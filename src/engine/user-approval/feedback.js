function buildRevisionPrompt(originalTask, userFeedback, stage, _currentResult) {
  const guidance = [];

  guidance.push('## 用户反馈意见');
  guidance.push(userFeedback);
  guidance.push('');

  if (stage.approval && stage.approval.maxFeedbackRounds) {
    guidance.push('请根据以上意见修改你的输出。');
  }

  // For simple feedback (< 50 chars), inject directly as instruction
  if (userFeedback.length < 50) {
    guidance.push(`\n## 修改目标\n${userFeedback}`);
  } else {
    guidance.push(`\n## 修改要求\n${userFeedback}\n\n请逐条处理以上反馈。如果反馈涉及多个问题，请分别说明修改方式。`);
  }

  guidance.push('\n返回完整修改后的内容，不要只返回修改部分。');

  const revisedTask = `${originalTask}\n\n${guidance.join('\n')}`;
  return revisedTask;
}

module.exports = { buildRevisionPrompt };
