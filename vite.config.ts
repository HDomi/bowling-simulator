import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

/**
 * GitHub Pages 프로젝트 사이트는 https://<user>.github.io/<repo>/ 아래에 올라간다.
 * 개발 서버만 루트를 쓴다. preview는 배포본과 같은 경로로 띄워야 링크가 깨지지 않는다.
 */
const PAGES_BASE = '/bowling-simulator/'

export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview ? PAGES_BASE : '/',
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
}))
