import { useState } from 'react'
import { PanelTitle } from '../PanelTitle'
import {
  DEMO_ATTACHMENTS,
  DEMO_LYRICS,
  LYRIC_TYPE_LABELS,
  type DemoLyricSection,
  type DemoProject,
} from './ProjectsView'

/**
 * UI 骨架（demo）：项目详情页，三个 tab（分析 / 歌词 / 文件）。
 * 歌词编辑仅在组件内 state 中生效（刷新即丢），正式版接 project.soc.json 原子保存。
 */

type DetailTab = 'analysis' | 'lyrics' | 'files'

const TABS: { key: DetailTab; label: string }[] = [
  { key: 'analysis', label: '分析' },
  { key: 'lyrics', label: '歌词' },
  { key: 'files', label: '文件' },
]

export function ProjectDetailView({ project, onBack }: { project: DemoProject; onBack: () => void }) {
  const [tab, setTab] = useState<DetailTab>('analysis')
  const [sections, setSections] = useState<DemoLyricSection[]>(DEMO_LYRICS)

  return (
    <div className="bg-atmosphere relative flex min-h-full flex-col gap-2 p-3">
      {/* 页头：返回 + 项目名 + 保存状态 */}
      <section className="panel-pixel pixel-corners panel-tint-warm flex items-center gap-3 px-3 py-2">
        <button type="button" onClick={onBack} className="btn-pixel h-7 shrink-0 px-2 text-xs">
          ← 项目列表
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate font-vt text-xl leading-tight text-ink">{project.name}</p>
          <p className="truncate font-vt text-xs text-ink-faint">更新于 {project.updatedAt}</p>
        </div>
        <span className="shrink-0 font-vt text-xs text-ink-faint" title="demo：正式版为防抖自动保存状态指示">
          ● 自动保存（demo 未接）
        </span>
      </section>

      {/* tab 切换 */}
      <div className="flex gap-1">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`btn-pixel h-8 px-4 text-sm ${tab === key ? '' : 'opacity-50'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* tab 内容 */}
      <section className="panel-pixel pixel-corners panel-tint-cool flex min-h-0 flex-1 flex-col px-3 py-2">
        {tab === 'analysis' && <AnalysisTab project={project} />}
        {tab === 'lyrics' && <LyricsTab sections={sections} setSections={setSections} />}
        {tab === 'files' && <FilesTab project={project} />}
      </section>
    </div>
  )
}

/** 分析 tab：摘要 + 时间线占位 */
function AnalysisTab({ project }: { project: DemoProject }) {
  if (!project.hasAnalysis) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 py-12">
        <p className="font-vt text-lg text-ink-dim">这首歌还没有分析结果</p>
        <p className="font-vt text-sm text-ink-faint">demo：正式版到「分析」页分析后可"存为项目"，或从历史转存</p>
      </div>
    )
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <PanelTitle symbol="∿">Analysis</PanelTitle>
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: '调性', value: project.keyText ?? '—' },
          { label: 'BPM', value: project.bpm != null ? String(project.bpm) : '—' },
          { label: '和弦', value: String(project.chordCount) },
          { label: '段落', value: String(project.sectionCount) },
        ].map(({ label, value }) => (
          <div key={label} className="border border-edge bg-base-deep px-2 py-1.5 text-center">
            <p className="font-vt text-lg leading-tight text-warm">{value}</p>
            <p className="font-vt text-xs text-ink-faint">{label}</p>
          </div>
        ))}
      </div>
      <div className="flex min-h-24 flex-1 items-end gap-0.5 border border-edge bg-base-deep p-2">
        {Array.from({ length: 32 }).map((_, i) => (
          <div
            key={i}
            className="flex-1 bg-cool-dim/70"
            style={{ height: `${20 + ((i * 37) % 60)}%` }}
            title="demo：正式版为和弦时间线（复用分析页组件）"
          />
        ))}
      </div>
      <p className="font-vt text-xs text-ink-faint">demo 占位 · 正式版载入 project.soc.json 中的完整分析结果（含手动校正）</p>
    </div>
  )
}

/** 歌词 tab：分节编辑器（组件内 state，可编辑体验手感） */
function LyricsTab({
  sections,
  setSections,
}: {
  sections: DemoLyricSection[]
  setSections: (next: DemoLyricSection[]) => void
}) {
  const updateText = (id: string, text: string) => {
    setSections(sections.map((s) => (s.id === id ? { ...s, text } : s)))
  }
  const removeSection = (id: string) => {
    setSections(sections.filter((s) => s.id !== id))
  }
  const addSection = () => {
    setSections([
      ...sections,
      { id: `s${Date.now()}`, type: 'free', title: `新段落 ${sections.length + 1}`, text: '' },
    ])
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <PanelTitle symbol="✎">Lyrics</PanelTitle>
        <button type="button" onClick={addSection} className="btn-pixel h-7 shrink-0 px-3 text-xs">
          + 加一节
        </button>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        {sections.map((section) => (
          <div key={section.id} className="border border-edge bg-base-deep px-3 py-2">
            <div className="mb-1.5 flex items-center gap-2">
              <select
                value={section.type}
                onChange={(event) => {
                  const type = event.target.value as DemoLyricSection['type']
                  setSections(sections.map((s) => (s.id === section.id ? { ...s, type } : s)))
                }}
                className="btn-pixel h-6 px-1 text-xs"
                title="节类型"
              >
                {Object.entries(LYRIC_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <input
                value={section.title}
                onChange={(event) => {
                  const title = event.target.value
                  setSections(sections.map((s) => (s.id === section.id ? { ...s, title } : s)))
                }}
                className="min-w-0 flex-1 border border-edge bg-base px-2 py-0.5 font-vt text-sm text-ink outline-none focus:border-edge-glow"
                placeholder="节标题"
              />
              <button
                type="button"
                title="删除这一节"
                onClick={() => removeSection(section.id)}
                className="btn-pixel h-6 w-6 shrink-0 justify-center px-0 text-xs"
              >
                ✕
              </button>
            </div>
            <textarea
              value={section.text}
              onChange={(event) => updateText(section.id, event.target.value)}
              rows={4}
              placeholder="在这里写歌词…（demo：与和弦/伴奏不联动，独立成篇）"
              className="w-full resize-y border border-edge bg-base px-2 py-1 font-vt text-base leading-relaxed text-ink outline-none focus:border-edge-glow"
            />
          </div>
        ))}
        {sections.length === 0 && (
          <p className="py-8 text-center font-vt text-sm text-ink-faint">还没有歌词段落，点"+ 加一节"开始</p>
        )}
      </div>
      <p className="font-vt text-xs text-ink-faint">demo：编辑只存在内存里 · 正式版防抖自动保存到 project.soc.json</p>
    </div>
  )
}

/** 文件 tab：附件清单（伴奏/编曲/demo 收纳） */
function FilesTab({ project }: { project: DemoProject }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <PanelTitle symbol="▤">Files</PanelTitle>
        <button
          type="button"
          className="btn-pixel h-7 shrink-0 px-3 text-xs"
          title="demo：正式版支持文件对话框 + 拖拽，复制进 attachments/"
        >
          + 添加附件
        </button>
      </div>
      {project.id === 'p1' ? (
        <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
          {DEMO_ATTACHMENTS.map((file) => (
            <li
              key={file.id}
              className="flex items-center gap-3 border border-edge bg-base-deep px-3 py-2"
            >
              <span className="btn-pixel h-6 shrink-0 cursor-default px-2 text-xs">{file.kind}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-vt text-base leading-tight text-ink">{file.name}</p>
                <p className="font-vt text-xs text-ink-faint">
                  {file.size} · 添加于 {file.addedAt}
                </p>
              </div>
              <button type="button" className="btn-pixel h-6 shrink-0 px-2 text-xs" title="demo：音频附件可播放">
                ▶
              </button>
              <button type="button" className="btn-pixel h-6 shrink-0 px-2 text-xs" title="demo：在资源管理器显示">
                目录
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-8 text-center font-vt text-sm text-ink-faint">还没有附件——伴奏、编曲工程、demo 都可以收进来</p>
      )}
      <p className="font-vt text-xs text-ink-faint">demo 数据 · 正式版附件实体存放在项目文件夹的 attachments/ 里</p>
    </div>
  )
}
