# OpenPip API Reference

> v0.1.0 — Programmatic interface for the OpenPip paper-writing engine.

## Quick Start

```js
const { validateAll, initProject, runPipeline } = require('./src/engine');

// Validate configuration (agent/pipeline YAML)
const errors = validateAll(__dirname);
if (errors.length > 0) { console.error(errors); process.exit(1); }

// Initialize a project
initProject('my-paper', __dirname);

// Run the full pipeline
await runPipeline('full-research', 'my-paper', '轴承故障诊断', __dirname, config);
```

---

## Table of Contents

- [Pipeline Engine](#pipeline-engine)
- [Knowledge System](#knowledge-system)
- [Blackboard (Shared State)](#blackboard-shared-state)
- [Agent System](#agent-system)
- [LLM Integration](#llm-integration)
- [Quality Assurance](#quality-assurance)
- [Review System](#review-system)
- [Fact Verification](#fact-verification)
- [Annotation Processing](#annotation-processing)
- [Export](#export)
- [Validation](#validation)
- [Utilities](#utilities)
- [Configuration](#configuration)
- [Type Definitions](#type-definitions)

---

## Pipeline Engine

### `loadPipeline(name, projectRoot) → PipelineConfig`

Loads a pipeline YAML from `.openpip/pipelines/{name}.yaml`.

```js
const { loadPipeline } = require('./src/engine');
const pipeline = loadPipeline('full-research', __dirname);
// => { name, description, stages: [{ id, agent, output, ... }] }
```

**Parameters:**
- `name` (string): Pipeline name (e.g. `'full-research'`, `'lightweight'`)
- `projectRoot` (string): Project root directory

**Returns:** `{ name: string, description?: string, stages: PipelineStage[] }`

若 pipeline YAML 含 `ref` 字段，`loadPipeline` 会递归解引用到目标 pipeline。

### `initProject(projectName, projectRoot) → string`

Creates project directory structure under `papers/{projectName}/`.

```js
const dir = initProject('my-paper', __dirname);
// Creates: papers/my-paper/{research,drafts,output,versions}/
// Creates: papers/my-paper/drafts/consistency-memory.md
```

### `runPipeline(pipelineName, project, topic, projectRoot, config, options?) → Promise<void>`

Executes the full pipeline. Supports checkpoint resume and parallel execution.

**Parameters:**
- `pipelineName` (string): Pipeline to run
- `project` (string): Project name (directory under `papers/`)
- `topic` (string): Paper topic/research question
- `projectRoot` (string): Root directory of the OpenPip project
- `config` (Object): Runtime config (API keys, features, targetVenue)
- `options` (Object, optional):
  - `confirm` (Function): HIL confirmation callback `async (msg) → boolean`
  - `resume` (boolean): Resume from last checkpoint
  - `fromStage` (string): Start from a specific stage
  - `dispatcher` (Function): Custom agent dispatcher
  - `enableReviewLoop` (boolean): Run review loop after completion

```js
await runPipeline('full-research', 'my-paper', '轴承故障诊断', __dirname, config, {
  confirm: async (msg) => { /* return true/false */ },
  resume: true,
});
```

### `getExecutionGroups(stages) → PipelineStage[][]`

Topologically sorts stages into parallel execution groups.

### `getDependencies(stage, allStages) → string[]`

Returns IDs of stages that the given stage depends on (via input file references).

### `loadCheckpoint(projectDir) → Object|null`

Loads the current checkpoint state for resume support.

### `saveCheckpoint(projectDir, checkpoint) → void`

Persists checkpoint state to disk.

### `clearCheckpoint(projectDir) → void`

Removes checkpoint file (called automatically on 100% completion).

### `getCheckpointPath(projectDir) → string`

Returns the absolute path to the checkpoint file.

### `PARALLEL_CONFIG`

```js
{ maxConcurrent: 3 }
```

Maximum concurrent stage execution.

---

## Knowledge System

### `buildKnowledgeIndex(knowledgeDir, options?) → TFIDF`

Builds a TF-IDF index from all `.md` files in the knowledge directory. Uses disk cache when available.

**Parameters:**
- `knowledgeDir` (string): Path to `.openpip/knowledge/`
- `options.useCache` (boolean, default `true`): Whether to use/load cache

```js
const { buildKnowledgeIndex, searchKnowledge } = require('./src/engine/knowledge/knowledge-rag');
const index = buildKnowledgeIndex('.openpip/knowledge');
const results = searchKnowledge(index, '有限元分析 边界条件', 5);
// => [{ id, text, metadata, score }, ...]
```

### `searchKnowledge(index, query, topK?) → SearchResult[]`

Searches the TF-IDF index. Returns sorted results with scores.

**Parameters:**
- `index` (TFIDF): A built knowledge index
- `query` (string): Search query
- `topK` (number, default `5`): Max results

**Returns:** `Array<{ id: string, text: string, metadata: Object, score: number }>`

### `loadKnowledgeHybrid(knownPaths, knowledgeDir, query, options?) → string`

Hybrid search combining TF-IDF + optional embedding retrieval. Always includes core rules.

**Parameters:**
- `knownPaths` (string[]): Knowledge file paths to load
- `knowledgeDir` (string): Knowledge root directory
- `query` (string): Search query for RAG retrieval
- `options.coreRules` (string[], default `['writing/academic-style.md', 'format/gb7714.md']`): Always-included files
- `options.topK` (number, default `5`): Max retrieved chunks

**Returns:** Concatenated knowledge content string

### `precomputeIndex(knowledgeDir) → { filesProcessed, chunksCount, vocabSize, cachePath }`

Pre-computes and caches the TF-IDF index. Useful for CLI warm-up.

### `chunkDocument(text, chunkSize?, overlap?) → string[]`

Splits text into overlapping chunks for indexing.

**Parameters:**
- `text` (string): Input text
- `chunkSize` (number, default `500`): Max characters per chunk
- `overlap` (number, default `100`): Overlap between chunks

### Classes

#### `TFIDF`

```js
const tfidf = new TFIDF();
tfidf.addDocument('doc1', 'Some text content', { file: 'example.md' });
tfidf.computeIDF();
const results = tfidf.search('query text', 5);
```

| Method | Description |
|--------|-------------|
| `addDocument(id, text, metadata?)` | Index a document |
| `computeIDF()` | Compute IDF values (call after all docs added) |
| `search(query, topK?)` | Search with cosine similarity |
| `tokenize(text)` | Tokenize text (CJK-aware) |

#### `EmbeddingIndex`

Vector search via Python subprocess (BGE-M3 model). Falls back gracefully if Python/numpy unavailable.

| Method | Description |
|--------|-------------|
| `addDocuments(docs)` | Batch compute and store embeddings |
| `search(query, topK?)` | Cosine similarity search |
| `loadCache(knowledgeDir)` | Load cached embeddings |
| `saveCache(knowledgeDir)` | Persist embeddings to disk |

#### `HybridSearch`

Combines TF-IDF (40%) + Embedding (60%) scoring.

| Method | Description |
|--------|-------------|
| `addDocument(id, text, metadata?)` | Add document to both indexes |
| `build(knowledgeDir)` | Build all indexes |
| `search(query, topK?)` | Hybrid search |

---

## Blackboard (Shared State)

The Blackboard is a JSON state file (`papers/{project}/state/blackboard.json`) shared between agents with field-level permission control.

### `initBlackboard(projectDir) → Blackboard`

Creates a new blackboard with default empty schema (v4).

```js
const { initBlackboard, loadBlackboard, writeField } = require('./src/engine/state/shared-state');
const bb = initBlackboard('/path/to/project');
```

### `loadBlackboard(projectDir) → Blackboard`

Loads the blackboard from disk, auto-migrating from older versions if needed.

### `saveBlackboard(projectDir, bb) → void`

Persists blackboard to disk. Auto-compresses history.

### `sliceFor(agentName, subtask, bb) → Object`

Returns a permission-filtered slice of the blackboard for a specific agent. This is the primary mechanism for controlling what each agent can see.

**Parameters:**
- `agentName` (string): Agent name (e.g. `'writer'`, `'reviewer'`)
- `subtask` (string|null): Current subtask (e.g. `'draft'`, `'polish'`, `'summary'`)
- `bb` (Blackboard): Full blackboard object

**Returns:** Partial blackboard object containing only fields the agent can read.

```js
const writerSlice = sliceFor('writer', 'draft', bb);
// => { outline, memory, mode, previousChapter? }

const reviewerSlice = sliceFor('reviewer', null, bb);
// => { draft, memory, mode, review }
```

### `writeField(bb, agentName, field, value, options?) → { ok, reason?, oldValue?, newValue? }`

Controlled write with permission check and history tracking.

**Parameters:**
- `bb` (Blackboard): Blackboard object
- `agentName` (string): Writing agent name
- `field` (string): Field name to write
- `value` (any): New value
- `options.summary` (string): History summary
- `options.needFull` (boolean): Store full content in history

### `canRead(agentName, field) → boolean`

Checks if an agent has read permission on a field.

### `appendHistory(bb, entry) → HistoryEntry[]`

Appends an entry to blackboard history with auto-compression.

### `compressHistory(history) → HistoryEntry[]`

Compresses history: keeps last 10 full entries, older entries collapsed to summary.

### `migrateBlackboard(bb) → Blackboard`

Migrates blackboard from v1/v2 to current version (v4).

### `FIELD_PERMISSIONS`

Permission matrix defining which agents can read/write each field:

| Field | Readers | Writers |
|-------|---------|---------|
| `topic` | all | orchestrator, researcher |
| `mode` | all | orchestrator |
| `research` | orchestrator, planner, writer, reviewer | researcher |
| `outline` | orchestrator, writer, coder, reviewer | planner |
| `draft` | orchestrator, writer, reviewer, formatter | writer, formatter |
| `memory` | all | writer, reviewer, coder |
| `review` | orchestrator, writer, reviewer | reviewer |
| `integrity` | orchestrator, reviewer, writer | reviewer |
| `history` | orchestrator, reviewer | all agents |

### `BlackboardCache`

In-memory cache with batched flush for high-frequency updates.

```js
const cache = new BlackboardCache(projectDir, { flushInterval: 30000, maxPending: 5 });
const bb = cache.load();
cache.update(bb => { bb.draft.full = newContent; });
cache.flush();  // Manual flush
cache.destroy(); // Flush + cleanup timer
```

---

## Agent System

### `loadAgent(name, projectRoot, query?) → AgentConfig`

Loads agent YAML config, prompt file, and knowledge content.

**Parameters:**
- `name` (string): Agent name (e.g. `'writer'`, `'reviewer'`)
- `projectRoot` (string): Project root directory
- `query` (string, optional): If provided, uses hybrid RAG to load relevant knowledge

**Returns:**
```js
{
  name: string,
  model: string,          // e.g. 'deepseek/deepseek-chat'
  temperature: number,    // 0-2
  topP: number,           // 0-1
  prompt: string,         // Prompt file reference
  knowledge: string[],    // Knowledge file paths
  promptText: string,     // Loaded prompt content
  _knowledgeContent: string, // Loaded knowledge content
  ensemble: Object|null,  // Ensemble config (reviewer)
  modes: Object|null,     // Subtask modes
  subtasks: Object|null,  // Subtask definitions
}
```

### `dispatchAgent(agentName, task, project, projectRoot, config) → Promise<string>`

Simple dispatch: loads agent and calls LLM with assembled prompt.

**Parameters:**
- `agentName` (string): Agent to dispatch
- `task` (string): Task description
- `project` (string): Project name
- `projectRoot` (string): Project root
- `config` (Object): Runtime config

### `dispatchAgentWithState(agentName, task, project, projectRoot, config) → Promise<string>`

Blackboard-aware dispatch: injects field slices, handles ensemble review, writes results back.

**Parameters:** Same as `dispatchAgent`.

Special behaviors:
- **reviewer** with `ensemble` config → runs `ensembleReview` (5×5 by default)
- **formatter** with `subtask: figure` → runs `FigureGenerator`
- **writer** with `subtask: draft` → tracks chapters, extracts endings for continuity

### `_system` 伪 Agent

`_system` 是特殊伪 agent，用于 `evolve` 等系统内置阶段（见 `full-research`、`competition-math-modeling` 等管线中的 `agent: _system`），无需对应的 role-config 文件，配置校验会跳过对其存在性的检查。

---

## LLM Integration

### `callLLM(model, prompt, config) → Promise<string>`

Single LLM call with timeout (120s) and error classification.

**Supported models:**
- `deepseek/*` → DeepSeek API
- `openrouter/*` → OpenRouter API
- `ollama/*` → Local Ollama endpoint
- Default → DeepSeek API

### `callLLMWithRetry(model, prompt, config, retries?) → Promise<string>`

LLM call with automatic retry, exponential backoff, and fallback model support.

**Parameters:**
- `model` (string): Model identifier
- `prompt` (string): Prompt text
- `config` (Object): Must contain `api_keys`, optionally `fallback`
- `retries` (number, default `2`): Max retry attempts

**Error classification:** network, timeout, auth (401/403), rate_limit (429), server (5xx), unknown.

**Budget check:** Throws if `budgetTracker.isOverBudget()` returns true.

### `budgetTracker`

Global token/cost tracker for the entire pipeline session.

| Property/Method | Description |
|----------------|-------------|
| `totalTokens` | Total tokens consumed |
| `totalCost` | Total cost in USD |
| `budgetLimit` | Budget cap (or null) |
| `agentUsage` | Per-agent usage breakdown |
| `reset(budgetLimit?)` | Reset all counters |
| `record(agentName, tokens, extra?)` | Record usage |
| `isOverBudget() → boolean` | Check budget status |
| `getRemainingBudget() → number` | Remaining budget |
| `getReport() → Object` | Full usage report |
| `getStageReport() → Object` | Per-stage breakdown |

```js
const { budgetTracker } = require('./src/engine');
budgetTracker.reset(5.00); // $5 limit
// ... run pipeline ...
const report = budgetTracker.getReport();
// { totalTokens: 125000, totalCost: '0.2500', budgetLimit: 5, remaining: '4.7500', byAgent: {...} }
```

---

## Quality Assurance

### `qualityCheck(text, options?) → { pass, results, compositeScore }`

Runs all registered quality metrics against the text.

**Parameters:**
- `text` (string): Draft text to check
- `options.mode` (string, `'weighted'|'all_pass'`): Scoring mode (default `'weighted'`)
- `options.metrics` (string[]): Specific metrics to run (default: all)
- `options.minWords` (number): Minimum word count (default `2000`)

**Returns:**
```js
{
  pass: boolean,              // All metrics passed
  compositeScore: number,     // Weighted average (0-100)
  results: {
    forbidden_words: { score, pass, issues },
    citation_density: { score, pass, issues },
    word_count: { score, pass, count, minWords, issues },
    formula_numbering: { score, pass, issues },
    terminology_consistency: { score, pass, issues },
    figure_formula_consistency: { score, pass, issues },
    argumentation_quality: { score, pass, issues },
    narrative_coherence: { score, pass, issues },
  }
}
```

### Individual Check Functions

```js
const { checkForbiddenWords, checkFormulaNumbering, checkWordCount, checkTerminologyConsistency } = require('./src/engine/quality/quality-check');

checkForbiddenWords(text);
// => { score: 100, pass: true, issues: [] }

checkFormulaNumbering(text);
// => { score: 100, pass: true, issues: [] }

checkWordCount(text, 3000);
// => { score: 85, pass: false, count: 2550, minWords: 3000, issues: ['字数 2550 < 要求 3000'] }

checkTerminologyConsistency(text);
// => { score: 100, pass: true, issues: [] }
```

### Custom Metrics

```js
const { registerMetric, getMetric, getAllMetrics, unregisterMetric } = require('./src/engine/quality/quality-check');

registerMetric('my_custom_check', (text, options) => {
  const issues = [];
  // ... check logic ...
  return { score: 95, pass: issues.length === 0, issues };
}, 1.5); // weight

const allMetrics = getAllMetrics(); // [{ name, fn, weight }, ...]
unregisterMetric('my_custom_check');
```

---

## Review System

### `reviewLoop(project, projectRoot, config, options?) → Promise<Object>`

Full review feedback loop: parse comments → generate tasks → execute fixes → verify.

**Parameters:**
- `project` (string): Project name
- `projectRoot` (string): Project root
- `config` (Object): Runtime config
- `options.dispatcher` (Function): Custom dispatcher

**Returns:**
```js
{
  totalComments: number,
  completed: number,
  failed: number,
  results: Array<{ id, agent, severity, problem, status, result }>,
  verifyResult: string | null,
}
```

### `iterativeReview(draft, options?) → Promise<Object>`

Writer↔Reviewer iterative review with convergence detection.

### `parseReviewIssues(reviewText) → Issue[]`

Parses a review report into structured issues.

### `classifyComment(comment) → string`

Returns the agent that should handle the comment (e.g. `'writer'`, `'formatter'`, `'researcher'`).

### Ensemble Review

```js
const {
  ensembleReview,
  REVIEWER_STYLES,
  parsePaperStructure,
} = require('./src/engine/review/ensemble-review');
```

### Iterative Review

```js
const {
  iterativeReview,
  parseReviewIssues,
  classifyComment,
  getPerspectiveForRound,
  medianScore,
  detectConvergence,
  IssueTracker,
  PERSPECTIVES,
} = require('./src/engine/review/iterative-review');
```

### Anti-Sycophancy

```js
const { AntiSycophancyChecker, FrameLockDetector } = require('./src/engine/review/anti-sycophancy');
// Detects AI reviewers that are too lenient or lock into one frame
```

---

## Fact Verification

```js
const { FactVerifier, FeedbackParser } = require('./src/engine');

const verifier = new FactVerifier(projectRoot);
// Runs 4-in-1 check: citations, data, sources, hallucinations
const report = await verifier.verify(draftPath);

const parser = new FeedbackParser();
const feedback = parser.parse(reviewReport);
```

---

## Annotation Processing

### `parseAnnotations(text) → Annotation[]`

Parses `<!-- TODO: ... -->`, `<!-- FIXME: ... -->` etc. from markdown.

**Returns:**
```js
[{
  line: number,
  content: string,
  type: 'TODO' | 'FIXME' | 'NOTE' | 'BUG' | 'HACK' | 'XXX',
  agent: string,  // Auto-classified target agent
  status: 'pending',
}]
```

### `classifyAnnotation(content) → string`

Returns the agent that should handle the annotation.

### `processAnnotations(filePath, project, projectRoot, config, dispatcher?) → Promise<Object>`

Full pipeline: parse → classify → dispatch fixes → report.

### `executeAnnotations(annotations, filePath, project, projectRoot, config, dispatcher?) → Promise<Object>`

Execute fixes for pre-parsed annotations.

---

## Export

### `exportToLatex(draft, options?) → string`

Converts a markdown draft to LaTeX format.

### `generateLatex(draft, options?) → string`

Lower-level LaTeX generation.

```js
const { exportToLatex } = require('./src/engine');
const latex = exportToLatex(draftContent, {
  template: 'ieee',  // or 'nature', 'gb', 'thesis'
  title: '论文标题',
  authors: ['作者1', '作者2'],
});
```

### `generatePythonCode(model, data) → string`

Generates Python code for figure/model rendering.

---

## Validation

### `validateSchema(data, schema, path?) → Array<{path, message}>`

Validates data against a JSON Schema.

```js
const errors = validateSchema(myData, {
  type: 'object',
  required: ['name', 'model'],
  properties: {
    name: { type: 'string', pattern: '^[a-z][a-z0-9-]*$' },
    model: { type: 'string' },
  },
});
```

### `validateAgent(yamlPath) → Array<{path, message}>`

Validates a single agent YAML config file.

### `validatePipeline(yamlPath) → Array<{path, message}>`

Validates a pipeline YAML config file. Checks agent references exist.

### `validateAll(projectRoot?) → Array<{path, message, file}>`

Validates all agent and pipeline configs. Returns all errors.

### `formatErrors(errors) → string`

Formats validation errors into a human-readable string.

```js
const { validateAll, formatErrors } = require('./src/engine');
const errors = validateAll(__dirname);
console.log(formatErrors(errors));
// ✅ 配置校验通过
// or
// ❌ 配置校验失败:
//   agents/writer.yaml prompt: 提示词文件不存在: writer.md
```

---

## Utilities

### Text Quality

| Function | Signature | Description |
|----------|-----------|-------------|
| `checkForbiddenWords(text)` | `→ { score, pass, issues }` | Detects AI-style forbidden words |
| `checkFormulaNumbering(text)` | `→ { score, pass, issues }` | Checks `\label{eq:X-Y}` continuity |
| `checkWordCount(text, minWords?)` | `→ { score, pass, count, issues }` | Validates minimum word count |
| `checkTerminologyConsistency(text)` | `→ { score, pass, issues }` | Detects mixed Chinese/English terms |

### Document Processing

| Function | Signature | Description |
|----------|-----------|-------------|
| `chunkDocument(text, chunkSize?, overlap?)` | `→ string[]` | Split text into overlapping chunks |

### Runtime Detection

```js
const { detectPlatform, getAvailableTools } = require('./src/engine/runtime/platform-detector');
const platform = detectPlatform(); // 'node', 'codex', 'browser'
const tools = getAvailableTools(); // Available tool names
```

### Model Routing

```js
const { routeModel, routeModelForAgent, scoreComplexity } = require('./src/engine/llm/model-router');
const { model, tier } = routeModelForAgent('writer', 'Write chapter 3 about experiment design');
const complexity = scoreComplexity(taskDescription); // 0-100
```

---

## Configuration

OpenPip reads configuration from `.openpip/config.json` (or CLI `openpip config`).

### Config Schema

```json
{
  "api_keys": {
    "deepseek": "sk-...",
    "openrouter": "sk-or-...",
    "ollama_endpoint": "http://localhost:11434"
  },
  "fallback": {
    "deepseek": "openrouter/deepseek-chat"
  },
  "targetVenue": "neurips",
  "features": {
    "model_router": true,
    "hybrid_search": true,
    "anti_sycophancy": true
  },
  "budget_limit": 5.0
}
```

---

## Type Definitions

### Blackboard Schema (v4)

```typescript
interface Blackboard {
  version: 4;
  topic: string;
  mode: 'research' | 'competition';
  research: {
    brief: string;
    refs: Array<{ id: string; title: string; authors: string[] }>;
    contribution: { claim: string; evidence: string[] } | null;
  };
  outline: {
    title: string;
    chapters: Array<{
      name: string;
      title?: string;
      goal?: string;
      sections?: string[];
    }>;
  };
  draft: {
    full: string;
    chapters: Array<{
      index: number;
      content: string;
      ending: string;
      wordCount: number;
    }>;
    summary: string;
    code: string;
    formatted: string;
    latex: string;
  };
  memory: {
    terms: Array<{ zh: string; en: string; definedAt: string }>;
    refs: Array<{ id: string; brief: string }>;
    symbols: Array<{ symbol: string; meaning: string }>;
    figures: Array<{ id: string; success: boolean; caption: string }>;
    gapAnalysis: string[];
    knownIssues?: string[];
    learnedLessons?: string[];
  };
  review: {
    score: number | null;
    decision: string;
    issues: string[];
  };
  integrity: {
    refs: boolean | null;
    formulas: boolean | null;
    figures: boolean | null;
    terms: boolean | null;
  };
  history: HistoryEntry[];
  meta: {
    updatedAt: string;
    version: number;
    lastTask?: string;
  };
}
```

### Agent Config Schema

```typescript
interface AgentConfig {
  name: string;          // Pattern: ^[a-z][a-z0-9-]*$
  model: string;         // e.g. 'deepseek/deepseek-chat'
  temperature?: number;  // 0-2
  topP?: number;         // 0-1
  prompt: string;        // Prompt file reference
  knowledge?: string[];  // Knowledge file paths
  ensemble?: {
    num_reviews: number;
    num_reflections: number;
  };
}
```

### Pipeline Stage Schema

```typescript
interface PipelineStage {
  id: string;            // Pattern: ^[a-z][a-z0-9-]*$
  agent: string;         // Agent name to dispatch
  input?: Record<string, string> | string;
  output: string;        // Output file path
  confirm?: boolean;     // Requires HIL confirmation
  qualityCheck?: boolean;
  qualityRetries?: number;
  minWords?: number;
  sequential?: boolean;
  chapters?: number[];
  mode?: 'sequential' | 'iterative';
  maxIterations?: number;
  condition?: string;    // Skip condition (e.g. "review=Accept")
  convergence?: {
    minScoreImprove: number;
    cosineThreshold: number;   // 0-1
    scoreVarianceThreshold: number;
  };
}
```

### Pipeline Config Schema

```typescript
interface PipelineConfig {
  name: string;
  description?: string;
  stages: PipelineStage[];
}
```

---

## Full Export List

以下符号从 `src/engine` 顶层导出；子模块的其他导出需直接 require 子路径。

| Category | Exports |
|----------|---------|
| **Core** | `callLLM`, `budgetTracker`, `loadAgent`, `dispatchAgent`, `loadKnowledge`, `loadPipeline`, `initProject`, `runPipeline`, `getProjectInfo`, `qualityCheck`, `reviewLoop`, `processAnnotations` |
| **Resource Resolver** | `ResourceResolver` |
| **Knowledge** | `TFIDF`, `precomputeIndex`, `KnowledgeGrowthManager` |
| **Quality** | `ReverseOutlineVerifier` |
| **Runtime** | `routeModel`, `routeModelForAgent`, `AGENT_TIER_MAP` |
| **Validation** | `validateAll`, `formatErrors` |
| **UI** | `EventBus`, `ProgressBar`, `ExecutionTracer` |
| **Features** | `FigureGenerator`, `FigureLinker`, `exportToLatex`, `DataProvenance`, `VersionManager` |
| **Review** | `iterativeReview`, `detectConvergence`, `AntiSycophancyChecker` |
| **Fact Verification** | `FactVerifier`, `FeedbackParser` |
| **Utils** | `utils` |

