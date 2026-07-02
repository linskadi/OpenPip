const { resolve } = require('path');
const { findProjectDir } = require('../services/project-service');

module.exports = async function(args, engine, ROOT, config) {
  const project = args[1];
  const file = args[2] || 'drafts/draft-v2.md';

  if (!project) {
    console.error('用法: openpip annotate <项目名> [文件路径]');
    return;
  }

  const projectDir = findProjectDir(ROOT, project);
  if (!projectDir) {
    console.error(`项目 '${project}' 不存在`);
    return;
  }
  const filePath = resolve(projectDir, file);
  const report = await engine.processAnnotations(filePath, project, ROOT, config);

  if (report) {
    console.log('\n✅ 批注处理报告已生成');
  }
};
