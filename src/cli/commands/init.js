const { resolve } = require('path');
const { writeFileSync, mkdirSync } = require('fs');
const { ask } = require('../utils/readline');

module.exports = async function(args, engine, ROOT) {
  const project = args[1];
  if (!project) { console.error('用法: openpip init <项目名> [-i]'); return; }

  const isInteractive = args.includes('--interactive') || args.includes('-i');
  const projectDir = engine.initProject(project, ROOT);

  const configDir = resolve(projectDir, '.openpip');
  mkdirSync(configDir, { recursive: true });

  if (isInteractive) {
    console.log('\n📝 OpenPip 项目创建向导\n');

    const researchField = await ask('研究领域 (如: 计算机视觉/自然语言处理/无线通信): ');
    const paperType = await ask('论文类型 (1=本科毕业论文, 2=硕士毕业论文, 3=期刊论文, 4=会议论文): ');
    const targetWords = await ask('目标字数 (如: 10000): ');
    const refFormat = await ask('参考文献格式 (1=GB/T 7714, 2=APA, 3=IEEE): ');

    const paperTypes = { '1': '本科毕业论文', '2': '硕士毕业论文', '3': '期刊论文', '4': '会议论文' };
    const refFormats = { '1': 'gb7714', '2': 'apa', '3': 'ieee' };

    const projectConfig = {
      name: project,
      researchField,
      paperType: paperTypes[paperType] || '硕士毕业论文',
      targetWords: parseInt(targetWords) || 10000,
      refFormat: refFormats[refFormat] || 'gb7714',
      createdAt: new Date().toISOString(),
    };

    writeFileSync(resolve(projectDir, 'project.json'), JSON.stringify(projectConfig, null, 2), 'utf-8');

    console.log(`\n✅ 项目已创建: papers/${project}/`);
    console.log('\n📁 项目配置:');
    console.log(`  研究领域: ${researchField}`);
    console.log(`  论文类型: ${projectConfig.paperType}`);
    console.log(`  目标字数: ${targetWords}`);
    console.log(`  参考文献: ${projectConfig.refFormat}`);
    console.log(`\n💡 下一步: openpip run "${project}" "你的选题"`);
  } else {
    console.log(`✅ 项目已创建: papers/${project}/`);
    console.log(`\n💡 下一步: openpip run "${project}" "你的选题"`);
    console.log(`💡 使用 -i 参数启用交互式引导: openpip init "${project}" -i`);
  }
};

