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
