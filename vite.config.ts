import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // the licences of the npm packages bundled into dist/ (React, onnxruntime-web, …), served as /third-party-licenses.md
  build: { license: { fileName: 'third-party-licenses.md' } },
})
