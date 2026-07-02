const { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } = require('fs');
const { resolve, join } = require('path');

const RUNS_DIR = 'state';
const RUNS_SUBDIR = 'runs';
const INDEX_FILE = 'index.json';

class PipelineHistory {
  constructor(projectDir) {
    this.runsDir = resolve(projectDir, RUNS_DIR, RUNS_SUBDIR);
  }

  /**
   * Save a completed run's full context
   * @param {Object} runData - { run_id, pipeline, project, started_at, completed_at, stages, blackboard_snapshot }
   */
  saveRun(runData) {
    if (!runData || !runData.run_id) {
      throw new Error('runData must include run_id');
    }

    if (!existsSync(this.runsDir)) {
      mkdirSync(this.runsDir, { recursive: true });
    }

    // Save individual run file
    const runPath = join(this.runsDir, `${runData.run_id}.json`);
    writeFileSync(runPath, JSON.stringify(runData, null, 2), 'utf-8');

    // Update index
    const index = this._loadIndex();
    const entry = {
      run_id: runData.run_id,
      pipeline: runData.pipeline || '',
      project: runData.project || '',
      started_at: runData.started_at || '',
      completed_at: runData.completed_at || '',
      stage_count: Array.isArray(runData.stages) ? runData.stages.length : 0,
    };

    // Remove existing entry with same run_id (deduplicate)
    const filtered = index.filter(e => e.run_id !== runData.run_id);
    filtered.push(entry);

    // Sort by started_at descending
    filtered.sort((a, b) => (b.started_at || '').localeCompare(a.started_at || ''));

    this._saveIndex(filtered);
    return entry;
  }

  /**
   * List all runs sorted by started_at descending
   * @returns {Array} Array of run summary objects
   */
  listRuns() {
    if (!existsSync(this.runsDir)) {
      return [];
    }
    return this._loadIndex();
  }

  /**
   * Inspect a specific run by ID
   * @param {string} runId
   * @returns {Object|null} Full run data or null if not found
   */
  inspectRun(runId) {
    if (!runId) return null;
    if (!existsSync(this.runsDir)) return null;

    const runPath = join(this.runsDir, `${runId}.json`);
    if (!existsSync(runPath)) return null;

    try {
      return JSON.parse(readFileSync(runPath, 'utf-8'));
    } catch {
      return null;
    }
  }

  /**
   * Generate a unique run ID
   * Format: run-YYYYMMDD-xxxxxx (date + 6-char random)
   */
  static generateRunId() {
    const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randPart = Math.random().toString(36).slice(2, 8);
    return `run-${datePart}-${randPart}`;
  }

  _loadIndex() {
    const indexPath = join(this.runsDir, INDEX_FILE);
    if (!existsSync(indexPath)) return [];
    try {
      const data = JSON.parse(readFileSync(indexPath, 'utf-8'));
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }

  _saveIndex(index) {
    if (!existsSync(this.runsDir)) {
      mkdirSync(this.runsDir, { recursive: true });
    }
    const indexPath = join(this.runsDir, INDEX_FILE);
    writeFileSync(indexPath, JSON.stringify(index, null, 2), 'utf-8');
  }
}

module.exports = { PipelineHistory };
