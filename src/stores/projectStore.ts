import { create } from 'zustand'
import type { ProjectSummary } from '../../electron/types'
import { bridge } from '../bridge'
import type { SongProject } from '../shared/project-model'

export interface CurrentProject {
  folderPath: string
  project: SongProject
  audioMissing: boolean
}

interface ProjectState {
  projects: ProjectSummary[]
  loading: boolean
  error: string | null
  current: CurrentProject | null
  refresh: () => Promise<void>
  createProject: (parentDir: string, name: string) => Promise<boolean>
  openProject: (folderPath: string) => Promise<boolean>
  closeProject: () => void
  deleteProject: (folderPath: string) => Promise<void>
  /** 更新当前项目并落盘（歌词/附件/分析等变更统一走这里） */
  updateProject: (updater: (project: SongProject) => SongProject) => Promise<void>
}

/** 歌曲项目状态：列表 + 当前打开的项目（v0.2.0 工作台） */
export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  loading: false,
  error: null,
  current: null,

  refresh: async () => {
    set({ loading: true, error: null })
    try {
      const projects = await bridge.projects.list()
      set({ projects, loading: false })
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err), loading: false })
    }
  },

  createProject: async (parentDir, name) => {
    try {
      const { folderPath, project } = await bridge.projects.create(parentDir, name)
      set({ current: { folderPath, project: project as SongProject, audioMissing: false }, error: null })
      await get().refresh()
      return true
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) })
      return false
    }
  },

  openProject: async (folderPath) => {
    try {
      const result = await bridge.projects.open(folderPath)
      set({
        current: {
          folderPath: result.folderPath,
          project: result.project as SongProject,
          audioMissing: result.audioMissing,
        },
        error: null,
      })
      return true
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) })
      return false
    }
  },

  closeProject: () => set({ current: null }),

  deleteProject: async (folderPath) => {
    try {
      await bridge.projects.remove(folderPath)
      if (get().current?.folderPath === folderPath) set({ current: null })
      await get().refresh()
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) })
    }
  },

  updateProject: async (updater) => {
    const current = get().current
    if (!current) return
    const next = updater(current.project)
    set({ current: { ...current, project: next } })
    try {
      await bridge.projects.save(current.folderPath, next)
      await get().refresh()
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err) })
    }
  },
}))
