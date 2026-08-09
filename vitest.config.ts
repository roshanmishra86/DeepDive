import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config.ts'

export default mergeConfig(
  viteConfig,
  defineConfig({
    // happy-dom test files (marked `@vitest-environment happy-dom`) run in Vite's
    // client environment, where node: builtins aren't resolvable by default.
    // src/test/nodeDriver.ts imports node:sqlite; tests run under Node, so
    // externalize rather than bundle.
    environments: {
      client: {
        resolve: { builtins: [/^node:/] },
      },
    },
    test: {
      environment: 'node',
      globals: true,
      include: ['src/**/*.test.{ts,tsx}'],
    },
  })
)
