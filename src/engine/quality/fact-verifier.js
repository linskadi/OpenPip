const { readFileSync, existsSync } = require('fs');
const { findOverClaims } = require('./over-claim-patterns');

// 三重学术真实性保障引擎
class FactVerifier {
  constructor(projectRoot) {
    this.projectRoot = projectRoot;
  }

  // 引用可查性校验
  verifyCitations(paperPath) {
    if (!existsSync(paperPath)) {
      return { valid: false, issues: [{ type: 'file_not_found', description: `文件不存在: ${paperPath}` }], inlineCitations: [], referenceCount: 0 };
    }
    const content = readFileSync(paperPath, 'utf-8');
    const issues = [];

    // 提取正文引用 [N] 或 [N, N, ...]
    const inlineCitations = new Set();
    const inlinePattern = /\[(\d+(?:,\s*\d+)*)\]/g;
    let match;
    while ((match = inlinePattern.exec(content)) !== null) {
      const nums = match[1].split(',').map(n => parseInt(n.trim()));
      for (const n of nums) inlineCitations.add(n);
    }

    // 提取参考文献列表 [N] 开头的条目
    const refListPattern = /^\[(\d+)\]\s*/gm;
    const referenceList = new Set();
    while ((match = refListPattern.exec(content)) !== null) {
      referenceList.add(parseInt(match[1]));
    }

    // 悬空引用：正文引用了但参考文献列表中没有
    for (const num of inlineCitations) {
      if (!referenceList.has(num)) {
        issues.push({
          type: 'dangling_reference',
          severity: 'high',
          citation: `[${num}]`,
          description: `悬空引用: 正文引用了 [${num}]，但参考文献列表中不存在该条目`,
        });
      }
    }

    // 孤立参考文献：列表中有但正文从未引用
    for (const num of referenceList) {
      if (!inlineCitations.has(num)) {
        issues.push({
          type: '孤立引用',
          severity: 'medium',
          citation: `[${num}]`,
          description: `孤立参考文献: [${num}] 在参考文献列表中但正文未引用`,
        });
      }
    }

    // 格式错误：引用编号不连续
    const sortedRefs = Array.from(referenceList).sort((a, b) => a - b);
    for (let i = 1; i < sortedRefs.length; i++) {
      if (sortedRefs[i] !== sortedRefs[i - 1] + 1) {
        issues.push({
          type: 'reference_gap',
          severity: 'medium',
          description: `参考文献编号跳跃: [${sortedRefs[i - 1]}] -> [${sortedRefs[i]}]`,
        });
      }
    }

    // 格式错误：引用列表条目格式不规范
    const refSection = this.extractReferenceSection(content);
    if (refSection) {
      const refLines = refSection.split('\n').filter(l => l.trim().startsWith('['));
      for (const line of refLines) {
        const numMatch = line.match(/^\[(\d+)\]/);
        if (numMatch) {
          const afterNum = line.substring(numMatch[0].length).trim();
          // 检查是否有作者、标题、期刊基本结构
          if (afterNum.length < 10) {
            issues.push({
              type: 'reference_incomplete',
              severity: 'medium',
              citation: line.substring(0, 60),
              description: `参考文献条目可能不完整: "${line.substring(0, 80)}"`,
            });
          }
        }
      }
    }

    return {
      valid: issues.length === 0,
      issues,
      inlineCitations: Array.from(inlineCitations).sort((a, b) => a - b),
      referenceCount: referenceList.size,
    };
  }

