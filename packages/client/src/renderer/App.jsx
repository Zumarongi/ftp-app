import React, { useState } from 'react';
import SiteManager from './components/SiteManager';
import DirectoryTree from './components/DirectoryTree';
import DownloadQueue from './components/DownloadQueue';
import './styles.css';

export default function App() {
  const [sessionInfo, setSessionInfo] = useState(null);

  return (
    <div className="app-grid">
      <aside className="left-panel">
        <h3>站点管理</h3>
        <SiteManager onConnected={(info)=>setSessionInfo(info)} />
      </aside>
      <main className="main-panel">
        <h3>远程浏览</h3>
        { sessionInfo ? <DirectoryTree sessionId={sessionInfo.sessionId} /> : <div className="placeholder">请先连接</div> }
      </main>
      <aside className="right-panel">
        <h3>下载队列</h3>
        <DownloadQueue />
      </aside>
    </div>
  );
}
