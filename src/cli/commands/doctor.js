const { resolve } = require('path');
const { existsSync, readdirSync } = require('fs');
const { walkDir } = require(resolve(__dirname, '..', '..', 'engine', 'utils'));
const { validateAll } = require(resolve(__dirname, '..', '..', 'engine', 'validate'));

module.exports = async function(args, engine, ROOT, config) {
  console.log('🔍 OpenPip 配置诊断\n');

  let issues = 0;
  let warnings = 0;

  const dirs = ['.openpip/role-configs', '.openpip/role-prompts', '.openpip/knowledge', '.openpip/pipelines'];
  for (const dir of dirs) {
    if (!existsSync(resolve(ROOT, dir))) {
      console.log(`❌ 缺失目录: ${dir}`);
      issues++;
    } else {
      console.log(`✅ ${dir}`);
    }
  }

  const configFiles = ['openpip.config.json'];
  for (const f of configFiles) {
    if (!existsSync(resolve(ROOT, f))) {
      console.log(`❌ 缺失配置: ${f}`);
      issues++;
    } else {
      console.log(`✅ ${f}`);
    }
  }

  if (config) {
    if (!config.api_keys?.deepseek && !config.api_keys?.openrouter) {
      console.log('⚠️  未配置 API Key (运行 openpip config 设置)');
      warnings++;
    } else {
      console.log(`✅ API Key: ${config.api_keys.deepseek ? 'DeepSeek' : 'OpenRouter'}`);
    }
  }

  const agentsDir = resolve(ROOT, '.openpip', 'role-configs');
  if (existsSync(agentsDir)) {
    const agents = readdirSync(agentsDir).filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));
    console.log(`\n📋 已配置 Agent (${agents.length}):`);
    for (const agent of agents) {
      const name = agent.replace(/\.(yaml|yml)$/, '');
      const promptPath = resolve(ROOT, '.openpip', 'role-prompts', `${name}.md`);
      const hasPrompt = existsSync(promptPath);
      console.log(`  ${hasPrompt ? '✅' : '⚠️'} ${name} ${hasPrompt ? '' : '(缺少提示词)'}`);
      if (!hasPrompt) warnings++;
    }
  }

  const knowledgeDir = resolve(ROOT, '.openpip', 'knowledge');
  if (existsSync(knowledgeDir)) {
    let count = 0;
    walkDir(knowledgeDir, (full, entry) => { if (entry.endsWith('.md')) count++; });
    console.log(`\n📚 知识库文件: ${count} 个`);
  }

  console.log('\n📋 Schema 校验:');
  const schemaErrors = validateAll(ROOT);
  if (schemaErrors.length === 0) {
    console.log('  ✅ 所有配置文件符合 Schema');
  } else {
    for (const err of schemaErrors) {
      console.log(`  ❌ ${err.file || ''} ${err.path}: ${err.message}`);
      issues++;
    }
  }

  console.log(`\n${issues === 0 ? '✅' : '❌'} 诊断完成: ${issues} 个错误, ${warnings} 个警告`);
};

