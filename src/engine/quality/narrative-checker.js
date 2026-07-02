const { formatReport } = require('./report-formatter');
const { calculateSimilarity } = require('../utils');

const NARRATIVE_CHECKS = [
  {
    name: 'promise_delivery_alignment',
    severity: 'critical',
    description: 'Promise-Delivery 对齐',
    check(promises, results) {
      const issues = [];
      for (const r of results) {
        if (!r.delivered) {
          issues.push({ message: `承诺未交付: "${r.promise.slice(0, 50)}"`, promise: r.promise });
        }
      }
      return issues;
    },
  },
  {
    name: 'redundancy_detection',
    severity: 'major',
    description: '冗余检测',
    check(text, _promises, sections) {
      const issues = [];
      if (!sections || sections.length < 2) return issues;
      for (let i = 0; i < sections.length; i++) {
        for (let j = i + 1; j < sections.length; j++) {
          const sim = calculateSimilarity(sections[i].text, sections[j].text, 'word');
          if (sim > 0.6) {
            issues.push({ message: `${sections[i].title} 与 ${sections[j].title} 相似度 ${(sim * 100).toFixed(0)}%，建议差异化` });
          }
        }
      }
      return issues;
    },
  },
  {
    name: 'transition_break',
    severity: 'minor',
    description: '过渡断裂检测',
    check(text, _promises, sections) {
      const issues = [];
      if (!sections || sections.length < 2) return issues;
      for (let i = 0; i < sections.length - 1; i++) {
        const currentEnd = sections[i].text.slice(-200);
        const nextStart = sections[i + 1]?.text.slice(0, 200) || '';
        const hasTransition = /(?:基于|因此|此外|然而|另一方面|综上|如前所述|在上一章)/.test(currentEnd + nextStart);
        if (!hasTransition && currentEnd.length > 50 && nextStart.length > 50) {
          issues.push({ message: `${sections[i].title} → ${sections[i + 1].title} 可能缺少过渡句` });
        }
      }
      return issues;
    },
  },
  {
    name: 'design_decision_trace',
    severity: 'major',
    description: '设计决策追溯',
    check(methodText, _promises, _sections, experimentText) {
      const issues = [];
      if (!methodText || !experimentText) return issues;
      const decisions = [...methodText.matchAll(/(?:我们选择|我们设定|参数设为|采用)\s*(.+?)(?:[，。])/g)];
      for (const decision of decisions) {
        const key = decision[1].slice(0, 20);
        if (!experimentText.includes(key) && !experimentText.includes('消融')) {
          issues.push({ message: `方法中 "${key}" 在实验中未见消融验证` });
        }
      }
      return issues;
    },
  },
  {
    name: 'terminology_intro_order',
    severity: 'minor',
    description: '术语引入顺序',
    check(text) {
      const issues = [];
      const termPattern = /\$([A-Za-z_]\w*)\$/g;
      let match;
      while ((match = termPattern.exec(text)) !== null) {
        const term = match[1];
        const before = text.slice(0, match.index);
        if (!new RegExp(`(?:其中|where|定义|denote|represents).*\\$?${term}\\$?`).test(before.slice(-500))) {
          if (text.indexOf(`$${term}$`) === match.index) {
            issues.push({ message: `变量 $${term}$ 首次出现时可能缺少定义` });
          }
        }
      }
      return issues;
    },
  },
];

function checkNarrative(text, promises, sections) {
  const methodSection = sections?.find(s => /方法|method/i.test(s.title));
  const experimentSection = sections?.find(s => /实验|experiment/i.test(s.title));
  const conclusionSection = sections?.find(s => /结论|conclusion/i.test(s.title));

  const results = [];
  for (const check of NARRATIVE_CHECKS) {
    let issues;
    if (check.name === 'promise_delivery_alignment') {
      const promiseResults = require('./promise-extractor').checkPromiseDelivery(
        promises, methodSection?.text, experimentSection?.text, conclusionSection?.text
      );
      issues = check.check(promises, promiseResults);
    } else if (check.name === 'design_decision_trace') {
      issues = check.check(methodSection?.text, promises, sections, experimentSection?.text);
    } else {
      issues = check.check(text, promises, sections);
    }
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

  return formatReport({
    title: '叙事连贯性检查报告',
    summary: [
      `总问题数: ${totalIssues}`,
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

module.exports = { NARRATIVE_CHECKS, checkNarrative, generateReport };
