const { readFileSync, existsSync, mkdirSync } = require('fs');
const { resolve } = require('path');
const { defaultLogger } = require('../infra/logger');
const { loadRole, SUBTASK_TO_TASK_TYPE, AGENT_TO_TASK_TYPE } = require('./loader');
const { callLLMWithRetry, callLLMWithTools } = require('../llm/llm');
const { loadBlackboard, saveBlackboard, sliceFor } = require('../state/shared-state');
const { ensembleReview } = require('../review/ensemble-review');
const { routeModelForAgent } = require('../llm/model-router');
const { assemblePrompt } = require('../runtime/prompt-assembler');
const { searchArxiv, formatArxivResults } = require('./tools/arxiv-search');

async function dispatchRole(agentName, task, project, projectRoot, config) {
  const bb = loadBlackboard(resolve(projectRoot, 'papers', project));
  let agent;
  try {
    agent = loadRole(agentName, projectRoot, task, bb.classification || null);
  } catch (err) {
    throw new Error(`[Role] 加载失败 — ${err.message}`);
  }

  const useRouter = config && config.features && config.features.model_router;
  if (useRouter) {
    const routed = routeModelForAgent(agentName, task);
    agent.model = routed.model;
  }

  const fullPrompt = `你是 OpenPip 的 ${agentName} 角色。

## 你的角色定义
${agent.promptText}

## 参考知识
${agent._knowledgeContent}

## 当前任务
${task}

## 项目目录
papers/${project}/

请执行任务，将结果保存到项目目录中。`;

  defaultLogger.debug('Dispatching role', { agent: agentName, model: agent.model });
  return await callLLMWithRetry(agent.model, fullPrompt, config);
}

