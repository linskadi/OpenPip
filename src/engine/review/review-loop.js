const { readFileSync, writeFileSync, existsSync } = require('fs');
const { resolve } = require('path');
const { getDefaultDispatcher } = require('../dispatcher-registry');
const { parseReviewIssues, classifyComment } = require('./review-parser');

// ============================================================
// 显示配置常量
// ============================================================

// 问题摘要截断长度（字符数）
const DISPLAY_SUMMARY_LENGTH = 50;

// 生成修改任务
function generateFixTasks(comments) {
  const tasks = [];
  
  for (const comment of comments) {
    tasks.push({
      id: tasks.length + 1,
      agent: comment.agent,
      severity: comment.severity,
      problem: comment.problem,
      location: comment.location,
      suggestion: comment.suggestion,
      status: 'pending',
    });
  }
  
  return tasks;
}

// 执行修改任务
async function executeFixTasks(tasks, project, projectRoot, config, dispatcher = null) {
  const results = [];
  const dispatch = dispatcher || getDefaultDispatcher();
  
  for (const task of tasks) {
    console.log(`\n📝 执行修改任务 #${task.id}: ${task.agent}`);
    console.log(`  问题: ${task.problem}`);
    console.log(`  建议: ${task.suggestion}`);
    
    const fixPrompt = `根据审稿意见修改论文。

## 审稿意见
问题: ${task.problem}
位置: ${task.location}
建议: ${task.suggestion}

## 任务
1. 读取 papers/${project}/drafts/draft-v2.md
2. 根据上述意见进行修改
3. 将修改后的内容保存到 papers/${project}/drafts/draft-v3.md
4. 列出所有修改点`;
    
    try {
      const result = await dispatch(task.agent, fixPrompt, project, projectRoot, config);
      results.push({ ...task, status: 'completed', result });
      console.log(`  ✅ 完成 (${result.length} 字)`);
    } catch (err) {
      results.push({ ...task, status: 'failed', error: err.message });
      console.log(`  ❌ 失败: ${err.message}`);
    }
  }
  
  return results;
}

// 复核验证
async function verifyFixes(project, projectRoot, config, dispatcher = null) {
  console.log('\n🔍 执行复核验证...');
  const dispatch = dispatcher || getDefaultDispatcher();
  
  const verifyPrompt = `复核论文修改结果。

## 任务
1. 读取 papers/${project}/drafts/draft-v3.md
2. 检查是否已修复以下问题：
   - 引用格式是否规范
   - 图表编号是否连续
   - 术语是否一致
   - 是否还有禁用词
3. 输出复核报告`;
  
  try {
    const result = await dispatch('reviewer', verifyPrompt, project, projectRoot, config);
    console.log(`  ✅ 复核完成 (${result.length} 字)`);
    return result;
  } catch (err) {
    console.log(`  ❌ 复核失败: ${err.message}`);
    return null;
  }
}

// 完整评审闭环
async function reviewLoop(project, projectRoot, config, options = {}) {
  console.log('\n🔄 启动评审闭环...');
  const dispatcher = options.dispatcher || getDefaultDispatcher();
  
  // 1. 读取审稿报告
  const reviewPath = resolve(projectRoot, 'papers', project, 'output/review-report.md');
  if (!existsSync(reviewPath)) {
    console.log('❌ 审稿报告不存在');
    return null;
  }
  
  const reviewText = readFileSync(reviewPath, 'utf-8');
  
  // 2. 解析意见
  console.log('\n📋 解析审稿意见...');
  const comments = parseReviewIssues(reviewText);
  console.log(`  发现 ${comments.length} 条意见`);
  
  for (const c of comments) {
    console.log(`  - [${c.severity}] ${c.agent}: ${c.problem.substring(0, DISPLAY_SUMMARY_LENGTH)}...`);
  }
  
  // 3. 生成修改任务
  const tasks = generateFixTasks(comments);
  console.log(`\n📝 生成 ${tasks.length} 个修改任务`);
  
  // 4. 执行修改
  console.log('\n🔧 执行修改...');
  const results = await executeFixTasks(tasks, project, projectRoot, config, dispatcher);
  
  // 5. 复核验证
  const verifyResult = await verifyFixes(project, projectRoot, config, dispatcher);
  
  // 6. 生成闭环报告
  const report = {
    totalComments: comments.length,
    completed: results.filter(r => r.status === 'completed').length,
    failed: results.filter(r => r.status === 'failed').length,
    results,
    verifyResult,
  };
  
  const reportPath = resolve(projectRoot, 'papers', project, 'output/review-loop-report.md');
  writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');
  console.log('\n📄 闭环报告已保存: output/review-loop-report.md');
  
  return report;
}

module.exports = { parseReviewIssues, classifyComment, generateFixTasks, executeFixTasks, verifyFixes, reviewLoop };