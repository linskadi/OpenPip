// OpenPip 完整自检测试
console.log('=== OpenPip 完整自检测试 ===\n');

const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '..', '..');

const results = {
  passed: 0,
  failed: 0,
  errors: [],
};

function test(name, fn) {
  try {
    fn();
    console.log(`✅ ${name}`);
    results.passed++;
  } catch (err) {
    console.log(`❌ ${name}: ${err.message}`);
    results.failed++;
    results.errors.push({ name, error: err.message });
  }
}

// 测试核心模块
console.log('\n--- 核心模块 ---');

test('LLM 模块', () => {
  const { callLLM, callLLMWithRetry } = require('../engine/llm/llm');
  if (!callLLM || !callLLMWithRetry) throw new Error('导出缺失');
});

test('Agent 模块', () => {
  const { loadAgent } = require('../engine/roles/loader');
  const { dispatchAgent } = require('../engine/roles/dispatcher');
  if (!loadAgent || !dispatchAgent) throw new Error('导出缺失');
});

test('知识库模块', () => {
  const { loadKnowledge, loadAllKnowledge } = require('../engine/knowledge/knowledge');
  if (!loadKnowledge || !loadAllKnowledge) throw new Error('导出缺失');
});

test('流水线模块', () => {
  const { loadPipeline, runPipeline } = require('../engine/pipeline');
  if (!loadPipeline || !runPipeline) throw new Error('导出缺失');
});

test('知识 RAG 模块', () => {
  const { TFIDF, buildKnowledgeIndex, searchKnowledge } = require('../engine/knowledge/knowledge-rag');
  if (!TFIDF || !buildKnowledgeIndex || !searchKnowledge) throw new Error('导出缺失');
});

test('评审闭环模块', () => {
  const { reviewLoop } = require('../engine/review/review-loop');
  if (!reviewLoop) throw new Error('导出缺失');
});

test('批注模块', () => {
  const { processAnnotations, parseAnnotations } = require('../engine/features/annotation');
  if (!processAnnotations || !parseAnnotations) throw new Error('导出缺失');
});

// 测试 P6 模块
console.log('\n--- P6 模块 ---');

test('数据溯源模块', () => {
  const { DataProvenance } = require('../engine/output/data-provenance');
  if (!DataProvenance) throw new Error('导出缺失');
});

// 测试 P3 模块
console.log('\n--- P3 模块 ---');

test('事件总线模块', () => {
  const { EventBus, EVENT_TYPES } = require('../engine/infra/event-bus');
  if (!EventBus || !EVENT_TYPES) throw new Error('导出缺失');
  const bus = new EventBus();
  if (typeof bus.on !== 'function') throw new Error('EventBus 方法缺失');
});

test('知识自生长模块', () => {
  const { KnowledgeCandidatePool, KnowledgeGrowthManager } = require('../engine/knowledge/knowledge-growth');
  if (!KnowledgeCandidatePool || !KnowledgeGrowthManager) throw new Error('导出缺失');
});

test('版本管理模块', () => {
  const { VersionManager } = require('../engine/state/version-manager');
  if (!VersionManager) throw new Error('导出缺失');
});

// 测试 P4 模块
console.log('\n--- P4 模块 ---');

test('模型路由模块', () => {
  const { routeModel, routeHybridModel, loadTierMatrix } = require('../engine/llm/model-router');
  if (!routeModel || !routeHybridModel || !loadTierMatrix) throw new Error('导出缺失');
  const result = routeModel('writing');
  if (!result || !result.model) throw new Error('模型路由失败');
});

test('反向大纲模块', () => {
  const { ReverseOutlineVerifier } = require('../engine/quality/reverse-outline');
  if (!ReverseOutlineVerifier) throw new Error('导出缺失');
});

// 测试额外功能模块
console.log('\n--- 额外功能模块 ---');

test('调试可观测模块', () => {
  const { ExecutionTracer } = require('../engine/infra/debug-observability');
  if (!ExecutionTracer) throw new Error('导出缺失');
});

test('可视化进度模块', () => {
  const { ProgressBar, StageProgressTracker } = require('../engine/infra/visual-progress');
  if (!ProgressBar || !StageProgressTracker) throw new Error('导出缺失');
});

test('竞赛评审模块', () => {
  const { iterativeReview } = require('../engine/review/iterative-review');
  if (!iterativeReview) throw new Error('导出缺失');
});

