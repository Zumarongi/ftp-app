const { contextBridge, ipcRenderer } = require('electron');

// 仅暴露必要的、受控的 API 到渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  send: (channel, ...args) => {
    // 你可以在这里白名单 channel 名称以增强安全性
    ipcRenderer.send(channel, ...args);
  },
  on: (channel, listener) => {
    ipcRenderer.on(channel, listener);
  },
});
