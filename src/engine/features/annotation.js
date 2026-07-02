const { readFileSync, existsSync } = require('fs');
const { getDefaultDispatcher } = require('../dispatcher-registry');

function parseAnnotations(text) {
  const annotations = [];
  const lines = text.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const todoMatch = line.match(/<!--\s*(TODO|FIXME|NOTE|BUG|HACK|XXX)[：:]\s*(.+?)\s*-->/g);
    if (todoMatch) {
      for (const match of todoMatch) {
        const content = match.replace(/<!--\s*(TODO|FIXME|NOTE|BUG|HACK|XXX)[：:]\s*/, '').replace(/\s*-->/, '');
        annotations.push({
          line: i + 1,
          content: content.trim(),
          type: (match.match(/TODO|FIXME|NOTE|BUG|HACK|XXX/)?.[0] || 'TODO').toLowerCase(),
          agent: classifyAnnotation(content),
          status: 'pending',
        });
      }
    }
  }

  return annotations;
}

function classifyAnnotation(content) {
  const text = content.toLowerCase();

  if (text.includes('格式') || text.includes('标点') || text.includes('引用')) {
    return 'formatter';
  }
  if (text.includes('润色') || text.includes('语言') || text.includes('ai')) {
    // polisher 已并入 writer 的 polish 子任务
    return 'writer';
  }
  if (text.includes('补充') || text.includes('增加') || text.includes('实验')) {
    return 'writer';
  }
  if (text.includes('检查') || text.includes('验证') || text.includes('核对')) {
    // integrity 已并入 reviewer
    return 'reviewer';
  }

  return 'writer';
}

async function executeAnnotations(annotations, filePath, project, projectRoot, config, dispatcher = null) {
  const results = [];
  const dispatch = dispatcher || getDefaultDispatcher();

  for (const annotation of annotations) {
    console.log(`\n📝 处理批注 #${annotation.line}: ${annotation.type}`);
    console.log(`  内容: ${annotation.content}`);
    console.log(`  Agent: ${annotation.agent}`);

    const fixPrompt = `根据批注修改论文。

## 批注信息
位置: 第 ${annotation.line} 行
类型: ${annotation.type}
内容: ${annotation.content}

## 任务
1. 读取 ${filePath}
2. 找到第 ${annotation.line} 行附近的上下文
3. 根据批注内容进行修改
4. 将修改后的内容保存到文件
5. 移除已处理的批注标记
6. 添加 "<!-- 已响应: ${annotation.type} -->" 标记`;

    try {
      const result = await dispatch(annotation.agent, fixPrompt, project, projectRoot, config);
      results.push({ ...annotation, status: 'completed', result });
      console.log('  ✅ 完成');
    } catch (err) {
      results.push({ ...annotation, status: 'failed', error: err.message });
      console.log(`  ❌ 失败: ${err.message}`);
    }
  }

  return results;
}

async function processAnnotations(filePath, project, projectRoot, config, dispatcher = null) {
  console.log('\n🔍 解析批注...');
  const dispatch = dispatcher || getDefaultDispatcher();

  if (!existsSync(filePath)) {
    console.log('❌ 文件不存在:', filePath);
    return null;
  }

  const text = readFileSync(filePath, 'utf-8');
  const annotations = parseAnnotations(text);

  if (annotations.length === 0) {
    console.log('✅ 未发现批注');
    return { total: 0, processed: 0 };
  }

  console.log(`📋 发现 ${annotations.length} 条批注:`);
  for (const a of annotations) {
    console.log(`  - [${a.type}] 第${a.line}行: ${a.content.substring(0, 50)}...`);
  }

  console.log('\n🔧 执行修改...');
  const results = await executeAnnotations(annotations, filePath, project, projectRoot, config, dispatch);

  const report = {
    total: annotations.length,
    processed: results.filter(r => r.status === 'completed').length,
    failed: results.filter(r => r.status === 'failed').length,
    results,
  };

  console.log(`\n📊 处理完成: ${report.processed}/${report.total} 成功`);

  return report;
}

module.exports = { parseAnnotations, processAnnotations };
