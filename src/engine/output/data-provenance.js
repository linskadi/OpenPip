const { readFileSync, writeFileSync, existsSync } = require('fs');
const { resolve, extname } = require('path');
const { calculateHash, loadJsonFile, walkDir: utilsWalkDir } = require('../utils');

// 数据溯源记录
class DataProvenance {
  constructor(projectRoot) {
    this.projectRoot = projectRoot;
    this.provenanceFile = resolve(projectRoot, 'papers', 'data-provenance.json');
    this.provenance = this.loadProvenance();
  }

  // 加载溯源记录
  loadProvenance() {
    const defaultProvenance = {
      version: '1.0',
      created: new Date().toISOString(),
      experiments: [],
      dataFiles: [],
      scripts: [],
      checksums: {},
    };
    return loadJsonFile(this.provenanceFile, defaultProvenance);
  }

  // 保存溯源记录
  saveProvenance() {
    writeFileSync(this.provenanceFile, JSON.stringify(this.provenance, null, 2), 'utf-8');
    console.log('  ✅ 溯源记录已保存: data-provenance.json');
  }

  // 计算文件校验和
  calculateChecksum(filePath) {
    const content = readFileSync(filePath, 'utf-8');
    return calculateHash(content);
  }

  // 扫描数据文件
  scanDataFiles(dataDir) {
    console.log('\n📁 扫描数据文件...');
    
    const dataFiles = [];
    const extensions = ['.csv', '.json', '.xlsx', '.xls', '.txt', '.dat', '.h5', '.hdf5'];
    
    utilsWalkDir(dataDir, (fullPath, entry, stat) => {
      if (extensions.includes(extname(entry).toLowerCase())) {
        const checksum = this.calculateChecksum(fullPath);
        const relativePath = fullPath.replace(this.projectRoot, '').replace(/\\/g, '/');
        
        dataFiles.push({
          name: entry,
          path: relativePath,
          size: stat.size,
          modified: stat.mtime.toISOString(),
          checksum,
          metadata: this.extractDataMetadata(fullPath),
        });
        
        console.log(`  📄 ${relativePath} (${this.formatSize(stat.size)})`);
      }
    });
    
    this.provenance.dataFiles = dataFiles;
    
    return dataFiles;
  }

  // 提取数据文件元数据
  extractDataMetadata(filePath) {
    const ext = extname(filePath).toLowerCase();
    const metadata = {
      type: ext,
      format: this.getDataFormat(ext),
    };
    
    try {
      const content = readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');
      
      // 提取前几行作为样本
      metadata.preview = lines.slice(0, 5).join('\n');
      metadata.lineCount = lines.length;
      
      // 尝试解析结构化数据
      if (ext === '.json') {
        const data = JSON.parse(content);
        metadata.structure = {
          isArray: Array.isArray(data),
          keys: Array.isArray(data) ? (data[0] ? Object.keys(data[0]) : []) : Object.keys(data),
          length: Array.isArray(data) ? data.length : null,
        };
      } else if (ext === '.csv') {
        const headers = lines[0].split(',').map(h => h.trim());
        metadata.structure = {
          columns: headers.length,
          headers: headers,
        };
      }
    } catch (err) {
      metadata.preview = '无法读取文件内容';
    }
    
    return metadata;
  }

  // 获取数据格式描述
  getDataFormat(ext) {
    const formats = {
      '.csv': 'CSV (逗号分隔值)',
      '.json': 'JSON (JavaScript对象表示)',
      '.xlsx': 'Excel 工作簿',
      '.xls': 'Excel 旧格式',
      '.txt': '纯文本',
      '.dat': '数据文件',
      '.h5': 'HDF5 格式',
      '.hdf5': 'HDF5 格式',
    };
    return formats[ext] || '未知格式';
  }

