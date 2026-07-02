// Stage constants: task definitions, output paths, chapter prefix
const STAGE_TASKS = {
  research: t => `分析选题方向：${t}。生成研究简报。`,
  'problem-analysis': t => `分析竞赛问题：${t}。生成问题分析报告。`,
  skeleton: t => `基于 research-brief.md / problem-analysis.md 设计论文大纲。选题：${t}。`,
  code: () => '基于 outline 编写并执行建模代码，输出 notebook。',
  draft: () => '基于 outline 逐章撰写正文。',
  summary: () => '基于全文生成结构化摘要。',
  review: () => '以审稿人视角审视论文，输出审稿报告（含完整性附录）。',
  revise: () => '基于审稿意见润色论文，只改表达不改观点。',
  format: () => '格式化论文，应用 GB/T 7714 参考文献规范。',
  figure: () => '基于正文内容生成学术图表代码并渲染。',
  export: () => '将论文转为 LaTeX 并编译 PDF。',
  evolve: () => '分析评审报告，提取失败模式，自动改进 prompt 文件。',
};

const STAGE_OUTPUTS = {
  'contribution-refinement': 'research/contribution-statement.md',
  research: 'research/research-brief.md',
  'literature-synthesis': 'research/literature-synthesis.md',
  'problem-analysis': 'research/problem-analysis.md',
  skeleton: 'drafts/outline-v1.md',
  code: 'drafts/notebook.ipynb',
  draft: 'drafts/draft-v1.md',
  summary: 'drafts/summary.md',
  review: 'output/review-report.md',
  revise: 'drafts/draft-v2.md',
  format: 'output/paper.md',
  figure: 'figures/',
  export: 'output/latex/paper.tex',
  evolve: 'output/evolution-report.md',
};

const CHAPTER_OUTPUT_PREFIX = 'drafts/chapter-';

const ITERATIVE_OUTPUTS = {
  outlineV2: 'drafts/outline-v2.md',
  draftFinal: 'drafts/draft-final.md',
  reviewReport: 'output/iterative-review-report.md',
  iterativeTrace: 'state/iterative-trace.json',
};

const PARALLEL_CONFIG = {
  maxConcurrent: 3,
};

module.exports = { STAGE_TASKS, STAGE_OUTPUTS, CHAPTER_OUTPUT_PREFIX, ITERATIVE_OUTPUTS, PARALLEL_CONFIG };
