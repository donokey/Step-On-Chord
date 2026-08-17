import { shell } from 'electron'
import { statSync } from 'node:fs'
import { access, copyFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { ProjectSummary } from './types'
import {
  ATTACHMENTS_DIR_NAME,
  PROJECT_FILE_NAME,
  createProject,
  parseProject,
  renameProject,
  serializeProject,
  validateProject,
  type ProjectAttachment,
  type ProjectAudioRef,
  type SongProject,
} from '../src/shared/project-model'
import type { ProjectIndexStore } from './db'

/** 打开项目的结果（project 已通过主进程校验） */
export interface ProjectOpenResult {
  folderPath: string
  project: SongProject
  audioMissing: boolean
  /** 磁盘上缺失的附件 id 列表（用于前端标灰提示） */
  attachmentMissing: string[]
}

/**
 * 歌曲项目管理（v0.2.0 工作台）：
 * - 项目 = 一个文件夹（project.soc.json + attachments/ + 可选 audio/）
 * - 写盘一律原子替换（临时文件 + rename），防止断电写坏
 * - 删除一律走系统回收站（shell.trashItem），不永久删除
 */
export class ProjectsService {
  constructor(private readonly index: ProjectIndexStore) {}

  private projectFilePath(folderPath: string): string {
    return path.join(folderPath, PROJECT_FILE_NAME)
  }

  private async atomicWrite(target: string, content: string): Promise<void> {
    const tmp = `${target}.tmp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    await writeFile(tmp, content, 'utf-8')
    await rename(tmp, target)
  }

  private async exists(target: string): Promise<boolean> {
    try {
      await access(target)
      return true
    } catch {
      return false
    }
  }

  /** 新建项目：建文件夹 + 写 project.soc.json + 索引；同名文件夹已存在则抛错 */
  async create(parentDir: string, name: string): Promise<{ folderPath: string; project: SongProject }> {
    const project = createProject(name)
    const folderPath = path.join(parentDir, project.name)
    await mkdir(parentDir, { recursive: true }) // 集中根目录可能尚不存在
    await mkdir(folderPath, { recursive: false })
    await mkdir(path.join(folderPath, ATTACHMENTS_DIR_NAME), { recursive: true })
    await this.atomicWrite(this.projectFilePath(folderPath), serializeProject(project))
    this.index.upsert(project.name, folderPath, project.updated_at)
    return { folderPath, project }
  }

  /** 打开项目：读取 + 校验 + 音频/附件存在性检查（失败路径由 IPC 层提示重新定位） */
  async open(folderPath: string): Promise<ProjectOpenResult> {
    const raw = await readFile(this.projectFilePath(folderPath), 'utf-8')
    const project = parseProject(raw)
    let audioMissing = false
    if (project.audio) {
      try {
        await access(project.audio.path)
      } catch {
        audioMissing = true
      }
    }
    const attachmentMissing: string[] = []
    for (const attachment of project.attachments) {
      try {
        await access(path.join(folderPath, attachment.rel_path))
      } catch {
        attachmentMissing.push(attachment.id)
      }
    }
    this.index.upsert(project.name, folderPath, project.updated_at)
    return { folderPath, project, audioMissing, attachmentMissing }
  }

  /** 保存项目（原子写 + 刷新索引） */
  async save(folderPath: string, project: SongProject): Promise<void> {
    validateProject(project)
    await this.atomicWrite(this.projectFilePath(folderPath), serializeProject(project))
    this.index.upsert(project.name, folderPath, project.updated_at)
  }

  /** 项目改名：重命名文件夹 + 更新 project.soc.json + 刷新索引（歌名经常变） */
  async rename(folderPath: string, newName: string): Promise<{ folderPath: string; project: SongProject }> {
    const trimmed = String(newName ?? '').trim()
    if (!trimmed) throw new Error('项目名不能为空')
    if (/[\\/:*?"<>|]/.test(trimmed)) {
      throw new Error('项目名不能包含 \\ / : * ? " < > | 字符')
    }
    const oldPath = path.resolve(folderPath)
    const newPath = path.join(path.dirname(oldPath), trimmed)
    if (oldPath === newPath) {
      const project = parseProject(await readFile(this.projectFilePath(oldPath), 'utf-8'))
      return { folderPath: oldPath, project }
    }
    if (await this.exists(newPath)) throw new Error(`已存在同名项目：${trimmed}`)

    const raw = await readFile(this.projectFilePath(oldPath), 'utf-8')
    const project = renameProject(parseProject(raw), trimmed)
    // 先重命名文件夹，再更新 soc.json（新路径目录此时才存在）
    await rename(oldPath, newPath)
    await this.atomicWrite(this.projectFilePath(newPath), serializeProject(project))
    this.index.remove(oldPath)
    this.index.upsert(project.name, newPath, project.updated_at)
    return { folderPath: newPath, project }
  }

  /** 删除项目：整个文件夹进回收站 + 移除索引 */
  async remove(folderPath: string): Promise<void> {
    await shell.trashItem(folderPath)
    this.index.remove(folderPath)
  }

  /** 重新定位音频（reference 模式换路径） */
  async setAudio(folderPath: string, project: SongProject, audio: ProjectAudioRef): Promise<SongProject> {
    const next: SongProject = { ...project, audio: { ...audio }, updated_at: Date.now() }
    await this.save(folderPath, next)
    return next
  }

  /** 收集进项目：复制音频到 <项目>/audio/ 并更新引用（防原文件丢失） */
  async copyAudioIntoProject(folderPath: string, project: SongProject, sourcePath: string): Promise<SongProject> {
    const audioDir = path.join(folderPath, 'audio')
    await mkdir(audioDir, { recursive: true })
    const fileName = path.basename(sourcePath)
    await copyFile(sourcePath, path.join(audioDir, fileName))
    const next: SongProject = {
      ...project,
      audio: { mode: 'copy', path: path.join(audioDir, fileName), file_name: fileName },
      updated_at: Date.now(),
    }
    await this.save(folderPath, next)
    return next
  }

  /** 计算 attachments/ 内不冲突的唯一文件名：demo.mp3 → demo (2).mp3 …（同时避开元数据已占用名与磁盘孤立文件） */
  private async uniqueAttachmentName(attDir: string, project: SongProject, fileName: string): Promise<string> {
    const usedNames = new Set(project.attachments.map((item) => path.basename(item.rel_path)))
    const dot = fileName.lastIndexOf('.')
    const stem = dot > 0 ? fileName.slice(0, dot) : fileName
    const ext = dot > 0 ? fileName.slice(dot) : ''
    let candidate = fileName
    let counter = 2
    while (usedNames.has(candidate) || (await this.pathExists(path.join(attDir, candidate)))) {
      candidate = `${stem} (${counter})${ext}`
      counter += 1
    }
    return candidate
  }

  private async pathExists(target: string): Promise<boolean> {
    try {
      await access(target)
      return true
    } catch {
      return false
    }
  }

  /** 添加附件：复制进 attachments/ + 更新项目（记录文件大小；重名自动加序号防覆盖） */
  async addAttachment(
    folderPath: string,
    project: SongProject,
    sourcePath: string,
    kind: ProjectAttachment['kind'],
    note: string,
  ): Promise<SongProject> {
    const attDir = path.join(folderPath, ATTACHMENTS_DIR_NAME)
    await mkdir(attDir, { recursive: true })
    const fileName = await this.uniqueAttachmentName(attDir, project, path.basename(sourcePath))
    const relPath = path.join(ATTACHMENTS_DIR_NAME, fileName)
    await copyFile(sourcePath, path.join(folderPath, relPath))
    const size = statSync(sourcePath).size
    const attachment: ProjectAttachment = {
      id: `att-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      name: fileName,
      rel_path: relPath,
      kind,
      note,
      size,
      added_at: Date.now(),
    }
    const next: SongProject = {
      ...project,
      attachments: [...project.attachments, attachment],
      updated_at: Date.now(),
    }
    await this.save(folderPath, next)
    return next
  }

  /** 移除附件：文件进回收站 + 更新项目（文件缺失时静默跳过） */
  async removeAttachment(folderPath: string, project: SongProject, attachmentId: string): Promise<SongProject> {
    const attachment = project.attachments.find((item) => item.id === attachmentId)
    const next: SongProject = {
      ...project,
      attachments: project.attachments.filter((item) => item.id !== attachmentId),
      updated_at: Date.now(),
    }
    if (attachment) {
      try {
        await shell.trashItem(path.join(folderPath, attachment.rel_path))
      } catch {
        // 文件可能已被外部删除，忽略
      }
    }
    await this.save(folderPath, next)
    return next
  }

  list(): ProjectSummary[] {
    return this.index.list()
  }
}
