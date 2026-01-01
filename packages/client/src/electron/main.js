const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');

// Disable GPU/Hardware acceleration to avoid GPU process initialization errors
try { app.disableHardwareAcceleration(); } catch (e) { /* ignore */ }
const path = require('path');
const fs = require('fs');
const os = require('os');
const FtpClient = require('./ftpClient');

const sessions = new Map(); // sessionId -> client
const tasks = new Map(); // taskId -> { status, ... }
const taskControllers = new Map(); // taskId -> AbortController

function makeId(prefix = '') {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2,8);
}

function createMainWindow() {
  const win = new BrowserWindow({
    width: 1200, height: 760,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (process.env.NODE_ENV === 'development') {
    const devUrl = process.env.ELECTRON_RENDERER_URL || 'http://localhost:5174';
    win.loadURL(devUrl);
    // win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(createMainWindow);

// IPC: create session
ipcMain.handle('ftp:createSession', async (_, { host, port=21, user='anonymous', pass='', secure=false, timeout } ) => {
  const client = new FtpClient();
  try {
    await client.connect({ host, port, user, pass, secure, timeout });
  } catch (err) {
    throw new Error(`连接 FTP 主机失败: ${err && err.message ? err.message : String(err)}`);
  }
  const sessionId = makeId('s');
  sessions.set(sessionId, client);
  return { sessionId };
});

// IPC: list
ipcMain.handle('ftp:list', async (_, { sessionId, path='' }) => {
  const client = sessions.get(sessionId);
  if (!client) throw new Error('Invalid sessionId');
  const list = await client.list(path);
  return { list };
});

// IPC: download
ipcMain.handle('ftp:download', async (_, { sessionId, remotePath, localPath }) => {
  const client = sessions.get(sessionId);
  if (!client) throw new Error('Invalid sessionId');
  
  const base = path.basename(remotePath);
  if (!localPath) {
    const downloads = path.join(os.homedir(), 'ftpDownloads');
    localPath = path.join(downloads, base);
  } else { localPath = path.join(localPath, base); }

  const dir = path.dirname(localPath);
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (err) { throw new Error(`无法创建下载目录: ${dir}, ${err.message}`); }

  const taskId = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  // 保存任务状态
  tasks.set(taskId, { sessionId, remotePath, localPath, status: 'running', bytes: 0, total: undefined });
  console.log(`Starting download task ${taskId}: ${remotePath} -> ${localPath}`);

  // 用于取消
  const controller = new AbortController();
  taskControllers.set(taskId, controller);

  const sendAll = (channel, payload) => { BrowserWindow.getAllWindows().forEach(w => w.webContents.send(channel, payload)); };

  // progress 处理
  const progressHandler = (p) => {
    const task = tasks.get(taskId);
    if (!task) return;

    const next = {
      ...task,
      bytes: p.bytes,
      total: p.total
    };
    tasks.set(taskId, next);

    alert("Sending progress", {
      taskId,
      remotePath,
      localPath,
      bytes: p.bytes,
      total: p.total
    });

    sendAll('ftp:progress', {
      taskId,
      remotePath,
      localPath,
      bytes: p.bytes,
      total: p.total
    });
  };

  client.on('progress', progressHandler);

  try {
    await client.download(remotePath, localPath, { signal: controller.signal });
    tasks.set(taskId, { ...tasks.get(taskId), status: 'completed' });
    sendAll('ftp:completed', { taskId, remotePath, localPath });
  } catch (err) {
    if (controller.signal.aborted) {
      tasks.set(taskId, {
        ...tasks.get(taskId),
        status: 'cancelled'
      });

      sendAll('ftp:cancelled', { taskId });
    } else {
      tasks.set(taskId, {
        ...tasks.get(taskId),
        status: 'error',
        error: err.message
      });

      sendAll('ftp:error', { taskId, error: err.message });
    }
  } finally {
    client.removeListener('progress', progressHandler);
    taskControllers.delete(taskId);
  }

  return { taskId, localPath };
});

ipcMain.handle('ftp:cancel', (_, { taskId }) => {
  const controller = taskControllers.get(taskId);
  if (controller) {
    controller.abort();
    taskControllers.delete(taskId);
  }
});

// IPC: select download directory
ipcMain.handle('dialog:selectDownloadDir', async () => {
  const result = await dialog.showOpenDialog({
    title: '选择下载位置',
    properties: ['openDirectory', 'createDirectory']
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true };
  }
  return { canceled: false, path: result.filePaths[0] };
});

// IPC: upload
ipcMain.handle('ftp:upload', async (_, { sessionId, localPath, remotePath }) => {
  const client = sessions.get(sessionId);
  if (!client) throw new Error('Invalid sessionId');
  if (!remotePath) remotePath = path.basename(localPath);
  const taskId = Date.now().toString(36) + Math.random().toString(36).slice(2,8);
  tasks.set(taskId, { sessionId, remotePath, localPath, status: 'running' });

  const progressHandler = (p) => {
    BrowserWindow.getAllWindows().forEach(w => w.webContents.send('ftp:progress', { taskId, ...p }));
  };
  client.on('progress', progressHandler);

  try {
    await client.upload(localPath, remotePath);
    tasks.set(taskId, { ...tasks.get(taskId), status: 'done' });
    BrowserWindow.getAllWindows().forEach(w => w.webContents.send('ftp:completed', { taskId }));
  } catch (err) {
    tasks.set(taskId, { ...tasks.get(taskId), status: 'error', error: err.message });
    BrowserWindow.getAllWindows().forEach(w => w.webContents.send('ftp:error', { taskId, error: err.message }));
  } finally {
    client.removeListener('progress', progressHandler);
  }

  return { taskId };
});

ipcMain.handle('dialog:selectUploadFile', async () => {
  const result = await dialog.showOpenDialog({
    title: '选择要上传的文件',
    properties: ['openFile']
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true };
  }
  const filePath = result.filePaths[0];
  return { canceled: false, filePath, fileName: path.basename(filePath) };
});

// IPC: cancel
ipcMain.handle('ftp:cancelTask', async (_, { taskId }) => {
  const t = tasks.get(taskId);
  if (!t) return { ok: false, msg: 'no such task' };
  if (t.cancelFn) {
    await t.cancelFn();
    return { ok: true };
  }
  return { ok: false, msg: 'cannot cancel' };
});

// IPC: close session
ipcMain.handle('ftp:closeSession', async (_, { sessionId }) => {
  const client = sessions.get(sessionId);
  if (client) {
    await client.quit().catch(()=>{});
    sessions.delete(sessionId);
  }
  return { ok: true };
});

// IPC: make directory
ipcMain.handle('ftp:mkdir', async (_, { sessionId, remotePath }) => {
  const client = sessions.get(sessionId);
  if (!client) throw new Error('Invalid sessionId');
  return await client.makeDir(remotePath);
});

// IPC: remove file or directory
ipcMain.handle('ftp:remove', async (_, { sessionId, remotePath, isDir=false }) => {
  const client = sessions.get(sessionId);
  if (!client) throw new Error('Invalid sessionId');
  return await client.remove(remotePath, isDir);
});

// IPC: rename
ipcMain.handle('ftp:rename', async (_, { sessionId, oldPath, newPath }) => {
  const client = sessions.get(sessionId);
  if (!client) throw new Error('Invalid sessionId');
  return await client.rename(oldPath, newPath);
});

// Optionally expose dialog for save-as
ipcMain.handle('dialog:showSave', async (_, options) => {
  const win = BrowserWindow.getAllWindows()[0];
  const res = await dialog.showSaveDialog(win, options);
  return res;
});

ipcMain.handle('shell:openPath', async (_, p) => {
  dir = path.dirname(p)
  shell.showItemInFolder(dir)
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
