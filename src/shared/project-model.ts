/**
 * 歌曲项目数据模型（v0.2.0 乐手工作台核心）。
 *
 * 设计原则：
 * - 纯函数、无副作用：校验/序列化/操作均不碰文件系统，便于 vitest 单测；
 * - 不可变操作：所有变更返回新对象，避免共享引用串改；
 * - 原子保存由 electron/projects.ts 负责（临时文件 + rename），本模块只提供
 *   数据约定与纯逻辑。
 *
 * 项目结构约定：
 *   晴天/
 *   ├─ project.soc.json      <- 唯一数据源（本模块序列化/解析）
 *   └─ attachments/          <- 附件实体
 */

import type { AnalysisResult } from '../types/analysis'

export const PROJECT_FORMAT = 'step-on-chord-project'
export const PROJECT_VERSION = 1
export const PROJECT_FILE_NAME = 'project.soc.json'
export const ATTACHMENTS_DIR_NAME = 'attachments'

export type AudioRefMode = 'reference' | 'copy'

export interface ProjectAudioRef {
  mode: AudioRefMode
  path: string
  file_name: string
}

export type LyricsSectionType = 'verse' | 'chorus' | 'bridge' | 'intro' | 'outro' | 'free'
export const LYRICS_SECTION_TYPES: readonly LyricsSectionType[] = [
  'verse', 'chorus', 'bridge', 'intro', 'outro', 'free',
]

export interface LyricsSection {
  id: string
  type: LyricsSectionType
  title: string
  text: string
}

export interface LyricsData {
  sections: LyricsSection[]
}

export type AttachmentKind = 'accompaniment' | 'arrangement' | 'demo' | 'other'
export const ATTACHMENT_KINDS: readonly AttachmentKind[] = [
  'accompaniment', 'arrangement', 'demo', 'other',
]

export interface ProjectAttachment {
  id: string
  name: string
  /** 相对项目根目录的路径（约定在 attachments/ 下） */
  rel_path: string
  kind: AttachmentKind
  note: string
  /** 文件大小（字节），旧数据可能缺失（默认 0） */
  size: number
  added_at: number
}

export interface SongProject {
  format: string
  version: number
  name: string
  created_at: number
  updated_at: number
  audio: ProjectAudioRef | null
  analysis: AnalysisResult | null
  lyrics: LyricsData
  attachments: ProjectAttachment[]
}

// ---------------------------------------------------------------------------
// 工厂与校验
// ---------------------------------------------------------------------------

let _idCounter = 0

/** 生成短 id（纯函数内唯一性保证：进程内自增 + 时间戳，测试可注入前缀） */
export function newId(prefix = 'id'): string {
  _idCounter += 1
  return `${prefix}-${Date.now().toString(36)}-${_idCounter.toString(36)}`
}

