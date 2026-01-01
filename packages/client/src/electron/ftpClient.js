const ftp = require("basic-ftp");
const fs = require("fs");
const EventEmitter = require('events');

class FtpClient extends EventEmitter {
  constructor() {
    super();
    this.client = new ftp.Client();
    this.client.ftp.verbose = true;
    this._progressHandler = null;
    this.client.ftp.timeout = 15000;
  }

  async connect({ host, port = 21, user = "anonymous", pass = "", secure = false, timeout } = {}) {
    if (typeof timeout === 'number' && timeout > 0) this.client.ftp.timeout = timeout;
    try {
      await this.client.access({ host, port, user, password: pass, secure });
    } catch (err) { throw err; }
  }

  async list(remotePath = "") {
    const raw = await this.client.list(remotePath);
    return raw.map(e => ({
      name: e.name,
      size: e.size,
      type: e.type,
      rawModifiedAt: e.rawModifiedAt,
      isDir: e.type === 'd' || e.type === 'D' || !!e.isDirectory,
      raw: e
    }));
  }

  async makeDir(remotePath) {
    try {
      await this.client.send(`MKD ${remotePath}`);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  async remove(remotePath, isDir = false) {
    try {
      if (isDir) {
        // remove directory (non-recursive). If recursive needed, callers should list contents first.
        if (typeof this.client.removeDir === 'function') {
          await this.client.removeDir(remotePath);
        } else {
          await this.client.send(`RMD ${remotePath}`);
        }
      } else {
        await this.client.remove(remotePath);
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  async rename(oldPath, newPath) {
    try {
      await this.client.rename(oldPath, newPath);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  async size(remotePath) {
    try {
      return await this.client.size(remotePath);
    } catch (err) {
      return undefined;
    }
  }

  /**
   * Download file with optional resume
   * @param {string} remotePath
   * @param {string} localPath
   * @param {object} opts { resume: boolean, onProgress: fn(info) }
   */
  async download(remotePath, localPath, opts = {}) {
    const { resume = true, onProgress, signal } = opts;
    const remoteSize = await this.size(remotePath).catch(() => undefined);
    let startAt = 0;

    if (resume && fs.existsSync(localPath)) {
      try {
        startAt = fs.statSync(localPath).size;
      } catch {}
    }

    if (remoteSize !== undefined && startAt >= remoteSize) {
      return { skipped: true };
    }

    const progressHandler = info => {
      onProgress?.({
        bytes: info.bytesOverall,
        total: remoteSize
      });
    };

    this.client.trackProgress(progressHandler);

    try {
      if (signal) {
        signal.addEventListener('abort', () => {
          this.client.close();
        });
      }
      await this.client.downloadTo(localPath, remotePath, startAt);
      return { ok: true };
    } finally {
      this.client.trackProgress();
    }
  }

  async upload(localPath, remotePath, opts = {}) {
    const { onProgress } = opts;
    try {
      if (typeof onProgress === "function") {
        this._progressHandler = info => {
          const ev = { name: info.name, type: info.type, bytes: info.bytes, bytesOverall: info.bytesOverall };
          this.emit('progress', ev);
          try { onProgress(ev); } catch (e) {}
        };
        this.client.trackProgress(this._progressHandler);
      } else {
        this.client.trackProgress();
      }

      await this.client.uploadFrom(localPath, remotePath);
      return { ok: true };
    } finally {
      try { this.client.trackProgress(); } catch (e) {}
      this._progressHandler = null;
    }
  }

  async close() {
    try {
      await this.client.close();
    } catch (e) {
      // ignore
    }
  }

  // Force-abort: closes underlying control socket -> transfer will error/stop
  async abort() {
    try {
      await this.client.close();
    } catch (e) {}
  }

  // legacy alias used by rest of the codebase
  async quit() { return this.close(); }
}

module.exports = FtpClient;
