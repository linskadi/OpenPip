const { readFileSync } = require('fs');
const { calculateSimilarity } = require('../utils');

// 反向大纲校验器
class ReverseOutlineVerifier {
  constructor(projectRoot) {
    this.projectRoot = projectRoot;
  }

  // 从论文中反向提取大纲
  extractOutline(paperPath) {
    const content = readFileSync(paperPath, 'utf-8');
    const lines = content.split('\n');

    const outline = {
      title: '',
      sections: [],
      currentSection: null,
      currentSubsection: null,
    };

    for (const line of lines) {
      const trimmed = line.trim();

      // 检测标题 (# 开头)
      if (trimmed.match(/^#\s+/)) {
        outline.title = trimmed.replace(/^#+\s*/, '');
        continue;
      }

      // 检测章节 (## 开头)
      if (trimmed.match(/^##\s+/)) {
        if (outline.currentSection) {
          outline.sections.push(outline.currentSection);
        }
        outline.currentSection = {
          title: trimmed.replace(/^##\s*/, ''),
          content: '',
          subsections: [],
          keyPoints: [],
        };
        outline.currentSubsection = null;
        continue;
      }

      // 检测小节 (### 开头)
      if (trimmed.match(/^###\s+/)) {
        if (outline.currentSection) {
          if (outline.currentSubsection) {
            outline.currentSection.subsections.push(outline.currentSubsection);
          }
          outline.currentSubsection = {
            title: trimmed.replace(/^###\s*/, ''),
            content: '',
            keyPoints: [],
          };
        }
        continue;
      }

      // 收集内容
      if (outline.currentSubsection) {
        outline.currentSubsection.content += trimmed + '\n';
      } else if (outline.currentSection) {
        outline.currentSection.content += trimmed + '\n';
      }
    }

    // 添加最后一个
    if (outline.currentSection) {
      if (outline.currentSubsection) {
        outline.currentSection.subsections.push(outline.currentSubsection);
      }
      outline.sections.push(outline.currentSection);
    }

    // 提取关键点
    this.extractKeyPoints(outline);

    return outline;
  }

  // 提取关键点
  extractKeyPoints(outline) {
    for (const section of outline.sections) {
      section.keyPoints = this.extractPointsFromText(section.content);

      for (const subsection of section.subsections) {
        subsection.keyPoints = this.extractPointsFromText(subsection.content);
      }
    }
  }

  extractPointsFromText(text) {
    const points = [];

    // 提取包含关键词的句子
    const keywords = [
      '本文', '提出', '设计', '实现', '实验', '结果', '表明', '证明',
      '创新', '贡献', '特点', '优势', '方法', '算法', '模型', '系统',
    ];

    const sentences = text.split(/[。！？]/);
    for (const sentence of sentences) {
      if (keywords.some(kw => sentence.includes(kw))) {
        const trimmed = sentence.trim();
        if (trimmed.length > 10 && trimmed.length < 100) {
          points.push(trimmed);
        }
      }
    }

    return points.slice(0, 5); // 每节最多5个关键点
  }

  // 与原始大纲对比
  compareOutlines(original, extracted) {
    const comparison = {
      titleMatch: false,
      sections: [],
      missingSections: [],
      extraSections: [],
      deviatedSections: [],
      score: 0,
    };

    // 比较标题
    comparison.titleMatch = original.title === extracted.title;

    // 构建原始大纲的章节映射
    const originalSections = new Map();
    for (const section of original.sections) {
      originalSections.set(section.title, section);
    }

    // 构建提取大纲的章节映射
    const extractedSections = new Map();
    for (const section of extracted.sections) {
      extractedSections.set(section.title, section);
    }

    // 找出缺失的章节
    for (const [title] of originalSections) {
      if (!extractedSections.has(title)) {
        comparison.missingSections.push(title);
      }
    }

    // 找出多余的章节
    for (const [title] of extractedSections) {
      if (!originalSections.has(title)) {
        comparison.extraSections.push(title);
      }
    }

    // 比较共同章节
    for (const [title, originalSection] of originalSections) {
      const extractedSection = extractedSections.get(title);
      if (extractedSection) {
        const sectionComparison = {
          title,
          originalKeyPoints: originalSection.keyPoints || [],
          extractedKeyPoints: extractedSection.keyPoints || [],
          coverage: 0,
          deviations: [],
        };

        // 计算覆盖率
        if (originalSection.keyPoints && originalSection.keyPoints.length > 0) {
          const covered = originalSection.keyPoints.filter(point =>
            extractedSection.keyPoints?.some(ep =>
              calculateSimilarity(point, ep) > 0.3
            )
          );
          sectionComparison.coverage = covered.length / originalSection.keyPoints.length;
        }

        // 检测偏离
        for (const ep of (extractedSection.keyPoints || [])) {
          const isDeviation = !(originalSection.keyPoints || []).some(op =>
            calculateSimilarity(op, ep) > 0.3
          );
          if (isDeviation) {
            sectionComparison.deviations.push(ep);
          }
        }

        comparison.sections.push(sectionComparison);
      }
    }

    // 计算总分
    const totalSections = original.sections.length;
    const coveredSections = comparison.sections.filter(s => s.coverage > 0.5).length;
    comparison.score = (coveredSections / totalSections) * 100;

    return comparison;
  }

  // 标记遗漏/偏离/冗余部分
  markIssues(comparison) {
    const issues = [];

    // 遗漏部分
    for (const section of comparison.missingSections) {
      issues.push({
        type: 'missing',
        severity: 'high',
        description: `章节 "${section}" 在正文中未找到`,
      });
    }

    // 偏离部分
    for (const section of comparison.sections) {
      if (section.deviations.length > 0) {
        issues.push({
          type: 'deviation',
          severity: 'medium',
          description: `章节 "${section.title}" 存在偏离大纲的内容`,
          details: section.deviations,
        });
      }

      if (section.coverage < 0.3) {
        issues.push({
          type: 'underdeveloped',
          severity: 'medium',
          description: `章节 "${section.title}" 未充分展开`,
          coverage: section.coverage,
        });
      }
    }

    // 冗余部分
    for (const section of comparison.extraSections) {
      issues.push({
        type: 'redundant',
        severity: 'low',
        description: `章节 "${section}" 不在原始大纲中`,
      });
    }

    return issues;
  }

  // 生成校验报告
  generateReport(originalPath, extractedPath) {
    const original = this.extractOutline(originalPath);
    const extracted = this.extractOutline(extractedPath);

    const comparison = this.compareOutlines(original, extracted);
    const issues = this.markIssues(comparison);

    let report = `# 反向大纲校验报告

## 生成时间
${new Date().toISOString()}

## 原始大纲
- **标题**: ${original.title}
- **章节数**: ${original.sections.length}

## 提取大纲
- **标题**: ${extracted.title}
- **章节数**: ${extracted.sections.length}

## 对比结果
- **标题匹配**: ${comparison.titleMatch ? '✅ 是' : '❌ 否'}
- **总体得分**: ${comparison.score.toFixed(1)}%

## 章节对比

| 章节 | 覆盖率 | 状态 |
|------|--------|------|
`;

    for (const section of comparison.sections) {
      const status = section.coverage > 0.7 ? '✅' : section.coverage > 0.3 ? '⚠️' : '❌';
      report += `| ${section.title} | ${(section.coverage * 100).toFixed(1)}% | ${status} |\n`;
    }

    if (comparison.missingSections.length > 0) {
      report += '\n## 缺失章节\n';
      for (const section of comparison.missingSections) {
        report += `- ❌ ${section}\n`;
      }
    }

    if (comparison.extraSections.length > 0) {
      report += '\n## 多余章节\n';
      for (const section of comparison.extraSections) {
        report += `- ⚠️ ${section}\n`;
      }
    }

    if (issues.length > 0) {
      report += '\n## 问题清单\n';
      for (const issue of issues) {
        const icon = issue.severity === 'high' ? '🔴' : issue.severity === 'medium' ? '🟡' : '🟢';
        report += `${icon} **[${issue.type}]** ${issue.description}\n`;
      }
    }

    report += '\n## 建议\n';

    if (comparison.score >= 80) {
      report += '✅ 论文结构与大纲高度一致，保持当前写作方向。\n';
    } else if (comparison.score >= 60) {
      report += '⚠️ 论文结构与大纲基本一致，但有部分偏离，建议检查。\n';
    } else {
      report += '❌ 论文结构与大纲偏差较大，建议重新审视写作方向。\n';
    }

    return { report, comparison, issues, score: comparison.score };
  }

  // 计算漂移分数（0-1，0 表示完全一致，1 表示完全偏离）
  calculateDriftScore(original, extracted) {
    const comparison = this.compareOutlines(original, extracted);
    const totalSections = original.sections.length || 1;

    const missingRatio = comparison.missingSections.length / totalSections;
    const extraRatio = comparison.extraSections.length / totalSections;

    let deviatedSections = 0;

    for (const section of comparison.sections) {
      if (section.deviations.length > 0) {
        deviatedSections++;
      }
    }

    const deviationRatio = deviatedSections / totalSections;
    const avgCoverage = comparison.sections.length > 0
      ? comparison.sections.reduce((sum, s) => sum + s.coverage, 0) / comparison.sections.length
      : 0;

    const driftScore = Math.min(1,
      missingRatio * 0.3 +
      extraRatio * 0.2 +
      deviationRatio * 0.3 +
      (1 - avgCoverage) * 0.2
    );

    return {
      driftScore,
      missingSections: comparison.missingSections,
      extraSections: comparison.extraSections,
      deviatedSections: comparison.sections.filter(s => s.deviations.length > 0).map(s => s.title),
      avgCoverage,
      comparison,
    };
  }

  // 确保写作不跑题
  verifyNoDrift(originalPath, extractedPath, threshold = 60) {
    const result = this.generateReport(originalPath, extractedPath);

    return {
      passed: result.score >= threshold,
      score: result.score,
      threshold,
      issues: result.issues.filter(i => i.severity === 'high' || i.severity === 'medium'),
      report: result.report,
    };
  }

  // 检测漂移并返回详细信息
  detectDrift(originalPath, extractedPath, driftThreshold = 0.3) {
    const original = this.extractOutline(originalPath);
    const extracted = this.extractOutline(extractedPath);
    const driftResult = this.calculateDriftScore(original, extracted);

    return {
      isDrifted: driftResult.driftScore > driftThreshold,
      driftScore: driftResult.driftScore,
      driftThreshold,
      missingSections: driftResult.missingSections,
      extraSections: driftResult.extraSections,
      deviatedSections: driftResult.deviatedSections,
      avgCoverage: driftResult.avgCoverage,
      comparison: driftResult.comparison,
    };
  }
}

module.exports = { ReverseOutlineVerifier };
