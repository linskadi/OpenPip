const { resolve, basename } = require('path');
const { existsSync, writeFileSync, mkdirSync, readdirSync, statSync, readFileSync, copyFileSync } = require('fs');
const { CitationWhitelist } = require('../../engine/quality/citation-whitelist');
const { PipelineLoader } = require('../../engine/pipeline-loader');
const { PipelineAdvisor } = require('../../engine/pipeline-advisor');
const { saveYaml, loadJsonFile } = require('../../engine/utils');
const { DEFAULT_MODEL } = require('../../engine/constants');

// ============================================================
// 独立的项目目录解析函数（供 CLI 命令与 ProjectService 共用）
// 解析顺序：
//   1. papers/<category>/<domain>/.../<projectName>（递归嵌套）
//   2. papers/<projectName>（legacy 平铺）
//   3. papers/<多段路径>（用户直接传 competition/math-modeling/huashubei/2023C）
// ============================================================
function findProjectDir(root, projectName) {
  if (!projectName) return null;
  const papersDir = resolve(root, 'papers');
  if (!existsSync(papersDir)) return null;

  // 1. 在 research/competition 分类下递归查找（最多 5 层深度，避免无限遍历）
  for (const category of ['research', 'competition']) {
    const catDir = resolve(papersDir, category);
    if (!existsSync(catDir)) continue;
    const found = findInTree(catDir, projectName, 0, 5);
    if (found) return found;
  }

  // 2. Legacy 平铺：papers/<projectName>
  const legacyDir = resolve(papersDir, projectName);
  if (existsSync(legacyDir) && statSync(legacyDir).isDirectory()) return legacyDir;

  // 3. 多段路径直接拼接（如 competition/math-modeling/huashubei/2023C）
  const multiSegDir = resolve(papersDir, projectName);
  if (projectName.includes('/') || projectName.includes('\\')) {
    if (existsSync(multiSegDir) && statSync(multiSegDir).isDirectory()) return multiSegDir;
  }

  return null;
}

// 递归在 dir 下查找名为 projectName 的子目录
function findInTree(dir, projectName, depth, maxDepth) {
  if (depth > maxDepth) return null;
  try {
    const direct = resolve(dir, projectName);
    if (existsSync(direct) && statSync(direct).isDirectory()) return direct;
    for (const entry of readdirSync(dir)) {
      const entryPath = resolve(dir, entry);
      let isDir;
      try { isDir = statSync(entryPath).isDirectory(); } catch { continue; }
      if (!isDir) continue;
      // 跳过非项目目录（output/drafts/state/.openpip 等已知子目录）
      if (['output', 'drafts', 'state', '.openpip', 'node_modules', '.git'].includes(entry)) continue;
      const found = findInTree(entryPath, projectName, depth + 1, maxDepth);
      if (found) return found;
    }
  } catch {
    // 目录读取失败，静默跳过
  }
  return null;
}

class ProjectService {
  constructor(engine, root, config) {
    this.engine = engine;
    this.root = root;
    this.config = config;
    this.pipelineLoader = new PipelineLoader(root);
  }

  findProjectDir(projectName) {
    return findProjectDir(this.root, projectName);
  }

  createProject(name, category, domain, topic) {
    category = category || 'research';
    domain = domain || 'general';

    // Ensure category/domain directories exist
    const domainDir = resolve(this.root, 'papers', category, domain);
    mkdirSync(domainDir, { recursive: true });

    const projectDir = resolve(domainDir, name);
    if (existsSync(projectDir)) {
      return { success: false, error: `项目 '${name}' 已存在于 ${category}/${domain}/` };
    }

    // Create project via engine
    mkdirSync(projectDir, { recursive: true });
    for (const dir of ['research', 'drafts', 'output', 'versions', 'figures', 'user-input']) {
      mkdirSync(resolve(projectDir, dir), { recursive: true });
    }
    const configDir = resolve(projectDir, '.openpip');
    mkdirSync(configDir, { recursive: true });

    // Write project config
    const projectConfig = {
      name,
      category,
      domain,
      topic: topic || '',
      pipeline: `${category}/${domain}`,
      createdAt: new Date().toISOString(),
    };
    writeFileSync(resolve(projectDir, 'project.json'), JSON.stringify(projectConfig, null, 2), 'utf-8');

    // Copy domain pipeline template if exists
    const template = this.pipelineLoader.loadPipelineTemplate(category, domain);
    if (template) {
      saveYaml(resolve(configDir, 'pipeline.yaml'), template);
    }

    // Create consistency memory
    writeFileSync(resolve(projectDir, 'drafts', 'consistency-memory.md'),
      '# 一致性记忆\n\n> 自动维护的术语、变量、引用、图表编号记录。\n\n## 术语表\n\n## 变量表\n\n## 引用表\n\n## 图表表\n', 'utf-8');

    return {
      success: true,
      path: `${category}/${domain}/${name}`,
      config: projectConfig,
      pipeline: template?.name || 'lightweight',
    };
  }

