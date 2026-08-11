import { useCallback, useEffect, useRef, useState } from 'react'
import {
  LYRICS_SECTION_TYPES,
  newId,
  removeLyricsSection,
  reorderLyricsSections,
  upsertLyricsSection,
  type LyricsSectionType,
} from '../../shared/project-model'
import { useProjectStore } from '../../stores/projectStore'

/** 节类型中文名（展示与下拉选项） */
const TYPE_LABELS: Record<LyricsSectionType, string> = {
  verse: '主歌',
  chorus: '副歌',
  bridge: '桥段',
  intro: '前奏',
  outro: '尾奏',
  free: '自由',
}

/** 文本输入防抖保存间隔 */
const SAVE_DEBOUNCE_MS = 500

interface Draft {
  type: LyricsSectionType
  title: string
  text: string
}

/**
 * 歌词编辑器（workbench 阶段 3）：独立分节文本编辑，不与和弦/伴奏联动。
 * - 节增/删/排序即时保存；标题/类型/正文输入防抖自动保存
 * - 数据存于 project.soc.json 的 lyrics.sections[]，重启不丢
 */
export function LyricsTab() {
  const { current, updateProject } = useProjectStore()
  const sections = current?.project.lyrics.sections ?? []
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const timerRef = useRef<number | null>(null)
  const savedTimerRef = useRef<number | null>(null)

  const selected = sections.find((item) => item.id === selectedId) ?? null

  // 切换选中节时从项目数据同步草稿（仅依赖 selectedId，避免保存回写时吞掉输入）
  useEffect(() => {
    setDraft(selected ? { type: selected.type, title: selected.title, text: selected.text } : null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId])

  // 卸载时清掉未触发的防抖定时器
  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
      if (savedTimerRef.current !== null) window.clearTimeout(savedTimerRef.current)
    },
    [],
  )

  const flushSave = useCallback(
    (next: Draft, sectionId: string) => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
      setSaving(true)
      timerRef.current = window.setTimeout(() => {
        void updateProject((project) => upsertLyricsSection(project, { id: sectionId, ...next }))
          .catch(() => {})
          .finally(() => {
            setSaving(false)
            // 保存完成的短暂反馈（1.5s 后恢复「自动保存」）
            setSavedFlash(true)
            if (savedTimerRef.current !== null) window.clearTimeout(savedTimerRef.current)
            savedTimerRef.current = window.setTimeout(() => setSavedFlash(false), 1500)
          })
      }, SAVE_DEBOUNCE_MS)
    },
    [updateProject],
  )

  const patchDraft = useCallback(
    (patch: Partial<Draft>) => {
      if (!selectedId || !draft) return
      const next = { ...draft, ...patch }
      setDraft(next)
      flushSave(next, selectedId)
    },
    [selectedId, draft, flushSave],
  )

  const addSection = useCallback(() => {
    const id = newId('lyr')
    void updateProject((project) => upsertLyricsSection(project, { id, type: 'verse', title: '', text: '' })).catch(() => {})
    setSelectedId(id)
  }, [updateProject])

  const removeSection = useCallback(
    (id: string) => {
      setConfirmDeleteId(null)
      const index = sections.findIndex((item) => item.id === id)
      void updateProject((project) => removeLyricsSection(project, id)).catch(() => {})
      if (selectedId === id) {
        const next = sections[index + 1] ?? sections[index - 1]
        setSelectedId(next?.id ?? null)
      }
    },
    [sections, selectedId, updateProject],
  )

  const moveSection = useCallback(
    (id: string, dir: -1 | 1) => {
      const index = sections.findIndex((item) => item.id === id)
      const target = index + dir
      if (index < 0 || target < 0 || target >= sections.length) return
      const ordered = sections.map((item) => item.id)
      ;[ordered[index], ordered[target]] = [ordered[target], ordered[index]]
      void updateProject((project) => reorderLyricsSections(project, ordered)).catch(() => {})
    },
    [sections, updateProject],
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {/* 工具条 */}
      <div className="flex items-center justify-between gap-2">
        <p className="font-vt text-xs text-ink-faint">
          {saving ? (
            <span className="text-warm">保存中…</span>
          ) : savedFlash ? (
            <span className="text-success">已保存 ✓</span>
          ) : (
            '自动保存'
          )}
        </p>
        <button type="button" onClick={addSection} className="btn-pixel px-2 py-1 text-xs">
          + 新增段落
        </button>
      </div>

      {sections.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-10">
          <p className="font-vt text-lg text-ink-dim">还没有歌词</p>
          <p className="font-vt text-sm text-ink-faint">点右上角「+ 新增段落」，按主歌 / 副歌分段填写</p>
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(10rem,14rem)_1fr] gap-2">
          {/* 段落列表 */}
          <div className="min-h-0 space-y-1 overflow-y-auto pr-1">
            {sections.map((section, index) => (
              <div
                key={section.id}
                className={`group border px-2 py-1.5 ${
                  selectedId === section.id ? 'border-edge-glow bg-base-deep' : 'border-edge bg-base'
                }`}
              >
                <button
                  type="button"
                  className="block w-full text-left"
                  onClick={() => {
                    setSelectedId(section.id)
                    setConfirmDeleteId(null)
                  }}
                >
                  <span className="font-vt text-[10px] text-warm">{TYPE_LABELS[section.type]}</span>
                  <span className="ml-1 block truncate font-vt text-sm text-ink">
                    {section.title || `段落 ${index + 1}`}
                  </span>
                </button>
                <div className="mt-1 flex gap-1 opacity-60 group-hover:opacity-100">
                  {confirmDeleteId === section.id ? (
                    <>
                      <span className="px-1 py-0 font-vt text-[10px] text-error">删除此段？</span>
                      <button
                        type="button"
                        onClick={() => removeSection(section.id)}
                        className="btn-pixel px-1 py-0 text-[10px] text-error"
                      >
                        确认
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        className="btn-pixel px-1 py-0 text-[10px]"
                      >
                        取消
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => moveSection(section.id, -1)}
                        disabled={index === 0}
                        className="btn-pixel px-1 py-0 text-[10px] disabled:opacity-30"
                        title="上移"
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        onClick={() => moveSection(section.id, 1)}
                        disabled={index === sections.length - 1}
                        className="btn-pixel px-1 py-0 text-[10px] disabled:opacity-30"
                        title="下移"
                      >
                        ▼
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(section.id)}
                        className="btn-pixel px-1 py-0 text-[10px] text-error"
                        title="删除"
                      >
                        ✕
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* 编辑区 */}
          {draft && selected ? (
            <div className="min-h-0 overflow-y-auto pr-1">
              <div className="space-y-2">
                <div className="flex gap-2">
                  <select
                    value={draft.type}
                    onChange={(event) => patchDraft({ type: event.target.value as LyricsSectionType })}
                    className="border border-edge bg-base-deep px-2 py-1 font-vt text-sm text-ink"
                  >
                    {LYRICS_SECTION_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {TYPE_LABELS[type]}
                      </option>
                    ))}
                  </select>
                  <input
                    value={draft.title}
                    onChange={(event) => patchDraft({ title: event.target.value })}
                    placeholder="段落标题（如：主歌 1）"
                    className="min-w-0 flex-1 border border-edge bg-base-deep px-2 py-1 font-vt text-sm text-ink placeholder:text-ink-faint"
                  />
                </div>
                <textarea
                  value={draft.text}
                  onChange={(event) => patchDraft({ text: event.target.value })}
                  placeholder="在这里填写歌词，每行一句…"
                  rows={16}
                  className="w-full resize-y border border-edge bg-base-deep px-3 py-2 font-vt text-sm leading-relaxed text-ink placeholder:text-ink-faint focus:border-edge-glow focus:outline-none"
                />
              </div>
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-center">
              <p className="font-vt text-sm text-ink-faint">选择左侧段落进行编辑</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
