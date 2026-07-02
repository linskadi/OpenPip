const { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } = require('fs');
const { resolve } = require('path');
const { STAGE_OUTPUTS } = require('./stage-constants');
const { loadJsonFile, parseMarkdownSectionsCore } = require('./utils');

function logError(projectDir, stageId, error, attempt = 0) {
  const outputDir = resolve(projectDir, 'output');
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });
  const errorLogPath = resolve(outputDir, 'error-log.md');
  const timestamp = new Date().toISOString();
  const errorMessage = error?.message || String(error);
  const errorStack = error?.stack || '';
  const entry = `## [${timestamp}] Stage: ${stageId} (attempt ${attempt + 1})

**错误信息**: ${errorMessage}

${errorStack ? `**堆栈**:
\`\`\`
${errorStack}
\`\`\`
` : ''}
---

`;
  let existingContent = '';
  if (existsSync(errorLogPath)) {
    existingContent = readFileSync(errorLogPath, 'utf-8');
  } else {
    existingContent = '# 流水线错误日志\n\n> 本文件记录流水线执行过程中的所有错误。\n\n';
  }
  writeFileSync(errorLogPath, existingContent + entry, 'utf-8');
}

function parseOutlineSections(outlinePath) {
  if (!existsSync(outlinePath)) return [];
  const content = readFileSync(outlinePath, 'utf-8');
  const { sections } = parseMarkdownSectionsCore(content, {
    minLevel: 2,
    maxLevel: 3,
    stripNumber: true,
  });
  return sections;
}

function updateConsistencyMemory(projectDir, chapterIndex, chapterText, _chapterTitle) {
  const memPath = resolve(projectDir, 'drafts', 'consistency-memory.md');
  let mem = '';
  if (existsSync(memPath)) {
    mem = readFileSync(memPath, 'utf-8');
  } else {
    mem = '# 全文一致性记忆文档\n\n## 核心论点\n（待填写）\n\n## 术语表\n| 中文术语 | 英文术语 | 首次定义位置 | 定义 |\n|---------|---------|------------|------|\n\n## 变量表\n| 变量符号 | 含义 | 单位 | 首次出现公式 |\n|---------|------|------|------------|\n\n## 引用编号分配\n| 编号 | 文献简述 | 使用章节 |\n|------|---------|---------|\n\n## 图表编号计划\n| 编号 | 类型 | 标题 | 所在章节 |\n|------|------|------|---------|\n';
  }

  const termPattern = /([\u4e00-\u9fff]{2,8}?)[（(]([A-Za-z][A-Za-z\s-]+?)[)）]/g;
  let termMatch;
  while ((termMatch = termPattern.exec(chapterText)) !== null) {
    const cn = termMatch[1];
    const en = termMatch[2].trim();
    if (!mem.includes(`${cn} | ${en}`)) {
      const termInsert = `| ${cn} | ${en} | 第${chapterIndex}章 | |\n`;
      mem = mem.replace('## 术语表\n| 中文术语 | 英文术语 | 首次定义位置 | 定义 |\n|---------|---------|------------|------|\n', `## 术语表\n| 中文术语 | 英文术语 | 首次定义位置 | 定义 |\n|---------|---------|------------|------|\n${termInsert}`);
    }
  }

  const refPattern = /\[(\d+)\]/g;
  let refMatch;
  while ((refMatch = refPattern.exec(chapterText)) !== null) {
    const num = refMatch[1];
    if (!mem.includes(`| ${num} |`)) {
      const refInsert = `| ${num} | 待补充 | 第${chapterIndex}章 |\n`;
      mem = mem.replace('## 引用编号分配\n| 编号 | 文献简述 | 使用章节 |\n|------|---------|---------|\n', `## 引用编号分配\n| 编号 | 文献简述 | 使用章节 |\n|------|---------|---------|\n${refInsert}`);
    }
  }

  writeFileSync(memPath, mem, 'utf-8');
}

function getCheckpointPath(projectDir) {
  return resolve(projectDir, 'pipeline-checkpoint.json');
}

function saveCheckpoint(projectDir, checkpoint) {
  const cpPath = getCheckpointPath(projectDir);
  checkpoint.timestamp = new Date().toISOString();
  writeFileSync(cpPath, JSON.stringify(checkpoint, null, 2), 'utf-8');
}

function saveVersion(projectDir, project, stageId, stageIndex) {
  const outputRel = STAGE_OUTPUTS[stageId];
  if (!outputRel) return;
  const srcPath = resolve(projectDir, outputRel);
  if (!existsSync(srcPath)) return;

  const versionsDir = resolve(projectDir, 'versions');
  if (!existsSync(versionsDir)) mkdirSync(versionsDir, { recursive: true });

  const version = stageIndex + 1;
  const versionFile = `v${version}-${stageId}.md`;
  const dstPath = resolve(versionsDir, versionFile);
  copyFileSync(srcPath, dstPath);

  const indexPath = resolve(versionsDir, 'index.json');
  const index = loadJsonFile(indexPath, []);
  index.push({
    version,
    stage: stageId,
    file: versionFile,
    timestamp: new Date().toISOString(),
  });
  writeFileSync(indexPath, JSON.stringify(index, null, 2), 'utf-8');
  console.log(`  📦 版本快照: versions/${versionFile}`);
}

module.exports = {
  logError,
  parseOutlineSections,
  updateConsistencyMemory,
  getCheckpointPath,
  saveCheckpoint,
  saveVersion,
};