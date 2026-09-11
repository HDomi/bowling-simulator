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
    /**
     * 물리 테스트는 Rapier를 수천 스텝 돌린다. 개발기에서 1~2초 걸리는 것이
     * CI 러너에서는 몇 배가 되고, vitest 기본값 5초를 넘기면 배포가 막힌다.
     * 시간 초과는 단언 실패와 달리 코드가 깨진 것처럼 보여 원인을 찾기도 어렵다.
     */
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
}))
