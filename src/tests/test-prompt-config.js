const { readFileSync, existsSync } = require('fs');
const { resolve } = require('path');
const yaml = require('js-yaml');

const configPath = resolve(__dirname, '..', '..', '.openpip', 'prompt-config.yaml');
if (!existsSync(configPath)) throw new Error('prompt-config.yaml not found');

const config = yaml.load(readFileSync(configPath, 'utf-8'));

if (!config.writer) throw new Error('Missing writer config');
if (!config.writer.draft) throw new Error('Missing writer.draft config');
if (!config.writer.draft.prelude) throw new Error('Missing writer.draft.prelude');
if (!config.writer.draft.constraints || config.writer.draft.constraints.length === 0) throw new Error('Missing writer.draft.constraints');
if (!config.reviewer) throw new Error('Missing reviewer config');
if (!config.reviewer.research) throw new Error('Missing reviewer.research config');
if (!config.planner) throw new Error('Missing planner config');
if (!config.researcher) throw new Error('Missing researcher config');

console.log('✅ test-prompt-config passed');

