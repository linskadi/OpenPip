const readline = require('readline');
const { IntentParser } = require('../services/intent-parser');
const { ProjectService } = require('../services/project-service');
const { ChatSession } = require('../services/session');
const { resolveModel } = require('../services/tool-registry');
const { PipelineGenerator } = require('../services/pipeline-generator');
const { resolve } = require('path');

const SPINNERS = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

function createSpinner(text) {
  let i = 0;
  let running = true;
  const id = setInterval(() => {
    if (!running) return;
    process.stdout.write(`\r${SPINNERS[i % SPINNERS.length]} ${text}`);
    i++;
  }, 80);
  return {
    stop() {
      running = false;
      clearInterval(id);
      process.stdout.write('\r' + ' '.repeat(text.length + 4) + '\r');
    },
  };
}

module.exports = async function chat(args, engine, ROOT, config) {
  // Parse arguments
  const modelIdx = args.indexOf('--model');
  const modelName = modelIdx >= 0 && modelIdx + 1 < args.length
    ? args[modelIdx + 1]
    : resolveModel(config);

  const projectIdx = args.indexOf('--project');
  const initialProject = projectIdx >= 0 && projectIdx + 1 < args.length
    ? args[projectIdx + 1]
    : null;

  // Non-interactive mode: single query
  const query = args.filter(a => !a.startsWith('--') && a !== 'chat').join(' ');
  if (query && !args.includes('--interactive')) {
    return await singleQuery(query, engine, ROOT, config, modelName, initialProject);
  }

  // Interactive REPL
  return await startREPL(engine, ROOT, config, modelName, initialProject);
};

async function singleQuery(query, engine, root, config, modelName, initialProject) {
  const session = new ChatSession(root);
  const projectService = new ProjectService(engine, root, config);
  const parser = new IntentParser(modelName, config);

  if (initialProject) session.setActiveProject(initialProject);

  console.log(`\n💬 OpenPip Chat (${modelName})\n`);

  const spinner = createSpinner('思考中...');
  try {
    const context = session.getContextMenu();
    const result = await parser.parse(query, context);
    spinner.stop();

    if (result.type === 'tool_call') {
      await executeToolCalls(result.toolCalls, parser, session, projectService, engine, root, config);
      const s2 = createSpinner('生成总结...');
      const summary = await parser.summarizeToolResults();
      s2.stop();
      console.log(`\n${summary}\n`);
    } else {
      console.log(`${result.content}\n`);
    }
  } catch (err) {
    spinner.stop();
    console.log(`\n❌ 发生错误: ${err.message}\n`);
  }
}

async function startREPL(engine, root, config, modelName, initialProject) {
  const session = new ChatSession(root);
  const projectService = new ProjectService(engine, root, config);
  const parser = new IntentParser(modelName, config);

  if (initialProject) session.setActiveProject(initialProject);

  console.log(`\n💬 OpenPip Chat (${modelName})`);
  console.log('输入消息开始对话，输入 /help 查看命令，/quit 退出\n');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: 'You: ',
  });

  rl.prompt();

  rl.on('line', async (line) => {
    const input = line.trim();
    if (!input) { rl.prompt(); return; }

    // Handle slash commands
    if (input.startsWith('/')) {
      await handleSlashCommand(input, session, projectService);
      rl.prompt();
      return;
    }

    // Get session context
    const context = session.getContextMenu();

    // Parse intent with spinner
    const spinner = createSpinner('思考中...');
    try {
      const result = await parser.parse(input, context);
      spinner.stop();

      if (result.type === 'tool_call') {
        await executeToolCalls(result.toolCalls, parser, session, projectService, engine, root, config);
        const s2 = createSpinner('生成总结...');
        const summary = await parser.summarizeToolResults();
        s2.stop();
        console.log(`\n${summary}\n`);
      } else {
        console.log(`${result.content}\n`);
      }
    } catch (err) {
      spinner.stop();
      console.log(`\n❌ 发生错误: ${err.message}\n`);
    }

    rl.prompt();
  });

  rl.on('close', () => {
    console.log('\n👋 再见！');
    process.exitCode = 0;
  });
}