  getCitationWhitelist(project) {
    const projectDir = this.findProjectDir(project) || resolve(this.root, 'papers', project);
    return new CitationWhitelist(projectDir);
  }

  importBibTeX(project, filePath) {
    const wl = this.getCitationWhitelist(project);
    return wl.importBibTeX(filePath);
  }

  listReferences(project) {
    const wl = this.getCitationWhitelist(project);
    const entries = wl.getAll();
    return {
      success: true,
      count: entries.length,
      entries: entries.map((e, i) => ({
        index: i + 1,
        key: e.key,
        type: e.type,
        title: e.title || '',
        authors: e.authors ? e.authors.map(a => a.name || a).join(', ') : '',
        year: e.year || '',
      })),
    };
  }

  importMaterials(project, files) {
    const projectDir = this.findProjectDir(project);
    if (!projectDir) {
      return { success: false, error: `项目 '${project}' 不存在` };
    }

    const inputDir = resolve(projectDir, 'user-input');
    mkdirSync(inputDir, { recursive: true });

    const imported = [];
    const failed = [];

    for (const filePath of files) {
      try {
        const dest = resolve(inputDir, basename(filePath));
        if (existsSync(filePath)) {
          copyFileSync(filePath, dest);
          imported.push(basename(filePath));
        } else {
          failed.push({ file: filePath, reason: '文件不存在' });
        }
      } catch (err) {
        failed.push({ file: filePath, reason: err.message });
      }
    }

    return { success: imported.length > 0, imported, failed };
  }

