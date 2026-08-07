import { bridge } from '../bridge'
import { useProjectStore } from '../stores/projectStore'
import { useUiStore } from '../stores/uiStore'
import type { AnalysisResult } from '../types/analysis'

/**
 * 把一次分析结果存为歌曲项目：
 * 选父目录 → 建项目 → 关联音频（reference）→ 写入分析 → 打开项目并跳转。
 * 取消选择目录返回 false；失败抛错由调用方提示。
 */
export async function saveAnalysisAsProject(
  fileName: string,
  filePath: string,
  result: AnalysisResult,
): Promise<boolean> {
  const parentDir = await bridge.projects.chooseParentDir()
  if (!parentDir) return false
  const name = fileName.replace(/\.[^.]+$/, '') || '未命名歌曲'
  const { folderPath, project } = await bridge.projects.create(parentDir, name)
  const withAudio = { ...project, audio: { mode: 'reference' as const, path: filePath, file_name: fileName } }
  const withAnalysis = { ...withAudio, analysis: result, updated_at: Date.now() }
  await bridge.projects.save(folderPath, withAnalysis)
  await useProjectStore.getState().openProject(folderPath)
  useUiStore.getState().setActiveView('projects')
  return true
}
