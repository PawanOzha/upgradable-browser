import { defineConfig, loadEnv } from 'vite'
import path from 'node:path'
import electron from 'vite-plugin-electron/simple'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [
      react(),
      tailwindcss(),
      electron({
        main: {
          // Shortcut of `build.lib.entry`.
          entry: 'electron/main.ts',
          vite: {
            define: {
              // Only inject non-VITE_ prefixed credentials into main process
              // VITE_ prefixed vars are automatically exposed to renderer, which is insecure
              'process.env.CPANEL_API_TOKEN': JSON.stringify(env.CPANEL_API_TOKEN),
              'process.env.CPANEL_USERNAME': JSON.stringify(env.CPANEL_USERNAME),
            },
            build: {
              rollupOptions: {
                external: ['better-sqlite3', 'ws', 'bufferutil', 'utf-8-validate'],
              },
            },
          },
        },
      preload: {
        // Shortcut of `build.rollupOptions.input`.
        // Preload scripts may contain Web assets, so use the `build.rollupOptions.input` instead `build.lib.entry`.
        input: path.join(__dirname, 'electron/preload-secure.ts'),
      },
        // Ployfill the Electron and Node.js API for Renderer process.
        // If you want use Node.js in Renderer process, the `nodeIntegration` needs to be enabled in the Main process.
        // See 👉 https://github.com/electron-vite/vite-plugin-electron-renderer
        renderer: process.env.NODE_ENV === 'test'
          // https://github.com/electron-vite/vite-plugin-electron-renderer/issues/78#issuecomment-2053600808
          ? undefined
          : {},
      }),
    ],
  }
})
