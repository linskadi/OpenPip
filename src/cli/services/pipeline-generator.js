/**
 * PipelineGenerator — 自然语言驱动的管线配置生成器
 *
 * 功能：
 *   1. 根据结构化配置生成 YAML 管线文件
 *   2. 修改现有管线配置
 *   3. 校验管线名称唯一性
 */

const { writeFileSync, readFileSync, existsSync } = require('fs');
const { resolve, join } = require('path');
const { loadYaml } = require('../../engine/utils');

class PipelineGenerator {
  /**
   * @param {string} pipelinesDir .openpip/pipelines/ 目录路径
   */
  constructor(pipelinesDir) {
    this.pipelinesDir = pipelinesDir;
  }

  /**
   * 生成新的管线 YAML 文件
   * @param {object} config 管线配置
   * @returns {{ success: boolean, path?: string, error?: string }}
   */
  generate(config) {
    const { name, description, category, domain, stages } = config;

    // 校验名称
    if (!name || !/^[a-z][a-z0-9-]*$/.test(name)) {
      return { success: false, error: '管线名称必须是英文小写字母开头，只含小写字母、数字和连字符' };
    }

    // 校验名称唯一性
    const filePath = join(this.pipelinesDir, `${name}.yaml`);
    if (existsSync(filePath)) {
      return { success: false, error: `管线 '${name}' 已存在` };
    }

    // 校验阶段
    if (!stages || stages.length === 0) {
      return { success: false, error: '至少需要一个阶段' };
    }

    const validAgents = ['researcher', 'planner', 'writer', 'reviewer', 'formatter', 'coder', 'code-reviewer', 'contribution-architect', 'adversarial-researcher', 'orchestrator', '_system'];
    for (const stage of stages) {
      if (!stage.id || !/^[a-z][a-z0-9-]*$/.test(stage.id)) {
        return { success: false, error: `阶段 ID '${stage.id}' 格式无效` };
      }
      if (stage.agent && !validAgents.includes(stage.agent)) {
        return { success: false, error: `角色 '${stage.agent}' 不存在。可用角色: ${validAgents.join(', ')}` };
      }
    }

    // 自动生成 input 依赖（基于 output 路径推断）
    const autoInputs = this._inferInputs(stages);

    // 生成 YAML
    const lines = [];
    lines.push(`name: ${name}`);
    lines.push(`description: ${description || name}`);
    if (category) lines.push(`category: ${category}`);
    if (domain) lines.push(`domain: ${domain}`);
    lines.push('');
    lines.push('stages:');

    for (let i = 0; i < stages.length; i++) {
      const stage = stages[i];
      const inputs = autoInputs[i] || {};
      lines.push(`  - id: ${stage.id}`);
      lines.push(`    agent: ${stage.agent || 'writer'}`);
      if (stage.task) lines.push(`    task: "${stage.task.replace(/"/g, '\\"')}"`);
      if (Object.keys(inputs).length > 0) {
        lines.push('    input:');
        for (const [key, val] of Object.entries(inputs)) {
          lines.push(`      ${key}: ${val}`);
        }
      }
      lines.push(`    output: ${stage.output || `drafts/${stage.id}.md`}`);
      lines.push('');
    }

    const yamlContent = lines.join('\n');

    try {
      writeFileSync(filePath, yamlContent, 'utf-8');
      return { success: true, path: filePath, name };
    } catch (err) {
      return { success: false, error: `写入文件失败: ${err.message}` };
    }
  }

