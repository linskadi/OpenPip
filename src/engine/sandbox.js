const fs = require('fs');
const path = require('path');

class PipelineSandbox {
  constructor(projectRoot, runId) {
    this.projectRoot = projectRoot;
    this.runId = runId;
    this.sandboxDir = path.join(projectRoot, '.openpip', 'sandbox', runId);
  }

  /**
   * Create sandbox by copying project directory
   * @param {string} projectName - Name of the project to sandbox
   * @returns {string} The sandbox project directory path
   */
  async create(projectName) {
    const srcDir = path.join(this.projectRoot, 'papers', projectName);

    if (!fs.existsSync(srcDir)) {
      throw new Error(`项目目录不存在: papers/${projectName}`);
    }

    const dstDir = path.join(this.sandboxDir, 'papers', projectName);

    // Create full directory structure
    fs.mkdirSync(dstDir, { recursive: true });

    // Copy directories that exist in the source project
    const dirsToCopy = ['research', 'drafts', 'output', 'state', 'figures', 'versions', 'data'];
    for (const dir of dirsToCopy) {
      const srcSub = path.join(srcDir, dir);
      const dstSub = path.join(dstDir, dir);
      if (fs.existsSync(srcSub)) {
        fs.cpSync(srcSub, dstSub, { recursive: true });
      }
    }

    // Copy .openpip subdirectory if it exists (project-level config)
    const srcOmDir = path.join(srcDir, '.openpip');
    if (fs.existsSync(srcOmDir)) {
      const dstOmDir = path.join(dstDir, '.openpip');
      fs.cpSync(srcOmDir, dstOmDir, { recursive: true });
    }

    // Copy metadata.json if it exists
    const metadataPath = path.join(srcDir, 'metadata.json');
    if (fs.existsSync(metadataPath)) {
      fs.copyFileSync(metadataPath, path.join(dstDir, 'metadata.json'));
    }

    console.log(`  📦 沙箱创建完成: ${path.relative(this.projectRoot, dstDir)}`);
    return dstDir;
  }

  /**
   * Get the sandbox project directory path
   * @param {string} projectName
   * @returns {string}
   */
  getSandboxProjectDir(projectName) {
    return path.join(this.sandboxDir, 'papers', projectName);
  }

  /**
   * Export results from sandbox back to project
   * @param {string} projectName
   */
  async exportResults(projectName) {
    const srcDir = path.join(this.sandboxDir, 'papers', projectName);
    const dstDir = path.join(this.projectRoot, 'papers', projectName);

    if (!fs.existsSync(srcDir)) {
      throw new Error(`沙箱项目目录不存在: ${srcDir}`);
    }

    // Ensure destination parent exists
    fs.mkdirSync(dstDir, { recursive: true });

    // Copy output/ and figures/ back
    const dirsToExport = ['output', 'figures'];
    for (const dir of dirsToExport) {
      const srcSub = path.join(srcDir, dir);
      const dstSub = path.join(dstDir, dir);
      if (fs.existsSync(srcSub)) {
        fs.cpSync(srcSub, dstSub, { recursive: true });
        console.log(`  📁 已导出: ${dir}/`);
      }
    }

    // Also export state/ for blackboard and version data
    const stateSrc = path.join(srcDir, 'state');
    const stateDst = path.join(dstDir, 'state');
    if (fs.existsSync(stateSrc)) {
      fs.cpSync(stateSrc, stateDst, { recursive: true });
      console.log(`  📁 已导出: state/`);
    }

    console.log(`  ✅ 结果已导出回 papers/${projectName}`);
  }

  /**
   * Clean up sandbox directory
   */
  async cleanup() {
    if (fs.existsSync(this.sandboxDir)) {
      fs.rmSync(this.sandboxDir, { recursive: true, force: true });
      console.log(`  🧹 沙箱已清理: ${path.relative(this.projectRoot, this.sandboxDir)}`);
    }
  }

  /**
   * Check if sandbox exists
   * @returns {boolean}
   */
  exists() {
    return fs.existsSync(this.sandboxDir);
  }

  /**
   * Generate a unique run ID
   * @returns {string}
   */
  static generateRunId() {
    return `sandbox-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  }
}

module.exports = { PipelineSandbox };
