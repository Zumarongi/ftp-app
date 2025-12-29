import React, { useState, useEffect } from 'react';
const STORAGE_KEY = 'ftp_sites_v1';
function loadSites(){ try{ const raw = localStorage.getItem(STORAGE_KEY); return raw?JSON.parse(raw):[] }catch(e){return[]} }
function saveSites(sites){ localStorage.setItem(STORAGE_KEY, JSON.stringify(sites)); }

export default function SiteManager({ onConnected }) {
  const [sites, setSites] = useState(loadSites());
  const [form, setForm] = useState({ name: '', host: '', port: 21, user: 'anonymous', pass: '', passive: true });

  useEffect(()=>{ saveSites(sites); }, [sites]);

  function addSite(){ const s = { ...form, id: Date.now().toString(36) }; setSites([s, ...sites]); setForm({ name:'', host:'', port:21, user:'anonymous', pass:'', passive:true }); }
  function removeSite(id){ setSites(sites.filter(s=>s.id!==id)); }

  async function connectSite(site){
    try {
      const res = await window.electronAPI.createFtpSession({ host: site.host, port: Number(site.port||21), user: site.user, pass: site.pass, passive: !!site.passive });
      onConnected({ sessionId: res.sessionId, site });
    } catch (err) {
      alert('连接失败: ' + (err.message||err));
    }
  }

  return (
    <div>
      <div className="form">
        <input placeholder="Name" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/>
        <input placeholder="Host" value={form.host} onChange={e=>setForm({...form,host:e.target.value})}/>
        <input placeholder="Port" value={form.port} onChange={e=>setForm({...form,port:e.target.value})}/>
        <input placeholder="User" value={form.user} onChange={e=>setForm({...form,user:e.target.value})}/>
        <input placeholder="Pass" type="password" value={form.pass} onChange={e=>setForm({...form,pass:e.target.value})}/>
        <label><input type="checkbox" checked={form.passive} onChange={e=>setForm({...form,passive:e.target.checked})}/> PASV</label>
        <button onClick={addSite}>保存站点</button>
      </div>

      <div className="site-list">
        {sites.map(s=>(
          <div key={s.id} className="site-item">
            <div>
              <strong>{s.name || s.host}</strong>
              <div className="meta-sub">{s.user}@{s.host}:{s.port}</div>
            </div>
            <div>
              <button onClick={()=>connectSite(s)}>连接</button>
              <button onClick={()=>removeSite(s.id)}>删除</button>
            </div>
          </div>
        ))}
        {!sites.length && <div className="placeholder">尚无站点</div>}
      </div>
    </div>
  );
}
