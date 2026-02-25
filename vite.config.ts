import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalizedId = id.replace(/\\/g, '/');
          if (!normalizedId.includes('/node_modules/')) {
            return undefined;
          }

          if (
            normalizedId.includes('/prosemirror-') ||
            normalizedId.includes('/@lezer/') ||
            normalizedId.includes('/orderedmap/') ||
            normalizedId.includes('/rope-sequence/') ||
            normalizedId.includes('/w3c-keyname/') ||
            normalizedId.includes('/crelt/')
          ) {
            return 'vendor-editor-core';
          }

          if (normalizedId.includes('/@tiptap/')) {
            return 'vendor-tiptap';
          }

          if (
            normalizedId.includes('/react/') ||
            normalizedId.includes('/react-dom/') ||
            normalizedId.includes('/scheduler/')
          ) {
            return 'vendor-react';
          }

          if (normalizedId.includes('/@tauri-apps/')) {
            return 'vendor-tauri';
          }

          if (normalizedId.includes('/lucide-react/')) {
            return 'vendor-icons';
          }

          if (normalizedId.includes('/turndown/') || normalizedId.includes('/entities/')) {
            return 'vendor-text';
          }

          if (
            normalizedId.includes('/@babel/runtime/') ||
            normalizedId.includes('/nanoid/') ||
            normalizedId.includes('/@jridgewell/') ||
            normalizedId.includes('/@esbuild/') ||
            normalizedId.includes('/csstype/')
          ) {
            return 'vendor-runtime';
          }

          return 'vendor-misc';
        },
      },
    },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
  envPrefix: ['VITE_', 'TAURI_'],
});
