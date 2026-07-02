const { readFileSync, writeFileSync, existsSync, mkdirSync } = require('fs');
const { dirname } = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);

const baseAdapter = {
  async readFile(path) {
    return readFileSync(path, 'utf-8');
  },

  async writeFile(path, content) {
    const dir = dirname(path);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(path, content, 'utf-8');
  },

  async executeCommand(cmd, args = []) {
    try {
      const { stdout } = await execFileAsync(cmd, args, { timeout: 30000, encoding: 'utf-8' });
      return { stdout, stderr: '', exitCode: 0 };
    } catch (err) {
      return { stdout: err.stdout || '', stderr: err.stderr || err.message, exitCode: err.code || 1 };
    }
  },
};

module.exports = baseAdapter;
