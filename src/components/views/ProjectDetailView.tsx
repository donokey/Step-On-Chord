import { useCallback, useEffect, useState } from 'react'
import { bridge } from '../../bridge'
import { useProjectStore } from '../../stores/projectStore'
import { useAccompanimentStore } from '../../stores/accompanimentStore'
import { PanelTitle } from '../PanelTitle'
import { AccompanimentPlayer } from '../AccompanimentPlayer'
import { LyricsTab } from '../lyrics/LyricsTab'
import { FilesTab } from '../files/FilesTab'

type DetailTab = 'analysis' | 'lyrics' | 'files'

/** 项目详情（v0.2.0 工作台）：分析 / 歌词 / 附件 三个 tab。T2.4 先落地分析 tab。 */
export function ProjectDetailView() {
  const { current, closeProject, updateProject } = useProjectStore()
  const [tab, setTab] = useState<DetailTab>('analysis')
  const [busy, setBusy] = useState(false)
  const folderPath = current?.folderPath

  // 离开项目 / 切换项目时停止伴奏播放（播放条常驻本组件顶部，tab 切换不影响）
  useEffect(() => {
    return () => {
      useAccompanimentStore.getState().stop()
    }
  }, [folderPath])

  const relocateAudio = useCallback(async () => {
    if (!current || busy) return
    setBusy(true)
    try {
      await bridge.projects.locateAudio(current.folderPath)
      await useProjectStore.getState().openProject(current.folderPath)
    } finally {
      setBusy(false)
    }
  }, [current, busy])

  const copyAudioIn = useCallback(async () => {
    if (!current || busy || !current.project.audio) return
    setBusy(true)
    try {
      await updateProject((project) => project) // no-op to keep lint happy
      const next = await bridge.projects.copyAudio(current.folderPath, current.project.audio.path)
      await useProjectStore.getState().openProject(current.folderPath)
      void next
    } finally {
      setBusy(false)
    }
  }, [current, busy, updateProject])

  if (!current) return null
  const { project, audioMissing } = current
  const analysis = project.analysis

  return (
    <div className="bg-atmosphere relative flex min-h-full flex-col gap-2 p-3">
      <section className="panel-pixel pixel-corners panel-tint-cool flex min-h-0 flex-1 flex-col px-3 py-2">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <PanelTitle symbol="▣">项目 · {project.name}</PanelTitle>
            <p className="truncate font-vt text-xs text-ink-faint">{current.folderPath}</p>
          </div>
          <button type="button" onClick={closeProject} className="btn-pixel px-2 py-1 text-xs">
            ← 返回列表
          </button>
        </div>

        {/* 伴奏播放器：常驻顶部，切 tab 不中断 */}
        <div className="mb-2">
          <AccompanimentPlayer />
        </div>

        {/* tab 栏 */}
        <div className="mb-2 flex gap-1 border-b border-edge pb-1">
          {(
            [
              ['analysis', '分析'],
              ['lyrics', '歌词'],
              ['files', '附件'],
            ] as [DetailTab, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`px-3 py-1 font-vt text-sm ${tab === key ? 'border border-edge-glow bg-base-deep text-warm' : 'text-ink-dim hover:text-ink'}`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'analysis' && (
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
            {/* 音频信息 */}
            <div className="border border-edge bg-base-deep px-3 py-2">
              <p className="font-vt text-xs text-ink-faint">音频</p>
              {project.audio ? (
                <>
                  <p className="truncate font-vt text-sm text-ink">
                    {project.audio.file_name}（{project.audio.mode === 'copy' ? '已收集进项目' : '外部引用'}）
                  </p>
                  {audioMissing && <p className="font-vt text-xs text-error">⚠ 文件缺失</p>}
                  <div className="mt-1 flex gap-2">
                    <button type="button" onClick={() => void relocateAudio()} disabled={busy} className="btn-pixel px-2 py-0.5 text-xs">
                      重新定位
                    </button>
                    {project.audio.mode === 'reference' && (
                      <button type="button" onClick={() => void copyAudioIn()} disabled={busy} className="btn-pixel px-2 py-0.5 text-xs">
                        收集进项目
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <p className="font-vt text-sm text-ink-dim">未关联音频</p>
              )}
            </div>

            {/* 分析结果 */}
            {analysis ? (
              <>
                <div className="grid grid-cols-4 gap-2">
                  {(
                    [
                      ['调性', analysis.analysis.overall.key ?? '—'],
                      ['调式', analysis.analysis.overall.mode ?? '—'],
                      ['BPM', analysis.analysis.overall.tempo_bpm ?? '—'],
                      ['置信度', analysis.analysis.overall.confidence ?? '—'],
                    ] as [string, string | number][]
                  ).map(([label, value]) => (
                    <div key={label} className="border border-edge bg-base-deep px-2 py-1.5 text-center">
                      <p className="font-vt text-[10px] text-ink-faint">{label}</p>
                      <p className="font-vt text-lg text-warm">{value}</p>
                    </div>
                  ))}
                </div>

                {analysis.analysis.sections.length > 0 && (
                  <div className="border border-edge bg-base-deep px-3 py-2">
                    <p className="mb-1 font-vt text-xs text-ink-faint">曲式</p>
                    <div className="flex flex-wrap gap-1">
                      {analysis.analysis.sections.map((section, index) => (
                        <span key={index} className="border border-edge bg-base px-2 py-0.5 font-vt text-xs text-ink">
                          {section.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {analysis.analysis.sections.some((section) => section.chords.length > 0) && (
                  <div className="border border-edge bg-base-deep px-3 py-2">
                    <p className="mb-1 font-vt text-xs text-ink-faint">和弦（前 40 个）</p>
                    <div className="flex flex-wrap gap-1">
                      {analysis.analysis.sections
                        .flatMap((section) => section.chords)
                        .slice(0, 40)
                        .map((chord, index) => (
                          <span key={index} className="border border-edge bg-base px-1.5 py-0.5 font-vt text-xs text-ink">
                            {chord.display_chord ?? chord.chord}
                          </span>
                        ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="flex flex-col items-center gap-2 py-10">
                <p className="font-vt text-lg text-ink-dim">还没有分析结果</p>
                <p className="font-vt text-sm text-ink-faint">到「分析」页拖入歌曲，完成后点「存为项目」</p>
              </div>
            )}
          </div>
        )}

        {tab === 'lyrics' && <LyricsTab />}

        {tab === 'files' && <FilesTab />}
      </section>
    </div>
  )
}
