import { ipcRenderer, contextBridge } from 'electron'

// --------- Expose some API to the Renderer process ---------
contextBridge.exposeInMainWorld('ipcRenderer', {
  on(...args: Parameters<typeof ipcRenderer.on>) {
    const [channel, listener] = args
    return ipcRenderer.on(channel, (event, ...args) => listener(event, ...args))
  },
  off(...args: Parameters<typeof ipcRenderer.off>) {
    const [channel, ...omit] = args
    return ipcRenderer.off(channel, ...omit)
  },
  send(...args: Parameters<typeof ipcRenderer.send>) {
    const [channel, ...omit] = args
    return ipcRenderer.send(channel, ...omit)
  },
  invoke(...args: Parameters<typeof ipcRenderer.invoke>) {
    const [channel, ...omit] = args
    return ipcRenderer.invoke(channel, ...omit)
  },

  // You can expose other APTs you need here.
  // ...
})

contextBridge.exposeInMainWorld('windowControls', {
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
})


// Database API
contextBridge.exposeInMainWorld('database', {
  saveSequence: (name: string, tasks: any[]) => ipcRenderer.invoke('db:save-sequence', name, tasks),
  loadSequence: (name: string) => ipcRenderer.invoke('db:load-sequence', name),
  getAllSequences: () => ipcRenderer.invoke('db:get-all-sequences'),
  deleteSequence: (name: string) => ipcRenderer.invoke('db:delete-sequence', name),
});

// Webview Automation API (these will be executed on the active webview)
contextBridge.exposeInMainWorld('webviewAPI', {
  search: (query: string) => ipcRenderer.invoke('webview:search', query),
  find: (selector: string) => ipcRenderer.invoke('webview:find', selector),
  click: (selector: string) => ipcRenderer.invoke('webview:click', selector),
  extractDOM: () => ipcRenderer.invoke('webview:extract-dom'),
  scroll: (y: number) => ipcRenderer.invoke('webview:scroll', y),
  execute: (code: string) => ipcRenderer.invoke('webview:execute', code),
});