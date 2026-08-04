import { create } from 'zustand'

/** 左侧导航的四个入口 */
export type NavView = 'analyze' | 'history' | 'voicing' | 'settings'

interface UiState {
  activeView: NavView
  setActiveView: (view: NavView) => void
}

export const useUiStore = create<UiState>((set) => ({
  activeView: 'analyze',
  setActiveView: (view) => set({ activeView: view }),
}))
