const ftp = require("basic-ftp");
const fs = require("fs");
const EventEmitter = require('events');

class FtpClient extends EventEmitter {
  constructor() {
    super();
    this.client = new ftp.Client(); // default timeout ~ 0 (infinite) - you can set client.ftp.timeout
    this.client.ftp.verbose = true;
    this._progressHandler = null;
    // sensible default timeout for control operations (ms)
    this.client.ftp.timeout = 15000;
  }

  async connect({ host, port = 21, user = "anonymous", pass = "", secure = false, timeout } = {}) {
    // allow caller to override control socket timeout (ms)
    if (typeof timeout === 'number' && timeout > 0) this.client.ftp.timeout = timeout;
    try {
      await this.client.access({
        host,
        port,
        user,
        password: pass,
        secure
      });
    } catch (err) {
      // rethrow to let callers handle and add context if needed
      throw err;
    }
  }

  async list(remotePath = "") {
    // returns array of objects {name, size, type, rawModifiedAt, owner,...}
    // console.log('FtpClient.list', remotePath);
    const raw = await this.client.list(remotePath);
    // normalize entries to include `isDir` boolean and `path` if possible
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
    // basic-ftp provides send/ensureDir; use send MKD to create single dir
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
    const { resume = true, onProgress } = opts;

    console.log('FtpClient.download', { remotePath, localPath });

    const remoteSize = await this.size(remotePath).catch(()=>undefined);
    let startAt = 0;

    // If file exists and resume requested, use existing size
    if (resume && fs.existsSync(localPath)) {
      try {
        const st = fs.statSync(localPath);
        startAt = st.size;
      } catch (e) {
        startAt = 0;
      }
    }

    if (remoteSize !== undefined && startAt >= remoteSize) {
      // already downloaded
      return { ok: true, skipped: true, localPath, remoteSize };
    }

    // install progress handler
    try {
      if (typeof onProgress === "function") {
        // trackProgress will call with { name, type, bytes, bytesOverall }
        this._progressHandler = info => {
          // emit progress event for consumers and call optional callback
          const ev = {
            name: info.name,
            type: info.type, // 'download'|'upload'|'list'
            bytes: info.bytes, // bytes transferred for this callback
            bytesOverall: info.bytesOverall // bytes transferred since trackProgress set
          };
          this.emit('progress', ev);
          try { onProgress(ev); } catch (e) {}
        };
        this.client.trackProgress(this._progressHandler);
      } else {
        this.client.trackProgress(); // disable
      }

      // basic-ftp supports startAt parameter
      await this.client.downloadTo(localPath, remotePath, startAt);
      return { ok: true, localPath, remoteSize };
    } finally {
      // stop tracking in all cases
      try { this.client.trackProgress(); } catch (e) {}
      this._progressHandler = null;
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
