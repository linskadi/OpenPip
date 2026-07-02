const { resolve } = require('path');
const { writeFileSync, mkdirSync } = require('fs');
const { DEFAULT_MODEL } = require('../../engine/constants');

module.exports = async function(args, engine, ROOT) {
  const subCmd = args[1];
  const agentName = args[2];

  if (subCmd === 'create' && agentName) {
    const configsDir = resolve(ROOT, '.openpip', 'role-configs');
    const promptsDir = resolve(ROOT, '.openpip', 'role-prompts');

    mkdirSync(configsDir, { recursive: true });
    mkdirSync(promptsDir, { recursive: true });

    const yamlTemplate = `name: ${agentName}
model: ${DEFAULT_MODEL}
temperature: 0.7
topP: 0.9
prompt: ${agentName}.md
knowledge:
  - writing/academic-style.md
`;

    const promptTemplate = `# ${agentName.charAt(0).toUpperCase() + agentName.slice(1)} Agent

你是 OpenPip 的 ${agentName} 专家。

## 工作流程
1. 读取输入文件
2. 执行任务
3. 保存结果

## 输出
保存到 papers/{project}/output/${agentName}-output.md
`;

    writeFileSync(resolve(configsDir, `${agentName}.yaml`), yamlTemplate, 'utf-8');
    writeFileSync(resolve(promptsDir, `${agentName}.md`), promptTemplate, 'utf-8');

    console.log(`✅ Agent '${agentName}' 已创建:`);
    console.log(`  - .openpip/role-configs/${agentName}.yaml`);
    console.log(`  - .openpip/role-prompts/${agentName}.md`);
    console.log(`\n💡 编辑提示词: .openpip/role-prompts/${agentName}.md`);
  } else {
    console.error('用法: openpip agent create <name>');
  }
};
