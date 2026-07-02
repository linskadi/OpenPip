const { findProjectDir } = require('../services/project-service');

module.exports = async function(args, engine, ROOT) {
  const project = args[1];
  if (!project) { console.error('用法: openpip status <项目名>'); return; }
  const projectDir = findProjectDir(ROOT, project);
  if (!projectDir) { console.error(`项目 '${project}' 不存在`); return; }
  console.log(`📁 项目: ${project}`);
  const info = engine.getProjectInfo(projectDir);
  for (const f of info.files) {
    const size = f.size > 1024 ? `${(f.size / 1024).toFixed(1)}KB` : `${f.size}B`;
    console.log(`  ${f.path} (${size})`);
  }
};
