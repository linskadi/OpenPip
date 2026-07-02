function classifySeverity(severity) {
  const s = (severity || '').toLowerCase();
  if (s === '高' || s === 'high' || s === '严重') return 'heavy';
  if (s === '中' || s === 'medium' || s === '一般') return 'medium';
  return 'light';
}

function routeBySeverity(severity) {
  switch (classifySeverity(severity)) {
  case 'heavy': return 'planner';
  case 'medium': return 'writer';
  case 'light': return 'writer';
  default: return 'writer';
  }
}

function classifyComment(comment) {
  const text = (comment.problem + comment.suggestion).toLowerCase();

  if (text.includes('格式') || text.includes('标点') || text.includes('参考文献') || text.includes('图表编号')) {
    return 'formatter';
  }

  if (text.includes('写作') || text.includes('语言') || text.includes('AI痕迹') || text.includes('口语')) {
    return 'writer';
  }

  if (text.includes('实验') || text.includes('对比') || text.includes('消融') || text.includes('数据集')) {
    return 'writer';
  }

  if (text.includes('文献') || text.includes('引用') || text.includes('综述')) {
    return 'researcher';
  }

  return 'writer';
}

function parseReviewIssues(text) {
  const issues = [];
  const blocks = text.split(/^###\s*意见/m).slice(1);

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const severityMatch = block.match(/严重程度[：:](\S+?)[\]）]/);
    const severity = severityMatch ? severityMatch[1] : '中';

    const problemMatch = block.match(/\*\*问题\*\*[：:]?\s*(.+)/);
    const locationMatch = block.match(/\*\*位置\*\*[：:]?\s*(.+)/);
    const suggestionMatch = block.match(/\*\*建议\*\*[：:]?\s*(.+)/);

    const problem = problemMatch ? problemMatch[1].trim() : '';
    const location = locationMatch ? locationMatch[1].trim() : '';
    const suggestion = suggestionMatch ? suggestionMatch[1].trim() : '';
    const priority = classifySeverity(severity);

    issues.push({
      id: i + 1,
      severity,
      problem,
      issue: problem,
      location,
      suggestion,
      priority,
      title: `### 意见${i + 1}：[严重程度：${severity}]`,
      agent: null,
    });
  }

  for (const issue of issues) {
    issue.agent = classifyComment(issue);
  }

  return issues;
}

module.exports = {
  parseReviewIssues,
  classifySeverity,
  classifyComment,
  routeBySeverity,
};
