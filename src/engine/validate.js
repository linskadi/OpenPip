const { existsSync, readdirSync } = require('fs');
const { resolve } = require('path');
const { loadYaml } = require('./utils');
const { agentSchema, pipelineSchema } = require('./schema');

function validateSchema(data, schema, path = '') {
  const errors = [];

  if (schema.type) {
    const actualType = Array.isArray(data) ? 'array' : typeof data;
    let typeMatch = actualType === schema.type;
    if (!typeMatch && schema.type === 'integer') {
      typeMatch = actualType === 'number' && Number.isInteger(data);
    }
    if (!typeMatch) {
      errors.push({ path, message: `类型错误: 期望 ${schema.type}，实际 ${actualType}` });
      return errors;
    }
  }

  if (schema.required) {
    for (const field of schema.required) {
      if (!(field in data)) {
        errors.push({ path: `${path}.${field}`, message: `缺少必填字段: ${field}` });
      }
    }
  }

  if (schema.properties) {
    for (const [key, value] of Object.entries(data)) {
      if (schema.properties[key]) {
        errors.push(...validateSchema(value, schema.properties[key], `${path}.${key}`));
      } else if (schema.additionalProperties === false) {
        errors.push({ path: `${path}.${key}`, message: `未知字段: ${key}` });
      }
    }
  }

  if (schema.minimum !== undefined && typeof data === 'number' && data < schema.minimum) {
    errors.push({ path, message: `值 ${data} 小于最小值 ${schema.minimum}` });
  }
  if (schema.maximum !== undefined && typeof data === 'number' && data > schema.maximum) {
    errors.push({ path, message: `值 ${data} 大于最大值 ${schema.maximum}` });
  }

  if (schema.pattern && typeof data === 'string') {
    const regex = new RegExp(schema.pattern);
    if (!regex.test(data)) {
      errors.push({ path, message: `值 "${data}" 不匹配正则 ${schema.pattern}` });
    }
  }

  if (schema.enum && !schema.enum.includes(data)) {
    errors.push({ path, message: `值 "${data}" 不在允许列表中: [${schema.enum.join(', ')}]` });
  }

  if (schema.items && Array.isArray(data)) {
    for (let i = 0; i < data.length; i++) {
      errors.push(...validateSchema(data[i], schema.items, `${path}[${i}]`));
    }
  }

  return errors;
}

function validateAgent(yamlPath) {
  const errors = [];

  if (!existsSync(yamlPath)) {
    errors.push({ path: yamlPath, message: '文件不存在' });
    return errors;
  }

  try {
    const data = loadYaml(yamlPath, null);
    if (!data) {
      errors.push({ path: yamlPath, message: 'YAML 文件为空或解析失败' });
      return errors;
    }
    errors.push(...validateSchema(data, agentSchema, ''));

    if (data.prompt) {
      const promptPath = yamlPath.replace(/role-configs[/\\][^/\\]+\.yaml$/, `role-prompts/${data.prompt}`);
      const resolved = resolve(promptPath);
      if (!resolved.startsWith(resolve(yamlPath, '..', '..', 'role-prompts'))) {
        errors.push({ path: 'prompt', message: `提示词路径越界: ${data.prompt}` });
      } else if (!existsSync(resolved)) {
        errors.push({ path: 'prompt', message: `提示词文件不存在: ${data.prompt}` });
      }
    }

    if (data.knowledge) {
      const knowledgeDir = yamlPath.replace(/role-configs[/\\][^/\\]+\.yaml$/, 'knowledge');
      for (const k of data.knowledge) {
        const kPath = resolve(knowledgeDir, k);
        const resolved = resolve(kPath);
        if (!resolved.startsWith(resolve(knowledgeDir))) {
          errors.push({ path: `knowledge[${k}]`, message: `知识文件路径越界: ${k}` });
        } else if (!existsSync(resolved)) {
          errors.push({ path: `knowledge[${k}]`, message: `知识文件不存在: ${k}` });
        }
      }
    }
  } catch (e) {
    errors.push({ path: yamlPath, message: `YAML 解析错误: ${e.message}` });
  }

  return errors;
}

function validatePipeline(yamlPath) {
  const errors = [];

  if (!existsSync(yamlPath)) {
    errors.push({ path: yamlPath, message: '文件不存在' });
    return errors;
  }

  try {
    const data = loadYaml(yamlPath, null);
    if (!data) {
      errors.push({ path: yamlPath, message: 'YAML 文件为空或解析失败' });
      return errors;
    }
    errors.push(...validateSchema(data, pipelineSchema, ''));

    if (data.stages) {
      const agentsDir = yamlPath.replace(/pipelines[/\\][^/\\]+\.yaml$/, 'role-configs');
      for (const stage of data.stages) {
        const agentPath = resolve(agentsDir, `${stage.agent}.yaml`);
        if (!existsSync(agentPath) && stage.agent === '_system') continue;
        if (!existsSync(agentPath)) {
          errors.push({ path: `stages[${stage.id}].agent`, message: `Agent 不存在: ${stage.agent}` });
        }
      }
    }
  } catch (e) {
    errors.push({ path: yamlPath, message: `YAML 解析错误: ${e.message}` });
  }

  return errors;
}

function validateAll(projectRoot = process.cwd()) {
  const allErrors = [];

  const agentsDir = resolve(projectRoot, '.openpip', 'role-configs');
  const pipelinesDir = resolve(projectRoot, '.openpip', 'pipelines');

  if (existsSync(agentsDir)) {
    for (const file of readdirSync(agentsDir)) {
      if (file.endsWith('.yaml')) {
        const errors = validateAgent(resolve(agentsDir, file));
        allErrors.push(...errors.map(e => ({ ...e, file: `role-configs/${file}` })));
      }
    }
  }

  if (existsSync(pipelinesDir)) {
    for (const file of readdirSync(pipelinesDir)) {
      if (file.endsWith('.yaml')) {
        const errors = validatePipeline(resolve(pipelinesDir, file));
        allErrors.push(...errors.map(e => ({ ...e, file: `pipelines/${file}` })));
      }
    }
  }

  return allErrors;
}

function formatErrors(errors) {
  if (errors.length === 0) return '✅ 配置校验通过';

  const lines = ['❌ 配置校验失败:\n'];
  for (const err of errors) {
    lines.push(`  ${err.file || ''} ${err.path}: ${err.message}`);
  }
  return lines.join('\n');
}

module.exports = { validateAll, formatErrors };

