import { create } from 'zustand'

/** 左侧导航入口（projects 为乐手工作台项目页） */
export type NavView = 'analyze' | 'projects' | 'history' | 'voicing' | 'settings'

interface UiState {
  activeView: NavView
  setActiveView: (view: NavView) => void
}

export const useUiStore = create<UiState>((set) => ({
  activeView: 'analyze',
  setActiveView: (view) => set({ activeView: view }),
}))
