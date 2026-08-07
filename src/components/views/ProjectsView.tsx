import { useState } from 'react'
import { PanelTitle } from '../PanelTitle'
import { PixelBuddy } from '../PixelBuddy'
import { ProjectDetailView } from './ProjectDetailView'

/**
 * UI 骨架（demo）：歌曲项目列表 + 详情入口。
 * 全部为 mock 数据，未接 IPC / 文件读写 —— 正式实现见 docs/musician-workbench-spec.md 阶段 2。
 */

export interface DemoProject {
  id: string
  name: string
  updatedAt: string
  hasAnalysis: boolean
  keyText: string | null
  bpm: number | null
  chordCount: number
  sectionCount: number
  attachmentCount: number
}

export interface DemoLyricSection {
  id: string
  type: 'verse' | 'chorus' | 'bridge' | 'intro' | 'outro' | 'free'
  title: string
  text: string
}

export interface DemoAttachment {
  id: string
  name: string
  kind: '伴奏' | '编曲' | 'demo' | '其他'
  size: string
  addedAt: string
}

export const LYRIC_TYPE_LABELS: Record<DemoLyricSection['type'], string> = {
  verse: '主歌',
  chorus: '副歌',
  bridge: '桥段',
  intro: '前奏',
  outro: '尾奏',
  free: '自由',
}

const DEMO_PROJECTS: DemoProject[] = [
  {
    id: 'p1',
    name: '晴天',
    updatedAt: '2026-08-08 14:20',
    hasAnalysis: true,
    keyText: 'G 大调',
    bpm: 76,
    chordCount: 42,
    sectionCount: 6,
    attachmentCount: 2,
  },
  {
    id: 'p2',
    name: '夜城 demo',
    updatedAt: '2026-08-07 22:05',
    hasAnalysis: false,
    keyText: null,
    bpm: null,
    chordCount: 0,
    sectionCount: 0,
    attachmentCount: 1,
  },
]

export const DEMO_LYRICS: DemoLyricSection[] = [
  { id: 's1', type: 'verse', title: '主歌 1', text: '故事的小黄花\n从出生那年就飘着' },
  { id: 's2', type: 'chorus', title: '副歌', text: '' },
]

export const DEMO_ATTACHMENTS: DemoAttachment[] = [
  { id: 'a1', name: 'demo-v1.mp3', kind: 'demo', size: '8.2 MB', addedAt: '2026-08-06' },
  { id: 'a2', name: '编曲参考-吉他.wav', kind: '编曲', size: '24.7 MB', addedAt: '2026-08-07' },
]

/** 项目视图：列表 ↔ 详情的本地切换（demo 用组件内状态，正式版接 projectStore） */
export function ProjectsView() {
  const [selected, setSelected] = useState<DemoProject | null>(null)

  if (selected) {
    return <ProjectDetailView project={selected} onBack={() => setSelected(null)} />
  }

  return (
    <div className="bg-atmosphere relative flex min-h-full flex-col gap-2 p-3">
      <section className="panel-pixel pixel-corners panel-tint-magic flex min-h-0 flex-1 flex-col px-3 py-2">
        <div className="mb-2 flex items-center justify-between gap-2">
          <PanelTitle symbol="♫">Projects</PanelTitle>
          <button
            type="button"
            className="btn-pixel h-7 shrink-0 px-3 text-xs"
            title="demo：正式版将支持选择目录并创建 project.soc.json"
          >
            + 新建项目
          </button>
        </div>

        {DEMO_PROJECTS.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 py-12">
            <PixelBuddy state="idle" scale={4} orbit />
            <p className="font-vt text-lg text-ink-dim">还没有歌曲项目</p>
            <p className="font-vt text-sm text-ink-faint">每首歌一个文件夹：分析、歌词、伴奏都收在这一首歌名下</p>
          </div>
        ) : (
          <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
            {DEMO_PROJECTS.map((project) => (
              <li key={project.id}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelected(project)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') setSelected(project)
                  }}
                  className="group flex cursor-pointer items-center gap-3 border border-edge bg-base-deep px-3 py-2 transition-colors hover:border-edge-glow"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-vt text-lg leading-tight text-ink group-hover:text-warm">
                      {project.name}
                    </p>
                    <p className="truncate font-vt text-xs text-ink-faint">
                      {project.updatedAt} ·{' '}
                      {project.hasAnalysis
                        ? `${project.keyText ?? '未知调'} · ${project.bpm ?? '—'} BPM · ${project.chordCount} 和弦 · ${project.sectionCount} 段落`
                        : '未分析'}
                      {' · '}
                      {project.attachmentCount} 个附件
                    </p>
                  </div>
                  <span className="shrink-0 font-vt text-xs text-ink-faint group-hover:text-ink-dim">打开 →</span>
                </div>
              </li>
            ))}
          </ul>
        )}

        <p className="mt-2 font-vt text-xs text-ink-faint">
          demo 数据 · 正式版项目 = 文件夹（project.soc.json + attachments/），可存可开、整夹拷走
        </p>
      </section>
    </div>
  )
}