  // 扫描脚本文件
  scanScripts(scriptsDir) {
    console.log('\n📜 扫描计算脚本...');
    
    const scripts = [];
    const extensions = ['.py', '.r', '.R', '.m', '.ipynb', '.js', '.ts'];
    
    utilsWalkDir(scriptsDir, (fullPath, entry, stat) => {
      if (extensions.includes(extname(entry).toLowerCase())) {
        const checksum = this.calculateChecksum(fullPath);
        const relativePath = fullPath.replace(this.projectRoot, '').replace(/\\/g, '/');
        
        scripts.push({
          name: entry,
          path: relativePath,
          size: stat.size,
          modified: stat.mtime.toISOString(),
          checksum,
          language: this.getScriptLanguage(entry),
          metadata: this.extractScriptMetadata(fullPath),
        });
        
        console.log(`  📜 ${relativePath} (${this.getScriptLanguage(entry)})`);
      }
    });
    
    this.provenance.scripts = scripts;
    
    return scripts;
  }

  // 获取脚本语言
  getScriptLanguage(filename) {
    const ext = extname(filename).toLowerCase();
    const languages = {
      '.py': 'Python',
      '.r': 'R',
      '.R': 'R',
      '.m': 'MATLAB',
      '.ipynb': 'Jupyter Notebook',
      '.js': 'JavaScript',
      '.ts': 'TypeScript',
    };
    return languages[ext] || '未知';
  }

