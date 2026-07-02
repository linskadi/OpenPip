const { existsSync } = require('fs');
const { resolve } = require('path');

class UserAbortError extends Error {
  constructor(msg) { super(msg); this.name = 'UserAbortError'; }
}

const PREVIEW_LINES = 30;

function formatStageSummary(stage, result, projectDir, qualityScore, elapsed) {
  const lines = [];
  const outputPath = resolve(projectDir, stage.output || '');
  lines.push(`\n📝 阶段「${stage.id}」(${stage.agent || stage.role}) 已完成`);
  lines.push(`  ├─ 字数: ${result.length}`);
  if (elapsed) lines.push(`  ├─ 耗时: ${(elapsed / 1000).toFixed(1)}s`);
  if (qualityScore !== null && qualityScore !== undefined) lines.push(`  ├─ 质量分: ${qualityScore}/100`);
  if (existsSync(outputPath)) lines.push(`  └─ 路径: ${stage.output}`);
  return lines.join('\n');
}

function printPreview(text, maxLines = PREVIEW_LINES) {
  const lines = text.split('\n');
  const preview = lines.slice(0, maxLines);
  const width = Math.min(process.stdout.columns || 80, 80);
  console.log(`\n  ┌${'─'.repeat(width - 2)}┐`);
  for (const line of preview) {
    const truncated = line.length > width - 4 ? line.slice(0, width - 7) + '...' : line;
    console.log(`  │ ${truncated}${' '.repeat(Math.max(0, width - 4 - truncated.length))}│`);
  }
  if (lines.length > maxLines) {
    console.log(`  │ ${' '.repeat(width - 4)}│`);
    console.log(`  │ ... 还有 ${lines.length - maxLines} 行 (输入 d 查看全部)${' '.repeat(Math.max(0, width - 38))}│`);
  }
  console.log(`  └${'─'.repeat(width - 2)}┘`);
}

function showMenu() {
  console.log('\n  [回车] 确认，继续下一步');
  console.log('  [i]    指出问题，让 AI 修改');
  console.log('  [e]    手动编辑 (打开 $EDITOR)');
  console.log('  [d]    查看全部内容');
  console.log('  [s]    中止流水线');
}

function readUserInput(prompt) {
  const readline = require('readline');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve, reject) => {
    const onSigint = () => {
      rl.close();
      process.removeListener('SIGINT', onSigint);
      const err = new UserAbortError('用户中断 (SIGINT)');
      reject(err);
    };
    process.on('SIGINT', onSigint);
    rl.question(prompt, answer => {
      rl.close();
      process.removeListener('SIGINT', onSigint);
      resolve(answer.trim().toLowerCase());
    });
  });
}

async function approvalGate(stage, result, projectDir, options = {}) {
  const { qualityScore, elapsed, confirm: confirmFn, ipcConfirm } = options;
  const approval = stage.approval || {};
  const maxFeedbackRounds = approval.maxFeedbackRounds || 3;
  const allowEdit = approval.allowEdit !== false;
  const previewLines = approval.previewLines !== undefined ? approval.previewLines : PREVIEW_LINES;
  const showPreview = previewLines > 0;

  if (stage.approval === false) return { action: 'approve' };

  if (ipcConfirm && typeof ipcConfirm === 'function') {
    return approvalGateIpc(stage, result, projectDir, {
      qualityScore, elapsed, ipcConfirm, maxFeedbackRounds, allowEdit, showPreview, previewLines,
    });
  }

  for (let round = 1; round <= maxFeedbackRounds; round++) {
    console.log(formatStageSummary(stage, result, projectDir, qualityScore, elapsed));

    if (showPreview) {
      printPreview(result, previewLines);
    }

    showMenu();

    const choice = await readUserInput('\n  > ');

    switch (choice) {
    case '':
      return { action: 'approve' };

    case 'i':
    case 'f': {
      const feedback = await readUserInput('\n  请输入你的意见: ');
      if (!feedback.trim()) {
        console.log('  ⚠️ 意见不能为空');
        round--;
        continue;
      }
      return { action: 'feedback', text: feedback.trim(), round };
    }

    case 'e': {
      if (!allowEdit) {
        console.log('  ⚠️ 此阶段不允许手动编辑');
        round--;
        continue;
      }
      if (confirmFn && typeof confirmFn === 'function') {
        const ok = await confirmFn('  确认打开编辑器? (y/N): ');
        if (!ok) { round--; continue; }
      }
      return { action: 'edit' };
    }

    case 'd':
      if (showPreview) {
        console.log('\n' + result);
      } else {
        console.log('\n  (预览已关闭)');
      }
      round--;
      continue;

    case 's':
      return { action: 'stop' };

    default:
      console.log(`  ⚠️ 未知选项: "${choice || '(空)'}"，请重新输入`);
      round--;
      continue;
    }
  }

  console.log('  ⚠️ 超过最大反馈轮数，自动确认');
  return { action: 'approve' };
}

async function approvalGateIpc(stage, result, projectDir, options) {
  const { qualityScore, elapsed, ipcConfirm, maxFeedbackRounds } = options;

  const summary = formatStageSummary(stage, result, projectDir, qualityScore, elapsed);

  for (let round = 1; round <= maxFeedbackRounds; round++) {
    const previewText = result.length > 2000 ? result.slice(0, 2000) + `\n\n... (还有 ${result.length - 2000} 字符)` : result;
    const content = `${summary}\n\n--- 内容预览 ---\n${previewText}`;

    const response = await ipcConfirm(stage.id, content);

    if (response.approved) {
      return { action: 'approve' };
    }

    if (response.stop || response.feedback === 'stop') {
      return { action: 'stop' };
    }

    if (response.feedback && response.feedback.trim()) {
      return { action: 'feedback', text: response.feedback.trim(), round };
    }

    return { action: 'approve' };
  }

  return { action: 'approve' };
}

module.exports = { approvalGate, UserAbortError, formatStageSummary, printPreview };
