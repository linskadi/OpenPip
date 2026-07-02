const agentSchema = {
  type: 'object',
  required: ['name', 'model', 'prompt'],
  properties: {
    name: { type: 'string', pattern: '^[a-z][a-z0-9-]*$' },
    model: { type: 'string' },
    temperature: { type: 'number', minimum: 0, maximum: 2 },
    topP: { type: 'number', minimum: 0, maximum: 1 },
    prompt: { type: 'string' },
    knowledge: { type: 'array', items: { type: 'string' } },
  },
  additionalProperties: true,
};

const pipelineStageSchema = {
  type: 'object',
  required: ['id', 'agent', 'output'],
  properties: {
    id: { type: 'string', pattern: '^[a-z][a-z0-9-]*$' },
    agent: { type: 'string' },
    input: { type: 'object' },
    output: { type: 'string' },
    confirm: { type: 'boolean' },
    qualityCheck: { type: 'boolean' },
    qualityRetries: { type: 'integer', minimum: 0 },
    minWords: { type: 'integer', minimum: 0 },
    sequential: { type: 'boolean' },
    chapters: { type: 'array', items: { type: 'integer' } },
    mode: { type: 'string', enum: ['sequential', 'iterative'] },
    maxIterations: { type: 'integer', minimum: 1 },
    maxRetries: { type: 'integer', minimum: 0, default: 1 },
    continueOnFailure: { type: 'boolean', default: false },
    convergence: {
      type: 'object',
      properties: {
        minScoreImprove: { type: 'number' },
        cosineThreshold: { type: 'number', minimum: 0, maximum: 1 },
        scoreVarianceThreshold: { type: 'number', minimum: 0 },
      },
    },
    reviewers: { type: 'object' },
    routing: { type: 'object' },
    task: { type: 'string' },
  },
  additionalProperties: true,
};

const branchRuleConditionSchema = {
  type: 'object',
  properties: {
    type: { type: 'string', enum: ['keyword', 'classification'] },
    keywords: { type: 'array', items: { type: 'string' } },
    operator: { type: 'string', enum: ['and', 'or'], default: 'or' },
    value: { type: 'string' },
  },
  additionalProperties: true,
};

const branchRuleSchema = {
  type: 'object',
  required: ['name', 'condition'],
  properties: {
    name: { type: 'string' },
    condition: branchRuleConditionSchema,
    action: { type: 'string', enum: ['insert', 'skip'] },
    insertAfter: { type: 'string' },
    stage: { type: 'string' },
    skip: { type: 'array', items: { type: 'string' } },
  },
  additionalProperties: true,
};

const dynamicStageSchema = {
  type: 'object',
  properties: {
    agent: { type: 'string' },
    output: { type: 'string' },
    task_prefix: { type: 'string' },
    task: { type: 'string' },
  },
  additionalProperties: true,
};

const pipelineSchema = {
  type: 'object',
  required: ['name', 'stages'],
  properties: {
    name: { type: 'string' },
    description: { type: 'string' },
    category: { type: 'string' },
    domain: { type: 'string' },
    stageTasks: { type: 'object', additionalProperties: { type: 'string' } },
    branchRules: { type: 'array', items: branchRuleSchema },
    dynamicStages: { type: 'object', additionalProperties: dynamicStageSchema },
    stages: {
      type: 'array',
      items: pipelineStageSchema,
    },
  },
  additionalProperties: true,
};

module.exports = { agentSchema, pipelineSchema };
