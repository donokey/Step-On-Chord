import { SideNav } from './components/SideNav'
import { StatusBar } from './components/StatusBar'
import { TitleBar } from './components/TitleBar'
import { AnalyzeView } from './components/views/AnalyzeView'
import { HistoryView } from './components/views/HistoryView'
import { SettingsView } from './components/views/SettingsView'
import { VoicingView } from './components/views/VoicingView'
import { useUiStore } from './stores/uiStore'

export default function App() {
  const activeView = useUiStore((s) => s.activeView)

  return (
    <div className="flex h-full flex-col overflow-hidden bg-base text-ink">
      <TitleBar />
      <div className="flex min-h-0 flex-1">
        <SideNav />
        <main className="min-w-0 flex-1 overflow-y-auto bg-base">
          {activeView === 'analyze' && <AnalyzeView />}
          {activeView === 'history' && <HistoryView />}
          {activeView === 'voicing' && <VoicingView />}
          {activeView === 'settings' && <SettingsView />}
        </main>
      </div>
      <StatusBar />
    </div>
  )
}
