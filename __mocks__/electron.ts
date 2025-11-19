/**
 * Electron Mock for Testing
 */

export const app = {
  getPath: jest.fn((name: string) => {
    if (name === 'userData') {
      return './test-data';
    }
    return './test';
  }),
  whenReady: jest.fn(() => Promise.resolve()),
  on: jest.fn(),
  quit: jest.fn(),
  isPackaged: false,
};

export const ipcMain = {
  on: jest.fn(),
  handle: jest.fn(),
  removeHandler: jest.fn(),
};

export const ipcRenderer = {
  send: jest.fn(),
  on: jest.fn(),
  invoke: jest.fn(() => Promise.resolve()),
  removeListener: jest.fn(),
};

export const BrowserWindow = jest.fn().mockImplementation(() => ({
  loadURL: jest.fn(),
  loadFile: jest.fn(),
  on: jest.fn(),
  webContents: {
    send: jest.fn(),
    on: jest.fn(),
    setWindowOpenHandler: jest.fn(),
  },
  minimize: jest.fn(),
  maximize: jest.fn(),
  unmaximize: jest.fn(),
  close: jest.fn(),
  isMaximized: jest.fn(() => false),
}));

export const contextBridge = {
  exposeInMainWorld: jest.fn(),
};

export const session = {
  fromPartition: jest.fn(() => ({
    webRequest: {
      onHeadersReceived: jest.fn(),
    },
    protocol: {
      interceptFileProtocol: jest.fn(),
    },
  })),
};

export const protocol = {
  registerFileProtocol: jest.fn(),
};