  async runPipeline(project, topic, quality, pipelineName) {
    // Find project directory
    const projectDir = this.findProjectDir(project);
    if (!projectDir) {
      return { success: false, error: `项目 '${project}' 不存在` };
    }

    // Load advisor with project-level feature settings
    const advisor = new PipelineAdvisor(this.config);
    const projectFeatures = PipelineAdvisor.loadFeatures(projectDir);
    advisor.setFeatures(projectFeatures);

    // Resolve pipeline: explicit name > project config > domain default > fallback
    let pipeline = null;
    if (pipelineName) {
      pipeline = this.pipelineLoader.loadPipelineByName(pipelineName);
    }
    if (!pipeline) {
      const projectConfig = this._loadProjectConfig(projectDir);
      if (projectConfig) {
        pipeline = this.pipelineLoader.loadPipelineTemplate(projectConfig.category, projectConfig.domain);
      }
    }
    if (!pipeline) {
      pipeline = this.pipelineLoader.resolvePipeline(projectDir);
    }
    if (!pipeline) {
      return { success: false, error: '未找到可用的管线模板' };
    }

    // Task 1: If LLM pipeline generation is enabled, let LLM optimize the pipeline
    if (advisor.isEnabled('llm_pipeline_generation') && !pipelineName) {
      try {
        const projectConfig = this._loadProjectConfig(projectDir);
        const { prompt } = advisor.generatePipeline(topic, projectConfig?.category || 'research', pipeline.stages);
        // Call LLM to get optimized pipeline
        const { callLLMWithRetry } = require('../../engine/llm/llm');
        const model = this.config?.models?.orchestrator || DEFAULT_MODEL;
        const response = await callLLMWithRetry(model, prompt, this.config);
        const optimized = advisor.parsePipelineFromLLM(response);
        if (optimized.stages.length > 0) {
          // Filter pipeline stages based on LLM suggestion
          pipeline.stages = pipeline.stages.filter(s => optimized.stages.includes(s.id));
          console.log(`  🤖 LLM 优化管线: ${optimized.stages.join(' → ')}`);
          if (optimized.reason) console.log(`  💡 原因: ${optimized.reason}`);
        }
      } catch (err) {
        // Fallback to template pipeline
        console.log(`  ⚠️ LLM 管线优化失败，使用模板: ${err.message}`);
      }
    }

    const pipelineId = pipeline.name || 'lightweight';
    const qualityConfig = {
      quick: { enableReviewLoop: false },
      standard: { enableReviewLoop: true },
      deep: { enableReviewLoop: true, ensemble: { numReviews: 5, numReflections: 5 } },
    };

    const opts = qualityConfig[quality] || qualityConfig.standard;
    const confirm = async () => true; // auto-confirm in chat mode

    try {
      await this.engine.runPipeline(pipelineId, project, topic || '未指定选题', this.root, this.config, {
        confirm,
        enableReviewLoop: opts.enableReviewLoop,
      });

      // Generate quality report
      try {
        const { QualityReport } = require('../../engine/quality/quality-report');
        const report = new QualityReport(projectDir);
        const bbPath = resolve(projectDir, 'state', 'blackboard.json');
        const bb = loadJsonFile(bbPath, null);
        if (bb) report.collectFromBlackboard(bb);
        const qcPath = resolve(projectDir, 'output', 'quality-check.json');
        const qc = loadJsonFile(qcPath, null);
        if (qc) report.collectFromQualityCheck(qc);
        const saved = report.save();
        return { success: true, message: '流水线执行完成', report: saved.path };
      } catch (reportErr) {
        return { success: true, message: '流水线执行完成（质量报告生成失败）' };
      }
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  getStatus(project) {
    if (!project) {
      // List all projects across categories
      const papersDir = resolve(this.root, 'papers');
      if (!existsSync(papersDir)) return { success: true, projects: [], categories: [] };
      const projects = [];
      for (const cat of ['research', 'competition']) {
        const catDir = resolve(papersDir, cat);
        if (!existsSync(catDir)) continue;
        for (const domain of readdirSync(catDir)) {
          const domainDir = resolve(catDir, domain);
          if (!statSync(domainDir).isDirectory()) continue;
          for (const p of readdirSync(domainDir)) {
            const pDir = resolve(domainDir, p);
            if (statSync(pDir).isDirectory() && existsSync(resolve(pDir, 'project.json'))) {
              projects.push({ name: p, category: cat, domain });
            }
          }
        }
      }
      // Also check legacy flat structure
      for (const d of readdirSync(papersDir)) {
        const full = resolve(papersDir, d);
        if (statSync(full).isDirectory() && !['research', 'competition'].includes(d)
            && existsSync(resolve(full, 'project.json'))) {
          projects.push({ name: d, category: 'legacy', domain: '' });
        }
      }
      return { success: true, projects };
    }

    const projectDir = this.findProjectDir(project);
    if (!projectDir) {
      return { success: false, error: `项目 '${project}' 不存在` };
    }

    const info = this.engine.getProjectInfo(projectDir);
    const files = (info.files || []).map(f => ({
      path: f.path,
      size: f.size > 1024 ? `${(f.size / 1024).toFixed(1)}KB` : `${f.size}B`,
    }));

    const draftPath = resolve(projectDir, 'drafts', 'draft-v1.md');
    const reviewPath = resolve(projectDir, 'output', 'review-report.md');
    const paperPath = resolve(projectDir, 'output', 'paper.md');

    let status = 'initialized';
    if (existsSync(paperPath)) status = 'completed';
    else if (existsSync(reviewPath)) status = 'reviewed';
    else if (existsSync(draftPath)) status = 'drafted';

    return { success: true, project, status, files };
  }

  exportPaper(project, format) {
    const projectDir = this.findProjectDir(project);
    if (!projectDir) {
      return { success: false, error: `项目 '${project}' 不存在` };
    }
    const paperPath = resolve(projectDir, 'output', 'paper.md');

    if (!existsSync(paperPath)) {
      return { success: false, error: '论文文件不存在，请先运行写作流水线' };
    }

    if (format === 'md' || format === 'markdown') {
      return { success: true, path: paperPath, format: 'markdown' };
    }

    const { execSync } = require('child_process');
    const outputDir = resolve(projectDir, 'output');

    try {
      if (format === 'docx' || format === 'word') {
        const outPath = resolve(outputDir, 'paper.docx');
        execSync(`pandoc "${paperPath}" -o "${outPath}" --from markdown --to docx`, { timeout: 30000 });
        return { success: true, path: outPath, format: 'docx' };
      }
      if (format === 'latex' || format === 'tex') {
        const outPath = resolve(outputDir, 'paper.tex');
        const figuresDir = resolve(projectDir, 'figures');

        // 1. Run pandoc
        execSync(`pandoc "${paperPath}" -o "${outPath}" --from markdown --to latex --standalone --toc`, { timeout: 30000 });

        // 2. Post-process: CJK + figure insertion
        try {
          let tex = readFileSync(outPath, 'utf-8');

          // Add ctex for Chinese
          if (!tex.includes('ctex')) {
            tex = tex.replace(
              /(\\documentclass\[[^\]]*\]\{[^}]+\})/,
              '$1\n\\usepackage{ctex}'
            );
          }
          if (!tex.includes('\\usepackage{graphicx}')) {
            tex = tex.replace('\\usepackage{ctex}', '\\usepackage{ctex}\n\\usepackage{graphicx}');
          }
          // Add adjustbox for figure sizing
          if (!tex.includes('adjustbox')) {
            tex = tex.replace('\\usepackage{graphicx}', '\\usepackage{graphicx}\n\\usepackage{adjustbox}');
          }

          // Build figure map
          if (existsSync(figuresDir)) {
            const figFiles = readdirSync(figuresDir).filter(f => /\.(png|pdf)$/i.test(f)).sort();
            const figMap = {};
            for (const f of figFiles) {
              const numMatch = f.match(/fig(\d+)/i);
              if (numMatch) figMap[parseInt(numMatch[1])] = f;
            }

            // Find body section boundary
            const appendixMarkers = ['\\subsection{附录}', '\\appendix', '\\section*{附录'];
            let bodyEnd = tex.length;
            for (const marker of appendixMarkers) {
              const idx = tex.indexOf(marker);
              if (idx > 0 && idx < bodyEnd) bodyEnd = idx;
            }
            const body = tex.slice(0, bodyEnd);
            const rest = tex.slice(bodyEnd);

            // Insert figures at "图N" references in body
            let modifiedBody = body;
            for (let figNum = 1; figNum <= 20; figNum++) {
              const fileName = figMap[figNum];
              if (!fileName) continue;
              const figLabel = fileName.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_');
              const figCmd = `\n\\begin{figure}[htbp]\n\\centering\n\\includegraphics[width=0.9\\textwidth]{../figures/${fileName}}\n\\caption{图${figNum}}\n\\label{fig:${figLabel}}\n\\end{figure}\n`;

              const figRefPattern = new RegExp(`图${figNum}[^\\d\\n]`, 'g');
              let lastMatch = null;
              let m;
              while ((m = figRefPattern.exec(modifiedBody)) !== null) {
                const before = modifiedBody.slice(Math.max(0, m.index - 300), m.index);
                if (before.includes('\\begin{tabular') || before.includes('\\caption') || before.includes('\\begin{figure}')) continue;
                lastMatch = m;
              }
              if (lastMatch) {
                const afterRef = modifiedBody.slice(lastMatch.index);
                const paraEnd = afterRef.search(/\n\n|\n\\(section|subsection|subsubsection)/);
                const insertPos = lastMatch.index + (paraEnd > 0 ? paraEnd : Math.min(afterRef.length, 500));
                if (!modifiedBody.includes(`includegraphics{../figures/${fileName}}`)) {
                  modifiedBody = modifiedBody.slice(0, insertPos) + figCmd + modifiedBody.slice(insertPos);
                }
              }
            }
            tex = modifiedBody + rest;
          }

          // Fix any remaining figures/ paths
          tex = tex.replace(/\\includegraphics\{figures\//g, '\\includegraphics{../figures/');

          writeFileSync(outPath, tex, 'utf-8');
        } catch (e) {
          console.log(`  ⚠️ LaTeX 路径修复失败: ${e.message}`);
        }

        return { success: true, path: outPath, format: 'latex' };
      }
      return { success: false, error: `不支持的格式: ${format}。支持: md, docx, latex` };
    } catch (err) {
      return { success: false, error: `导出失败: ${err.message}。需要安装 pandoc` };
    }
  }
  _loadProjectConfig(projectDir) {
    const configPath = resolve(projectDir, 'project.json');
    return loadJsonFile(configPath, null);
  }

  listCategories() {
    return this.pipelineLoader.listCategories();
  }

  listPipelines(category) {
    return this.pipelineLoader.listPipelines(category);
  }
}

module.exports = { ProjectService, findProjectDir };
