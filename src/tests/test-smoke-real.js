if (!process.env.SMOKE) {
  console.log('⏭️ 冒烟测试跳过（设置 SMOKE=1 启用）');
  process.exit(0);
}

const { ensureConfig } = require('../cli/utils/config');
const { callLLMWithRetry } = require('../engine/llm');

const config = ensureConfig();
if (!config.api_keys?.deepseek) {
  console.log('❌ 未配置 API Key，跳过冒烟测试');
  process.exit(1);
}

async function smokeTest() {
  console.log('🔥 运行真实 LLM 冒烟测试...');

  const result = await callLLMWithRetry(
    'deepseek/deepseek-chat',
    '用一句话介绍机器学习。',
    config,
    0
  );
  if (!result || result.length < 10) {
    throw new Error(`LLM 响应过短: ${result}`);
  }
  console.log(`  ✅ LLM 响应: ${result.substring(0, 80)}...`);
  console.log('✅ 冒烟测试通过');
}

smokeTest().catch(err => {
  console.error('❌ 冒烟测试失败:', err.message);
  process.exit(1);
});