async function dispatchRoleWithState(agentName, task, project, projectRoot, config) {
  const projectDir = resolve(projectRoot, 'papers', project);
  const bb = loadBlackboard(projectDir);
  let agent;
  try {
    agent = loadRole(agentName, projectRoot, task, bb.classification || null);
  } catch (err) {
    throw new Error(`[Role] 加载失败 — ${err.message}`);
  }

  const useRouter = config && config.features && config.features.model_router;
  if (useRouter) {
    const routed = routeModelForAgent(agentName, task);
    agent.model = routed.model;
    agent._tier = routed.tier;
    agent._promptVariant = routed.promptVariant;
  }

  const subtaskMatch = task.match(/subtask:\s*(\w[\w-]*)/);
  const subtask = subtaskMatch ? subtaskMatch[1] : null;
  const modeMatch = task.match(/mode:\s*(\w+)/);
  const mode = modeMatch ? modeMatch[1] : bb.mode || (bb.classification ? 'competition' : 'research');

  if (agentName === 'formatter' && subtask === 'figure') {
    console.log('  [formatter] subtask=figure → 启动 FigureGenerator');
    const { FigureGenerator, scanFigureAnnotations } = require('../output/figure-generator');

    let draftContent = '';
    const draftPath = resolve(projectDir, 'drafts/draft-v2.md');
    try { draftContent = readFileSync(draftPath, 'utf-8'); } catch {}
    if (!draftContent) {
      const v1Path = resolve(projectDir, 'drafts/draft-v1.md');
      try { draftContent = readFileSync(v1Path, 'utf-8'); } catch {}
    }

    const annotations = scanFigureAnnotations(draftContent);
    const figGen = new FigureGenerator(projectRoot);
    const outputDir = resolve(projectDir, 'figures');
    if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

    const results = [];
    let hasStyle = null;
    const styleMatch = draftContent.match(/<!--\s*STYLE:\s*(\w+)\s*-->/);
    if (styleMatch) hasStyle = styleMatch[1];

    for (const ann of annotations) {
      try {
        const spec = { ...ann, style: ann.style || hasStyle || 'ieee', number: results.length + 1 };
        const figResult = figGen.generateFromSpec(spec, outputDir);
        results.push(figResult);
        const tag = figResult.success ? '✅' : '❌';
        console.log(`  ${tag} 图${spec.number}: ${spec.title || '未命名'} (${figResult.success ? 'PDF+PNG' : figResult.error})`);
      } catch (err) {
        console.log(`  ❌ 图生成失败: ${err.message}`);
        results.push({ success: false, error: err.message });
      }
    }

    if (annotations.length === 0) {
      console.log('  ⚠️ 未找到 FIGURE 标注，调用 LLM 检测图表需求...');
      const result = await callLLMWithRetry(agent.model,
        `你是 OpenPip 的 ${agentName} 角色。\n\n## 你的角色定义\n${agent.promptText}\n\n## 当前任务\n${task}\n\n## 论文内容\n${draftContent.slice(0, 8000)}\n\n请分析正文中的数据和实验，返回 FIGURE 标注列表。每个标注格式：<!-- FIGURE: 图N 标题 类型:line|bar|scatter 数据:描述 -->`,
        config);
      bb.draft.figureAnalysis = result;
    }

    const summary = results.length > 0
      ? `FigureGenerator 完成: ${results.filter(r => r.success).length}/${results.length} 个图表生成成功`
      : '未生成图表（无 FIGURE 标注）';
    bb.memory.figures = results.map(r => ({ id: r.id, success: r.success, caption: r.caption }));
    saveBlackboard(projectDir, bb);
    return summary;
  }

  if (agentName === 'coder' && (task.includes('execute') || task.includes('competition-code') || subtask === 'competition-code')) {
    console.log('  [coder] 启动代码执行循环');
    const { codeExecutionLoop } = require('./tools/python-exec');
    const result = await codeExecutionLoop(task, project, projectRoot, {
      ...config,
      model: agent.model,
      maxCodeAttempts: 5,
      codeTimeout: 60000,
    });
    bb.draft.code = result;
    saveBlackboard(projectDir, bb);
    return result;
  }

  if (agentName === 'reviewer' && agent.ensemble) {
    console.log(`  [${agentName}] ensemble: ${agent.ensemble.num_reviews}x${agent.ensemble.num_reflections} mode=${mode}`);
    const result = await ensembleReview(agent, bb.draft.full || '', mode, config,
      { numReviews: agent.ensemble.num_reviews || 5, numReflections: agent.ensemble.num_reflections || 5 });
    const report = `# 审稿报告（ensemble ${agent.ensemble.num_reviews}×${agent.ensemble.num_reflections}）\n\n评分：${result.score}/100\n决策：${result.decision}\n\n## 审稿意见\n\n${result.issues.join('\n\n')}`;
    bb.review = { score: result.score, decision: result.decision, issues: result.issues };
    bb.integrity = extractIntegrity(report);
    saveBlackboard(projectDir, bb);
    return report;
  }

  const slice = sliceFor(agentName, subtask, bb);
  bb.meta = bb.meta || {};
  bb.meta.lastTask = task;

  const dynamicContext = buildDynamicContext(agentName, subtask, bb, config, task);

  const { scanProjectFiles, formatFilesContext } = require('./tools/local-files');
  const localFiles = scanProjectFiles(projectDir);

  let dynamicSections = '';
  if (dynamicContext.contribution) {
    dynamicSections += `\n## 核心贡献声明（全文围绕此展开）\n${JSON.stringify(dynamicContext.contribution, null, 2)}\n`;
  }
  if (dynamicContext.currentChapter) {
    dynamicSections += `\n## 当前章节信息\n- 标题: ${dynamicContext.currentChapter.name || dynamicContext.currentChapter.title || ''}\n- 目标: ${dynamicContext.currentChapter.goal || ''}\n- 前章结尾: ${dynamicContext.previousChapterEnding || '本章是第一章'}\n`;
  }
  if (dynamicContext.targetVenue) {
    dynamicSections += `\n## 目标期刊\n${dynamicContext.targetVenue}\n`;
  }
  if (dynamicContext.knownIssues && dynamicContext.knownIssues.length > 0) {
    dynamicSections += `\n## 已知问题（请重点关注）\n${dynamicContext.knownIssues.join('\n')}\n`;
  }

  const filesContext = formatFilesContext(localFiles);
  if (filesContext) {
    dynamicSections += filesContext;
  }

  let arxivReferenceSection = '';
  const arxivEnabled = config?.features?.arxiv_search !== false;
  if (agentName === 'researcher' && arxivEnabled) {
    const isLiteratureTask = /文献|调研|research|literature|综述|研究现状|研究背景/i.test(task);
    if (isLiteratureTask) {
      try {
        console.log('  [researcher] 启动 arXiv 文献检索...');
        const arxivResult = await searchArxiv(task, 5);
        if (arxivResult.success && arxivResult.papers.length > 0) {
          const formatted = formatArxivResults(arxivResult);
          arxivReferenceSection = `\n## 参考资料（arXiv 实时检索）\n${formatted}\n`;
          console.log(`  [researcher] arXiv 检索完成，找到 ${arxivResult.papers.length} 篇相关论文`);
        } else {
          console.log(`  [researcher] arXiv 检索无结果: ${arxivResult.error || '空结果'}`);
        }
      } catch (err) {
        console.log(`  [researcher] arXiv 检索失败（降级）: ${err.message}`);
      }
    }
  }

  const taskType = SUBTASK_TO_TASK_TYPE[subtask] || AGENT_TO_TASK_TYPE[agentName] || 'writing';
  const modelTier = agent._tier || 'L1';
  const promptHeader = assemblePrompt(agentName, taskType, modelTier);

  const fullPrompt = `你是 OpenPip 的 ${agentName} 角色。

## 你的角色定义
${agent.promptText}

${promptHeader}

## 参考知识
${agent._knowledgeContent}
${arxivReferenceSection}
${dynamicSections}
## 共享状态切片（仅你需要字段）
${JSON.stringify(slice, null, 2)}

## 当前任务
${task}

## 项目目录
papers/${project}/

请执行任务，将结果保存到项目目录中。`;

  console.log(`  [${agentName}] 模型: ${agent.model} subtask=${subtask || '-'} tools=${agent.tools ? agent.tools.join(',') : 'none'}`);

  let result;
  if (agent.tools && agent.tools.length > 0) {
    result = await callLLMWithTools(agent.model, fullPrompt, config, {
      tools: agent.tools,
      projectRoot,
      project,
    });
  } else {
    result = await callLLMWithRetry(agent.model, fullPrompt, config);
  }

  writeBackBlackboard(agentName, subtask, bb, result);

  if (agentName === 'writer' && bb.memory && bb.memory.learnedLessons && bb.memory.learnedLessons.length > 0) {
    console.log(`  📖 注入 ${bb.memory.learnedLessons.length} 条历史教训`);
  }

  saveBlackboard(projectDir, bb);
  return result;
}

