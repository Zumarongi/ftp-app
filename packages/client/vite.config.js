import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  root: 'src/renderer',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src/renderer')
    }
  },
  build: {
    outDir: '../../dist/client/renderer',
    emptyOutDir: true
  }
});


// export ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
// npx electron-rebuild -f -w better-sqlite3
