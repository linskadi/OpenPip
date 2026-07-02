const { resolve } = require('path');
const { writeFileSync } = require('fs');
const { deepMerge, loadJsonFile } = require('../../engine/utils');
const { DEFAULT_MODEL } = require('../../engine/constants');

const ROOT = resolve(__dirname, '..', '..', '..');
const CONFIG_PATH = resolve(ROOT, 'openpip.config.json');
const PROJECT_CONFIG_PATH = resolve(ROOT, '.openpip', 'config.json');
const CREDENTIALS_PATH = resolve(ROOT, 'credentials.json');

/**
 * 加载配置：优先级从低到高
 *   .openpip/config.json < openpip.config.json < credentials.json < 环境变量
 */
function loadConfig() {
  // 第1层：项目级配置（.openpip/config.json）— 最低优先级
  let config = loadJsonFile(PROJECT_CONFIG_PATH, {});

  // 第2层：用户级配置（openpip.config.json）— 覆盖第1层
  const userConfig = loadJsonFile(CONFIG_PATH, null);
  if (userConfig) {
    config = deepMerge(config, userConfig);
  }

  // 第3层：凭证文件（credentials.json）— API Key + 其他设置
  const creds = loadJsonFile(CREDENTIALS_PATH, null);
  if (creds) {
    if (!config.api_keys) config.api_keys = {};
    if (creds.deepseek) config.api_keys.deepseek = creds.deepseek;
    if (creds.openrouter) config.api_keys.openrouter = creds.openrouter;
    if (creds.ollama_endpoint) config.api_keys.ollama_endpoint = creds.ollama_endpoint;
    if (creds.target_venue) config.targetVenue = creds.target_venue;
    if (creds.budget_limit) config.budget_limit = creds.budget_limit;
  }

  // 第4层：环境变量覆盖（最高优先级）
  if (!config.api_keys) config.api_keys = {};
  if (process.env.OPENPIP_API_KEY_DEEPSEEK) config.api_keys.deepseek = process.env.OPENPIP_API_KEY_DEEPSEEK;
  if (process.env.OPENPIP_API_KEY_OPENROUTER) config.api_keys.openrouter = process.env.OPENPIP_API_KEY_OPENROUTER;
  if (process.env.OPENPIP_OLLAMA_ENDPOINT) config.api_keys.ollama_endpoint = process.env.OPENPIP_OLLAMA_ENDPOINT;
  if (process.env.OPENPIP_TARGET_VENUE) config.targetVenue = process.env.OPENPIP_TARGET_VENUE;
  if (process.env.OPENPIP_BUDGET_LIMIT) config.budget_limit = Number(process.env.OPENPIP_BUDGET_LIMIT);

  return Object.keys(config).length > 0 ? config : null;
}

function saveConfig(config) {
  const { api_keys, targetVenue, budget_limit, ...restConfig } = config;
  if (Object.keys(restConfig).length > 0) {
    writeFileSync(CONFIG_PATH, JSON.stringify(restConfig, null, 2), 'utf-8');
  }
  // Save API keys + settings to credentials.json（唯一位置）
  const creds = { ...api_keys };
  if (targetVenue) creds.target_venue = targetVenue;
  if (budget_limit) creds.budget_limit = budget_limit;
  writeFileSync(CREDENTIALS_PATH, JSON.stringify(creds, null, 2), 'utf-8');
}

function defaultConfig() {
  return {
    api_keys: { deepseek: '', openrouter: '', ollama_endpoint: 'http://localhost:11434' },
    models: {
      orchestrator: DEFAULT_MODEL,
      researcher: DEFAULT_MODEL,
      planner: DEFAULT_MODEL,
      writer: DEFAULT_MODEL,
      coder: DEFAULT_MODEL,
      reviewer: DEFAULT_MODEL,
      formatter: DEFAULT_MODEL,
    },
    fallback: {
      deepseek: 'ollama/qwen2.5:14b',
    },
    private_mode: true,
    offline_mode: false,
  };
}

function ensureConfig() {
  // dotenv 为可选依赖：存在则加载 .env，不存在则静默跳过（环境变量仍可由系统注入）
  try {
    require('dotenv').config({ override: true });
  } catch {
    // dotenv 未安装时跳过 — 凭证仍可通过 credentials.json 或系统环境变量提供
  }
  let config = loadConfig();
  if (!config) { config = defaultConfig(); saveConfig(config); }
  return config;
}

module.exports = { loadConfig, saveConfig, defaultConfig, ensureConfig, CONFIG_PATH, CREDENTIALS_PATH };
