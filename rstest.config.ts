import { defineConfig } from '@rstest/core'
import { pluginReact } from '@rsbuild/plugin-react'

export default defineConfig({
  plugins: [pluginReact()],
  testEnvironment: 'happy-dom',
  testEnvironmentOptions: {
    happyDom: { url: 'http://localhost:5007/' },
  },
  setupFiles: ['./test/setup.ts'],
  include: ['test/{unit,integration,contract,e2e}/**/*.test.{ts,tsx}'],
  coverage: {
    provider: 'istanbul',
    reporters: ['text', 'json-summary'],
    reportsDirectory: 'coverage',
    include: ['src/**/*.{ts,tsx}'],
    exclude: ['src/**/*.d.ts', 'src/**/*.css'],
  },
})