  // 数据一致性校验
  verifyDataConsistency(paperPath) {
    if (!existsSync(paperPath)) {
      return { valid: false, issues: [{ type: 'file_not_found', description: `文件不存在: ${paperPath}` }], dataPointsFound: 0 };
    }
    const content = readFileSync(paperPath, 'utf-8');
    const issues = [];

    // 提取所有数值声明
    const dataPoints = this.extractAllDataPoints(content);

    // 按数据名称分组，检查同一数据是否在不同位置出现且不一致
    const dataGroups = {};
    for (const dp of dataPoints) {
      const key = this.normalizeDataKey(dp.name);
      if (!dataGroups[key]) dataGroups[key] = [];
      dataGroups[key].push(dp);
    }

    for (const points of Object.values(dataGroups)) {
      if (points.length < 2) continue;
      const values = [...new Set(points.map(p => p.numericValue).filter(v => v !== null))];
      if (values.length > 1) {
        issues.push({
          type: 'data_inconsistency',
          severity: 'high',
          dataName: points[0].name,
          values,
          locations: points.map(p => ({
            text: p.context.substring(0, 80),
            line: p.line,
          })),
          description: `数据 "${points[0].name}" 在不同位置出现不一致的值: ${values.join(', ')}`,
        });
      }
    }

    // 检查图表数据与正文描述是否一致
    const tableData = this.extractTableData(content);
    const textData = this.extractTextDataClaims(content);

    for (const textClaim of textData) {
      for (const tableEntry of tableData) {
        if (this.isSameData(textClaim, tableEntry)) {
          if (textClaim.value !== tableEntry.value) {
            issues.push({
              type: 'table_text_mismatch',
              severity: 'high',
              textValue: textClaim.value,
              tableValue: tableEntry.value,
              description: `正文描述 "${textClaim.name}=${textClaim.value}" 与表格数据 ${tableEntry.value} 不一致`,
            });
          }
        }
      }
    }

    return {
      valid: issues.length === 0,
      issues,
      dataPointsFound: dataPoints.length,
    };
  }