test('收敛检测模块', () => {
  const { detectConvergence } = require('../engine/state/convergence-detector');
  if (!detectConvergence) throw new Error('导出缺失');
});

test('反阿谀模块', () => {
  const { AntiSycophancyChecker } = require('../engine/review/anti-sycophancy');
  if (!AntiSycophancyChecker) throw new Error('导出缺失');
});

test('事实校验模块', () => {
  const { FactVerifier } = require('../engine/quality/fact-verifier');
  if (!FactVerifier) throw new Error('导出缺失');
});

test('反馈解析模块', () => {
  const { FeedbackParser } = require('../engine/feedback-parser');
  if (!FeedbackParser) throw new Error('导出缺失');
});

test('LaTeX导出模块', () => {
  const { exportToLatex, DOCUMENT_CLASSES } = require('../engine/output/latex-exporter');
  if (!exportToLatex || !DOCUMENT_CLASSES) throw new Error('导出缺失');
  if (!DOCUMENT_CLASSES.competition) throw new Error('竞赛模板缺失');
});

test('图表链接模块', () => {
  const { FigureLinker, scanFigureAnnotations } = require('../engine/output/figure-linker');
  if (!FigureLinker || !scanFigureAnnotations) throw new Error('导出缺失');
});

test('常量模块', () => {
  const { FORBIDDEN_WORDS } = require('../engine/constants');
  if (!FORBIDDEN_WORDS || FORBIDDEN_WORDS.length < 50) throw new Error('禁用词列表不完整');
});

// 测试统一导出
console.log('\n--- 统一导出 ---');

test('index.js 统一导出', () => {
  const engine = require('../engine/index');
  const requiredExports = [
    'callLLM', 'loadAgent', 'dispatchAgent', 'loadKnowledge',
    'loadPipeline', 'runPipeline', 'TFIDF', 'reviewLoop',
    'DataProvenance',
    'EventBus', 'KnowledgeGrowthManager', 'VersionManager',
    'routeModel', 'ReverseOutlineVerifier',
    'ExecutionTracer', 'ProgressBar',
    'FigureGenerator', 'FigureLinker', 'FactVerifier', 'FeedbackParser',
    'iterativeReview', 'detectConvergence', 'AntiSycophancyChecker',
    'validateAll', 'formatErrors',
    'routeModelForAgent', 'AGENT_TIER_MAP',
    'budgetTracker',
    'exportToLatex',
    'qualityCheck',
    'ResourceResolver',
    'utils',
  ];

  for (const exp of requiredExports) {
    if (!engine[exp]) throw new Error(`缺少导出: ${exp}`);
  }
});

test('utils 模块', () => {
  const utils = require('../engine/utils');
  const requiredFns = [
    'generateId', 'calculateSimilarity', 'parseSections', 'parseMarkdownSectionsCore',
    'extractJsonFromText', 'walkDir',
    'loadJsonFile', 'saveJsonFile', 'loadYaml', 'saveYaml',
    'safeReadFile', 'safeWriteFile',
    'calculateHash', 'formatDuration', 'escapeHtml', 'deduplicateBy',
    'copyDirSync', 'collectFiles',
  ];
  for (const fn of requiredFns) {
    if (typeof utils[fn] !== 'function') throw new Error(`utils 缺少函数: ${fn}`);
  }
});

test('dispatcher 模块', () => {
  const { setDefaultDispatcher, getDefaultDispatcher } = require('../engine/dispatcher-registry');
  if (typeof setDefaultDispatcher !== 'function') throw new Error('缺少 setDefaultDispatcher');
  if (typeof getDefaultDispatcher !== 'function') throw new Error('缺少 getDefaultDispatcher');
});

// 测试配置文件
console.log('\n--- 配置文件 ---');

test('config.json 存在', () => {
  if (!fs.existsSync(path.join(ROOT, '.openpip/config.json'))) throw new Error('config.json 不存在');
  let configStr = fs.readFileSync(path.join(ROOT, '.openpip/config.json'), 'utf-8');
  if (configStr.charCodeAt(0) === 0xFEFF) configStr = configStr.slice(1);
  const config = JSON.parse(configStr);
  if (!config.name || !config.version) throw new Error('config.json 字段不完整');
});

