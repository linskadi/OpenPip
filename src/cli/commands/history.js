const { PipelineHistory } = require('../../engine/pipeline-history');
const { findProjectDir } = require('../services/project-service');

module.exports = async function historyCommand(args, engine, ROOT, config) {
  const subcommand = args[1]; // list | inspect
  const project = args[2];
  const runId = args[3];

  if (!subcommand || !['list', 'inspect'].includes(subcommand)) {
    console.error('用法: openpip history <list|inspect> <项目名> [run-id]');
    console.error('  list    — 列出项目的所有执行记录');
    console.error('  inspect — 查看某次执行的详细信息');
    return;
  }

  if (!project) {
    console.error(`用法: openpip history ${subcommand} <项目名>${subcommand === 'inspect' ? ' <run-id>' : ''}`);
    return;
  }

  const projectDir = findProjectDir(ROOT, project);
  if (!projectDir) {
    console.error(`项目 '${project}' 不存在`);
    return;
  }

  const history = new PipelineHistory(projectDir);

  if (subcommand === 'list') {
    const runs = history.listRuns();
    if (runs.length === 0) {
      console.log(`📁 项目 '${project}' 暂无执行记录`);
      return;
    }
    console.log(`📁 项目 '${project}' 的执行记录 (${runs.length} 条):\n`);
    for (const run of runs) {
      const duration = run.completed_at && run.started_at
        ? ` (${formatDuration(new Date(run.completed_at) - new Date(run.started_at))})`
        : '';
      console.log(`  ${run.run_id}`);
      console.log(`    管线: ${run.pipeline || '未知'}  |  阶段数: ${run.stage_count}  |  开始: ${run.started_at || '未知'}${duration}`);
    }
    return;
  }

  // inspect
  if (!runId) {
    console.error('用法: openpip history inspect <项目名> <run-id>');
    console.error('  使用 openpip history list <项目名> 查看可用的 run-id');
    return;
  }

  const run = history.inspectRun(runId);
  if (!run) {
    console.error(`未找到执行记录: ${runId}`);
    return;
  }

  console.log(`\n📋 执行记录: ${run.run_id}\n`);
  console.log(`  管线: ${run.pipeline || '未知'}`);
  console.log(`  项目: ${run.project || '未知'}`);
  console.log(`  开始: ${run.started_at || '未知'}`);
  console.log(`  完成: ${run.completed_at || '未完成'}`);
  if (run.completed_at && run.started_at) {
    console.log(`  耗时: ${formatDuration(new Date(run.completed_at) - new Date(run.started_at))}`);
  }

  if (run.stages && run.stages.length > 0) {
    console.log(`\n  阶段详情 (${run.stages.length} 个):\n`);
    for (const stage of run.stages) {
      const status = stage.success ? '✅' : (stage.skipped ? '⏭️' : '❌');
      const duration = stage.duration ? ` (${formatDuration(stage.duration)})` : '';
      const error = stage.error ? ` — ${stage.error}` : '';
      console.log(`    ${status} ${stage.stage_id || stage.stage || '未知'}${duration}${error}`);
    }
  }

  if (run.blackboard_snapshot) {
    console.log('\n  黑板快照: 已保存');
  }
};

function formatDuration(ms) {
  if (!ms || ms < 0) return '未知';
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainSeconds = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remainSeconds}s`;
  const hours = Math.floor(minutes / 60);
  const remainMinutes = minutes % 60;
  return `${hours}h ${remainMinutes}m`;
}
