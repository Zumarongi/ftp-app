// src/electron/server/ftp_server_worker.js
// WorkerThread entry: runs the FTP server (control sockets + PASV data sockets)
const { parentPort } = require('worker_threads');
const net = require('net');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

// Configuration defaults (will be replaced by message from main)
let cfg = {
  port: 2121,
  pasvRange: [30000, 30100],
  rootBase: path.join(os.homedir(), 'ftp-root'),
  usersDb: path.join(process.cwd(), 'ftp_users.db'),
  maxConnections: 50
};

let controlServer = null;
const activeConns = new Set();
const pasvPool = new Set();

function log(level, msg, meta) {
  parentPort.postMessage({ type: 'log', level, msg, meta });
}

function ensureDir(p) {
  try { fs.mkdirSync(p, { recursive: true }); } catch (e) {}
}

function normalizeVirtualPath(userHome, requested) {
  // requested may be absolute or relative
  let p = requested || '/';
  if (!p.startsWith('/')) p = path.posix.join('/', p);
  // map to OS path under userHome
  const resolved = path.resolve(userHome, '.' + p); // '.' avoids stripping leading slash
  // ensure prefix
  if (!resolved.startsWith(userHome)) {
    return userHome;
  }
  return resolved;
}

function allocPasvPort() {
  const [start, end] = cfg.pasvRange;
  for (let p = start; p <= end; ++p) {
    if (!pasvPool.has(p)) {
      pasvPool.add(p);
      return p;
    }
  }
  return null;
}
function freePasvPort(p) { pasvPool.delete(p); }

// Very simple user store using JSON-backed file for worker (main uses sqlite for admin UI).
// Worker will read a users.json exported by main. For robustness, main should send user list in start message.
let usersCache = {}; // username -> { username, passwordHash, home, perms }

parentPort.on('message', async (m) => {
  try {
    if (m.cmd === 'start') {
      cfg = { ...cfg, ...m.cfg };
      if (m.users) {
        usersCache = {};
        for (const u of m.users) {
          usersCache[u.username] = u;
        }
      }
      startServer();
    } else if (m.cmd === 'stop') {
      stopServer();
    } else if (m.cmd === 'reloadUsers' && m.users) {
      usersCache = {};
      for (const u of m.users) usersCache[u.username] = u;
      parentPort.postMessage({ type: 'log', level: 'info', msg: 'users reloaded' });
    }
  } catch (err) {
    parentPort.postMessage({ type: 'error', error: err && err.stack || err.message });
  }
});

function startServer() {
  if (controlServer) return;
  ensureDir(cfg.rootBase);
  controlServer = net.createServer(onControlConnection);
  controlServer.maxConnections = cfg.maxConnections || 50;
  controlServer.listen(cfg.port, () => {
    log('info', `FTP server listening on port ${cfg.port}`);
    parentPort.postMessage({ type: 'started', port: cfg.port });
  });
  controlServer.on('error', (e) => log('error', 'controlServer error: ' + e.message));
}

function stopServer() {
  if (!controlServer) return;
  try {
    controlServer.close();
  } catch (e) {}
  for (const s of Array.from(activeConns)) {
    try { s.destroy(); } catch(e) {}
  }
  activeConns.clear();
  controlServer = null;
  parentPort.postMessage({ type: 'stopped' });
  log('info', 'FTP server stopped');
}

