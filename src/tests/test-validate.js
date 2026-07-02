const { validateAll, formatErrors } = require('../engine/validate');
const { resolve } = require('path');

const projectRoot = resolve(__dirname);

console.log('=== 配置校验测试 ===\n');

const errors = validateAll(projectRoot);
console.log(formatErrors(errors));

if (errors.length > 0) {
  console.log('\n详细错误:');
  for (const err of errors) {
    console.log(`  ${err.file} ${err.path}: ${err.message}`);
  }
}
