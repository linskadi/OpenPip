// 用户反馈解析引擎
class FeedbackParser {
  constructor() {
    // Agent 分配规则（7-agent 精简版：skeleton→planner, polisher→writer polish 子任务）
    this.agentRules = {
      format: 'formatter',
      content: 'writer',
      structure: 'planner',
      data: 'researcher',
      expression: 'writer',
      unknown: 'writer',
    };

    // 优先级规则
    this.priorityMap = {
      data: 'high',
      content: 'high',
      structure: 'medium',
      format: 'low',
      expression: 'low',
    };
  }

  // 解析用户反馈
  parseFeedback(feedbackText) {
    const feedbacks = [];
    const lines = feedbackText.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // 跳过空行
      if (!line) continue;

      // 检测定点批注格式 <!-- TODO: ... -->
      const todoMatch = line.match(/<!--\s*TODO(?::(\w+))?\s+(.+?)\s*-->/);
      if (todoMatch) {
        const type = todoMatch[1] || 'general';
        const content = todoMatch[2];
        feedbacks.push({
          line: i + 1,
          type: this.classifyFeedbackContent(content, type),
          rawType: type,
          content,
          source: 'annotation',
          originalLine: line,
        });
        continue;
      }

      // 检测 FIXME 格式
      const fixmeMatch = line.match(/<!--\s*FIXME\s+(.+?)\s*-->/);
      if (fixmeMatch) {
        feedbacks.push({
          line: i + 1,
          type: 'content',
          rawType: 'FIXME',
          content: fixmeMatch[1],
          source: 'annotation',
          originalLine: line,
        });
        continue;
      }

      // 全局评价（不带具体位置）
      const globalPatterns = [
        { regex: /^整体上?[,，]?\s*(.+)/, type: 'global' },
        { regex: /^(?:总体|全文|整篇)[,，]?\s*(.+)/, type: 'global' },
        { regex: /^论文\s*(.+)/, type: 'global' },
      ];

      let isGlobal = false;
      for (const { regex, type } of globalPatterns) {
        const match = line.match(regex);
        if (match) {
          feedbacks.push({
            line: 0,
            type: this.classifyFeedbackContent(match[1], 'global'),
            rawType: type,
            content: match[1],
            source: 'natural_language',
            originalLine: line,
          });
          isGlobal = true;
          break;
        }
      }
      if (isGlobal) continue;

      // 自然语言反馈（含位置提示）
      const locationPatterns = [
        { regex: /(?:第[一二三四五六七八九十\d]+章|第\d+章)\s*[，,：:]?\s*(.+)/, type: 'content' },
        { regex: /(?:第[一二三四五六七八九十\d]+节|第\d+节)\s*[，,：:]?\s*(.+)/, type: 'content' },
        { regex: /(?:摘要|引言|结论|致谢|附录)\s*[，,：:]?\s*(.+)/, type: 'content' },
        { regex: /(?:第\d+页|P\.?\s*\d+)\s*[，,：:]?\s*(.+)/, type: 'content' },
      ];

      let hasLocation = false;
      for (const { regex, type } of locationPatterns) {
        const match = line.match(regex);
        if (match) {
          feedbacks.push({
            line: 0,
            type: this.classifyFeedbackContent(match[1], type),
            rawType: 'location_based',
            content: match[1],
            location: match[0].replace(match[1], '').trim(),
            source: 'natural_language',
            originalLine: line,
          });
          hasLocation = true;
          break;
        }
      }
      if (hasLocation) continue;

      // 其他自然语言反馈
      if (line.length > 2) {
        feedbacks.push({
          line: 0,
          type: this.classifyFeedbackContent(line, 'general'),
          rawType: 'general',
          content: line,
          source: 'natural_language',
          originalLine: line,
        });
      }
    }

    return feedbacks;
  }

  classifyFeedbackContent(text, rawType) {
    if (rawType && rawType !== 'general' && rawType !== 'global' && rawType !== 'location_based') {
      if (['format', 'content', 'structure', 'data', 'expression'].includes(rawType)) {
        return rawType;
      }
    }

    const lower = text.toLowerCase();

    // 格式类
    if (/(?:格式|标点|字体|行距|页眉|页脚|页码|目录|参考文献格式|GB\/T|GB7714)/.test(lower)) {
      return 'format';
    }

    // 数据类
    if (/(?:数据|实验|统计|样本|结果|测量|指标|参数|准确率|召回率|F1)/.test(lower)) {
      return 'data';
    }

    // 结构类
    if (/(?:结构|逻辑|章节|框架|层次|组织|排列|衔接|过渡|呼应)/.test(lower)) {
      return 'structure';
    }

    // 表达类
    if (/(?:语言|润色|表达|措辞|文笔|学术|口语|AI味|生硬|通顺|流畅|精炼)/.test(lower)) {
      return 'expression';
    }

    // 内容类（默认）
    if (/(?:补充|增加|删除|修改|重写|内容|论证|论述|分析|讨论|解释|说明)/.test(lower)) {
      return 'content';
    }

    return 'content';
  }

  // 生成修改任务列表
  generateFixTasks(feedbacks) {
    const tasks = [];

    for (const fb of feedbacks) {
      const task = {
        id: `fix-${tasks.length + 1}`,
        type: fb.type,
        location: fb.location || null,
        content: fb.content,
        priority: fb.type === 'data' || fb.type === 'content' ? 'high' : 'medium',
        targetAgent: this.assignAgent({ type: fb.type }),
        source: fb.source,
        originalLine: fb.line,
        status: 'pending',
      };
      tasks.push(task);
    }

    // 按优先级排序：high > medium > low
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    tasks.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    return tasks;
  }

  // 根据任务类型分配 Agent
  assignAgent(task) {
    const type = task.type || 'unknown';
    return this.agentRules[type] || this.agentRules.unknown;
  }

  // 生成任务报告
  generateTaskReport(tasks) {
    const byAgent = {};
    for (const task of tasks) {
      if (!byAgent[task.targetAgent]) byAgent[task.targetAgent] = [];
      byAgent[task.targetAgent].push(task);
    }

    const byType = {};
    for (const task of tasks) {
      if (!byType[task.type]) byType[task.type] = 0;
      byType[task.type]++;
    }

    return {
      totalTasks: tasks.length,
      byAgent,
      byType,
      highPriority: tasks.filter(t => t.priority === 'high').length,
      summary: Object.entries(byType)
        .map(([type, count]) => `${type}: ${count}`)
        .join(', '),
    };
  }
}

module.exports = { FeedbackParser };
