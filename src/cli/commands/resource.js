/**
 * openpip resource — 资源管理命令
 *
 * 子命令：
 *   openpip resource reload   — 手动刷新资源缓存
 *   openpip resource status   — 显示资源缓存状态
 *   openpip resource watch    — 启动文件监听（持续运行）
 */

const { getResolver } = require('../../engine/resource-resolver');
const { getResourceManager } = require('../../engine/resource-manager');
const { resolve } = require('path');

async function resourceCommand(args, engine, ROOT, config) {
  const subcommand = args._[0] || 'status';
  const resolver = getResolver(ROOT);
  const rm = resolver.getResourceManager();

  switch (subcommand) {
    case 'reload': {
      rm.reload();
      console.log('  ✅ 资源缓存已刷新');
      console.log(`  📂 基础目录: ${rm.baseDir}`);
      break;
    }

    case 'status': {
      const stats = rm.stats();
      console.log('\n📊 资源缓存状态:');
      console.log(`  基础目录: ${stats.baseDir}`);
      console.log(`  缓存文件: ${stats.cachedFiles} 个`);
      console.log(`  监听器: ${stats.watchers} 个`);

      if (stats.cachedFiles > 0) {
        console.log('\n  缓存文件列表:');
        for (const [path, entry] of rm.cache.entries()) {
          const age = Date.now() - entry.mtime;
          const ageStr = age < 60000 ? `${Math.round(age / 1000)}s 前`
            : age < 3600000 ? `${Math.round(age / 60000)}min 前`
            : `${Math.round(age / 3600000)}h 前`;
          console.log(`    ${path} (${entry.size} bytes, ${ageStr})`);
        }
      }
      break;
    }

    case 'watch': {
      console.log('👁️  启动资源文件监听...');
      console.log(`  📂 监听目录: ${rm.baseDir}`);
      console.log('  按 Ctrl+C 停止\n');

      rm.on('change', ({ type, path }) => {
        console.log(`  🔄 [${type}] ${path}`);
      });

      rm.startWatching();

      // 保持进程运行
      await new Promise((resolve) => {
        process.on('SIGINT', () => {
          rm.stopWatching();
          console.log('\n  ⏹️  监听已停止');
          resolve();
        });
      });
      break;
    }

    default:
      console.log(`  ❌ 未知子命令: ${subcommand}`);
      console.log('  可用子命令: reload, status, watch');
  }
}

module.exports = resourceCommand;