test('Agent 配置完整', () => {
  const agentsDir = path.join(ROOT, '.openpip/role-configs');
  const requiredAgents = [
    'orchestrator', 'researcher', 'planner', 'writer', 'coder',
    'reviewer', 'formatter', 'contribution-architect',
    'adversarial-researcher', 'code-reviewer'
  ];

  for (const agent of requiredAgents) {
    if (!fs.existsSync(`${agentsDir}/${agent}.yaml`)) {
      throw new Error(`角色配置缺失: ${agent}.yaml`);
    }
  }
});

test('提示词文件完整', () => {
  const promptsDir = path.join(ROOT, '.openpip/role-prompts');
  const requiredPrompts = [
    'orchestrator', 'researcher', 'planner', 'writer', 'coder',
    'reviewer', 'formatter', 'contribution-architect',
    'adversarial-researcher', 'code-reviewer'
  ];

  for (const prompt of requiredPrompts) {
    if (!fs.existsSync(`${promptsDir}/${prompt}.md`)) {
      throw new Error(`提示词缺失: ${prompt}.md`);
    }
  }
});

test('流水线配置存在', () => {
  if (!fs.existsSync(path.join(ROOT, '.openpip/pipelines/full-paper.yaml'))) {
    throw new Error('流水线配置缺失');
  }
});

test('eslint.config.js 存在', () => {
  if (!fs.existsSync(path.join(ROOT, 'eslint.config.js'))) throw new Error('eslint.config.js 不存在');
});

// 测试 CLI 命令模块
console.log('\n--- CLI 命令模块 ---');

test('CLI 命令注册表', () => {
  const { getCommand } = require('../cli/commands/index');
  if (typeof getCommand !== 'function') throw new Error('缺少 getCommand');
  const initCmd = getCommand('init');
  if (!initCmd) throw new Error('init 命令未注册');
});

test('CLI 工具模块', () => {
  const { ask, confirm } = require('../cli/utils/readline');
  if (typeof ask !== 'function') throw new Error('缺少 ask');
  if (typeof confirm !== 'function') throw new Error('缺少 confirm');
});

test('CLI 配置工具', () => {
  const config = require('../cli/utils/config');
  if (typeof config.loadConfig !== 'function') throw new Error('缺少 loadConfig');
  if (typeof config.saveConfig !== 'function') throw new Error('缺少 saveConfig');
});

// 测试适配器模块
console.log('\n--- 适配器模块 ---');

test('适配器注册表', () => {
  const { getAdapter, listAdapters } = require('../adapters/index');
  if (typeof getAdapter !== 'function') throw new Error('缺少 getAdapter');
  if (typeof listAdapters !== 'function') throw new Error('缺少 listAdapters');
  const adapters = listAdapters();
  if (adapters.length < 2) throw new Error('适配器数量不足');
});

test('适配器接口一致', () => {
  const { getAdapter } = require('../adapters/index');
  const required = ['name', 'description', 'callLLM', 'readFile', 'writeFile', 'executeCommand'];
  for (const name of ['cli', 'agent']) {
    const adapter = getAdapter(name);
    for (const method of required) {
      if (!adapter[method]) throw new Error(`${name} 缺少 ${method}`);
    }
  }
});

// 输出结果
console.log('\n=== 测试结果 ===');
console.log(`✅ 通过: ${results.passed}`);
console.log(`❌ 失败: ${results.failed}`);
console.log(`总计: ${results.passed + results.failed}`);

if (results.errors.length > 0) {
  console.log('\n--- 失败详情 ---');
  for (const err of results.errors) {
    console.log(`  ${err.name}: ${err.error}`);
  }
}

// 检查路线图完成状态（统计待办区的 checkbox）
console.log('\n--- 路线图待办进度 ---');
const planContent = fs.readFileSync(path.join(ROOT, 'docs', 'ROADMAP.md'), 'utf-8');
const unchecked = (planContent.match(/^[\s]*- \[ \]/gm) || []).length;
const checked = (planContent.match(/^[\s]*- \[x\]/gm) || []).length;

console.log(`✅ 待办区已勾选: ${checked}`);
console.log(`⏳ 待办区未勾选: ${unchecked}`);

if (unchecked > 0) {
  console.log(`\n⚠️ 待办区仍有 ${unchecked} 项未完成（P1-P3 路线图任务）`);
} else {
  console.log('\n🎉 待办区全部完成！');
}

process.exit(results.failed > 0 ? 1 : 0);

