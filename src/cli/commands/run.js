const { ask, confirm } = require('../utils/readline');
const { PipelineSandbox } = require('../../engine/sandbox');

function detectPipeline(project, topic) {
  // 从项目路径自动检测管线分类
  // 如 competition/math-modeling/huashubei/2023C → competition-math-modeling
  const pathParts = (project || '').replace(/\\/g, '/').split('/');
  
  // 检查第一级目录
  if (pathParts[0] === 'competition') {
    if (pathParts[1] === 'math-modeling') return 'competition-math-modeling';
    if (pathParts[1] === 'data-science') return 'competition-data-science';
    return 'competition-general';
  }
  if (pathParts[0] === 'research') {
    if (pathParts[1] === 'cs') return 'research-cs';
    return 'full-research';
  }
  
  // 从选题关键词检测
  const t = (topic || '').toLowerCase();
  const mathKeywords = ['数学建模', '华数杯', '国赛', '美赛', 'mcm', 'icm', 'cumcm', 'mathorcup', 
    '五一杯', '电工杯', '数维杯', 'apmcm', '优化模型', '预测模型', '评价模型'];
  if (mathKeywords.some(k => topic.includes(k) || t.includes(k.toLowerCase()))) {
    return 'competition-math-modeling';
  }
  if (t.includes('kaggle') || t.includes('天池') || t.includes('数据竞赛')) {
    return 'competition-data-science';
  }
  
  return 'full-research';
}

module.exports = async function(args, engine, ROOT, config) {
  const project = args[1];
  const topic = args[2] || '未指定选题';
  const enableReviewLoop = args.includes('--review-loop');
  const enableSandbox = args.includes('--sandbox');
  const venueIdx = args.indexOf('--venue');
  const venue = venueIdx >= 0 && venueIdx + 1 < args.length ? args[venueIdx + 1] : null;
  
  // --pipeline 参数允许手动指定管线，否则自动检测
  const pipelineIdx = args.indexOf('--pipeline');
  const pipelineName = pipelineIdx >= 0 && pipelineIdx + 1 < args.length 
    ? args[pipelineIdx + 1] 
    : detectPipeline(project, topic);
  
  if (!project) { 
    console.error('用法: openpip run <项目名> [选题] [--pipeline <管线名>] [--review-loop] [--venue <期刊>] [--sandbox]'); 
    return; 
  }
  
  console.log(`  📋 管线: ${pipelineName}`);
  if (venue) {
    config = { ...config, targetVenue: venue };
    console.log(`  🎯 目标期刊: ${venue}`);
  }

  let projectRoot = ROOT;
  let sandbox = null;

  if (enableSandbox) {
    const runId = PipelineSandbox.generateRunId();
    sandbox = new PipelineSandbox(ROOT, runId);
    
    try {
      projectRoot = await sandbox.create(project);
      console.log(`  🔒 沙箱模式已启用 (runId: ${runId})`);
    } catch (err) {
      console.error(`  ❌ 沙箱创建失败: ${err.message}`);
      return;
    }
  }

  try {
    await engine.runPipeline(pipelineName, project, topic, projectRoot, config, { confirm, enableReviewLoop });
  } finally {
    if (sandbox) {
      console.log('\n📋 沙箱运行完成。请选择后续操作:');
      console.log('  [e] 导出结果到项目目录并清理沙箱');
      console.log('  [k] 保留沙箱（稍后清理）');
      console.log('  [d] 直接删除沙箱');
      
      const choice = (await ask('请选择 (e/k/d) [e]: ')).trim() || 'e';
      
      switch (choice.toLowerCase()) {
        case 'e':
          await sandbox.exportResults(project);
          await sandbox.cleanup();
          break;
        case 'k':
          console.log(`  📁 沙箱保留于: .openpip/sandbox/${sandbox.runId}/`);
          break;
        case 'd':
        default:
          await sandbox.cleanup();
          break;
      }
    }
  }
};
