import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // ExcelJS (~930 kB) is a separate chunk that only loads on import/export (src/lib/files.ts).
  build: { chunkSizeWarningLimit: 1000 },
})