async function executeToolCalls(toolCalls, parser, session, projectService) {
  for (const tc of toolCalls) {
    const { name, args, id } = tc;
    console.log(`  🔧 ${name}(${JSON.stringify(args)})`);

    let result;
    try {
      switch (name) {
      case 'init_project': {
        result = projectService.createProject(args.name, args.category, args.domain, args.topic);
        if (result.success) session.setActiveProject(args.name);
        break;
      }
      case 'ingest_materials': {
        const project = args.project || session.activeProject;
        if (!project) {
          result = { success: false, error: '请指定项目名称，或先创建项目' };
        } else {
          result = projectService.importMaterials(project, args.files || []);
          if (result.success) {
            session.setActiveProject(project);
            (result.imported || []).forEach(f => session.addImportedFile(f));
          }
        }
        break;
      }
      case 'run_pipeline': {
        const project = args.project || session.activeProject;
        if (!project) {
          result = { success: false, error: '请指定项目名称，或先创建项目' };
        } else {
          console.log(`  ⏳ 正在执行写作流水线（${args.quality || 'standard'} 模式）...`);
          result = await projectService.runPipeline(project, args.topic, args.quality, args.pipeline);
        }
        break;
      }
      case 'query_status': {
        result = projectService.getStatus(args.project || session.activeProject);
        break;
      }
      case 'export_paper': {
        const project = args.project || session.activeProject;
        if (!project) {
          result = { success: false, error: '请指定项目名称' };
        } else {
          result = projectService.exportPaper(project, args.format);
        }
        break;
      }
      case 'import_references': {
        const project = args.project || session.activeProject;
        if (!project) {
          result = { success: false, error: '请指定项目名称，或先创建项目' };
        } else {
          result = projectService.importBibTeX(project, args.file);
        }
        break;
      }
      case 'list_references': {
        const project = args.project || session.activeProject;
        if (!project) {
          result = { success: false, error: '请指定项目名称' };
        } else {
          result = projectService.listReferences(project);
        }
        break;
      }
      case 'list_pipelines': {
        const pipelines = args.category
          ? projectService.listPipelines(args.category)
          : projectService.listCategories().flatMap(c => projectService.listPipelines(c.name));
        result = { success: true, pipelines };
        break;
      }
      case 'toggle_feature': {
        const { PipelineAdvisor } = require('../../engine/pipeline-advisor');
        if (args.project) {
          const projectDir = projectService.findProjectDir(args.project);
          if (!projectDir) {
            result = { success: false, error: `项目 '${args.project}' 不存在` };
          } else {
            const features = PipelineAdvisor.loadFeatures(projectDir);
            features[args.feature] = args.enabled;
            PipelineAdvisor.saveFeatures(projectDir, features);
            result = { success: true, feature: args.feature, enabled: args.enabled };
          }
        } else {
          // Global setting (for future use)
          result = { success: true, feature: args.feature, enabled: args.enabled, scope: 'global' };
        }
        break;
      }
      case 'review_code': {
        const project = args.project || session.activeProject;
        if (!project && (!args.files || args.files.length === 0)) {
          result = { success: false, error: '请指定项目名称或代码文件路径' };
        } else {
          console.log(`  ⏳ 正在执行代码审查（${args.focus || 'all'} 模式）...`);
          try {
            const pipelineName = 'code-review';
            result = await projectService.runPipeline(project || 'code-review-temp', args.files?.join(', ') || '代码审查', 'standard', pipelineName);
          } catch (err) {
            result = { success: false, error: err.message };
          }
        }
        break;
      }
      case 'create_pipeline': {
        const { PipelineGenerator } = require('../services/pipeline-generator');
        const pipelinesDir = resolve(root, '.openpip', 'pipelines');
        const gen = new PipelineGenerator(pipelinesDir);
        result = gen.generate({
          name: args.name,
          description: args.description,
          category: args.category,
          domain: args.domain,
          stages: args.stages || [],
        });
        if (result.success) {
          console.log(`  📄 管线配置已创建: ${result.path}`);
        }
        break;
      }
      case 'modify_pipeline': {
        const { PipelineGenerator } = require('../services/pipeline-generator');
        const pipelinesDir = resolve(root, '.openpip', 'pipelines');
        const gen = new PipelineGenerator(pipelinesDir);
        result = gen.modify(args.name, args.action, {
          stage: args.stage,
          stageOrder: args.stageOrder,
        });
        break;
      }
      default:
        result = { success: false, error: `未知工具: ${name}` };
      }
    } catch (err) {
      result = { success: false, error: err.message };
    }

    console.log(`  📋 结果: ${result.success ? '✅ 成功' : '❌ ' + (result.error || '失败')}`);
    await parser.addToolResult(id, result);
  }
}

async function handleSlashCommand(input, session, projectService) {
  const cmd = input.split(' ')[0].toLowerCase();
  const arg = input.slice(cmd.length).trim();

  switch (cmd) {
  case '/help':
    console.log(`
可用命令:
  /help           显示此帮助
  /status         查看当前项目状态
  /projects       列出所有项目
  /use <项目名>   切换当前项目
  /clear          清除会话历史
  /quit           退出
      `);
    break;

  case '/status': {
    const project = session.activeProject;
    if (!project) {
      console.log('  当前未选择项目。使用 /use <项目名> 选择项目。');
    } else {
      const status = projectService.getStatus(project);
      if (status.success) {
        console.log(`  项目: ${status.project}`);
        console.log(`  状态: ${status.status}`);
        console.log(`  文件: ${status.files.length} 个`);
        status.files.forEach(f => console.log(`    ${f.path} (${f.size})`));
      } else {
        console.log(`  ❌ ${status.error}`);
      }
    }
    break;
  }

  case '/projects': {
    const result = projectService.getStatus();
    if (result.success && result.projects.length > 0) {
      console.log('  项目列表:');
      result.projects.forEach(p => {
        const marker = p === session.activeProject ? ' ← 当前' : '';
        console.log(`    ${p}${marker}`);
      });
    } else {
      console.log('  暂无项目。使用 init_project 工具创建。');
    }
    break;
  }

  case '/use': {
    if (!arg) {
      console.log('  用法: /use <项目名>');
    } else {
      session.setActiveProject(arg);
      console.log(`  ✅ 已切换到项目: ${arg}`);
    }
    break;
  }

  case '/clear':
    session.clear();
    console.log('  ✅ 会话已清除');
    break;

  case '/quit':
    console.log('  👋 再见！');
    process.exit(0);
    break;

  default:
    console.log(`  未知命令: ${cmd}。输入 /help 查看可用命令。`);
  }
}
