import path from 'path'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.tsx'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      // Cover screens, hooks, context, and components.
      // shadcn/ui primitives (button, sheet, checkbox, input) are third-party
      // generated files excluded via the components/ui pattern.
      include: [
        'src/screens/**/*.{ts,tsx}',
        'src/hooks/**/*.{ts,tsx}',
        'src/context/**/*.{ts,tsx}',
        'src/components/**/*.{ts,tsx}',
      ],
      exclude: ['src/test/**', 'src/components/ui/**'],
      thresholds: {
        branches: 80,
        functions: 80,
        lines: 80,
        statements: 80,
      },
    },
  },
})
