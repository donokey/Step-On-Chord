import type { SVGProps } from 'react'

export type IconProps = SVGProps<SVGSVGElement>

/** 统一 stroke 风格（类 Lucide），颜色随 currentColor */
function iconProps(props: IconProps): IconProps {
  return {
    width: 16,
    height: 16,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
    focusable: false,
    ...props,
  }
}

/** 应用 Logo：波形线 */
export function IconLogo(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <path d="M3 12h3l2.5-6 3 12 3-15 3 9h3.5" />
    </svg>
  )
}

/** 导航 - 分析：音频波形柱 */
export function IconAnalyze(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <path d="M4 10v4" />
      <path d="M8 6v12" />
      <path d="M12 3v18" />
      <path d="M16 8v8" />
      <path d="M20 11v2" />
    </svg>
  )
}

/** 导航 - 历史：逆时针回转时钟 */
export function IconHistory(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <path d="M3.5 12a8.5 8.5 0 1 0 2.5-6L3.5 8.5" />
      <path d="M3.5 3.5v5h5" />
      <path d="M12 7.5V12l3 2" />
    </svg>
  )
}

/** 导航 - Voicing：吉他和弦网格（竖弦 + 横品丝 + 按弦点） */
export function IconVoicing(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <path d="M6 3.5v17" />
      <path d="M10 3.5v17" />
      <path d="M14 3.5v17" />
      <path d="M18 3.5v17" />
      <path d="M4.5 8h15" />
      <path d="M4.5 13h15" />
      <path d="M4.5 18h15" />
      <circle cx="14" cy="10.5" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="10" cy="15.5" r="1.6" fill="currentColor" stroke="none" />
    </svg>
  )
}

/** 导航 - 设置：八辐条齿轮 */
export function IconSettings(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 2.5v3" />
      <path d="M12 18.5v3" />
      <path d="M2.5 12h3" />
      <path d="M18.5 12h3" />
      <path d="M5.3 5.3l2.1 2.1" />
      <path d="M16.6 16.6l2.1 2.1" />
      <path d="M18.7 5.3l-2.1 2.1" />
      <path d="M7.4 16.6l-2.1 2.1" />
    </svg>
  )
}

/** 标题栏 - 最小化 */
export function IconMinimize(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <path d="M5 12h14" />
    </svg>
  )
}

/** 标题栏 - 最大化 */
export function IconMaximize(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <rect x="5" y="5" width="14" height="14" rx="1.5" />
    </svg>
  )
}

/** 标题栏 - 还原（最大化后） */
export function IconRestore(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <path d="M8.5 8.5v-2A1.5 1.5 0 0 1 10 5h8a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5h-2" />
      <rect x="4.5" y="8.5" width="11" height="11" rx="1.5" />
    </svg>
  )
}

/** 标题栏 - 关闭 */
export function IconClose(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <path d="M6 6l12 12" />
      <path d="M18 6L6 18" />
    </svg>
  )
}

/** 工具栏 - 打开文件 */
export function IconFolderOpen(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2.5h7a2 2 0 0 1 2 2v6.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-9z" />
    </svg>
  )
}

/** 播放 */
export function IconPlay(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <path d="M7 4.5v15l12-7.5z" fill="currentColor" stroke="none" />
    </svg>
  )
}

/** 暂停 */
export function IconPause(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <path d="M7 4.5v15" strokeWidth={3} />
      <path d="M17 4.5v15" strokeWidth={3} />
    </svg>
  )
}

/** 占位视图 - 音符 */
export function IconMusicNote(props: IconProps) {
  return (
    <svg {...iconProps(props)}>
      <path d="M9 18.5V6l11-2.5V15" />
      <circle cx="6.5" cy="18.5" r="2.5" />
      <circle cx="17.5" cy="15" r="2.5" />
    </svg>
  )
}
