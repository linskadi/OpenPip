const SEVERITY_ICONS = {
  high: '🔴',
  medium: '🟡',
  low: '🟢',
};

const SEVERITY_ALIASES = {
  critical: 'high',
  major: 'medium',
  minor: 'low',
  high: 'high',
  medium: 'medium',
  low: 'low',
};

function getSeverityIcon(severity) {
  const normalized = SEVERITY_ALIASES[severity] || severity;
  return SEVERITY_ICONS[normalized] || '•';
}

function formatIssueList(issues) {
  const lines = [];
  for (const issue of issues) {
    if (typeof issue === 'string') {
      lines.push(`- ${issue}`);
    } else if (issue.message) {
      lines.push(`- ${issue.message}`);
      if (issue.claim) {
        lines.push(`  来源: "${issue.claim.slice(0, 60)}"`);
      }
      if (issue.promise) {
        lines.push(`  承诺: "${issue.promise.slice(0, 60)}"`);
      }
    }
  }
  return lines.join('\n');
}

function formatReport({ title, summary, groups, timestamp }) {
  const header = formatReportHeader(title, { '生成时间': timestamp || new Date().toISOString() });
  const lines = [header];

  if (summary && summary.length > 0) {
    lines.push('## 总览');
    for (const item of summary) {
      lines.push(`- ${item}`);
    }
    lines.push('');
  }

  if (groups && groups.length > 0) {
    for (const group of groups) {
      if (!group.issues || group.issues.length === 0) {
        continue;
      }

      const icon = group.severity ? getSeverityIcon(group.severity) : '';
      const groupTitle = icon ? `${icon} ${group.title}` : group.title;
      lines.push(`## ${groupTitle}`);
      lines.push(formatIssueList(group.issues));
      lines.push('');
    }
  }

  return lines.join('\n');
}

// 统一报告头部：# 标题 + 元数据字段（按插入顺序输出）
function formatReportHeader(title, meta = {}) {
  const lines = [`# ${title}`, ''];
  for (const [key, value] of Object.entries(meta)) {
    lines.push(`**${key}**: ${value}`);
  }
  if (Object.keys(meta).length === 0) {
    lines.push(`**生成时间**: ${new Date().toISOString()}`);
  }
  lines.push('');
  return lines.join('\n');
}

module.exports = {
  formatReport,
  formatReportHeader,
};
