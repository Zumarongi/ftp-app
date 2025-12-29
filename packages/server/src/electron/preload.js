const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('serverAPI', {
  start: (cfg) => ipcRenderer.invoke('server:start', cfg),
  stop: () => ipcRenderer.invoke('server:stop'),
  addUser: (user) => ipcRenderer.invoke('server:addUser', user),
  listUsers: () => ipcRenderer.invoke('server:listUsers'),
  removeUser: (u) => ipcRenderer.invoke('server:removeUser', u),
  onLog: (cb) => ipcRenderer.on('server:log', (_, data) => cb(data)),
  onEvent: (cb) => ipcRenderer.on('server:event', (_, data) => cb(data)),
  onStarted: (cb) => ipcRenderer.on('server:started', (_, data) => cb(data)),
  onStopped: (cb) => ipcRenderer.on('server:stopped', (_, data) => cb(data))
});
