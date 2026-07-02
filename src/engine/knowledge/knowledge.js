const { resolve } = require('path');

const { walkDir, loadYaml, safeReadFile } = require('../utils');

/**
 * 加载知识文件内容（单目录模式）
 * @param {string[]} knownPaths - 知识文件相对路径列表
 * @param {string} knowledgeDir - 知识目录绝对路径
 * @returns {string} 拼接后的知识内容
 */
function loadKnowledge(knownPaths, knowledgeDir) {
  const parts = [];
  for (const k of knownPaths) {
    const filePath = resolve(knowledgeDir, k);
    const content = safeReadFile(filePath);
    if (content) {
      parts.push(`\n\n--- ${k} ---\n${content}`);
    }
  }
  return parts.join('');
}

/**
 * 多目录回退加载知识文件
 * 按 knowledgeDirs 顺序依次查找，找到第一个存在的文件即使用
 * @param {string[]} knownPaths - 知识文件相对路径列表
 * @param {string[]} knowledgeDirs - 知识目录列表（优先级从低到高）
 */
function loadKnowledgeMulti(knownPaths, knowledgeDirs) {
  const parts = [];
  for (const k of knownPaths) {
    let found = false;
    for (let i = knowledgeDirs.length - 1; i >= 0; i--) {
      const filePath = resolve(knowledgeDirs[i], k);
      const content = safeReadFile(filePath);
      if (content) {
        parts.push(`\n\n--- ${k} ---\n${content}`);
        found = true;
        break;
      }
    }
    if (!found) {
      // silently skip missing files
    }
  }
  return parts.join('');
}

function loadAllKnowledge(knowledgeDir) {
  const files = [];
  walkDir(knowledgeDir, (fullPath, entry) => {
    if (entry.endsWith('.md')) {
      files.push(fullPath);
    }
  });
  const parts = [];
  for (const f of files) {
    const rel = f.replace(knowledgeDir + '\\', '').replace(knowledgeDir + '/', '');
    const content = safeReadFile(f);
    if (content) {
      parts.push(`\n\n--- ${rel} ---\n${content}`);
    }
  }
  return parts.join('');
}

/**
 * 加载分类知识映射文件
 * @param {string} mapPath - classification-knowledge-map.yaml 的绝对路径
 */
function loadClassificationKnowledgeMap(mapPath) {
  if (!mapPath) return null;
  return loadYaml(mapPath, null);
}

/**
 * 根据分类过滤知识文件列表
 * @param {string[]} agentKnowledge - 角色配置的知识文件列表
 * @param {object} classification - { firstClass, subClass }
 * @param {string} classificationMapPath - classification-knowledge-map.yaml 的路径
 */
function loadKnowledgeByClassification(agentKnowledge, classification, classificationMapPath) {
  if (!classification || !classification.firstClass) {
    return agentKnowledge;
  }
  const classMap = loadClassificationKnowledgeMap(classificationMapPath);
  if (!classMap) return agentKnowledge;

  const classEntry = classMap[classification.firstClass];
  if (!classEntry) return agentKnowledge;

  const allowed = classEntry.knowledge || [];
  const forbidden = classEntry.forbidden_prefixes || [];

  return agentKnowledge.filter(k => {
    const isAllowed = allowed.includes(k);
    const isForbidden = forbidden.some(prefix => k.startsWith(prefix));
    return isAllowed && !isForbidden;
  });
}

module.exports = {
  loadKnowledge,
  loadKnowledgeMulti,
  loadAllKnowledge,
  loadKnowledgeByClassification,
  loadClassificationKnowledgeMap,
};