  // 提取脚本元数据
  extractScriptMetadata(filePath) {
    const metadata = {};
    
    try {
      const content = readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');
      
      metadata.lineCount = lines.length;
      metadata.preview = lines.slice(0, 10).join('\n');
      
      // 提取导入语句
      const imports = [];
      for (const line of lines.slice(0, 30)) {
        if (line.match(/^(import|from|require|#include)/)) {
          imports.push(line.trim());
        }
      }
      metadata.imports = imports;
      
      // 提取函数定义
      const functions = [];
      for (const line of lines) {
        if (line.match(/^(def|function|func|fn)\s+\w+/)) {
          const funcMatch = line.match(/^(def|function|func|fn)\s+(\w+)/);
          if (funcMatch) {
            functions.push(funcMatch[2]);
          }
        }
      }
      metadata.functions = functions;
    } catch (err) {
      metadata.preview = '无法读取文件内容';
    }
    
    return metadata;
  }

  // 记录实验
  recordExperiment(experiment) {
    const record = {
      id: `exp-${this.provenance.experiments.length + 1}`,
      name: experiment.name || `实验 ${this.provenance.experiments.length + 1}`,
      description: experiment.description || '',
      date: new Date().toISOString(),
      dataFiles: experiment.dataFiles || [],
      scripts: experiment.scripts || [],
      parameters: experiment.parameters || {},
      results: experiment.results || {},
      notes: experiment.notes || '',
      checksums: {},
    };
    
    // 计算相关文件的校验和
    for (const file of record.dataFiles) {
      const fullPath = resolve(this.projectRoot, file);
      if (existsSync(fullPath)) {
        record.checksums[file] = this.calculateChecksum(fullPath);
      }
    }
    
    for (const script of record.scripts) {
      const fullPath = resolve(this.projectRoot, script);
      if (existsSync(fullPath)) {
        record.checksums[script] = this.calculateChecksum(fullPath);
      }
    }
    
    this.provenance.experiments.push(record);
    this.saveProvenance();
    
    console.log(`  📝 实验记录已保存: ${record.id}`);
    
    return record;
  }

  // 验证数据完整性
  validateDataIntegrity() {
    console.log('\n🔍 验证数据完整性...');
    
    const issues = [];
    
    // 验证数据文件
    for (const file of this.provenance.dataFiles) {
      const fullPath = resolve(this.projectRoot, file.path);
      if (!existsSync(fullPath)) {
        issues.push({
          type: 'missing_file',
          severity: 'high',
          file: file.path,
          message: `数据文件不存在: ${file.path}`,
        });
        continue;
      }
      
      const currentChecksum = this.calculateChecksum(fullPath);
      if (currentChecksum !== file.checksum) {
        issues.push({
          type: 'checksum_mismatch',
          severity: 'medium',
          file: file.path,
          message: `数据文件已修改: ${file.path}`,
          expected: file.checksum,
          actual: currentChecksum,
        });
      }
    }
    
    // 验证脚本文件
    for (const script of this.provenance.scripts) {
      const fullPath = resolve(this.projectRoot, script.path);
      if (!existsSync(fullPath)) {
        issues.push({
          type: 'missing_script',
          severity: 'high',
          file: script.path,
          message: `计算脚本不存在: ${script.path}`,
        });
        continue;
      }
      
      const currentChecksum = this.calculateChecksum(fullPath);
      if (currentChecksum !== script.checksum) {
        issues.push({
          type: 'script_modified',
          severity: 'medium',
          file: script.path,
          message: `计算脚本已修改: ${script.path}`,
          expected: script.checksum,
          actual: currentChecksum,
        });
      }
    }
    
    return {
      valid: issues.length === 0,
      issues,
      checkedFiles: this.provenance.dataFiles.length + this.provenance.scripts.length,
      timestamp: new Date().toISOString(),
    };
  }

  // 生成可复现性报告
  generateReproducibilityReport() {
    console.log('\n📄 生成可复现性报告...');
    
    const validation = this.validateDataIntegrity();
    
    let report = `# 可复现性报告

## 生成时间
${new Date().toISOString()}

## 数据完整性验证
- **状态**: ${validation.valid ? '✅ 通过' : '❌ 发现问题'}
- **检查文件数**: ${validation.checkedFiles}

`;
    
    if (validation.issues.length > 0) {
      report += '### 发现的问题\n\n';
      for (const issue of validation.issues) {
        report += `- **[${issue.severity.toUpperCase()}]** ${issue.message}\n`;
        if (issue.expected && issue.actual) {
          report += `  - 预期: ${issue.expected}\n`;
          report += `  - 实际: ${issue.actual}\n`;
        }
      }
    } else {
      report += '### 验证通过\n\n所有数据文件和脚本文件完整性验证通过。\n';
    }
    
    report += `
## 数据文件清单

| 文件名 | 路径 | 大小 | 格式 | 校验和 |
|--------|------|------|------|--------|
`;
    
    for (const file of this.provenance.dataFiles) {
      report += `| ${file.name} | ${file.path} | ${this.formatSize(file.size)} | ${file.metadata.format} | ${file.checksum.substring(0, 12)}... |\n`;
    }
    
    report += `
## 计算脚本清单

| 脚本名 | 路径 | 语言 | 行数 | 校验和 |
|--------|------|------|------|--------|
`;
    
    for (const script of this.provenance.scripts) {
      report += `| ${script.name} | ${script.path} | ${script.language} | ${script.metadata.lineCount} | ${script.checksum.substring(0, 12)}... |\n`;
    }
    
    if (this.provenance.experiments.length > 0) {
      report += `
## 实验记录

| 实验ID | 名称 | 日期 | 数据文件 | 脚本 |
|--------|------|------|---------|------|
`;
      
      for (const exp of this.provenance.experiments) {
        report += `| ${exp.id} | ${exp.name} | ${exp.date} | ${exp.dataFiles.length} | ${exp.scripts.length} |\n`;
      }
    }
    
    report += `
## 复现步骤

1. **环境准备**
   - 确保安装了所有必要的依赖
   - 验证软件版本与记录一致

2. **数据准备**
   - 下载或准备所有数据文件
   - 验证文件校验和

3. **执行脚本**
   - 按顺序执行计算脚本
   - 检查输出结果

4. **结果验证**
   - 比对输出结果与预期
   - 检查生成的图表和表格
`;
    
    // 保存报告
    const reportPath = resolve(this.projectRoot, 'papers', 'reproducibility-report.md');
    writeFileSync(reportPath, report, 'utf-8');
    
    console.log('  ✅ 可复现性报告已保存: papers/reproducibility-report.md');
    
    return report;
  }

  // 格式化文件大小
  formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  // 完整扫描
  fullScan() {
    console.log('\n🔍 开始完整数据溯源扫描...');
    
    const dataDir = resolve(this.projectRoot, 'papers', 'data');
    const scriptsDir = resolve(this.projectRoot, 'papers', 'scripts');
    
    this.scanDataFiles(dataDir);
    this.scanScripts(scriptsDir);
    this.saveProvenance();
    
    console.log('\n📊 扫描完成:');
    console.log(`  数据文件: ${this.provenance.dataFiles.length} 个`);
    console.log(`  计算脚本: ${this.provenance.scripts.length} 个`);
    console.log(`  实验记录: ${this.provenance.experiments.length} 条`);
    
    return this.provenance;
  }
}

module.exports = { DataProvenance };
