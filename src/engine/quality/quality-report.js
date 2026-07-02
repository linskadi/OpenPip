const { writeFileSync } = require('fs');
const { resolve, basename } = require('path');
const { formatReportHeader } = require('./report-formatter');

class QualityReport {
  constructor(projectDir) {
    this.projectDir = projectDir;
    this.data = {
      project: basename(projectDir),
      timestamp: new Date().toISOString(),
      pipeline: {},
      quality: {},
      citations: {},
      figures: {},
      wordCount: 0,
      reviewRounds: 0,
      finalScore: 0,
      gates: [],
    };
  }

  collectFromBlackboard(bb) {
    if (bb.topic) this.data.pipeline.topic = bb.topic;
    if (bb.mode) this.data.pipeline.mode = bb.mode;
    if (bb.classification) this.data.pipeline.classification = bb.classification;

    // Draft stats
    if (bb.draft?.full) {
      const text = bb.draft.full;
      this.data.wordCount = text.replace(/\s+/g, '').length;
      this.data.pipeline.chapters = bb.draft.chapters?.length || 0;

      // Count citations
      const citations = text.match(/\[\d+\]/g) || [];
      this.data.citations.total = citations.length;
      const unique = new Set(citations.map(c => c));
      this.data.citations.unique = unique.size;

      // Count figures
      const figures = text.match(/!\[.*?\]\(.*?\)/g) || [];
      this.data.figures.total = figures.length;

      // Count tables
      const tables = (text.match(/\|.*\|/g) || []).length;
      this.data.figures.tables = Math.floor(tables / 3); // rough estimate
    }

    // Review stats
    if (bb.review?.report) {
      this.data.reviewRounds = (bb.review.report.match(/Round \d+/g) || []).length || 1;
      const scoreMatch = bb.review.report.match(/(\d+)\s*\/\s*100/);
      if (scoreMatch) this.data.finalScore = parseInt(scoreMatch[1]);
    }

    return this;
  }

  collectFromQualityCheck(qcResult) {
    if (!qcResult) return this;
    this.data.quality.compositeScore = qcResult.compositeScore || 0;
    this.data.quality.passed = qcResult.pass || false;
    // qcResult.results 为对象：{ metricName: { score, pass, weight, issues } }
    this.data.quality.metrics = Object.entries(qcResult.results || {}).map(([name, r]) => ({
      name,
      score: r.score,
      pass: r.pass,
      weight: r.weight,
    }));
    return this;
  }

  collectFromGates(gates) {
    this.data.gates = gates.map(g => ({
      name: g.name,
      passed: g.passed,
      score: g.score,
      issues: g.issues || [],
    }));
    return this;
  }

  generate() {
    const d = this.data;
    const lines = [];

    lines.push(formatReportHeader('论文质量报告', {
      '项目': d.project,
      '生成时间': d.timestamp,
      '论文主题': d.pipeline.topic || '未指定',
    }));

    // Overview
    lines.push('## 概览');
    lines.push('');
    lines.push('| 指标 | 数值 |');
    lines.push('|------|------|');
    lines.push(`| 总字数 | ${d.wordCount.toLocaleString()} |`);
    lines.push(`| 章节数 | ${d.pipeline.chapters || '-'} |`);
    lines.push(`| 引用数 | ${d.citations.total || 0}（${d.citations.unique || 0} 篇独立文献） |`);
    lines.push(`| 图表数 | ${d.figures.total || 0} |`);
    lines.push(`| 评审轮次 | ${d.reviewRounds} |`);
    lines.push(`| 最终得分 | ${d.finalScore}/100 |`);
    lines.push('');

    // Quality Gates
    if (d.quality.metrics && d.quality.metrics.length > 0) {
      lines.push('## 质量门禁结果');
      lines.push('');
      lines.push('| 门禁 | 得分 | 权重 | 状态 |');
      lines.push('|------|------|------|------|');
      for (const m of d.quality.metrics) {
        const status = m.pass ? '✅ 通过' : '❌ 未通过';
        lines.push(`| ${m.name} | ${m.score}/100 | ${m.weight} | ${status} |`);
      }
      lines.push('');
      lines.push(`**综合得分**: ${d.quality.compositeScore}/100 — ${d.quality.passed ? '✅ 通过' : '❌ 未通过'}`);
      lines.push('');
    }

    // Gate details
    if (d.gates.length > 0) {
      lines.push('## 检查门禁详情');
      lines.push('');
      for (const g of d.gates) {
        const icon = g.passed ? '✅' : '❌';
        lines.push(`### ${icon} ${g.name}`);
        if (g.issues.length > 0) {
          for (const issue of g.issues) {
            lines.push(`- ${issue}`);
          }
        } else {
          lines.push('- 无问题');
        }
        lines.push('');
      }
    }

    // Citation analysis
    lines.push('## 引用分析');
    lines.push('');
    if (d.citations.total > 0) {
      lines.push(`- 总引用次数: ${d.citations.total}`);
      lines.push(`- 独立文献数: ${d.citations.unique}`);
      const avg = (d.citations.total / Math.max(d.pipeline.chapters || 1, 1)).toFixed(1);
      lines.push(`- 平均每章引用: ${avg} 次`);
    } else {
      lines.push('- ⚠️ 未检测到引用，建议添加参考文献');
    }
    lines.push('');

    // Recommendations
    lines.push('## 改进建议');
    lines.push('');
    if (d.wordCount < 3000) {
      lines.push('- ⚠️ 字数偏少（<3000），建议扩充实验分析和讨论');
    }
    if (d.citations.total < 5) {
      lines.push('- ⚠️ 引用偏少（<5），建议补充相关工作引用');
    }
    if (d.figures.total < 3) {
      lines.push('- ⚠️ 图表偏少（<3），建议增加数据可视化');
    }
    if (d.quality.compositeScore < 60) {
      lines.push('- ⚠️ 质量门禁综合得分低于 60，建议重点修改');
    }
    if (d.reviewRounds === 0) {
      lines.push('- 💡 未进行评审迭代，建议开启 --review-loop');
    }
    if (lines.length === 11) {
      lines.push('- ✅ 各项指标正常');
    }
    lines.push('');

    return lines.join('\n');
  }

  save() {
    const report = this.generate();
    const reportPath = resolve(this.projectDir, 'output', 'quality-report.md');
    writeFileSync(reportPath, report, 'utf-8');
    return { success: true, path: reportPath };
  }
}

module.exports = { QualityReport };
