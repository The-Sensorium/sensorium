import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: [
      {
        // The real shim pulls a native SQLite module that cannot load under
        // node; tests get an in-memory Web Storage with the same contract.
        find: 'expo-sqlite/localStorage/install',
        replacement: fileURLToPath(
          new URL('./test/stubs/expo-sqlite-local-storage-install.ts', import.meta.url),
        ),
      },
    ],
  },
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
})
