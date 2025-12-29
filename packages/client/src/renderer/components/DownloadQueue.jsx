import React, { useEffect, useState } from 'react';

export default function DownloadQueue() {
  const [tasks, setTasks] = useState([]);

  useEffect(() => {
  const onProgress = (p) => {
    setTasks(prev => {
      const idx = prev.findIndex(t => t.taskId === p.taskId);
      const total = p.total || p.totalBytes || p.totalSize || p.total; // unified
      const bytes = p.bytes || 0;
      const update = { taskId: p.taskId, remotePath: p.remotePath, localPath: p.localPath, bytes, total, status: 'running' };
      if (idx === -1) return [update, ...prev];
      const np = [...prev];
      np[idx] = { ...np[idx], bytes, total, status: 'running' };
      return np;
    });
  };

  const onCompleted = (d) => {
    setTasks(prev => prev.map(t => t.taskId === d.taskId ? { ...t, status: 'done', bytes: t.total || t.bytes } : t));
  };
  const onError = (d) => setTasks(prev => prev.map(t => t.taskId === d.taskId ? { ...t, status: 'error', error: d.error } : t));
  const onCancelled = (d) => setTasks(prev => prev.map(t => t.taskId === d.taskId ? { ...t, status: 'cancelled' } : t));

  if (window.electronAPI) {
    if (typeof window.electronAPI.onProgress === 'function') window.electronAPI.onProgress(onProgress);
    if (typeof window.electronAPI.onCompleted === 'function') window.electronAPI.onCompleted(onCompleted);
    if (typeof window.electronAPI.onError === 'function') window.electronAPI.onError(onError);
    if (typeof window.electronAPI.onCancelled === 'function') window.electronAPI.onCancelled && window.electronAPI.onCancelled(onCancelled);
  }
}, []);

  function human(bytes) {
    if (!bytes) return '0 B';
    const units = ['B','KB','MB','GB','TB']; let i=0; let v=bytes;
    while (v>=1024 && i<units.length-1){ v/=1024; i++; }
    return v.toFixed(1) + ' ' + units[i];
  }

  return (
    <div className="download-queue">
      {tasks.length===0 && <div className="placeholder">暂无下载任务</div>}
      <ul>
        {tasks.map(t=>(
          <li key={t.taskId} className={`task ${t.status||''}`}>
            <div className="task-top">
              <div className="task-name">{t.remotePath}</div>
              <div className="task-status">{t.status}</div>
            </div>
            <div className="task-progress">
              <div className="bar" style={{ width: t.bytes ? Math.min(100, (t.bytes/1024/1024)*2) + '%' : '0%' }} />
              <div className="bytes">{human(t.bytes)}</div>
            </div>
            {t.error && <div className="error">错误: {t.error}</div>}
            <div className="task-meta">保存到: {t.localPath}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}
