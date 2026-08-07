import { defineConfig } from 'vitest/config'

// 前端纯逻辑单测（vitest）：只测 src 下的纯函数，不启动 Electron
export default defineConfig({
  test: {
    include: ['src/**/__tests__/**/*.test.ts'],
    environment: 'node',
  },
})