function onControlConnection(socket) {
  activeConns.add(socket);
  const remote = `${socket.remoteAddress}:${socket.remotePort}`;
  socket.setEncoding('utf8');
  socket.write('220 Welcome FTP\r\n');
  let state = {
    user: null,
    userObj: null,
    cwd: '/', // virtual cwd
    pasv: null, // { server, port }
    renameFrom: null,
    type: 'I' // binary default
  };

  log('info', `conn open ${remote}`);

  socket.on('data', async (chunk) => {
    const lines = String(chunk).split(/\r?\n/).filter(Boolean);
    for (let line of lines) {
      handleCommand(line.trim());
    }
  });

  socket.on('close', () => {
    log('info', `conn closed ${remote}`);
    cleanupPasv(state);
    activeConns.delete(socket);
  });

  socket.on('error', (e) => {
    log('warn', `socket error ${remote}: ${e.message}`);
    cleanupPasv(state);
    try { socket.destroy(); } catch(e){}
    activeConns.delete(socket);
  });

  function send(line) {
    socket.write(line + '\r\n');
    parentPort.postMessage({ type: 'ctl', remote, cmd: '<< ' + line });
  }

  async function handleCommand(line) {
    parentPort.postMessage({ type: 'ctl', remote, cmd: '>> ' + line });
    const [cmd, ...rest] = line.split(' ');
    const arg = rest.join('') ? rest.join(' ') : '';
    const up = (cmd || '').toUpperCase();

    try {
      if (up === 'USER') {
        state.user = arg;
        state.userObj = usersCache[arg] || null;
        send(state.userObj ? '331 User OK. Need password' : '530 Unknown user');
      } else if (up === 'PASS') {
        if (!state.user) return send('530 No user specified');
        const uobj = state.userObj;
        if (!uobj) return send('530 Login incorrect');
        // simple compare hash: uobj.passwordHash is bcrypt hash
        const bcrypt = require('bcryptjs');
        if (bcrypt.compareSync(arg, uobj.passwordHash)) {
          // set user's real home under rootBase
          const userHome = path.resolve(cfg.rootBase, uobj.home || uobj.username);
          ensureDir(userHome);
          state.userHome = userHome;
          state.cwd = '/';
          send('230 Login successful');
          parentPort.postMessage({ type:'session', event:'login', user: state.user, remote });
        } else {
          send('530 Login incorrect');
        }
      } else if (up === 'SYST') {
        send('215 UNIX Type: L8');
      } else if (up === 'PWD') {
        send(`257 "${state.cwd}" is current directory`);
      } else if (up === 'CWD') {
        if (!state.userHome) return send('530 Not logged in');
        const target = arg || '/';
        const resolved = normalizeVirtualPath(state.userHome, target);
        // ensure exists and is directory
        try {
          const st = fs.statSync(resolved);
          if (!st.isDirectory()) return send('550 Not a directory');
          // compute virtual path
          let virt = '/' + path.relative(state.userHome, resolved).replace(/\\/g,'/');
          if (virt === '/.') virt = '/';
          state.cwd = virt === '/' ? '/' : virt;
          send('250 Directory changed to ' + state.cwd);
        } catch (e) {
          send('550 Failed to change directory');
        }
      } else if (up === 'TYPE') {
        state.type = arg || 'I';
        send('200 Type set to ' + state.type);
      } else if (up === 'PASV') {
        if (!state.userHome) return send('530 Not logged in');
        cleanupPasv(state);
        const port = allocPasvPort();
        if (!port) return send('421 No PASV ports available');
        const pasvSrv = net.createServer();
        pasvSrv.maxConnections = 1;
        pasvSrv.listen(port, () => {
          const host = socket.localAddress || '127.0.0.1';
          const parts = host.split('.').map(Number);
          const p1 = Math.floor(port / 256);
          const p2 = port % 256;
          const resp = `227 Entering Passive Mode (${parts.join(',')},${p1},${p2})`;
          send(resp);
        });
        pasvSrv.on('connection', (dsock) => {
          parentPort.postMessage({ type: 'data', remote, event: 'pasv-connection', port });
          state.pasv.socket = dsock;
        });
        state.pasv = { server: pasvSrv, port };
      } else if (up === 'LIST') {
        if (!state.userHome) return send('530 Not logged in');
        // prepare data connection
        const listingPath = arg || state.cwd || '/';
        const realPath = normalizeVirtualPath(state.userHome, listingPath);
        send('150 Opening ASCII mode data connection for file list');
        await sendListOverData(state, realPath);
        send('226 Transfer complete');
      } else if (up === 'RETR') {
        if (!state.userHome) return send('530 Not logged in');
        const remote = arg;
        const real = normalizeVirtualPath(state.userHome, remote);
        try {
          const st = fs.statSync(real);
          if (!st.isFile()) return send('550 Not a file');
          send('150 Opening data connection for RETR');
          await sendFileOverData(state, real);
          send('226 Transfer complete');
        } catch (e) {
          send('550 File not found');
        }
      } else if (up === 'STOR') {
        if (!state.userHome) return send('530 Not logged in');
        const remote = arg;
        const real = normalizeVirtualPath(state.userHome, remote);
        send('150 Opening data connection for STOR');
        await receiveFileOverData(state, real);
        send('226 Transfer complete');
      } else if (up === 'MKD') {
        if (!state.userHome) return send('530 Not logged in');
        const real = normalizeVirtualPath(state.userHome, arg);
        try { fs.mkdirSync(real, { recursive: true }); send('257 Directory created'); } catch(e) { send('550 Failed to create'); }
      } else if (up === 'RMD' || up === 'DELE') {
        if (!state.userHome) return send('530 Not logged in');
        const real = normalizeVirtualPath(state.userHome, arg);
        try {
          if (up === 'RMD') fs.rmdirSync(real, { recursive: true });
          else fs.unlinkSync(real);
          send('250 OK');
        } catch (e) { send('550 Failed'); }
      } else if (up === 'RNFR') {
        state.renameFrom = normalizeVirtualPath(state.userHome, arg);
        send('350 RNFR accepted, ready for RNTO');
      } else if (up === 'RNTO') {
        if (!state.renameFrom) return send('503 Bad sequence');
        const to = normalizeVirtualPath(state.userHome, arg);
        try { fs.renameSync(state.renameFrom, to); send('250 Rename successful'); state.renameFrom = null; } catch(e) { send('550 Rename failed'); }
      } else if (up === 'QUIT') {
        send('221 Goodbye');
        socket.end();
      } else {
        send('502 Command not implemented');
      }
    } catch (err) {
      log('error', `command handling error: ${err && err.stack || err}`);
      try { socket.write('451 Internal server error\r\n'); } catch(e){}
    }
  }
}

