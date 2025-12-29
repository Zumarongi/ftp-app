import React, { useState } from 'react';
import ServerControl from './components/ServerControl';
import UserManager from './components/UserManager';
import './styles.css';

export default function App() {
  return (
    <div className="app-grid">
      <aside className="left-panel">
        <h3>服务器控制</h3>
        <ServerControl />
      </aside>
      <main className="main-panel">
        <h3>用户管理</h3>
        <UserManager />
      </main>
    </div>
  );
}