  /**
   * 修改现有管线
   * @param {string} pipelineName 管线名称
   * @param {string} action 操作类型
   * @param {object} params 操作参数
   * @returns {{ success: boolean, error?: string }}
   */
  modify(pipelineName, action, params) {
    const filePath = join(this.pipelinesDir, `${pipelineName}.yaml`);
    if (!existsSync(filePath)) {
      return { success: false, error: `管线 '${pipelineName}' 不存在` };
    }

    const pipeline = loadYaml(filePath, null);
    if (!pipeline || !pipeline.stages) {
      return { success: false, error: `管线 '${pipelineName}' 格式无效` };
    }

    switch (action) {
      case 'add_stage': {
        if (!params.stage || !params.stage.id) {
          return { success: false, error: '需要指定阶段配置' };
        }
        const newStage = {
          id: params.stage.id,
          agent: params.stage.agent || 'writer',
        };
        if (params.stage.task) newStage.task = params.stage.task;
        if (params.stage.output) newStage.output = params.stage.output;

        if (params.stage.after) {
          const idx = pipeline.stages.findIndex(s => s.id === params.stage.after);
          if (idx >= 0) {
            pipeline.stages.splice(idx + 1, 0, newStage);
          } else {
            pipeline.stages.push(newStage);
          }
        } else {
          pipeline.stages.push(newStage);
        }
        break;
      }
      case 'remove_stage': {
        if (!params.stage || !params.stage.id) {
          return { success: false, error: '需要指定要删除的阶段 ID' };
        }
        const idx = pipeline.stages.findIndex(s => s.id === params.stage.id);
        if (idx < 0) {
          return { success: false, error: `阶段 '${params.stage.id}' 不存在` };
        }
        pipeline.stages.splice(idx, 1);
        break;
      }
      case 'reorder_stages': {
        if (!params.stageOrder || !Array.isArray(params.stageOrder)) {
          return { success: false, error: '需要指定新的阶段顺序' };
        }
        const stageMap = new Map(pipeline.stages.map(s => [s.id, s]));
        const reordered = [];
        for (const id of params.stageOrder) {
          if (stageMap.has(id)) {
            reordered.push(stageMap.get(id));
            stageMap.delete(id);
          }
        }
        // 追加未在 order 中的阶段
        for (const s of stageMap.values()) {
          reordered.push(s);
        }
        pipeline.stages = reordered;
        break;
      }
      case 'update_stage': {
        if (!params.stage || !params.stage.id) {
          return { success: false, error: '需要指定要更新的阶段 ID' };
        }
        const stage = pipeline.stages.find(s => s.id === params.stage.id);
        if (!stage) {
          return { success: false, error: `阶段 '${params.stage.id}' 不存在` };
        }
        if (params.stage.agent) stage.agent = params.stage.agent;
        if (params.stage.task) stage.task = params.stage.task;
        if (params.stage.output) stage.output = params.stage.output;
        break;
      }
      default:
        return { success: false, error: `未知操作: ${action}` };
    }

    // 写回 YAML
    try {
      const yamlContent = this._toYaml(pipeline);
      writeFileSync(filePath, yamlContent, 'utf-8');
      return { success: true, name: pipelineName };
    } catch (err) {
      return { success: false, error: `写入文件失败: ${err.message}` };
    }
  }

  /**
   * 根据阶段输出路径推断 input 依赖
   */
  _inferInputs(stages) {
    const outputs = new Map(); // outputPath → stageId
    for (const stage of stages) {
      if (stage.output) outputs.set(stage.output, stage.id);
    }

    return stages.map(stage => {
      const inputs = {};
      // 简单推断：如果某个阶段的 output 路径被后续阶段引用，则建立依赖
      // 这里用一个简化的规则：research → skeleton, skeleton → draft, draft → review
      const stageIdx = stages.indexOf(stage);
      if (stageIdx > 0) {
        const prev = stages[stageIdx - 1];
        if (prev.output && prev.output.endsWith('.md')) {
          const key = prev.id;
          inputs[key] = prev.output;
        }
      }
      return inputs;
    });
  }

  /**
   * 简单的 YAML 序列化（避免引入额外依赖）
   */
  _toYaml(obj) {
    const lines = [];
    lines.push(`name: ${obj.name}`);
    lines.push(`description: ${obj.description || ''}`);
    if (obj.category) lines.push(`category: ${obj.category}`);
    if (obj.domain) lines.push(`domain: ${obj.domain}`);
    lines.push('');
    lines.push('stages:');
    for (const stage of (obj.stages || [])) {
      lines.push(`  - id: ${stage.id}`);
      lines.push(`    agent: ${stage.agent}`);
      if (stage.task) lines.push(`    task: "${stage.task.replace(/"/g, '\\"')}"`);
      if (stage.input && Object.keys(stage.input).length > 0) {
        lines.push('    input:');
        for (const [k, v] of Object.entries(stage.input)) {
          lines.push(`      ${k}: ${v}`);
        }
      }
      lines.push(`    output: ${stage.output}`);
    }
    return lines.join('\n') + '\n';
  }
}

module.exports = { PipelineGenerator };
