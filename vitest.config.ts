import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  // tsconfig 里 jsx 为 "preserve"（Next.js 要求），Vitest 需要显式覆盖为 automatic
  esbuild: { jsx: 'automatic' },
  test: {
    include: ['lib/**/*.test.{ts,tsx}', 'components/**/*.test.tsx'],
    environment: 'node',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
})
