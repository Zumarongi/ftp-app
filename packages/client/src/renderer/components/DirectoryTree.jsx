import React, { useEffect, useState } from 'react';

function parseUnixList(raw) {
  const lines = raw.split(/\r?\n/).filter(Boolean);
  return lines.map(line => {
    const parts = line.split(/\s+/);
    const perms = parts[0] || '';
    const name = parts.slice(8).join(' ') || parts[parts.length - 1] || line;
    return { raw: line, name, isDir: perms[0] === 'd' };
  });
}

export default function DirectoryTree({ sessionId }) {
  const [cwd, setCwd] = useState('/');
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);

  async function refresh(path) {
    setLoading(true);
    try {
      const res = await window.electronAPI.ftpList({ sessionId, path });
      // support both structured list (array) returned by basic-ftp wrapper and legacy raw text
      if (Array.isArray(res.list)) {
        const entries = res.list.map(item => ({ raw: item.raw || JSON.stringify(item), name: item.name || item.filename || '', isDir: (item.type === 'd' || item.type === 1 || item.isDirectory) }));
        setEntries(entries);
      } else {
        const raw = res.raw || '';
        setEntries(raw.trim() ? parseUnixList(raw) : []);
      }
    } catch (err) {
      alert('LIST 失败: ' + (err.message||err));
      setEntries([]);
    } finally { setLoading(false); }
  }

  useEffect(()=>{ if (sessionId) refresh(cwd); }, [sessionId, cwd]);

  function enter(entry) {
    if (entry.isDir) {
      const next = cwd === '/' ? `/${entry.name}` : `${cwd}/${entry.name}`;
      setCwd(next);
    } else {
      const remote = cwd === '/' ? `/${entry.name}` : `${cwd}/${entry.name}`;
      window.electronAPI.ftpDownload({ sessionId, remotePath: remote }).catch(err => alert('下载失败: ' + (err.message||err)));
    }
  }

  function up() {
    if (cwd === '/' || cwd === '') return;
    const parts = cwd.split('/').filter(Boolean);
    parts.pop();
    const next = '/' + parts.join('/');
    setCwd(next === '/' ? '/' : next);
  }

  return (
    <div className="directory-tree">
      <div className="dir-header">
        <button onClick={()=>refresh(cwd)}>刷新</button>
        <button onClick={up}>上级</button>
        <span className="cwd">当前: {cwd}</span>
      </div>
      {loading ? <div>加载中…</div> : (
        <ul className="entries">
          {entries.map((e,i)=>(
            <li key={i} className={e.isDir ? 'dir' : 'file'} onDoubleClick={()=>enter(e)}>
              <span className="name">{e.name}</span>
              {!e.isDir && <button onClick={(ev)=>{ev.stopPropagation(); enter(e);}}>下载</button>}
            </li>
          ))}
          {!entries.length && <li className="placeholder">无条目</li>}
        </ul>
      )}
    </div>
  );
}
