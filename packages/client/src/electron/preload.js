const { contextBridge, ipcRenderer } = require('electron');

const _listeners = {
  progress: new Map(),
  completed: new Map(),
  error: new Map(),
  cancelled: new Map()
};

contextBridge.exposeInMainWorld('electronAPI', {
  test: () => console.log('preload test'),
  createFtpSession: (opts) => ipcRenderer.invoke('ftp:createSession', opts),
  ftpList: (opts) => ipcRenderer.invoke('ftp:list', opts),
  ftpDownload: (opts) => ipcRenderer.invoke('ftp:download', opts),
  selectDownloadDir: () => ipcRenderer.invoke('dialog:selectDownloadDir'),
  ftpUpload: (opts) => ipcRenderer.invoke('ftp:upload', opts),
  selectUploadFile: () => ipcRenderer.invoke('dialog:selectUploadFile'),
  ftpMkdir: (opts) => ipcRenderer.invoke('ftp:mkdir', opts),
  ftpRemove: (opts) => ipcRenderer.invoke('ftp:remove', opts),
  ftpRename: (opts) => ipcRenderer.invoke('ftp:rename', opts),
  ftpCancel: (opts) => ipcRenderer.invoke('ftp:cancelTask', opts),
  closeSession: (opts) => ipcRenderer.invoke('ftp:closeSession', opts),
  showSaveDialog: (opts) => ipcRenderer.invoke('dialog:showSave', opts),
  openPath: (p) => ipcRenderer.invoke('shell:openPath', p),
  onProgress: (cb) => {
    const wrapper = (_, data) => cb(data);
    _listeners.progress.set(cb, wrapper);
    ipcRenderer.on('ftp:progress', wrapper);
  },
  offProgress: (cb) => {
    const wrapper = _listeners.progress.get(cb);
    if (wrapper) {
      ipcRenderer.removeListener('ftp:progress', wrapper);
      _listeners.progress.delete(cb);
    }
  },
  onCompleted: (cb) => {
    const wrapper = (_, data) => cb(data);
    _listeners.completed.set(cb, wrapper);
    ipcRenderer.on('ftp:completed', wrapper);
  },
  offCompleted: (cb) => {
    const wrapper = _listeners.completed.get(cb);
    if (wrapper) {
      ipcRenderer.removeListener('ftp:completed', wrapper);
      _listeners.completed.delete(cb);
    }
  },
  onError: (cb) => {
    const wrapper = (_, data) => cb(data);
    _listeners.error.set(cb, wrapper);
    ipcRenderer.on('ftp:error', wrapper);
  },
  offError: (cb) => {
    const wrapper = _listeners.error.get(cb);
    if (wrapper) {
      ipcRenderer.removeListener('ftp:error', wrapper);
      _listeners.error.delete(cb);
    }
  },
  onCancelled: (cb) => {
    const wrapper = (_, data) => cb(data);
    _listeners.cancelled.set(cb, wrapper);
    ipcRenderer.on('ftp:cancelled', wrapper);
  },
  offCancelled: (cb) => {
    const wrapper = _listeners.cancelled.get(cb);
    if (wrapper) {
      ipcRenderer.removeListener('ftp:cancelled', wrapper);
      _listeners.cancelled.delete(cb);
    }
  }
});
