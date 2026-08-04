import { create } from 'zustand'
import { bridge } from '../bridge'
import { DEMO_RESULT } from '../mock/sampleAnalysis'
import type { AnalysisResult } from '../types/analysis'

export type { AnalysisResult } from '../types/analysis'

export type AnalysisStatus = 'idle' | 'analyzing' | 'done' | 'error'

interface AnalysisState {
  filePath: string | null
  fileName: string | null
  status: AnalysisStatus
  result: AnalysisResult | null
  error: string | null
  /** 本次分析开始时间（ms 时间戳），用于分析中耗时展示 */
  startedAt: number | null
  /** 当前结果对应的历史记录 id（无则为 null，手动校正持久化用） */
  historyId: number | null
  analyze: (filePath: string, fileName: string) => Promise<void>
  /** 从历史记录直接加载结果（不重新分析） */
  loadResult: (fileName: string, filePath: string, result: AnalysisResult, historyId: number | null) => void
  /** 载入演示数据（不经过引擎，直接展示界面效果） */
  loadDemo: () => void
  /** 手动校正：覆盖某个和弦事件（保留 original_chord 供恢复） */
  applyChordOverride: (sectionIndex: number, chordIndex: number, symbol: string) => void
  /** 恢复单个和弦的原始分析值 */
  restoreChord: (sectionIndex: number, chordIndex: number) => void
  /** 恢复全部手动校正 */
  restoreAllChords: () => void
  reset: () => void
}

/** 校正变更后同步到历史记录（失败静默，不影响主流程） */
function persistCorrections(get: () => AnalysisState): void {
  const { historyId, result } = get()
  if (historyId === null || !result) return
  void bridge.history.updateJson(historyId, JSON.stringify(result)).catch(() => {})
}

/** 返回带校正/恢复后的新 result（不可变更新） */
function withChordEvent(
  result: AnalysisResult,
  sectionIndex: number,
  chordIndex: number,
  update: (event: AnalysisResult['analysis']['sections'][number]['chords'][number]) => AnalysisResult['analysis']['sections'][number]['chords'][number],
): AnalysisResult {
  return {
    ...result,
    analysis: {
      ...result.analysis,
      sections: result.analysis.sections.map((section, si) =>
        si !== sectionIndex
          ? section
          : { ...section, chords: section.chords.map((event, ci) => (ci !== chordIndex ? event : update(event))) },
      ),
    },
  }
}

/** 分析成功后写入 SQLite 历史（失败静默，不影响主流程）；返回记录 id（失败为 -1）。批量队列也复用 */
export async function persistHistory(fileName: string, filePath: string, result: AnalysisResult): Promise<number> {
  const { overall, sections } = result.analysis
  const chordCount = sections.reduce((count, section) => count + section.chords.length, 0)
  try {
    return await bridge.history.insert({
      fileName,
      filePath,
      keyText: overall.key ? `${overall.key} ${overall.mode ?? ''}`.trim() : null,
      bpm: overall.tempo_bpm,
      chordCount,
      sectionCount: sections.length,
      resultJson: JSON.stringify(result),
    })
  } catch {
    return -1
  }
}

/** 从主进程查询 sidecar 端口，拼接本地引擎地址（analyze 与 /api/audio 共用） */
export async function resolveEngineBaseUrl(): Promise<string> {
  const info = await bridge.sidecar.getInfo()
  if (info.status !== 'ready' || info.port === null) {
    throw new Error('分析引擎未就绪，请稍候（引擎状态见底部状态栏）')
  }
  return `http://127.0.0.1:${info.port}`
}

export const useAnalysisStore = create<AnalysisState>((set, get) => ({
  filePath: null,
  fileName: null,
  status: 'idle',
  result: null,
  error: null,
  startedAt: null,
  historyId: null,

  analyze: async (filePath, fileName) => {
    set({
      filePath,
      fileName,
      status: 'analyzing',
      result: null,
      error: null,
      startedAt: Date.now(),
    })
    try {
      const baseUrl = await resolveEngineBaseUrl()
      const response = await fetch(`${baseUrl}/api/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_path: filePath }),
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
      set({ status: 'done', result })
      // 写入历史并记录 id（后续手动校正要回写该记录）；写入期间用户切换结果则放弃
      void persistHistory(fileName, filePath, result).then((id) => {
        if (id > 0 && useAnalysisStore.getState().result === result) set({ historyId: id })
      })
    } catch (err) {
      set({
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
      })
    }
  },

  loadResult: (fileName, filePath, result, historyId) =>
    set({
      filePath,
      fileName,
      status: 'done',
      result,
      error: null,
      startedAt: null,
      historyId,
    }),

  applyChordOverride: (sectionIndex, chordIndex, symbol) => {
    const result = get().result
    if (!result) return
    set({
      result: withChordEvent(result, sectionIndex, chordIndex, (event) => ({
        ...event,
        original_chord: event.original_chord ?? event.chord,
        chord: symbol,
        display_chord: symbol,
        manual_override: true,
      })),
    })
    persistCorrections(get)
  },

  restoreChord: (sectionIndex, chordIndex) => {
    const result = get().result
    if (!result) return
    set({
      result: withChordEvent(result, sectionIndex, chordIndex, (event) =>
        event.original_chord
          ? {
              ...event,
              chord: event.original_chord,
              display_chord: event.original_chord,
              manual_override: undefined,
              original_chord: undefined,
            }
          : event,
      ),
    })
    persistCorrections(get)
  },

  restoreAllChords: () => {
    const result = get().result
    if (!result) return
    set({
      result: {
        ...result,
        analysis: {
          ...result.analysis,
          sections: result.analysis.sections.map((section) => ({
            ...section,
            chords: section.chords.map((event) =>
              event.original_chord
                ? {
                    ...event,
                    chord: event.original_chord,
                    display_chord: event.original_chord,
                    manual_override: undefined,
                    original_chord: undefined,
                  }
                : event,
            ),
          })),
        },
      },
    })
    persistCorrections(get)
  },

  loadDemo: () =>
    set({
      filePath: null,
      fileName: DEMO_RESULT.file.name,
      status: 'done',
      result: DEMO_RESULT,
      error: null,
      startedAt: null,
      historyId: null,
    }),

  reset: () =>
    set({
      filePath: null,
      fileName: null,
      status: 'idle',
      result: null,
      error: null,
      startedAt: null,
      historyId: null,
    }),
}))
