import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  base: './', // 使用相对路径，确保在 Electron 的 file:// 协议下正确加载资源
  plugins: [react()],
  server: {
    port: 5174, // 使用不同的端口，避免与 frontend 冲突
    strictPort: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});

