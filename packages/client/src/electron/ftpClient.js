const ftp = require("basic-ftp");
const fs = require("fs");
const EventEmitter = require('events');

class FtpClient extends EventEmitter {
  constructor() {
    super();
    this.client = new ftp.Client(); // default timeout ~ 0 (infinite) - you can set client.ftp.timeout
    this.client.ftp.verbose = false;
    this._progressHandler = null;
    // sensible default timeout for control operations (ms)
    this.client.ftp.timeout = 15000;
  }

  async connect({ host, port = 21, user = "anonymous", pass = "", secure = false }) {
    await this.client.access({
      host,
      port,
      user,
      password: pass,
      secure
    });
  }

  async list(remotePath = "") {
    // returns array of objects {name, size, type, rawModifiedAt, owner,...}
    return await this.client.list(remotePath);
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
