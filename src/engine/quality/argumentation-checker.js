const { formatReport } = require('./report-formatter');
const { findOverClaims } = require('./over-claim-patterns');

const CHECKS = [
  {
    name: 'evidence_matching',
    severity: 'high',
    description: '证据匹配：每个 claim 是否有支撑',
    check(text, claims) {
      const issues = [];
      for (const claim of claims) {
        const afterClaim = text.slice(claim.position, claim.position + 500);
        const hasEvidence = /\[[\d,\s]+\]/.test(afterClaim) || /\d+\.?\d*%/.test(afterClaim);
        if (!hasEvidence) {
          issues.push({ claim: claim.text, message: 'claim 后 500 字内未找到引用或数据支撑' });
        }
      }
      return issues;
    },
  },
  {
    name: 'over_claiming',
    severity: 'high',
    description: '过度声称检测',
    check(text) {
      // 中英文一并检测
      const cnMatches = findOverClaims(text, 'cn');
      const enMatches = findOverClaims(text, 'en');
      const issues = [];
      for (const m of cnMatches) {
        issues.push({ claim: m.pattern, message: `"${m.pattern}" 属于过度声称（中文模式）` });
      }
      for (const m of enMatches) {
        issues.push({ claim: m.pattern, message: `"${m.pattern}" 属于过度声称（英文模式）` });
      }
      return issues;
    },
  },
  {
    name: 'circular_reasoning',
    severity: 'medium',
    description: '循环论证检测',
    check(text) {
      const issues = [];
      const pattern = /(?:因为|由于)\s*(.+?)\s*(?:所以|因此|故)\s*(.+?)\s*(?:因为|由于)\s*\2/gi;
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(text)) !== null) {
        issues.push({ claim: match[0].slice(0, 80), message: '检测到循环论证' });
      }
      return issues;
    },
  },
  {
    name: 'causal_confusion',
    severity: 'medium',
    description: '因果混淆检测',
    check(text) {
      const issues = [];
      const pattern = /(?:A|方法|模型|算法)\s*(?:之后|以后|之后)\s*(?:B|结果|性能)\s*(?:提升|提高|改善)/gi;
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(text)) !== null) {
        issues.push({ claim: match[0].slice(0, 80), message: '可能将相关性误认为因果性' });
      }
      return issues;
    },
  },
  {
    name: 'sample_size',
    severity: 'medium',
    description: '样本量合理性',
    check(text) {
      const issues = [];
      const pattern = /(?:N|样本|数据量)[=:：]*\s*(\d+)/gi;
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const n = parseInt(match[1]);
        if (n > 0 && n < 30) {
          issues.push({ claim: match[0], message: `样本量 N=${n} < 30，声称"显著"可能不可靠` });
        }
      }
      return issues;
    },
  },
  {
    name: 'straw_man',
    severity: 'low',
    description: '稻草人论证检测',
    check(text) {
      const issues = [];
      const pattern = /(?:有些人认为|有人主张|传统观点认为)\s*(.+?)\s*(?:但实际上|然而|其实)/gi;
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(text)) !== null) {
        issues.push({ claim: match[0].slice(0, 80), message: '可能在攻击简化版的对立观点' });
      }
      return issues;
    },
  },
  {
    name: 'false_dilemma',
    severity: 'low',
    description: '非此即彼谬误检测',
    check(text) {
      const issues = [];
      const pattern = /(?:要么|不是)\s*(.+?)\s*(?:要么|就是)\s*(.+?)(?:。|，|;)/g;
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(text)) !== null) {
        issues.push({ claim: match[0].slice(0, 80), message: '可能忽略了第三种可能性' });
      }
      return issues;
    },
  },
  {
    name: 'ad_hoc_assumption',
    severity: 'low',
    description: '特设假设检测',
    check(text) {
      const issues = [];
      const pattern = /(?:我们设置|我们设定|我们选择|参数设为)\s*(.+?)\s*(?:没有|未)\s*(?:说明|解释|给出).*?(?:原因|理由|依据)/gi;
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(text)) !== null) {
        issues.push({ claim: match[0].slice(0, 80), message: '参数选择缺乏依据说明' });
      }
      return issues;
    },
  },
];

function checkArgumentation(text, claims) {
  const results = [];
  for (const check of CHECKS) {
    const issues = check.check(text, claims);
    results.push({
      name: check.name,
      severity: check.severity,
      description: check.description,
      issues,
      pass: issues.length === 0,
    });
  }
  return results;
}

function generateReport(results) {
  const totalIssues = results.reduce((sum, r) => sum + r.issues.length, 0);
  const highCount = results.filter(r => r.severity === 'high' && !r.pass).length;

  return formatReport({
    title: '论证质量检查报告',
    summary: [
      `总问题数: ${totalIssues}`,
      `🔴 High: ${highCount}`,
      `通过: ${results.filter(r => r.pass).length}/${results.length}`,
    ],
    groups: results
      .filter(r => !r.pass)
      .map(r => ({
        title: r.description,
        severity: r.severity,
        issues: r.issues,
      })),
  });
}

module.exports = { CHECKS, checkArgumentation, generateReport };