// helpers for data transfer
function cleanupPasv(state) {
  if (state && state.pasv) {
    try {
      if (state.pasv.socket) { state.pasv.socket.destroy(); state.pasv.socket = null; }
      if (state.pasv.server) { state.pasv.server.close(); }
      freePasvPort(state.pasv.port);
    } catch (e) {}
    state.pasv = null;
  }
}

function sendListOverData(state, realPath) {
  return new Promise((resolve) => {
    if (!state.pasv || !state.pasv.server) return resolve();
    const dsock = state.pasv.socket;
    if (!dsock) {
      // wait for connection for up to 5s
      let waited = 0;
      const iv = setInterval(() => {
        if (state.pasv && state.pasv.socket) {
          clearInterval(iv);
          writeList(state.pasv.socket, realPath, resolve);
        } else if (waited > 5000) {
          clearInterval(iv);
          resolve();
        }
        waited += 200;
      }, 200);
    } else {
      writeList(dsock, realPath, resolve);
    }
  });
}

function writeList(dsock, realPath, cb) {
  // produce simple unix-style listing
  fs.readdir(realPath, { withFileTypes: true }, (err, entries) => {
    if (err) { try { dsock.end(); } catch(e){}; return cb(); }
    let out = '';
    entries.forEach(dirent => {
      const name = dirent.name;
      const full = path.join(realPath, name);
      let stats;
      try { stats = fs.statSync(full); } catch(e) { stats = { size:0, mtime: new Date() }; }
      const perms = dirent.isDirectory() ? 'drwxr-xr-x' : '-rw-r--r--';
      const size = stats.size;
      const mtime = stats.mtime.toISOString().replace('T',' ').slice(0,19);
      out += `${perms} 1 owner group ${size} ${mtime} ${name}\r\n`;
    });
    try { dsock.write(out); dsock.end(); } catch(e){}
    cb();
  });
}

function sendFileOverData(state, realPath) {
  return new Promise((resolve) => {
    if (!state.pasv || !state.pasv.server) return resolve();
    const waitAndSend = () => {
      const dsock = state.pasv.socket;
      if (!dsock) {
        let waited = 0;
        const iv = setInterval(() => {
          if (state.pasv && state.pasv.socket) { clearInterval(iv); doSend(state.pasv.socket); }
          else if (waited > 5000) { clearInterval(iv); resolve(); }
          waited += 200;
        }, 200);
      } else doSend(dsock);
    };
    function doSend(dsock) {
      const rs = fs.createReadStream(realPath);
      rs.on('error', () => { try{ dsock.end(); }catch(e){}; resolve(); });
      rs.on('end', () => { try{ dsock.end(); }catch(e){}; resolve(); });
      rs.pipe(dsock, { end: true });
    }
    waitAndSend();
  });
}

function receiveFileOverData(state, realPath) {
  return new Promise((resolve) => {
    if (!state.pasv || !state.pasv.server) return resolve();
    const dsock = state.pasv.socket;
    if (!dsock) {
      let waited = 0;
      const iv = setInterval(() => {
        if (state.pasv && state.pasv.socket) { clearInterval(iv); doRecv(state.pasv.socket); }
        else if (waited > 5000) { clearInterval(iv); resolve(); }
        waited += 200;
      }, 200);
    } else doRecv(dsock);

    function doRecv(dsock) {
      const ws = fs.createWriteStream(realPath, { flags: 'w' });
      dsock.on('data', (b) => ws.write(b));
      dsock.on('end', () => { ws.end(); resolve(); });
      dsock.on('error', () => { try{ ws.close(); }catch(e){}; resolve(); });
    }
  });
}
