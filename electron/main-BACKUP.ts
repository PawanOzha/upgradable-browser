import { app, BrowserWindow, ipcMain } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { initializeDatabase, saveSequence, loadSequence, getAllSequences, deleteSequence } from '../db/database'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// The built directory structure
//
// ├─┬─┬ dist
// │ │ └── index.html
// │ │
// │ ├─┬ dist-electron
// │ │ ├── main.js
// │ │ └── preload.mjs
// │
process.env.APP_ROOT = path.join(__dirname, '..')

// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

let win: BrowserWindow | null

function createWindow() {
  win = new BrowserWindow({
    width: 900,
    height: 600,
    frame: false,
    icon: path.join(process.env.VITE_PUBLIC, 'electron-vite.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true, // Enable webview tag
    },
  })

  // Test active push message to Renderer-process.
  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', (new Date).toLocaleString())
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    // win.loadFile('dist/index.html')
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}


ipcMain.on('window-minimize', () => {
  if (win) {
    win.minimize()
  }
})

ipcMain.on('window-maximize', () => {
  if (win) {
    if (win.isMaximized()) {
      win.unmaximize()
    } else {
      win.maximize()
    }
  }
})

ipcMain.on('window-close', () => {
  if (win) {
    win.close()
  }
})



// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
  



  
})
// ==================== Database IPC Handlers ====================
ipcMain.handle('db:save-sequence', async (_event, name: string, tasks: any[]) => {
  try {
    const id = saveSequence(name, tasks);
    return { success: true, id };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db:load-sequence', async (_event, name: string) => {
  try {
    const sequence = loadSequence(name);
    return { success: true, sequence };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db:get-all-sequences', async () => {
  try {
    const sequences = getAllSequences();
    return { success: true, sequences };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('db:delete-sequence', async (_event, name: string) => {
  try {
    const changes = deleteSequence(name);
    return { success: true, changes };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

// ==================== Webview Automation Handlers ====================
// These handlers will execute actions on the ACTIVE WEBVIEW, not the main window

// Execute JavaScript in the focused webview
ipcMain.handle('webview:execute', async (_event, _code: string) => {
  try {
    // The renderer will send this after injecting the code into webview
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

// Search web (navigate to search engine with query)
ipcMain.handle('webview:search', async (_event, query: string) => {
  try {
    const searchURL = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
    return { success: true, url: searchURL };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

// Find element by selector or text using findInPage (Ctrl+F style)
ipcMain.handle('webview:find', async (_event, text: string, findNext = false) => {
  try {
    if (!win) {
      return { success: false, error: 'Window not available' };
    }

    // Get the active webview - we need to find it in the renderer
    // For now, we'll return success and let the renderer handle findInPage on the webview
    return { success: true, text, findNext };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

// Stop find in page
ipcMain.handle('webview:stopFind', async (_event, action: 'clearSelection' | 'keepSelection') => {
  try {
    return { success: true, action };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

// Click element
ipcMain.handle('webview:click', async (_event, selector: string) => {
  try {
    return { success: true, selector };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

// Extract DOM content
ipcMain.handle('webview:extract-dom', async (_event) => {
  try {
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});

// Scroll page
ipcMain.handle('webview:scroll', async (_event, y: number) => {
  try {
    return { success: true, y };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
});


app.whenReady().then(() => {
  initializeDatabase();
  createWindow();
})