  // 来源陈述校验
  verifySourceClaims(paperPath) {
    if (!existsSync(paperPath)) {
      return { valid: false, issues: [{ type: 'file_not_found', description: `文件不存在: ${paperPath}` }] };
    }
    const content = readFileSync(paperPath, 'utf-8');
    const issues = [];
    const lines = content.split('\n');

    // 无来源论断的常见模式
    const unsourcedPatterns = [
      { regex: /(?:实验证明|实验表明|实验结果表明|数据表明|数据显示)\s*[，,]?\s*([^。，,\n]{10,60})/g, desc: '实验/数据论断' },
      { regex: /(?:据统计|根据统计|统计结果显示)\s*[，,]?\s*([^。，,\n]{10,60})/g, desc: '统计论断' },
      { regex: /(?:研究表明|研究发现|已有研究显示)\s*[，,]?\s*([^。，,\n]{10,60})/g, desc: '研究论断' },
    ];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const { regex, desc } of unsourcedPatterns) {
        let match;
        while ((match = regex.exec(line)) !== null) {
          // 检查该论断附近是否有引用标记
          const surrounding = line.substring(Math.max(0, match.index - 20), match.index + match[0].length + 20);
          if (!/\[\d+\]/.test(surrounding)) {
            issues.push({
              type: 'unsourced_claim',
              severity: 'medium',
              line: i + 1,
              claim: match[0].substring(0, 80),
              category: desc,
              description: `无来源论断 (${desc}): "${match[0].substring(0, 60)}" 未附引用`,
            });
          }
        }
      }
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  }

  // 自动生成事实溯源报告
  generateProvenanceReport(paperPath) {
    if (!existsSync(paperPath)) {
      return { provenance: { userProvided: [], knowledgeBase: [], literatureCitation: [], originalDerivation: [] }, summary: { userProvided: 0, knowledgeBase: 0, literatureCitation: 0, originalDerivation: 0, unmarkedClaims: 0 }, unmarked: [] };
    }
    const content = readFileSync(paperPath, 'utf-8');
    const lines = content.split('\n');

    const provenance = {
      userProvided: [],
      knowledgeBase: [],
      literatureCitation: [],
      originalDerivation: [],
    };

    // 检测用户提供的标记
    const userPatterns = [
      /\[用户提供的数据\]/g,
      /\[用户数据\]/g,
    ];
    // 检测知识库收录标记
    const kbPatterns = [
      /\[知识库收录\]/g,
      /\[知识库\]/g,
    ];
    // 检测文献引用
    const litPatterns = [
      /\[文献引用\]/g,
      /\[(\d+)\]/g,
    ];
    // 检测原创推导标记
    const origPatterns = [
      /\[原创推导/g,
      /\[未经验证\]/g,
    ];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      for (const p of userPatterns) {
        let m;
        while ((m = p.exec(line)) !== null) {
          provenance.userProvided.push({
            line: lineNum,
            text: line.substring(Math.max(0, m.index - 30), m.index + m[0].length + 30).trim(),
          });
        }
      }

      for (const p of kbPatterns) {
        let m;
        while ((m = p.exec(line)) !== null) {
          provenance.knowledgeBase.push({
            line: lineNum,
            text: line.substring(Math.max(0, m.index - 30), m.index + m[0].length + 30).trim(),
          });
        }
      }

      for (const p of origPatterns) {
        let m;
        while ((m = p.exec(line)) !== null) {
          provenance.originalDerivation.push({
            line: lineNum,
            text: line.substring(Math.max(0, m.index - 30), m.index + m[0].length + 30).trim(),
          });
        }
      }

      // 检查是否有引用标记但未分类
      for (const p of litPatterns) {
        let m;
        while ((m = p.exec(line)) !== null) {
          const num = m[1] ? parseInt(m[1]) : null;
          if (num && !line.includes('[用户') && !line.includes('[知识库') && !line.includes('[原创')) {
            provenance.literatureCitation.push({
              line: lineNum,
              citation: `[${num}]`,
              text: line.substring(Math.max(0, m.index - 30), m.index + m[0].length + 30).trim(),
            });
          }
        }
      }
    }

    // 统计无标记论断（未标注来源的段落）
    const paragraphs = content.split(/\n\s*\n/);
    const unmarked = [];
    for (const para of paragraphs) {
      const trimmed = para.trim();
      if (trimmed.length < 30) continue;
      const hasAnyMarker = /\[用户|\[知识库|\[文献|\[原创|\[\d+\]/.test(trimmed);
      if (!hasAnyMarker && /^[^#[-]/.test(trimmed)) {
        unmarked.push({
          text: trimmed.substring(0, 100),
        });
      }
    }

    return {
      provenance,
      summary: {
        userProvided: provenance.userProvided.length,
        knowledgeBase: provenance.knowledgeBase.length,
        literatureCitation: provenance.literatureCitation.length,
        originalDerivation: provenance.originalDerivation.length,
        unmarkedClaims: unmarked.length,
      },
      unmarked,
    };
  }

  // 幻觉风险检测
  checkHallucinationRisk(paperPath) {
    if (!existsSync(paperPath)) {
      return { valid: false, issues: [{ type: 'file_not_found', description: `文件不存在: ${paperPath}` }] };
    }
    const content = readFileSync(paperPath, 'utf-8');
    const issues = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // 过于精确的数字没有引用来源
      const preciseNumbers = [
        /(\d+\.\d{2,})\s*%/g,           // 如 98.76%
        /(\d{1,3}\.\d{4,})\s*(?:mm|MPa|GPa|N·m|℃|°C)/g, // 如 123.4567 mm
      ];

      for (const regex of preciseNumbers) {
        let match;
        while ((match = regex.exec(line)) !== null) {
          const surrounding = line.substring(Math.max(0, match.index - 40), match.index + match[0].length + 40);
          if (!/\[\d+\]/.test(surrounding) && !/\[用户/.test(surrounding) && !/\[知识库/.test(surrounding)) {
            issues.push({
              type: 'precise_number_unsourced',
              severity: 'high',
              line: lineNum,
              value: match[0],
              context: surrounding.trim(),
              description: `过于精确的数值 "${match[0]}" 缺少引用来源，可能是幻觉`,
            });
          }
        }
      }

      // 绝对化表述（统一调用 over-claim-patterns 中心化模块）
      const overClaims = findOverClaims(line, 'cn');
      for (const m of overClaims) {
        const idx = m.index;
        const surrounding = line.substring(Math.max(0, idx - 30), idx + m.pattern.length + 30);
        if (!/\[\d+\]/.test(surrounding)) {
          issues.push({
            type: 'absolute_claim',
            severity: 'medium',
            line: lineNum,
            term: m.pattern,
            text: m.pattern,
            context: surrounding.trim(),
            description: `绝对化表述 "${m.pattern}" 缺少引用支撑，存在幻觉风险`,
          });
        }
      }
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  }

  // 综合检查
  checkAll(paperPath) {
    console.log('\n🔍 执行事实真实性校验...');

    const results = {
      citations: this.verifyCitations(paperPath),
      dataConsistency: this.verifyDataConsistency(paperPath),
      sourceClaims: this.verifySourceClaims(paperPath),
      hallucinationRisk: this.checkHallucinationRisk(paperPath),
    };

    const provenance = this.generateProvenanceReport(paperPath);

    const allValid = Object.values(results).every(r => r.valid);
    const totalIssues = Object.values(results).reduce((sum, r) => sum + r.issues.length, 0);

    console.log(`  ${allValid ? '✅' : '⚠️'} 校验完成: ${totalIssues} 个问题`);

    return {
      valid: allValid,
      results,
      provenance,
      totalIssues,
    };
  }

  // === 辅助方法 ===

  extractReferenceSection(content) {
    const refStart = content.lastIndexOf('## 参考文献');
    if (refStart === -1) return null;
    const afterRef = content.substring(refStart);
    const nextSection = afterRef.indexOf('\n## ', 10);
    return nextSection === -1 ? afterRef : afterRef.substring(0, nextSection);
  }

  extractAllDataPoints(content) {
    const points = [];
    const lines = content.split('\n');
    const patterns = [
      { regex: /(\S+?)\s*(?:为|达到|是|等于)\s*(\d+(?:\.\d+)?)\s*(%|mm|MPa|GPa|℃|°C|N·m)?/g, nameGroup: 1, valueGroup: 2 },
      { regex: /(?:提升|提高|增加|增长)\s*(?:了)?\s*(\d+(?:\.\d+)?)\s*%/g, nameGroup: null, valueGroup: 1 },
    ];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const { regex, nameGroup, valueGroup } of patterns) {
        let match;
        while ((match = regex.exec(line)) !== null) {
          points.push({
            name: nameGroup ? match[nameGroup] : match[0].substring(0, 10),
            numericValue: parseFloat(match[valueGroup]),
            context: line.substring(Math.max(0, match.index - 40), match.index + match[0].length + 40),
            line: i + 1,
          });
        }
      }
    }
    return points;
  }

  normalizeDataKey(name) {
    return name.replace(/[\s\u3000]+/g, '').toLowerCase();
  }

  extractTableData(content) {
    const data = [];
    const tablePattern = /\|([^|\n]+)\|([^|\n]+)\|/g;
    let match;
    while ((match = tablePattern.exec(content)) !== null) {
      const name = match[1].trim();
      const value = parseFloat(match[2].trim());
      if (!isNaN(value)) {
        data.push({ name, value });
      }
    }
    return data;
  }

  extractTextDataClaims(content) {
    const claims = [];
    const patterns = [
      /(\S+?)\s*(?:为|达到|是)\s*(\d+(?:\.\d+)?)\s*(%|mm|MPa)?/g,
    ];
    for (const regex of patterns) {
      let match;
      while ((match = regex.exec(content)) !== null) {
        claims.push({
          name: match[1],
          value: parseFloat(match[2]),
        });
      }
    }
    return claims;
  }

  isSameData(claim, tableEntry) {
    const a = claim.name.replace(/[\s\u3000]+/g, '');
    const b = tableEntry.name.replace(/[\s\u3000]+/g, '');
    return a.includes(b) || b.includes(a);
  }
}

module.exports = { FactVerifier };
