// 进度条生成器
class ProgressBar {
  constructor(options = {}) {
    this.total = options.total || 100;
    this.current = 0;
    this.width = options.width || 40;
    this.format = options.format || 'bar';
    this.startTime = Date.now();
  }

  update(value) {
    this.current = Math.min(value, this.total);
  }

  increment(amount = 1) {
    this.current = Math.min(this.current + amount, this.total);
  }

  getPercentage() {
    return Math.round((this.current / this.total) * 100);
  }

  getElapsed() {
    return Date.now() - this.startTime;
  }

  getETA() {
    if (this.current === 0) return null;
    const elapsed = this.getElapsed();
    const rate = this.current / elapsed;
    const remaining = (this.total - this.current) / rate;
    return remaining;
  }

  render() {
    const percentage = this.getPercentage();
    const filled = Math.round((percentage / 100) * this.width);
    const empty = this.width - filled;

    const bar = '█'.repeat(filled) + '░'.repeat(empty);
    const elapsed = (this.getElapsed() / 1000).toFixed(1);
    const eta = this.getETA() ? (this.getETA() / 1000).toFixed(1) : '?';

    return `[${bar}] ${percentage}% (${elapsed}s elapsed, ETA: ${eta}s)`;
  }
}

// 阶段进度追踪器
class StageProgressTracker {
  constructor() {
    this.stages = new Map();
    this.currentStage = null;
  }

  // 初始化阶段
  initStage(stageId, totalSteps, description = '') {
    const progress = new ProgressBar({ total: totalSteps });
    this.stages.set(stageId, {
      id: stageId,
      description,
      progress,
      status: 'pending',
      startTime: null,
      endTime: null,
      result: null,
    });
  }

  // 开始阶段
  startStage(stageId) {
    const stage = this.stages.get(stageId);
    if (!stage) return;

    stage.status = 'running';
    stage.startTime = new Date().toISOString();
    this.currentStage = stageId;
  }

  // 更新阶段进度
  updateStageProgress(stageId, value) {
    const stage = this.stages.get(stageId);
    if (!stage) return;

    stage.progress.update(value);
  }

  // 完成阶段
  completeStage(stageId, result = null) {
    const stage = this.stages.get(stageId);
    if (!stage) return;

    stage.status = 'completed';
    stage.endTime = new Date().toISOString();
    stage.result = result;
    stage.progress.update(stage.progress.total);

    if (this.currentStage === stageId) {
      this.currentStage = null;
    }
  }

  // 阶段失败
  failStage(stageId, error) {
    const stage = this.stages.get(stageId);
    if (!stage) return;

    stage.status = 'failed';
    stage.endTime = new Date().toISOString();
    stage.error = error;

    if (this.currentStage === stageId) {
      this.currentStage = null;
    }
  }

  // 生成进度显示
  renderProgress() {
    let output = '\n📊 流水线进度\n\n';

    for (const [id, stage] of this.stages) {
      const icon = stage.status === 'completed' ? '✅' :
        stage.status === 'running' ? '🔄' :
          stage.status === 'failed' ? '❌' : '⏳';

      output += `${icon} ${stage.description || id}\n`;

      if (stage.status === 'running') {
        output += `   ${stage.progress.render()}\n`;
      } else if (stage.status === 'completed' && stage.startTime && stage.endTime) {
        const duration = (new Date(stage.endTime) - new Date(stage.startTime)) / 1000;
        output += `   完成 (${duration.toFixed(1)}s)\n`;
      } else if (stage.status === 'failed') {
        output += `   失败: ${stage.error}\n`;
      }

      output += '\n';
    }

    return output;
  }

  // 获取总体进度
  getOverallProgress() {
    const stages = [...this.stages.values()];
    const completed = stages.filter(s => s.status === 'completed').length;
    const total = stages.length;

    return {
      completed,
      total,
      percentage: total > 0 ? Math.round((completed / total) * 100) : 0,
    };
  }
}

module.exports = {
  ProgressBar,
  StageProgressTracker,
};
