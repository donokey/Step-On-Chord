import { readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

/** 批量处理支持的音频格式（与后端纯 Python 解码链路一致） */
export const BATCH_AUDIO_SUFFIXES = new Set(['.wav', '.mp3', '.flac', '.ogg'])

/** 列出文件夹内的音频文件（仅顶层，按文件名排序）；文件夹不可读时抛错 */
export async function listAudioFilesInFolder(folderPath: string): Promise<string[]> {
  const entries = await readdir(folderPath, { withFileTypes: true })
  return entries
    .filter((entry) => entry.isFile() && BATCH_AUDIO_SUFFIXES.has(path.extname(entry.name).toLowerCase()))
    .map((entry) => path.join(folderPath, entry.name))
    .sort((a, b) => a.localeCompare(b, 'zh-CN'))
}

const ILLEGAL_FILENAME_CHARS = /[<>:"/\\|?*\u0000-\u001f]/g

export function sanitizeFileName(name: string): string {
  const cleaned = name.replace(ILLEGAL_FILENAME_CHARS, '_').trim()
  return cleaned || 'chord-sheet'
}

export interface BatchWriteItem {
  name: string
  content: string
}

/** 批量写文本文件到目标文件夹（重名自动加序号），返回已写路径列表 */
export async function writeTextFiles(directory: string, files: BatchWriteItem[]): Promise<string[]> {
  const written: string[] = []
  const usedNames = new Set<string>()
  for (const file of files) {
    let safeName = sanitizeFileName(file.name)
    let counter = 2
    while (usedNames.has(safeName.toLowerCase())) {
      const dot = safeName.lastIndexOf('.')
      const stem = dot > 0 ? safeName.slice(0, dot) : safeName
      const ext = dot > 0 ? safeName.slice(dot) : ''
      safeName = `${stem} (${counter})${ext}`
      counter += 1
    }
    usedNames.add(safeName.toLowerCase())
    const target = path.join(directory, safeName)
    await writeFile(target, file.content, 'utf-8')
    written.push(target)
  }
  return written
}
