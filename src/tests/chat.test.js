import { describe, it, expect } from 'vitest';
import path from 'path';

const ROOT = path.resolve(import.meta.dirname, '..', '..');

describe('Chat Tools', () => {
  it('CHAT_TOOLS has 10 tools', () => {
    const { CHAT_TOOLS } = require('../cli/services/tool-registry');
    expect(CHAT_TOOLS).toHaveLength(10);
    const names = CHAT_TOOLS.map(t => t.function.name);
    expect(names).toContain('init_project');
    expect(names).toContain('ingest_materials');
    expect(names).toContain('run_pipeline');
    expect(names).toContain('query_status');
    expect(names).toContain('export_paper');
    expect(names).toContain('import_references');
    expect(names).toContain('list_references');
    expect(names).toContain('list_pipelines');
    expect(names).toContain('toggle_feature');
    expect(names).toContain('review_code');
  });

  it('all tools have required fields', () => {
    const { CHAT_TOOLS } = require('../cli/services/tool-registry');
    for (const tool of CHAT_TOOLS) {
      expect(tool.type).toBe('function');
      expect(tool.function.name).toBeTruthy();
      expect(tool.function.description).toBeTruthy();
      expect(tool.function.parameters).toBeDefined();
      expect(tool.function.parameters.properties).toBeDefined();
    }
  });
});

describe('Model Resolver', () => {
  it('resolves model from config', () => {
    const { resolveModel } = require('../cli/services/tool-registry');
    expect(resolveModel({ models: { writer: 'openai/gpt-4o' } })).toBe('openai/gpt-4o');
    expect(resolveModel({ models: { writer: 'deepseek/deepseek-chat' } }, 'openrouter/claude-3')).toBe('openrouter/claude-3');
  });

  it('extracts model IDs correctly', () => {
    const { resolveModelId } = require('../cli/services/tool-registry');
    expect(resolveModelId('deepseek/deepseek-chat')).toBe('deepseek-chat');
    expect(resolveModelId('openai/gpt-4o')).toBe('gpt-4o');
    expect(resolveModelId('openrouter/claude-3')).toBe('claude-3');
  });

  it('resolves base URLs correctly', () => {
    const { resolveBaseURL } = require('../cli/services/tool-registry');
    expect(resolveBaseURL('deepseek/x')).toContain('deepseek');
    expect(resolveBaseURL('openai/x')).toContain('openai');
    expect(resolveBaseURL('openrouter/x')).toContain('openrouter');
  });
});

describe('ProjectService', () => {
  it('can be instantiated', () => {
    const { ProjectService } = require('../cli/services/project-service');
    const engine = require('../engine');
    const svc = new ProjectService(engine, ROOT, {});
    expect(svc.createProject).toBeDefined();
    expect(svc.importMaterials).toBeDefined();
    expect(svc.runPipeline).toBeDefined();
    expect(svc.getStatus).toBeDefined();
    expect(svc.exportPaper).toBeDefined();
  });
});

describe('ChatSession', () => {
  it('manages session state', () => {
    const { ChatSession } = require('../cli/services/session');
    const session = new ChatSession(ROOT);
    const ctx = session.getContextMenu();
    expect(typeof ctx).toBe('string');
  });
});

describe('IntentParser', () => {
  it('can be instantiated', () => {
    const { IntentParser } = require('../cli/services/intent-parser');
    const parser = new IntentParser('deepseek/deepseek-chat', { api_keys: { deepseek: 'test' } });
    expect(parser.parse).toBeDefined();
    expect(parser.addToolResult).toBeDefined();
    expect(parser.summarizeToolResults).toBeDefined();
  });
});

describe('Chat Command', () => {
  it('loads correctly', () => {
    const chat = require('../cli/commands/chat');
    expect(typeof chat).toBe('function');
  });
});

describe('init_project tool', () => {
  it('has name parameter as required', () => {
    const { CHAT_TOOLS } = require('../cli/services/tool-registry');
    const tool = CHAT_TOOLS.find(t => t.function.name === 'init_project');
    expect(tool.function.parameters.properties.name).toBeDefined();
    expect(tool.function.parameters.required).toContain('name');
  });
});

describe('run_pipeline tool', () => {
  it('has quality enum options', () => {
    const { CHAT_TOOLS } = require('../cli/services/tool-registry');
    const tool = CHAT_TOOLS.find(t => t.function.name === 'run_pipeline');
    expect(tool.function.parameters.properties.quality.enum).toContain('quick');
    expect(tool.function.parameters.properties.quality.enum).toContain('standard');
    expect(tool.function.parameters.properties.quality.enum).toContain('deep');
  });
});

describe('PipelineAdvisor', () => {
  it('has default features enabled', () => {
    const { PipelineAdvisor } = require('../engine/pipeline-advisor');
    const advisor = new PipelineAdvisor({});
    expect(advisor.isEnabled('llm_pipeline_generation')).toBe(true);
    expect(advisor.isEnabled('llm_stage_flow')).toBe(true);
    expect(advisor.isEnabled('llm_history_analysis')).toBe(true);
  });

  it('toggles features correctly', () => {
    const { PipelineAdvisor } = require('../engine/pipeline-advisor');
    const advisor = new PipelineAdvisor({});
    advisor.setFeature('llm_pipeline_generation', false);
    expect(advisor.isEnabled('llm_pipeline_generation')).toBe(false);
    expect(advisor.isEnabled('llm_stage_flow')).toBe(true);
  });

  it('generates pipeline prompt', () => {
    const { PipelineAdvisor } = require('../engine/pipeline-advisor');
    const advisor = new PipelineAdvisor({});
    const { prompt } = advisor.generatePipeline('量子计算综述', 'research');
    expect(prompt).toContain('量子计算综述');
    expect(prompt).toContain('research');
  });

  it('parses flow decision from LLM response', () => {
    const { PipelineAdvisor } = require('../engine/pipeline-advisor');
    const advisor = new PipelineAdvisor({});
    const result = advisor.parseFlowDecision('{"decision":"proceed","score":85}');
    expect(result.decision).toBe('proceed');
    expect(result.score).toBe(85);
  });
});

describe('toggle_feature tool', () => {
  it('has correct parameters', () => {
    const { CHAT_TOOLS } = require('../cli/services/tool-registry');
    const tool = CHAT_TOOLS.find(t => t.function.name === 'toggle_feature');
    expect(tool).toBeDefined();
    expect(tool.function.parameters.properties.feature.enum).toContain('llm_pipeline_generation');
    expect(tool.function.parameters.properties.feature.enum).toContain('llm_stage_flow');
    expect(tool.function.parameters.properties.feature.enum).toContain('llm_history_analysis');
    expect(tool.function.parameters.required).toContain('feature');
    expect(tool.function.parameters.required).toContain('enabled');
  });
});
