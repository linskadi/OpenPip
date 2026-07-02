const { saveConfig, CREDENTIALS_PATH, CONFIG_PATH } = require('../utils/config');
const { ask } = require('../utils/readline');

module.exports = async function(args, engine, ROOT, config) {
  console.log('⚙️  OpenPip 交互式配置\n');
  console.log('当前状态:');
  console.log(`  DeepSeek: ${config.api_keys.deepseek ? '✅ 已设置' : '❌ 未设置'}`);
  console.log(`  OpenRouter: ${config.api_keys.openrouter ? '✅ 已设置' : '❌ 未设置'}`);
  console.log(`  Ollama: ${config.api_keys.ollama_endpoint}\n`);

  const ds = await ask('DeepSeek API Key (回车跳过): ');
  if (ds) config.api_keys.deepseek = ds;

  const or = await ask('OpenRouter API Key (回车跳过): ');
  if (or) config.api_keys.openrouter = or;

  const ollama = await ask(`Ollama endpoint [${config.api_keys.ollama_endpoint}]: `);
  if (ollama) config.api_keys.ollama_endpoint = ollama;

  console.log('\n模型配置 (回车保持默认):');
  const agents = Object.keys(config.models);
  for (const agent of agents) {
    const val = await ask(`  ${agent} [${config.models[agent]}]: `);
    if (val) config.models[agent] = val;
  }

  saveConfig(config);
  console.log('\n✅ 配置已保存');
  console.log(`  - API Keys: ${CREDENTIALS_PATH}`);
  console.log(`  - 其他配置: ${CONFIG_PATH}`);
};
