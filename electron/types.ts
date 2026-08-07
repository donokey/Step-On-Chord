/** 主进程 / 渲染进程共享的 IPC 负载类型（纯类型声明，无运行时依赖） */

export type SidecarStatus = 'stopped' | 'starting' | 'ready' | 'error'

export interface SidecarInfo {
  status: SidecarStatus
  port: number | null
  restartCount: number
  lastError: string | null
}

/** 历史记录列表项（不含完整结果 JSON，列表查询用） */
export interface HistorySummary {
  id: number
  file_name: string
  file_path: string
  created_at: number
  key_text: string | null
  bpm: number | null
  chord_count: number
  section_count: number
}

/** 单条完整历史记录（含 analysis 结果 JSON） */
export interface HistoryRecord extends HistorySummary {
  result_json: string
}

/** 写入历史时的输入负载（渲染进程组装） */
export interface NewHistoryEntry {
  fileName: string
  filePath: string
  keyText: string | null
  bpm: number | null
  chordCount: number
  sectionCount: number
  resultJson: string
}

/** 保存文件对话框（导出和弦谱用） */
export interface SaveFileOptions {
  title: string
  /** 默认文件名（含扩展名） */
  defaultName: string
  filters: { name: string; extensions: string[] }[]
  /** 要写入的文本内容（UTF-8） */
  content: string
}

/** 设置页读取的应用设置快照 */
export interface AppSettings {
  refineQualities: boolean
  /** 模型目录绝对路径（打包后为用户目录下的 models） */
  modelsDir: string
}

/** 单个待检测的模型权重文件 */
export interface ModelWeightFile {
  id: string
  name: string
  /** 相对模型根目录的目标路径（展示/手动放置说明用） */
  target: string
  have: boolean
}

/** 模型完整性状态（首启下载页用） */
export interface ModelsStatus {
  isPackaged: boolean
  modelsDir: string
  missing: ModelWeightFile[]
  downloading: boolean
}

/** 模型下载进度事件（主进程 → 渲染进程推送） */
export interface ModelsProgress {
  /** downloading=正在下载某文件 / skip=已存在跳过 / done=全部完成 / error=出错中止 */
  phase: 'downloading' | 'skip' | 'done' | 'error'
  fileId?: string
  fileName?: string
  receivedBytes?: number
  totalBytes?: number
  error?: string
}

/** 歌曲项目列表项（索引表，不含完整内容） */
export interface ProjectSummary {
  id: number
  name: string
  folderPath: string
  updatedAt: number
}

/** 打开项目的结果（project 已由主进程校验） */
export interface ProjectOpenResult {
  folderPath: string
  project: object
  audioMissing: boolean
}
