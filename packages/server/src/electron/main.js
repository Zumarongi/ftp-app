const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const os = require('os');
const { Worker } = require('worker_threads');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

app.disableHardwareAcceleration();

const dbPath = path.join(process.cwd(), 'ftp_users.db');
const db = new Database(dbPath);

db.prepare(`CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  username TEXT UNIQUE,
  passwordHash TEXT,
  home TEXT,
  perms INTEGER DEFAULT 31
)`).run();

// seed default admin
const rowcount = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
if (rowcount === 0) {
  const pass = bcrypt.hashSync('password', 10);
  db.prepare('INSERT INTO users(username,passwordHash,home,perms) VALUES(?,?,?,?)').run('admin', pass, 'admin_home', 31);
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
    // mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

function startFtpServer(config = {}) {
  if (ftpWorker) return;
  const users = db.prepare('SELECT username,passwordHash,home,perms FROM users').all();
  // worker file lives next to this main file (ftpServer.js)
  const workerPath = path.join(__dirname, 'ftpServer.js');
  ftpWorker = new Worker(workerPath);
  ftpWorker.on('message', (msg) => {
    if (!mainWindow) return;
    if (msg.type === 'log') mainWindow.webContents.send('server:log', msg);
    else if (msg.type === 'started') mainWindow.webContents.send('server:started', msg);
    else if (msg.type === 'stopped') mainWindow.webContents.send('server:stopped', msg);
    else mainWindow.webContents.send('server:event', msg);
  });
  ftpWorker.on('error', (err) => { if (mainWindow) mainWindow.webContents.send('server:error', { error: err.message }); });
  ftpWorker.postMessage({ cmd: 'start', cfg: config, users });
}

function stopFtpServer() {
  if (!ftpWorker) return;
  ftpWorker.postMessage({ cmd: 'stop' });
  ftpWorker.terminate();
  ftpWorker = null;
}

ipcMain.handle('server:start', async (_, cfg) => { startFtpServer(cfg); return { ok: true }; });

ipcMain.handle('server:stop', async () => { stopFtpServer(); return { ok: true }; });

ipcMain.handle('server:listUsers', async () => { const rows = db.prepare('SELECT id,username,home,perms FROM users').all(); return { users: rows }; });

function validateUsername(username) {
  return typeof username === 'string'
    && /^[a-zA-Z][a-zA-Z0-9_-]{2,31}$/.test(username);
}

function validateHome(home) {
  return typeof home === 'string'
    && /^[a-zA-Z0-9_-]+$/.test(home)
    && !home.includes('..');
}

ipcMain.handle('server:addUser', async (_, { username, password, home, perms = 31 }) => {
  try {
    if (!validateUsername(username)) return { ok: false, error: 'Invalid username' };
    if (!password) return { ok: false, error: 'Password required' };

    home = username;
    if (!validateHome(home)) return { ok: false, error: 'Invalid home' };

    const hash = bcrypt.hashSync(password, 10);
    db.prepare('INSERT INTO users(username,passwordHash,home,perms) VALUES(?,?,?,?)').run(username, hash, home, perms);
    const users = db.prepare('SELECT username,passwordHash,home,perms FROM users').all();
    ftpWorker?.postMessage({ cmd: 'reloadUsers', users });
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('server:removeUser', async (_, { username }) => {
  db.prepare('DELETE FROM users WHERE username = ?').run(username);
  if (ftpWorker) {
    const users = db.prepare('SELECT username,passwordHash,home,perms FROM users').all();
    ftpWorker.postMessage({ cmd: 'reloadUsers', users });
  }
  return { ok: true };
});

ipcMain.handle('server:updateUser', async (_, { username, password, home, perms }) => {
  try {
    if (!validateUsername(username)) return { ok: false, error: 'Invalid username' };
    const existing = db.prepare('SELECT home FROM users WHERE username = ?').get(username);
    if (!existing) return { ok: false, error: 'User not found' };
    if (password) {
      const hash = bcrypt.hashSync(password, 10);
      db.prepare('UPDATE users SET passwordHash=?, perms=? WHERE username=?').run(hash, perms, username);
    } else {
      db.prepare('UPDATE users SET perms=? WHERE username=?').run(perms, username);
    }
    const users = db.prepare('SELECT username,passwordHash,home,perms FROM users').all();
    ftpWorker?.postMessage({ cmd: 'reloadUsers', users });
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message };} }
);

ipcMain.handle('server:dbPath', async () => ({ path: dbPath }));