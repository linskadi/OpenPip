const { resolve } = require('path');

module.exports = async function(args, engine, ROOT) {
  const knowledgeDir = resolve(ROOT, '.openpip', 'knowledge');
  console.log('Building TF-IDF index...');
  console.log('Knowledge dir:', knowledgeDir);

  const result = engine.precomputeIndex(knowledgeDir);

  console.log('Index built successfully:');
  console.log(`  Files: ${result.filesProcessed}`);
  console.log(`  Chunks: ${result.chunksCount}`);
  console.log(`  Vocabulary: ${result.vocabSize} terms`);
  console.log(`  Cache: ${result.cachePath}`);
};

