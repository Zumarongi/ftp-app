import React, { useState, useEffect } from 'react';
import {
  Card, CardHeader, CardContent,
  Stack, TextField, Button, List, ListItem,
  ListItemText, IconButton, Divider, Checkbox, FormControlLabel
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import LinkIcon from '@mui/icons-material/Link';

const STORAGE_KEY = 'ftp_sites_v1';
const loadSites = () => {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
  catch { return []; }
};
const saveSites = sites => localStorage.setItem(STORAGE_KEY, JSON.stringify(sites));

export default function SiteManager({ onConnected }) {
  const [sites, setSites] = useState(loadSites());
  const [form, setForm] = useState({
    name: '', host: '', port: 2121, user: '', pass: '', passive: true, secure: false, timeout: 30000
  });

  useEffect(() => saveSites(sites), [sites]);

  const addSite = () => {
    setSites([{ ...form, id: Date.now().toString(36) }, ...sites]);
    setForm({ name: '', host: '', port: 2121, user: '', pass: '', passive: true, secure: false, timeout: 30000 });
  };

  const connect = async site => {
    try {
      const res = await window.electronAPI.createFtpSession({
        host: site.host,
        port: Number(site.port),
        user: site.user,
        pass: site.pass,
        passive: site.passive,
        secure: !!site.secure,
        timeout: Number(site.timeout) || undefined
      });
      if (res && res.sessionId) onConnected({ sessionId: res.sessionId, site });
      else throw new Error(res && res.error ? res.error : '未知错误');
    } catch (err) {
      window.alert(`连接失败：${err.message}`);
    }
  };

  return (
    <Card sx={{ height: '100%' }}>
      <CardHeader title="站点管理" />
      <CardContent sx={{ height: '100%', overflow: 'auto' }}>
        <Stack spacing={2}>
          <TextField label="名称" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          <TextField label="Host" value={form.host} onChange={e => setForm({ ...form, host: e.target.value })} />
          <TextField label="Port" value={form.port} onChange={e => setForm({ ...form, port: e.target.value })} />
          <TextField label="User" value={form.user} onChange={e => setForm({ ...form, user: e.target.value })} />
          <TextField label="Password" type="password" value={form.pass} onChange={e => setForm({ ...form, pass: e.target.value })} />
          <FormControlLabel
            control={<Checkbox checked={form.passive} onChange={e => setForm({ ...form, passive: e.target.checked })} />}
            label="PASV"
          />
          <TextField label="Timeout(ms)" value={form.timeout} onChange={e => setForm({ ...form, timeout: e.target.value })} />
          <Button variant="contained" onClick={addSite}>保存站点</Button>

          <Divider />

          <List dense>
            {sites.map(s => (
              <ListItem
                key={s.id}
                secondaryAction={
                  <>
                    <IconButton onClick={() => connect(s)}><LinkIcon /></IconButton>
                    <IconButton onClick={() => setSites(sites.filter(x => x.id !== s.id))}><DeleteIcon /></IconButton>
                  </>
                }
              >
                <ListItemText
                  primary={s.name || s.host}
                  secondary={`${s.user}@${s.host}:${s.port}`}
                />
              </ListItem>
            ))}
          </List>
        </Stack>
      </CardContent>
    </Card>
  );
}
