import * as matchers from '@testing-library/jest-dom/matchers'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach, expect } from '@rstest/core'
import { startPlatform } from './fixtures/platform'

expect.extend(matchers)

// Every test runs against a fresh SDK runtime: signed in, with and
// this remote's messages loaded.
beforeEach(async () => {
  startPlatform()
  await new Promise((resolve) => setTimeout(resolve, 0))
})

afterEach(() => {
  cleanup()
  localStorage.clear()
  sessionStorage.clear()
  document.documentElement.removeAttribute('data-theme')
})
