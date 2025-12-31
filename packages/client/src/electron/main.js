const { app, BrowserWindow, ipcMain, dialog } = require('electron');

// Disable GPU/Hardware acceleration to avoid GPU process initialization errors
try { app.disableHardwareAcceleration(); } catch (e) { /* ignore */ }
const path = require('path');
const fs = require('fs');
const os = require('os');
const FtpClient = require('./ftpClient');

const sessions = new Map(); // sessionId -> client
const tasks = new Map(); // taskId -> { status, ... }

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
    win.webContents.openDevTools();
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
    // provide clearer error message upstream
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

  if (!localPath) { // default to ~/Downloads/<basename>
    const base = path.basename(remotePath);
    const downloads = path.join(os.homedir(), 'ftpDownloads');
    localPath = path.join(downloads, base);
  }

  const dir = path.dirname(localPath);
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (err) {
    throw new Error(`无法创建下载目录: ${dir}, ${err.message}`);
  }
  
  const taskId = Date.now().toString(36) + Math.random().toString(36).slice(2,8);
  tasks.set(taskId, { sessionId, remotePath, localPath, status: 'running' });

  const progressHandler = (p) => {
    BrowserWindow.getAllWindows().forEach(w => w.webContents.send('ftp:progress', { taskId, ...p }));
  };
  client.on('progress', progressHandler);

  try {
    await client.download(remotePath, localPath);
    tasks.set(taskId, { ...tasks.get(taskId), status: 'done' });
    BrowserWindow.getAllWindows().forEach(w => w.webContents.send('ftp:completed', { taskId }));
  } catch (err) {
    tasks.set(taskId, { ...tasks.get(taskId), status: 'error', error: err.message });
    BrowserWindow.getAllWindows().forEach(w => w.webContents.send('ftp:error', { taskId, error: err.message }));
  } finally {
    client.removeListener('progress', progressHandler);
  }

  return { taskId, localPath };
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

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
