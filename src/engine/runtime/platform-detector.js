const os = require('os');
const { execSync } = require('child_process');
const { writeFileSync, unlinkSync } = require('fs');
const { join } = require('path');
const { loadYaml } = require('../utils');

const MATRIX_PATH = join(__dirname, '..', '..', '..', 'config', 'tool-platform-matrix.yaml');

function run(cmd) {
  try {
    return execSync(cmd, { timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] }).toString().trim();
  } catch {
    // 命令执行失败通常意味着工具未安装，静默返回 null
    return null;
  }
}

function detectOS() {
  const platform = os.platform();
  const release = os.release();
  const version = os.version();

  if (platform === 'win32') return { os: 'windows', osVersion: `${release} (${version})` };
  if (platform === 'darwin') return { os: 'macos', osVersion: release };
  if (platform === 'linux') {
    let distro = '';
    const osRelease = run('cat /etc/os-release');
    if (osRelease) {
      const nameMatch = osRelease.match(/^PRETTY_NAME=(.+)$/m);
      if (nameMatch) distro = nameMatch[1].replace(/"/g, '');
    }
    return { os: 'linux', osVersion: distro || `${release} (${version})` };
  }
  return { os: platform, osVersion: release };
}

function detectRuntimes() {
  return {
    python: !!(run('python --version') || run('python3 --version')),
    latex: !!run('pdflatex --version'),
    pandoc: !!run('pandoc --version'),
    git: !!run('git --version'),
  };
}

function detectPermissions(workspace) {
  // 通过实际写入临时文件来检测工作区可写性（accessSync 对不存在文件会抛错）
  let workspaceWritable = false;
  const testFile = join(workspace || process.cwd(), '.openpip-write-test');
  try {
    writeFileSync(testFile, 'ok', { encoding: 'utf-8' });
    unlinkSync(testFile);
    workspaceWritable = true;
  } catch {
    // 工作区不可写或检测失败
  }

  let admin = false;
  if (process.platform === 'win32') {
    try {
      const result = run('net session');
      admin = !!result;
    } catch {
      // 非管理员权限运行，此为正常情况
    }
  } else {
    admin = process.getuid ? process.getuid() === 0 : false;
  }

  return { admin, workspaceWritable };
}

function detectNetwork() {
  const online = !!(run('ping -n 1 8.8.8.8') || run('ping -c 1 8.8.8.8'));
  let privateMode = false;
  if (process.platform === 'win32') {
    const result = run('powershell -Command "(Get-NetConnectionProfile).NetworkCategory"');
    privateMode = result === 'Private';
  }
  return { online, privateMode };
}

function loadMatrix() {
  return loadYaml(MATRIX_PATH, null);
}

function detectPlatform(workspace) {
  const { os: osName, osVersion } = detectOS();
  const runtimes = detectRuntimes();
  const permissions = detectPermissions(workspace);
  const network = detectNetwork();
  return { os: osName, osVersion, runtimes, permissions, network };
}

function getAvailableTools(platform, matrix) {
  if (!matrix) matrix = loadMatrix();
  if (!matrix || !matrix.tools) return [];

  const available = [];
  for (const [name, config] of Object.entries(matrix.tools)) {
    if (!config.platforms.includes(platform.os)) continue;

    const depsMet = config.dependencies.every((dep) => {
      if (dep === 'network') return platform.network.online;
      if (dep === 'python') return platform.runtimes.python;
      if (dep === 'latex') return platform.runtimes.latex;
      if (dep === 'pandoc') return platform.runtimes.pandoc;
      if (dep === 'git') return platform.runtimes.git;
      return true;
    });

    if (!depsMet) continue;

    available.push({
      name,
      risk: config.risk,
      fallback: config.fallback,
    });
  }

  return available;
}

module.exports = { detectPlatform, getAvailableTools, loadMatrix };

