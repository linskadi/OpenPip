const { resolveApiKey, resolveBaseURL, resolveModelId, resolveProvider } = require('../../engine/llm/provider-config');
const { DEFAULT_MODEL } = require('../../engine/constants');

const CHAT_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'init_project',
      description: '创建一个新的论文项目。用户需要提供项目名称，选择论文类别和领域。',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: '项目名称（英文，用连字符分隔，如 my-paper）',
          },
          category: {
            type: 'string',
            enum: ['research', 'competition'],
            description: '论文大类: research=科研论文, competition=竞赛论文',
          },
          domain: {
            type: 'string',
            description: '领域（如 cs/math/math-modeling/data-science/general），默认 general',
          },
          topic: {
            type: 'string',
            description: '论文题目或赛题描述',
          },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ingest_materials',
      description: '导入参考资料到当前项目。支持 PDF、CSV、Excel、Markdown、Python 等文件类型。',
      parameters: {
        type: 'object',
        properties: {
          project: {
            type: 'string',
            description: '项目名称',
          },
          files: {
            type: 'array',
            items: { type: 'string' },
            description: '要导入的文件路径列表',
          },
        },
        required: ['project', 'files'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_pipeline',
      description: '执行论文写作流水线。自动完成文献调研、大纲设计、正文撰写、审稿修改等全流程。系统会根据项目类别自动选择合适的管线，也可以手动指定。',
      parameters: {
        type: 'object',
        properties: {
          project: {
            type: 'string',
            description: '项目名称',
          },
          topic: {
            type: 'string',
            description: '论文主题（如未在创建项目时指定）',
          },
          quality: {
            type: 'string',
            enum: ['quick', 'standard', 'deep'],
            description: '质量档位: quick=快速, standard=标准, deep=深度(5x5评审)',
          },
          pipeline: {
            type: 'string',
            description: '管线名称（如 lightweight/full-research/competition-math-modeling），不指定则自动选择',
          },
        },
        required: ['project'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'query_status',
      description: '查询项目状态、进度、已生成的文件列表。不传项目名则列出所有项目。',
      parameters: {
        type: 'object',
        properties: {
          project: {
            type: 'string',
            description: '项目名称（可选，不传则列出所有项目）',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'export_paper',
      description: '导出论文为指定格式（Markdown、Word、LaTeX）。',
      parameters: {
        type: 'object',
        properties: {
          project: {
            type: 'string',
            description: '项目名称',
          },
          format: {
            type: 'string',
            enum: ['markdown', 'docx', 'latex'],
            description: '导出格式',
          },
        },
        required: ['project', 'format'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'import_references',
      description: '导入 BibTeX 参考文献文件到项目。导入后 Writer 只能引用库中文献，防止编造引用。',
      parameters: {
        type: 'object',
        properties: {
          project: {
            type: 'string',
            description: '项目名称',
          },
          file: {
            type: 'string',
            description: 'BibTeX 文件路径（.bib）',
          },
        },
        required: ['project', 'file'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_references',
      description: '列出项目中已导入的参考文献库。',
      parameters: {
        type: 'object',
        properties: {
          project: {
            type: 'string',
            description: '项目名称',
          },
        },
        required: ['project'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_pipelines',
      description: '列出可用的论文写作管线模板。可按类别筛选。',
      parameters: {
        type: 'object',
        properties: {
          category: {
            type: 'string',
            enum: ['research', 'competition'],
            description: '筛选类别（可选，不传则列出全部）',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'toggle_feature',
      description: '开关 LLM 优化功能。控制 LLM 是否参与管线生成、阶段流转决策、执行历史分析。',
      parameters: {
        type: 'object',
        properties: {
          feature: {
            type: 'string',
            enum: ['llm_pipeline_generation', 'llm_stage_flow', 'llm_history_analysis'],
            description: '功能名称: llm_pipeline_generation(LLM生成管线), llm_stage_flow(LLM决定流转), llm_history_analysis(LLM分析历史)',
          },
          enabled: {
            type: 'boolean',
            description: 'true=开启, false=关闭',
          },
          project: {
            type: 'string',
            description: '项目名称（可选，不传则全局设置）',
          },
        },
        required: ['feature', 'enabled'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'review_code',
      description: '审查代码文件或代码片段，生成代码质量/安全/性能报告。支持审查项目代码或用户上传的代码。',
      parameters: {
        type: 'object',
        properties: {
          project: {
            type: 'string',
            description: '项目名称（审查项目代码时使用）',
          },
          files: {
            type: 'array',
            items: { type: 'string' },
            description: '要审查的代码文件路径列表',
          },
          focus: {
            type: 'string',
            enum: ['quality', 'security', 'performance', 'all'],
            description: '审查重点，默认 all',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_pipeline',
      description: '根据用户描述创建新的论文写作管线配置。系统会自动生成 YAML 配置文件。',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: '管线名称（英文小写+连字符，如 my-custom-pipeline）',
          },
          description: {
            type: 'string',
            description: '管线描述（中文）',
          },
          category: {
            type: 'string',
            enum: ['research', 'competition', 'custom'],
            description: '管线类别',
          },
          domain: {
            type: 'string',
            description: '适用领域（如 general/cs/math-modeling）',
          },
          stages: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string', description: '阶段 ID（英文小写+连字符）' },
                agent: { type: 'string', description: '执行角色（researcher/planner/writer/reviewer/formatter/coder）' },
                task: { type: 'string', description: '任务描述文本' },
                output: { type: 'string', description: '输出文件路径' },
              },
            },
            description: '管线阶段列表',
          },
        },
        required: ['name', 'stages'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'modify_pipeline',
      description: '修改现有管线配置。支持添加、删除、重排阶段。',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: '要修改的管线名称',
          },
          action: {
            type: 'string',
            enum: ['add_stage', 'remove_stage', 'reorder_stages', 'update_stage'],
            description: '操作类型',
          },
          stage: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              agent: { type: 'string' },
              task: { type: 'string' },
              output: { type: 'string' },
              after: { type: 'string', description: '插入到哪个阶段之后（add_stage 时使用）' },
            },
            description: '阶段配置',
          },
          stageOrder: {
            type: 'array',
            items: { type: 'string' },
            description: '新的阶段顺序（reorder_stages 时使用）',
          },
        },
        required: ['name', 'action'],
      },
    },
  },
];

function resolveModel(config, modelOverride) {
  if (modelOverride) return modelOverride;
  return config?.models?.writer || config?.models?.orchestrator || DEFAULT_MODEL;
}

module.exports = { CHAT_TOOLS, resolveModel, resolveApiKey, resolveBaseURL, resolveModelId, resolveProvider };