export function createProject(name: string, now: number = Date.now()): SongProject {
  const trimmed = String(name ?? '').trim()
  if (!trimmed) throw new Error('项目名不能为空')
  return {
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    name: trimmed,
    created_at: now,
    updated_at: now,
    audio: null,
    analysis: null,
    lyrics: { sections: [] },
    attachments: [],
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 校验并规范化外部数据（读取 project.soc.json 时使用）；格式不符抛错 */
export function validateProject(data: unknown): SongProject {
  if (!isRecord(data)) throw new Error('项目数据格式错误：不是对象')
  if (data.format !== PROJECT_FORMAT) {
    throw new Error(`项目格式不匹配：期望 ${PROJECT_FORMAT}，实际 ${String(data.format)}`)
  }
  if (data.version !== PROJECT_VERSION) {
    throw new Error(`项目版本不支持：${String(data.version)}（当前支持 ${PROJECT_VERSION}）`)
  }
  const name = String(data.name ?? '').trim()
  if (!name) throw new Error('项目缺少名称')

  let audio: ProjectAudioRef | null = null
  if (data.audio !== null && data.audio !== undefined) {
    if (!isRecord(data.audio)) throw new Error('audio 字段格式错误')
    const mode = String(data.audio.mode ?? '')
    if (mode !== 'reference' && mode !== 'copy') throw new Error(`audio.mode 不合法：${mode}`)
    audio = {
      mode,
      path: String(data.audio.path ?? ''),
      file_name: String(data.audio.file_name ?? ''),
    }
  }

  let analysis: AnalysisResult | null = null
  if (data.analysis !== null && data.analysis !== undefined) {
    if (!isRecord(data.analysis)) throw new Error('analysis 字段格式错误')
    analysis = data.analysis as unknown as AnalysisResult
  }

  const lyricsRaw = isRecord(data.lyrics) ? data.lyrics : {}
  const sectionsRaw = Array.isArray(lyricsRaw.sections) ? lyricsRaw.sections : []
  const sections: LyricsSection[] = sectionsRaw.map((raw, index) => {
    if (!isRecord(raw)) throw new Error(`歌词第 ${index + 1} 节格式错误`)
    const type = String(raw.type ?? 'free')
    if (!LYRICS_SECTION_TYPES.includes(type as LyricsSectionType)) {
      throw new Error(`歌词节类型不合法：${type}`)
    }
    return {
      id: String(raw.id ?? `sec-${index}`),
      type: type as LyricsSectionType,
      title: String(raw.title ?? ''),
      text: String(raw.text ?? ''),
    }
  })

  const attachmentsRaw = Array.isArray(data.attachments) ? data.attachments : []
  const attachments: ProjectAttachment[] = attachmentsRaw.map((raw, index) => {
    if (!isRecord(raw)) throw new Error(`附件第 ${index + 1} 项格式错误`)
    const kind = String(raw.kind ?? 'other')
    if (!ATTACHMENT_KINDS.includes(kind as AttachmentKind)) {
      throw new Error(`附件类型不合法：${kind}`)
    }
    return {
      id: String(raw.id ?? `att-${index}`),
      name: String(raw.name ?? ''),
      rel_path: String(raw.rel_path ?? ''),
      kind: kind as AttachmentKind,
      note: String(raw.note ?? ''),
      size: Number(raw.size ?? 0),
      added_at: Number(raw.added_at ?? 0),
    }
  })

  return {
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    name,
    created_at: Number(data.created_at ?? 0),
    updated_at: Number(data.updated_at ?? 0),
    audio,
    analysis,
    lyrics: { sections },
    attachments,
  }
}

/** 解析 project.soc.json 文本 */
export function parseProject(json: string): SongProject {
  let data: unknown
  try {
    data = JSON.parse(json)
  } catch (error) {
    throw new Error(`项目文件不是合法 JSON：${error instanceof Error ? error.message : String(error)}`)
  }
  return validateProject(data)
}

/** 序列化为 project.soc.json 文本（格式化，便于人工查看） */
export function serializeProject(project: SongProject): string {
  return JSON.stringify(project, null, 2)
}

// ---------------------------------------------------------------------------
// 不可变操作（返回新对象）
// ---------------------------------------------------------------------------

export function touchProject(project: SongProject, now: number = Date.now()): SongProject {
  return { ...project, updated_at: now }
}

/** 项目改名（歌名经常变）：校验非空，返回新对象 */
export function renameProject(project: SongProject, name: string, now: number = Date.now()): SongProject {
  const trimmed = String(name ?? '').trim()
  if (!trimmed) throw new Error('项目名不能为空')
  return touchProject({ ...project, name: trimmed }, now)
}

export function setProjectAudio(project: SongProject, audio: ProjectAudioRef): SongProject {
  return touchProject({ ...project, audio: { ...audio } })
}

export function clearProjectAudio(project: SongProject): SongProject {
  return touchProject({ ...project, audio: null })
}

export function setProjectAnalysis(project: SongProject, analysis: AnalysisResult | null): SongProject {
  return touchProject({ ...project, analysis })
}

export function upsertLyricsSection(project: SongProject, section: LyricsSection): SongProject {
  const sections = project.lyrics.sections.some((item) => item.id === section.id)
    ? project.lyrics.sections.map((item) => (item.id === section.id ? { ...section } : item))
    : [...project.lyrics.sections, { ...section }]
  return touchProject({ ...project, lyrics: { sections } })
}

export function removeLyricsSection(project: SongProject, sectionId: string): SongProject {
  return touchProject({
    ...project,
    lyrics: { sections: project.lyrics.sections.filter((item) => item.id !== sectionId) },
  })
}

export function reorderLyricsSections(project: SongProject, orderedIds: string[]): SongProject {
  const byId = new Map(project.lyrics.sections.map((item) => [item.id, item]))
  const ordered = orderedIds.map((id) => byId.get(id)).filter((item): item is LyricsSection => item !== undefined)
  if (ordered.length !== project.lyrics.sections.length) {
    throw new Error('排序 id 列表与现有节不一致')
  }
  return touchProject({ ...project, lyrics: { sections: ordered } })
}

export function addAttachment(project: SongProject, attachment: ProjectAttachment): SongProject {
  return touchProject({
    ...project,
    attachments: [...project.attachments, { ...attachment }],
  })
}

export function updateAttachment(
  project: SongProject,
  attachmentId: string,
  patch: Partial<Pick<ProjectAttachment, 'name' | 'kind' | 'note'>>,
): SongProject {
  return touchProject({
    ...project,
    attachments: project.attachments.map((item) => (item.id === attachmentId ? { ...item, ...patch } : item)),
  })
}

export function removeAttachment(project: SongProject, attachmentId: string): SongProject {
  return touchProject({
    ...project,
    attachments: project.attachments.filter((item) => item.id !== attachmentId),
  })
}
