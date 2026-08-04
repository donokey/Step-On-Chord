import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron/simple'
import { notBundle } from 'vite-plugin-electron/plugin'

// 渲染进程由 Vite 构建（React + HMR）；
// electron/main.ts 与 electron/preload.ts 由 vite-plugin-electron 编译到 dist-electron/，
// 开发模式下自动启动 Electron 并在主进程代码变更时重启。
export default defineConfig({
  plugins: [
    react(),
    electron({
      main: {
        entry: 'electron/main.ts',
        vite: {
          // 原生模块不能进 bundle：.node 二进制依赖 node_modules 目录结构，
          // notBundle 会把 package.json dependencies（含 better-sqlite3）保持为运行时 require
          plugins: [notBundle()],
        },
      },
      preload: {
        input: 'electron/preload.ts',
      },
      // 不传 renderer：渲染进程保持纯 Web 环境（通过 preload contextBridge 通信），
      // 也不需要安装 vite-plugin-electron-renderer
    }),
  ],
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
