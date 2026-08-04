import Store from 'electron-store'

interface SettingsSchema {
  /** 七和弦自动精炼（实验性，默认关闭；sidecar 启动时以 CHORDCRAFT_REFINE_QUALITIES 传入） */
  refineQualities: boolean
}

/** 应用设置持久化（electron-store，userData/config.json） */
export class SettingsStore {
  private store: Store<SettingsSchema>

  constructor() {
    this.store = new Store<SettingsSchema>({
      defaults: { refineQualities: false },
    })
  }

  get refineQualities(): boolean {
    return this.store.get('refineQualities')
  }

  setRefineQualities(value: boolean): void {
    this.store.set('refineQualities', value)
  }

  /** sidecar spawn 时的环境变量覆盖（引擎进程级开关） */
  sidecarEnv(): Record<string, string> {
    return this.refineQualities ? { CHORDCRAFT_REFINE_QUALITIES: '1' } : {}
  }
}
