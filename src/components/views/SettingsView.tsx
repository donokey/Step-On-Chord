import { IconSettings } from '../icons'
import { PlaceholderView } from './PlaceholderView'

export function SettingsView() {
  return (
    <PlaceholderView
      icon={IconSettings}
      title="设置"
      description="模型目录、引擎端口、主题等偏好设置，持久化到本地配置。"
      milestone="Phase 4"
    />
  )
}
