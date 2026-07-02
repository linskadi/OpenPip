function resolveModelId(modelName) {
  if (modelName.startsWith('openai/')) return modelName.replace('openai/', '');
  if (modelName.startsWith('openrouter/')) return modelName.replace('openrouter/', '');
  if (modelName.startsWith('deepseek/')) return 'deepseek-chat';
  if (modelName.startsWith('ollama/')) return modelName.replace('ollama/', '');
  return modelName;
}

function resolveBaseURL(modelName) {
  if (modelName.startsWith('openai/')) return 'https://api.openai.com/v1';
  if (modelName.startsWith('openrouter/')) return 'https://openrouter.ai/api/v1';
  if (modelName.startsWith('deepseek/')) return 'https://api.deepseek.com/v1';
  if (modelName.startsWith('ollama/')) return '';
  return 'https://api.deepseek.com/v1';
}

function resolveApiKey(modelName, config) {
  if (modelName.startsWith('openai/')) return config?.api_keys?.openai || '';
  if (modelName.startsWith('openrouter/')) return config?.api_keys?.openrouter || '';
  if (modelName.startsWith('deepseek/')) return config?.api_keys?.deepseek || '';
  if (modelName.startsWith('ollama/')) return config?.api_keys?.ollama_endpoint || 'http://localhost:11434';
  return config?.api_keys?.deepseek || '';
}

function resolveProvider(modelName, config) {
  let provider = 'deepseek';
  if (modelName.startsWith('openai/')) provider = 'openai';
  else if (modelName.startsWith('openrouter/')) provider = 'openrouter';
  else if (modelName.startsWith('deepseek/')) provider = 'deepseek';
  else if (modelName.startsWith('ollama/')) provider = 'ollama';

  return {
    provider,
    apiKey: resolveApiKey(modelName, config),
    baseURL: resolveBaseURL(modelName),
    modelId: resolveModelId(modelName),
  };
}

module.exports = { resolveProvider, resolveApiKey, resolveBaseURL, resolveModelId };
