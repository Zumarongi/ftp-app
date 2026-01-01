const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { Worker } = require('worker_threads');
const sqlite3 = require('sqlite3');
const bcrypt = require('bcryptjs');

app.disableHardwareAcceleration();

const dbPath = path.join(process.cwd(), 'ftp_users.db');
const db = new sqlite3.Database(dbPath);

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

async function initDB() {
  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      passwordHash TEXT,
      home TEXT,
      perms INTEGER DEFAULT 31
    )
  `);

  const row = await get('SELECT COUNT(*) AS c FROM users');
  if (row.c === 0) {
    const pass = bcrypt.hashSync('password', 10);
    await run(
      'INSERT INTO users(username,passwordHash,home,perms) VALUES(?,?,?,?)',
      ['admin', pass, 'admin_home', 31]
    );
  }
}

// read package-level .env for server defaults (optional)
let envRootBase;
try {
  const envPath = path.join(__dirname, '..', '..', '.env');
  if (fs.existsSync(envPath)) {
    const txt = fs.readFileSync(envPath, 'utf8');
    txt.split(/\r?\n/).forEach(line => {
      line = line.trim();
      if (!line || line.startsWith('#')) return;
      const idx = line.indexOf('=');
      if (idx === -1) return;
      const key = line.slice(0, idx).trim();
      let val = line.slice(idx + 1).trim();
      if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
      if (key === 'ROOT_BASE') envRootBase = val;
    });
  }
} catch (e) {
  console.error('Failed to read server .env', e && e.message);
}

let mainWindow = null;
let ftpWorker = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(async () => {
  await initDB();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

async function startFtpServer(config = {}) {
  if (ftpWorker) return;
  const users = await all('SELECT username,passwordHash,home,perms FROM users');
  const workerPath = path.join(__dirname, 'ftpServer.js');
  ftpWorker = new Worker(workerPath);
  ftpWorker.on('message', (msg) => {
    try { console.log('[ftpWorker]', typeof msg === 'object' ? JSON.stringify(msg) : String(msg)); } catch (e) {}
    if (!mainWindow) return;
    if (msg.type === 'log') mainWindow.webContents.send('server:log', msg);
    else if (msg.type === 'started') mainWindow.webContents.send('server:started', msg);
    else if (msg.type === 'stopped') mainWindow.webContents.send('server:stopped', msg);
    else mainWindow.webContents.send('server:event', msg);
  });
  ftpWorker.on('error', (err) => { if (mainWindow) mainWindow.webContents.send('server:error', { error: err.message }); });
  const cfgToSend = { ...config };
  if (!cfgToSend.rootBase && envRootBase) cfgToSend.rootBase = envRootBase;
  ftpWorker.postMessage({ cmd: 'start', cfg: cfgToSend, users });
}

function stopFtpServer() {
  if (!ftpWorker) return;
  ftpWorker.postMessage({ cmd: 'stop' });
  ftpWorker.terminate();
  ftpWorker = null;
}

ipcMain.handle('server:start', async (_, cfg) => { startFtpServer(cfg); return { ok: true }; });

ipcMain.handle('server:stop', async () => { stopFtpServer(); return { ok: true }; });

ipcMain.handle('server:listUsers', async () => {
  const users = await all('SELECT id, username, home, perms FROM users');
  return { users };
});

function validateUsername(username) {
  return typeof username === 'string'
    && /^[a-zA-Z][a-zA-Z0-9_-]{2,31}$/.test(username);
}

function validateHome(home) {
  return typeof home === 'string'
    && /^[a-zA-Z0-9_-]+$/.test(home)
}

ipcMain.handle('server:addUser', async (_, { username, password, home, perms = 31 }) => {
  try {
    if (!validateUsername(username)) return { ok: false, error: 'Invalid username' };
    if (!password) return { ok: false, error: 'Password required' };

    home = username;
    if (!validateHome(home)) return { ok: false, error: 'Invalid home' };

    const hash = bcrypt.hashSync(password, 10);
    await run('INSERT INTO users(username,passwordHash,home,perms) VALUES(?,?,?,?)',[username, hash, home, perms]);
    const users = await all('SELECT username,passwordHash,home,perms FROM users');
    ftpWorker?.postMessage({ cmd: 'reloadUsers', users });
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('server:updateUser', async (_, { username, password, home, perms }) => {
  try {
    if (!validateUsername(username)) return { ok: false, error: 'Invalid username' };
    const existing = await all('SELECT home FROM users WHERE username = ?', [username]);
    if (!existing) return { ok: false, error: 'User not found' };
    if (password) {
      const hash = bcrypt.hashSync(password, 10);
      await run('UPDATE users SET passwordHash=?, perms=? WHERE username=?', [hash, perms, username]);
    } else {
      await run('UPDATE users SET perms=? WHERE username=?', [perms, username]);
    }
    const users = await all('SELECT username,passwordHash,home,perms FROM users');
    ftpWorker?.postMessage({ cmd: 'reloadUsers', users });
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message };} }
);

ipcMain.handle('server:removeUser', async (_, { username }) => {
  await run('DELETE FROM users WHERE username = ?', [username]);
  if (ftpWorker) {
    const users = await all('SELECT username,passwordHash,home,perms FROM users');
    ftpWorker.postMessage({ cmd: 'reloadUsers', users });
  }
  return { ok: true };
});

ipcMain.handle('server:dbPath', async () => ({ path: dbPath }));