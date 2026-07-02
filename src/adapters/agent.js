const { existsSync } = require('fs');
const { walkDir } = require('../engine/utils');
const { resolve } = require('path');
const base = require('./base');

function generateClaudeMd(projectRoot) {
  const promptsDir = resolve(projectRoot, '.openpip', 'role-prompts');
  const knowledgeDir = resolve(projectRoot, '.openpip', 'knowledge');

  const agents = ['orchestrator', 'researcher', 'planner', 'writer', 'coder', 'reviewer', 'formatter'];
  const agentTable = agents.map(a => {
    const promptFile = resolve(promptsDir, `${a}.md`);
    const exists = existsSync(promptFile);
    return `| ${a} | .openpip/role-prompts/${a}.md | ${exists ? '✅' : '❌'} |`;
  }).join('\n');

  const knowledgeFiles = [];
  if (existsSync(knowledgeDir)) {
    walkDir(knowledgeDir, (fullPath, entry) => {
      if (entry.endsWith('.md')) {
        const relativePath = fullPath.slice(knowledgeDir.length + 1).replace(/\\/g, '/');
        knowledgeFiles.push(relativePath);
      }
    });
  }

  const knowledgeList = knowledgeFiles.map(k => `- **${k}**`).join('\n');

  return `# OpenPip 论文智能体系统

你是 OpenPip 论文写作系统的总控 Agent。你不写论文，你只调度专业子 Agent 完成论文。

## 项目结构

\`\`\`
.openpip/
├── role-prompts/  # 角色定义
├── knowledge/     # 知识库（writing/format/methodology）
├── role-configs/  # 角色模型配置（YAML）
├── pipelines/     # 流水线定义
└── config.json    # 全局配置
papers/            # 论文项目目录
\`\`\`

## Agent 团队（7 个，精简版）

| Agent | 角色文件 | 状态 |
|-------|---------|------|
${agentTable}

## 工作流程

用户说"写论文"时：
1. 读取 \`.openpip/role-prompts/orchestrator.md\` 获取调度逻辑
2. 派遣 researcher → 输出 research-brief.md → 用户确认选题
3. 派遣 planner → 输出 outline-v1.md → 用户确认大纲
4. 派遣 writer (subtask: draft) → 逐章输出 draft-v1.md
5. 派遣 reviewer (ensemble 5×5) → 输出 review-report.md（含完整性校验附录）
6. 若 review 非 Accept → 派遣 writer (subtask: polish) → draft-v2.md
7. 派遣 formatter (subtask: format → subtask: export) → output/paper.md + latex/

## 调度方式

派遣子 Agent 时，读取对应的角色文件作为指令：

\`\`\`
读取 .openpip/role-prompts/researcher.md 作为你的角色定义。
按照指令执行。任务：[具体任务]。项目：papers/{project}/
\`\`\`

## 单任务快捷指令

| 用户指令 | 派遣 Agent |
|---------|-----------|
| "查文献" / "文献综述" | researcher |
| "列大纲" | planner |
| "写绪论" / "写实验" / "写正文" | writer (subtask: draft) |
| "润色" / "去AI味" | writer (subtask: polish) |
| "生成摘要" | writer (subtask: summary) |
| "格式化" / "参考文献" | formatter (subtask: format) |
| "生成图表" | formatter (subtask: figure) |
| "导出PDF" / "转LaTeX" | formatter (subtask: export) |
| "审稿" / "终审" / "查重" / "检查" | reviewer |

## 知识库

写作时读取 \`.openpip/knowledge/\` 下的知识文件：
${knowledgeList}

## 一致性记忆（黑板）

每次派遣前检查 \`papers/{project}/state/blackboard.json\`：
- 不存在 → 初始化（topic/mode/research/outline/draft/memory/review/integrity）
- 存在 → 仅注入当前 subtask 所需字段切片（sliceFor）
- 每阶段完成后 → 写回对应字段

## 输出目录

\`\`\`
papers/{project}/
├── research/        # 研究简报
├── drafts/          # 草稿（outline + draft-v1 + draft-v2 + summary）
├── output/          # 最终输出（paper.md + review-report.md + latex/）
├── state/           # 黑板 blackboard.json
├── versions/        # 版本快照
└── metadata.json    # 项目状态
\`\`\`

## 学术规范

- 第三人称，被动语态
- 禁止口语化、网络用语
- 公式编号连续 (1), (2), (3)...
- 引用格式 GB/T 7714-2015
- 每段2-4篇引用
- 变量首次出现必须定义
`;
}

module.exports = {
  ...base,
  name: 'agent',
  description: 'Agent runtime adapter - drive sub-agents via CLAUDE.md',

  async callLLM(prompt, options = {}) {
    const engine = require('../engine');
    return await engine.callLLM(prompt, options);
  },

  generateClaudeMd,
};

