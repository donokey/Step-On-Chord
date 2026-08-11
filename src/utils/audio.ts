/** 音频相关小工具（附件播放等场景共用） */

/** sidecar /api/audio 白名单后缀（与后端 SUPPORTED_AUDIO_SUFFIXES 对齐） */
export const AUDIO_EXTENSIONS = ['.wav', '.mp3', '.flac', '.ogg'] as const

/** 按文件名后缀判断是否可在应用内播放 */
export function isAudioFileName(name: string): boolean {
  const lower = name.toLowerCase()
  return AUDIO_EXTENSIONS.some((ext) => lower.endsWith(ext))
}
