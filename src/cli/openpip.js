#!/usr/bin/env node

const { resolve } = require('path');
const { getCommand } = require('./commands/index');
const { ensureConfig } = require('./utils/config');
const { validateAll, formatErrors } = require(resolve(__dirname, '..', 'engine', 'validate'));

const engine = require(resolve(__dirname, '..', 'engine'));
const ROOT = resolve(__dirname, '..', '..');

const HELP = `
📄 OpenPip - 学术写作工作流引擎

用法:
  openpip chat [消息] [--model 模型] [--project 项目]  自然语言对话
  openpip config              交互式配置 API Key 和模型
  openpip init <项目名> [-i]   初始化项目 (-i 启用交互式引导)
  openpip new <项目名> [-i]    创建项目 (同 init)
  openpip run <项目名> [选题] [--review-loop] 执行流水线
  openpip evolve <项目名> [--auto] 自我进化 (基于审稿报告改进)
  openpip annotate <项目名> [文件] 处理论文批注
  openpip agent <项目名>      直接派遣角色执行任务
  openpip doctor              诊断配置错误
  openpip export <项目名> [格式] 导出论文 (md/docx/latex)
  openpip index               预构建 TF-IDF 检索索引
  openpip status <项目名>     查看项目状态
  openpip history <list|inspect> <项目名> [run-id]  查看执行记录
  openpip resource <reload|status|watch>  管理资源缓存
  openpip tui                 启动终端界面 (TUI)

💡 推荐: openpip chat   用自然语言与 AI 对话完成论文写作
`;

async function main() {
  const args = process.argv.slice(2);

  let config;
  try {
    config = ensureConfig();
  } catch (err) {
    console.error('❌ 无法加载配置: ' + err.message);
    process.exitCode = 1;
    return;
  }

  const cmd = args[0];

  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
    console.log(HELP);
    return;
  }

  if (cmd !== 'doctor' && cmd !== 'config') {
    const errors = validateAll(ROOT);
    if (errors.length > 0) {
      console.log(formatErrors(errors));
      console.log('\n💡 运行 openpip doctor 查看详细诊断');
    }
  }

  const command = getCommand(cmd);
  if (!command) {
    console.error(`未知命令: ${cmd}`);
    console.log(HELP);
    return;
  }

  await command(args, engine, ROOT, config);
}

main().catch(err => {
  console.error('❌ 致命错误:', err.message || err);
  process.exitCode = 1;
});