function buildDynamicContext(agentName, subtask, bb, config, task) {
  const context = {};

  if (bb.research && bb.research.contribution) {
    context.contribution = bb.research.contribution;
  }

  if (agentName === 'writer' && subtask === 'draft') {
    const chapterMatch = task.match(/chapter:\s*(\d+)/);
    if (chapterMatch) {
      const chIdx = parseInt(chapterMatch[1], 10);
      if (bb.outline && bb.outline.chapters && bb.outline.chapters[chIdx - 1]) {
        context.currentChapter = bb.outline.chapters[chIdx - 1];
      }
      if (chIdx > 1 && bb.draft && bb.draft.chapters && bb.draft.chapters[chIdx - 2]) {
        context.previousChapterEnding = bb.draft.chapters[chIdx - 2].ending || '';
      }
    }
  }

  if (config && config.targetVenue) {
    context.targetVenue = config.targetVenue;
  }

  if (bb.memory && bb.memory.knownIssues && bb.memory.knownIssues.length > 0) {
    context.knownIssues = bb.memory.knownIssues;
  }

  return context;
}

function writeBackBlackboard(agentName, subtask, bb, result) {
  switch (agentName) {
  case 'researcher':
    bb.research.brief = result;
    break;
  case 'planner':
    try { bb.outline = JSON.parse(result); } catch { bb.outline = { raw: result }; }
    break;
  case 'writer':
    if (subtask === 'polish') {
      bb.draft.full = result;
    } else if (subtask === 'summary') {
      bb.draft.summary = result;
    } else {
      const lastTask = (bb.meta && bb.meta.lastTask) || '';
      const chapterMatch = lastTask.match(/chapter:\s*(\d+)/);
      if (chapterMatch) {
        const chIdx = parseInt(chapterMatch[1], 10) - 1;
        if (!bb.draft.chapters) bb.draft.chapters = [];
        const { getLastParagraphs } = require('../quality/chapter-self-critic');
        bb.draft.chapters[chIdx] = {
          index: chIdx + 1,
          content: result,
          ending: getLastParagraphs ? getLastParagraphs(result, 2) : result.split('\n').slice(-2).join('\n'),
          wordCount: result.length,
        };
        bb.draft.full = bb.draft.chapters.filter(c => c && c.content).map(c => c.content).join('\n\n');
      } else {
        bb.draft.full = result;
      }
    }
    break;
  case 'coder':
    bb.draft.code = result;
    break;
  case 'formatter':
    if (subtask === 'export') bb.draft.latex = result;
    else if (subtask === 'figure') bb.memory.figures.push(result);
    else bb.draft.formatted = result;
    break;
  }
}

function extractIntegrity(report) {
  return {
    refs: /引用[:：]\s*✅/.test(report),
    formulas: /公式[:：]\s*✅/.test(report),
    figures: /图表[:：]\s*✅/.test(report),
    terms: /术语[:：]\s*✅/.test(report),
  };
}

// @deprecated v0.2.0 - 使用 dispatchRole 代替
const dispatchAgent = dispatchRole;
// @deprecated v0.2.0 - 使用 dispatchRoleWithState 代替
const dispatchAgentWithState = dispatchRoleWithState;

module.exports = { dispatchRole, dispatchAgent, dispatchRoleWithState, dispatchAgentWithState, buildDynamicContext, writeBackBlackboard, extractIntegrity };
