// TUI 命令 — Rust TUI 已搁置（详见 docs/ROADMAP.md）
// 当前主推 CLI 交互模式 + Chat 自然语言对话。此命令保留为入口占位，
// 待 Rust TUI 落地后重新接入二进制启动逻辑。

module.exports = async function tui(_args, _engine, _ROOT, _config) {
  console.log('');
  console.log('🖼️  OpenPip TUI 暂未上线');
  console.log('');
  console.log('   Rust TUI 界面当前处于搁置状态，推荐使用以下方式：');
  console.log('');
  console.log('   • openpip chat          自然语言对话（推荐）');
  console.log('   • openpip run <项目>     执行写作流水线');
  console.log('   • openpip status <项目>  查看项目状态');
  console.log('');
  console.log('   详见 docs/ROADMAP.md 中 "Rust TUI 界面" 章节。');
  console.log('');
};
