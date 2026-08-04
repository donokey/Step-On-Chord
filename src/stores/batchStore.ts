import { create } from 'zustand'
import { bridge } from '../bridge'
import type { AnalysisResult } from '../types/analysis'
import { buildChordSheet, chordSheetBaseName } from '../utils/exportSheet'
import { persistHistory, resolveEngineBaseUrl } from './analysisStore'

export type BatchItemStatus = 'pending' | 'analyzing' | 'done' | 'error'

export interface BatchItem {
  path: string
  name: string
  status: BatchItemStatus
  error: string | null
  result: AnalysisResult | null
  elapsedSeconds: number | null
}

interface BatchState {
  items: BatchItem[]
  running: boolean
  /** 选择文件夹后串行分析全部音频（CPU 推理不并发） */
  startBatch: (paths: string[]) => Promise<void>
  /** 请求取消：当前这首分析完后停止调度后续文件 */
  cancelBatch: () => void
  clearBatch: () => void
  /** 全部完成的条目批量导出和弦谱；返回输出目录（取消/无成果为 null） */
  exportAll: (format: 'md' | 'txt') => Promise<{ directory: string; count: number } | null>
}

let cancelRequested = false

export const useBatchStore = create<BatchState>((set, get) => ({
  items: [],
  running: false,

  startBatch: async (paths) => {
    if (get().running || paths.length === 0) return
    cancelRequested = false
    set({
      items: paths.map((path) => ({
        path,
        name: path.split(/[\\/]/).pop() ?? path,
        status: 'pending' as const,
        error: null,
        result: null,
        elapsedSeconds: null,
      })),
      running: true,
    })

    let baseUrl: string
    try {
      baseUrl = await resolveEngineBaseUrl()
    } catch {
      set({ running: false })
      return
    }

    for (let index = 0; index < paths.length; index++) {
      if (cancelRequested) break
      const item = get().items[index]
      if (!item || item.status !== 'pending') continue
      patchItem(set, index, { status: 'analyzing' })
      const startedAt = Date.now()
      try {
        const response = await fetch(`${baseUrl}/api/analyze`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ file_path: item.path }),
        })
        if (!response.ok) {
          let detail = `分析请求失败（HTTP ${response.status}）`
          try {
            const payload = (await response.json()) as { detail?: unknown }
            if (payload.detail) detail = String(payload.detail)
          } catch {
            // 保留默认错误信息
          }
          throw new Error(detail)
        }
        const result = (await response.json()) as AnalysisResult
        patchItem(set, index, {
          status: 'done',
          result,
          elapsedSeconds: (Date.now() - startedAt) / 1000,
        })
        // 批量结果同样归档历史（不跟踪 historyId，校正持久化只走主分析视图）
        void persistHistory(item.name, item.path, result)
      } catch (err) {
        patchItem(set, index, {
          status: 'error',
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }
    set({ running: false })
  },

  cancelBatch: () => {
    cancelRequested = true
  },

  clearBatch: () => {
    if (!get().running) set({ items: [] })
  },

  exportAll: async (format) => {
    const done = get().items.filter((item) => item.status === 'done' && item.result !== null)
    if (done.length === 0) return null
    const directory = await bridge.dialog.openFolder()
    if (!directory) return null
    const files = done.map((item) => ({
      name: `${chordSheetBaseName(item.result as AnalysisResult)}.${format}`,
      content: buildChordSheet(item.result as AnalysisResult, format),
    }))
    const written = await bridge.files.writeTexts({ directory, files })
    return written.length > 0 ? { directory, count: written.length } : null
  },
}))

function patchItem(
  set: (fn: (state: BatchState) => Partial<BatchState>) => void,
  index: number,
  patch: Partial<BatchItem>,
): void {
  set((state) => ({
    items: state.items.map((item, i) => (i === index ? { ...item, ...patch } : item)),
  }))
}
