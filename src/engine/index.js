// ============================================================
// OpenPip 引擎模块总入口
// ============================================================

// ── Lazy Loading Infrastructure ──

const _lazy = {};

function lazy(name, loader) {
  Object.defineProperty(_lazy, name, {
    get() {
      const mod = loader();
      Object.defineProperty(_lazy, name, { value: mod });
      return mod;
    },
    configurable: true,
  });
}

// ── Core — Always Loaded ──

const { callLLM, budgetTracker } = require('./llm/llm');
const { loadRole: loadAgent } = require('./roles/loader');
const { dispatchRole: dispatchAgent } = require('./roles/dispatcher');
const { loadKnowledge } = require('./knowledge/knowledge');
const {
  loadPipeline,
  initProject,
  runPipeline,
  getProjectInfo,
} = require('./pipeline');
const { qualityCheck } = require('./quality/quality-check');
const { reviewLoop } = require('./review/review-loop');
const { processAnnotations } = require('./features/annotation');

// ── Resource Resolver ──
const { ResourceResolver } = require('./resource-resolver');

lazy('knowledgeRag', () => require('./knowledge/knowledge-rag'));
lazy('knowledgeGrowth', () => require('./knowledge/knowledge-growth'));

// ── Quality — Reverse Outline ──

lazy('reverseOutline', () => require('./quality/reverse-outline'));

// ── Runtime — Model Router ──

lazy('modelRouter', () => require('./llm/model-router'));

// ── UI — Event Bus, Visual Progress, Debug ──

lazy('eventBus', () => require('./infra/event-bus'));
lazy('visualProgress', () => require('./infra/visual-progress'));
lazy('debugObservability', () => require('./infra/debug-observability'));

// ── Features — Figure, LaTeX, Data Provenance, etc. ──

lazy('figureGenerator', () => require('./output/figure-generator'));
lazy('figureLinker', () => require('./output/figure-linker'));
lazy('latexExporter', () => require('./output/latex-exporter'));
lazy('dataProvenance', () => require('./output/data-provenance'));
lazy('versionManager', () => require('./state/version-manager'));

// ── Review — Iterative Review, Convergence, Anti-Sycophancy ──

lazy('iterativeReview', () => require('./review/iterative-review'));
lazy('convergenceDetector', () => require('./state/convergence-detector'));
lazy('antiSycophancy', () => require('./review/anti-sycophancy'));

// ── Fact Verification — Verifier, Feedback Parser ──

lazy('factVerifier', () => require('./quality/fact-verifier'));
lazy('feedbackParser', () => require('./feedback-parser'));

// ── Utils ──

lazy('utils', () => require('./utils'));
lazy('validate', () => require('./validate'));

// ── Exports — Flattened named exports (backward-compatible) ──

module.exports = {
  // ── Core (always loaded) ────────────────────────────────
  callLLM,
  budgetTracker,
  loadAgent,
  dispatchAgent,
  loadKnowledge,
  loadPipeline,
  initProject,
  runPipeline,
  getProjectInfo,
  qualityCheck,
  reviewLoop,
  processAnnotations,

  // ── Resource Resolver ────────────────────────────────────
  ResourceResolver,

  // ── Knowledge ───────────────────────────────────────────
  // RAG
  get TFIDF() { return _lazy.knowledgeRag.TFIDF; },
  get precomputeIndex() { return _lazy.knowledgeRag.precomputeIndex; },

  // Growth
  get KnowledgeGrowthManager() { return _lazy.knowledgeGrowth.KnowledgeGrowthManager; },

  // ── Quality ─────────────────────────────────────────────
  // Reverse Outline
  get ReverseOutlineVerifier() { return _lazy.reverseOutline.ReverseOutlineVerifier; },

  // ── Runtime ─────────────────────────────────────────────
  // Model Router
  get routeModel() { return _lazy.modelRouter.routeModel; },
  get routeModelForAgent() { return _lazy.modelRouter.routeModelForAgent; },
  get AGENT_TIER_MAP() { return _lazy.modelRouter.AGENT_TIER_MAP; },

  // Validate
  get validateAll() { return _lazy.validate.validateAll; },
  get formatErrors() { return _lazy.validate.formatErrors; },

  // ── UI ──────────────────────────────────────────────────
  // Event Bus
  get EventBus() { return _lazy.eventBus.EventBus; },

  // Visual Progress
  get ProgressBar() { return _lazy.visualProgress.ProgressBar; },

  // Debug Observability
  get ExecutionTracer() { return _lazy.debugObservability.ExecutionTracer; },

  // ── Features ────────────────────────────────────────────
  // Figure Generator & Linker
  get FigureGenerator() { return _lazy.figureGenerator.FigureGenerator; },
  get FigureLinker() { return _lazy.figureLinker.FigureLinker; },

  // LaTeX Exporter
  get exportToLatex() { return _lazy.latexExporter.exportToLatex; },

  // Data Provenance
  get DataProvenance() { return _lazy.dataProvenance.DataProvenance; },

  // Version Manager
  get VersionManager() { return _lazy.versionManager.VersionManager; },

  // ── Review ──────────────────────────────────────────────
  get iterativeReview() { return _lazy.iterativeReview.iterativeReview; },
  get detectConvergence() { return _lazy.convergenceDetector.detectConvergence; },
  get AntiSycophancyChecker() { return _lazy.antiSycophancy.AntiSycophancyChecker; },

  // ── Fact Verification ───────────────────────────────────
  get FactVerifier() { return _lazy.factVerifier.FactVerifier; },
  get FeedbackParser() { return _lazy.feedbackParser.FeedbackParser; },

  // ── Utils ───────────────────────────────────────────────
  get utils() { return _lazy.utils; },
};
