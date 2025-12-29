import React, { useState, useEffect } from 'react';

export default function ServerControl() {
  const [running, setRunning] = useState(false);
  const [port, setPort] = useState(2121);
  const [pasvStart, setPasvStart] = useState(30000);
  const [pasvEnd, setPasvEnd] = useState(30100);
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    if (window.serverAPI) {
      window.serverAPI.onLog(data => {
        setLogs(l => [JSON.stringify(data), ...l].slice(0, 200));
      });
      window.serverAPI.onStarted(() => setRunning(true));
      window.serverAPI.onStopped(() => setRunning(false));
    }
  }, []);

  async function start() {
    await window.serverAPI.start({
      port: Number(port),
      pasvRange: [Number(pasvStart), Number(pasvEnd)],
      rootBase: undefined // worker will use default rootBase unless provided
    });
  }
  async function stop() { await window.serverAPI.stop(); }

  return (
    <div>
      <h3>FTP Server 控制</h3>
      <div>
        <label>Port: <input value={port} onChange={e=>setPort(e.target.value)} /></label>
        <label>PASV Start: <input value={pasvStart} onChange={e=>setPasvStart(e.target.value)} /></label>
        <label>PASV End: <input value={pasvEnd} onChange={e=>setPasvEnd(e.target.value)} /></label>
      </div>
      <div style={{ marginTop: 8 }}>
        {!running ? <button onClick={start}>Start</button> : <button onClick={stop}>Stop</button>}
      </div>

      <h4>日志</h4>
      <div style={{ maxHeight: 300, overflow: 'auto', background: '#111', color:'#bcd', padding:8 }}>
        {logs.map((l,i)=><div key={i} style={{ fontSize:12 }}>{l}</div>)}
      </div>
    </div>
  );
}
