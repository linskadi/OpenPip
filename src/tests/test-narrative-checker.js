const { extractPromises } = require('../engine/quality/promise-extractor');
const { checkNarrative } = require('../engine/quality/narrative-checker');

// Test 1: extract promises
const intro = '本文提出了一种新的故障诊断方法。主要贡献包括：1）设计了新的网络架构；2）提出了自适应训练策略。';
const promises = extractPromises(intro);
if (promises.length === 0) throw new Error('Should extract promises');

// Test 2: check narrative with sections
const sections = [
  { title: '引言', text: intro },
  { title: '方法', text: '我们设计了基于Transformer的网络架构，包含自注意力机制和位置编码。' },
  { title: '实验', text: '实验结果表明准确率达到95.2%，比基线高2.3%。' },
  { title: '结论', text: '本文提出了新的故障诊断方法，在实验中验证了有效性。' },
];
const results = checkNarrative(intro, promises, sections);
if (!Array.isArray(results)) throw new Error('Should return array');

// Test 3: generate report
const { generateReport } = require('../engine/quality/narrative-checker');
const report = generateReport(results);
if (!report.includes('叙事连贯性检查报告')) throw new Error('Missing report header');

console.log('✅ test-narrative-checker passed');
