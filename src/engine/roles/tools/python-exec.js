const { writeFileSync, readdirSync, existsSync, mkdirSync, unlinkSync } = require('fs');
const { resolve } = require('path');
const { execFileSync } = require('child_process');
const { callLLMWithRetry } = require('../../llm');
const { DEFAULT_MODEL } = require('../../constants');

const SAFE_IMPORTS = [
  'numpy', 'scipy', 'pandas', 'matplotlib', 'sklearn',
  'statsmodels', 'sympy', 'json', 'csv', 'math', 'random',
  'itertools', 'collections', 'os', 'sys', 're',
];

const DANGEROUS_PATTERNS = [
  /\bos\.system\s*\(/,
  /\bsubprocess\b/,
  /\bshutil\.rmtree\b/,
  /\beval\s*\(/,
  /\bexec\s*\(/,
  /\b__import__\s*\(/,
  /\bopen\s*\(.*['"].*\.\.\//,
];

function validateCode(code) {
  const issues = [];
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(code)) {
      issues.push(`不安全操作: ${pattern}`);
    }
  }
  return { safe: issues.length === 0, issues };
}

function extractPythonCode(text) {
  const blockMatch = text.match(/```(?:python)?\n([\s\S]*?)```/);
  if (blockMatch) return blockMatch[1].trim();
  return text.trim();
}

function executePython(code, projectDir, timeout = 60000) {
  const scriptDir = resolve(projectDir, 'drafts');
  if (!existsSync(scriptDir)) mkdirSync(scriptDir, { recursive: true });

  const scriptPath = resolve(scriptDir, `temp_script_${Date.now()}.py`);
  writeFileSync(scriptPath, code, 'utf-8');

  const result = { stdout: '', stderr: '', exitCode: -1, generatedFiles: [] };

  try {
    const output = execFileSync(process.platform === 'win32' ? 'python' : 'python3', [scriptPath], {
      cwd: projectDir,
      timeout,
      stdio: 'pipe',
      maxBuffer: 10 * 1024 * 1024,
      env: { ...process.env, PYTHONUNBUFFERED: '1' },
    });
    result.stdout = output.toString().trim();
    result.exitCode = 0;
  } catch (err) {
    result.stdout = (err.stdout || '').toString().trim();
    result.stderr = (err.stderr || '').toString().trim();
    result.exitCode = err.status || 1;
  }

  try { unlinkSync(scriptPath); } catch {}

  const figuresDir = resolve(projectDir, 'figures');
  if (existsSync(figuresDir)) {
    try {
      result.generatedFiles = readdirSync(figuresDir)
        .filter(f => f.endsWith('.png') || f.endsWith('.pdf') || f.endsWith('.jpg'))
        .map(f => `figures/${f}`);
    } catch {}
  }

  return result;
}

async function codeExecutionLoop(task, project, projectRoot, config) {
  const projectDir = resolve(projectRoot, 'papers', project);
  const maxAttempts = config.maxCodeAttempts || 5;

  let code = '';
  const history = [];
  const finalNotebookCells = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const codeTask = history.length === 0
      ? task
      : `${task}\n\n## 历史执行结果\n${history.map(h =>
        `--- 第 ${h.attempt} 次 ---\nstdout:\n${h.stdout.slice(0, 2000)}\nstderr:\n${h.stderr.slice(0, 2000)}`
      ).join('\n')}\n\n请修复代码错误。返回完整的修正后的代码。`;

    const raw = await callLLMWithRetry(
      config.model || DEFAULT_MODEL,
      `你是 OpenPip 的 coder 角色。请编写 Python 代码解决问题。\n\n任务: ${codeTask}\n\n## 项目目录\npapers/${project}/\n\n返回代码放在 \`\`\`python 代码块中。`,
      config
    );

    code = extractPythonCode(raw);

    const validation = validateCode(code);
    if (!validation.safe) {
      history.push({ attempt, stdout: '', stderr: `代码安全检查未通过: ${validation.issues.join('; ')}`, exitCode: -1, generatedFiles: [] });
      finalNotebookCells.push({ source: 'code', content: code, error: validation.issues.join('; ') });
      console.log(`  🔒 第 ${attempt} 次: 代码安全拦截`);
      continue;
    }

    const result = executePython(code, projectDir, config.codeTimeout || 60000);
    history.push({ attempt, ...result });
    finalNotebookCells.push({ source: 'code', content: code, result: result.stdout.slice(0, 500), error: result.stderr.slice(0, 500) });

    console.log(`  🐍 第 ${attempt} 次: exit=${result.exitCode} | stdout=${result.stdout.length}ch | stderr=${result.stderr.length}ch`);

    if (result.exitCode === 0) {
      console.log('  ✅ 代码执行成功');
      break;
    }

    if (attempt === maxAttempts) {
      console.log('  ⚠️ 达到最大执行尝试次数');
    }
  }

  const notebook = generateNotebook(code, history, finalNotebookCells);

  const outputDir = resolve(projectDir, 'drafts');
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });
  writeFileSync(resolve(outputDir, 'notebook.ipynb'), JSON.stringify(notebook, null, 2), 'utf-8');

  const last = history[history.length - 1] || { stdout: '', stderr: '' };
  const summary = `## 代码执行报告\n\n- 尝试次数: ${history.length}\n- 最终状态: ${last.exitCode === 0 ? '✅ 成功' : '❌ 失败'}\n- 生成的图表: ${(last.generatedFiles || []).join(', ') || '无'}\n\n### 最终输出\n\`\`\`\n${last.stdout.slice(0, 2000)}\n\`\`\`\n\n### 错误信息\n\`\`\`\n${last.stderr.slice(0, 1000)}\n\`\`\``;

  writeFileSync(resolve(outputDir, 'code-execution-report.md'), summary, 'utf-8');
  return summary;
}

function generateNotebook(code, history, cells) {
  const nb = {
    nbformat: 4,
    nbformat_minor: 5,
    metadata: { kernelspec: { display_name: 'Python 3', language: 'python', name: 'python3' } },
    cells: [],
  };

  nb.cells.push({
    cell_type: 'markdown',
    metadata: {},
    source: ['# 代码执行报告\n', `\n自动生成于 ${new Date().toISOString()}\n`],
  });

  for (const cell of cells) {
    if (cell.source === 'code') {
      nb.cells.push({
        cell_type: 'code',
        execution_count: null,
        metadata: {},
        outputs: cell.error
          ? [{ output_type: 'error', ename: 'Error', evalue: cell.error, traceback: [] }]
          : [{ output_type: 'stream', name: 'stdout', text: cell.result || '' }],
        source: cell.content.split('\n').map(l => l + '\n'),
      });
    }
  }

  return nb;
}

module.exports = { executePython, extractPythonCode, validateCode, codeExecutionLoop, SAFE_IMPORTS };
