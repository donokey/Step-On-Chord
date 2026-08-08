import { useEffect, useState } from 'react'
import { SideNav } from './components/SideNav'
import { StatusBar } from './components/StatusBar'
import { TitleBar } from './components/TitleBar'
import { UpdatePrompt } from './components/UpdatePrompt'
import { AnalyzeView } from './components/views/AnalyzeView'
import { HistoryView } from './components/views/HistoryView'
import { ModelsSetupView } from './components/views/ModelsSetupView'
import { ProjectDetailView } from './components/views/ProjectDetailView'
import { ProjectsView } from './components/views/ProjectsView'
import { SettingsView } from './components/views/SettingsView'
import { VoicingView } from './components/views/VoicingView'
import { bridge } from './bridge'
import { useProjectStore } from './stores/projectStore'
import { useUiStore } from './stores/uiStore'

export default function App() {
  const activeView = useUiStore((s) => s.activeView)
  const currentProject = useProjectStore((s) => s.current)
  // 打包版权重缺失时先展示模型下载页（用户可跳过，下次启动重新检测）
  const [showModelsSetup, setShowModelsSetup] = useState(false)

  useEffect(() => {
    void bridge.models.status().then((status) => {
      if (status.isPackaged && status.missing.length > 0) setShowModelsSetup(true)
    })
  }, [])

  if (showModelsSetup) {
    return (
      <div className="flex h-full flex-col overflow-hidden bg-base text-ink">
        <TitleBar />
        <main className="min-h-0 flex-1 overflow-y-auto">
          <ModelsSetupView onEnterAnyway={() => setShowModelsSetup(false)} />
        </main>
        <StatusBar />
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-base text-ink">
      <TitleBar />
      <div className="flex min-h-0 flex-1">
        <SideNav />
        <main className="min-w-0 flex-1 overflow-y-auto bg-base">
          {activeView === 'analyze' && <AnalyzeView />}
          {activeView === 'projects' && (currentProject ? <ProjectDetailView /> : <ProjectsView />)}
          {activeView === 'history' && <HistoryView />}
          {activeView === 'voicing' && <VoicingView />}
          {activeView === 'settings' && <SettingsView />}
        </main>
      </div>
      <StatusBar />
      <UpdatePrompt />
    </div>
  )
}
