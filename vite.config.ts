/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 发布到反代域名时端口由 PORT 环境变量注入，本地开发回落到 5173
const injectedPort = Number(
  (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process
    ?.env?.PORT,
);
const port = Number.isFinite(injectedPort) && injectedPort > 0 ? injectedPort : 5173;

export default defineConfig({
  plugins: [react()],
  server: {
    port,
    host: '0.0.0.0',
    allowedHosts: true,
  },
  preview: {
    port,
    host: '0.0.0.0',
    allowedHosts: true,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
