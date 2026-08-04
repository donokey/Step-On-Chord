/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // 像素魔法风色板（Step On Chord · 深夜魔法书房）
        base: {
          DEFAULT: '#1c1410', // 深褐底色（石头+木头）
          deep: '#120c09', // 更深的凹陷区域（状态栏、轨道槽）
        },
        panel: {
          DEFAULT: '#2a1f1a', // 面板，暗木色
          light: '#352820', // 面板 hover / 次级面板
        },
        warm: {
          DEFAULT: '#d4a039', // 烛光金 · 主强调（魔杖光/蜡烛/发光边框）
          hover: '#e0b050',
          dim: '#8a6a28', // 暗金（Chorus 段落/按压边框）
        },
        cool: {
          DEFAULT: '#3a6a7a', // 石墙冷蓝 · 副强调
          light: '#4a8296',
          dim: '#2a4a56',
        },
        magic: {
          DEFAULT: '#7b5ea7', // 魔法紫 · 特殊高亮/粒子
          light: '#9478bd',
          dim: '#54406f',
        },
        ink: {
          DEFAULT: '#e8dcc8', // 羊皮纸色主文字
          dim: '#8a7a6a', // 次要文字
          faint: '#53473b', // 禁用/占位文字（进一步压暗，拉开文字层次）
        },
        edge: {
          DEFAULT: '#4a3828', // 边框，旧木框
          glow: '#d4a039', // 发光边框（烛光金）
        },
        success: '#5a9a5a', // 草药绿
        error: '#a04040', // 暗红
      },
      fontFamily: {
        // 像素字体（标题/导航/和弦名，仅拉丁字符）
        pixel: ['"Press Start 2P"', 'monospace'],
        // 正文等宽（VT323 优先，中文落系统等宽）
        vt: ['VT323', '"Microsoft YaHei"', 'monospace'],
        mono: ['"Cascadia Code"', 'Consolas', '"JetBrains Mono"', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '0.875rem' }],
      },
    },
  },
  plugins: [],
}
