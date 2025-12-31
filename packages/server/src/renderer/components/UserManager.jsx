import React, { useEffect, useState, useMemo } from 'react';
import {
  Card, CardHeader, CardContent,
  TextField, Button, Stack,
  Table, TableBody, TableCell, TableHead, TableRow,
  Checkbox, Chip, Alert, Box
} from '@mui/material';

const PERM_READ = 1;
const PERM_WRITE = 2;
const PERM_DELETE = 4;
const PERM_MKDIR = 8;
const PERM_RENAME = 16;

const USERNAME_RE = /^[a-zA-Z][a-zA-Z0-9_-]{2,31}$/;
const HOME_RE = /^[a-zA-Z0-9_-]+$/;

export default function UserManager() {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({
    username: '',
    password: '',
    home: '',
    perms: PERM_READ | PERM_WRITE | PERM_DELETE | PERM_MKDIR | PERM_RENAME
  });
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => { refresh(); }, []);

  async function refresh() {
    const res = await window.serverAPI.listUsers();
    setUsers(res.users || []);
  }

  useEffect(() => {
    if (!editing) {
      setForm(f => ({ ...f, home: form.username }));
    }
  }, [form.username]);

  const errors = useMemo(() => {
    const e = {};

    if (!form.username) {
      e.username = '用户名不能为空';
    } else if (!USERNAME_RE.test(form.username)) {
      e.username = '用户名必须以字母开头，仅包含字母、数字、下划线"\_"和短横杠"-"，长度3-32字符';
    }

    if (!form.home) {
      e.home = 'Home 不能为空';
    } else if (!HOME_RE.test(form.home)) {
      e.home = 'Home 仅允许字母、数字、下划线"\_"和短横杠"-"';
    }

    if (!editing && !form.password) {
      e.password = '新用户必须设置密码';
    }

    return e;
  }, [form, editing]);

  const hasError = Object.keys(errors).length > 0;

  function togglePerm(bit) {
    setForm(f => ({ ...f, perms: f.perms ^ bit }));
  }

  async function submit() {
    if (hasError) {
      setMessage({ type: 'error', text: errors.username || errors.password || errors.home });
      return;
    }
    const api = editing ? window.serverAPI.updateUser : window.serverAPI.addUser;
    const res = await api(form);
    if (!res.ok) {
      setMessage({ type: 'error', text: res.error || '操作失败' });
    } else {
      setMessage({ type: 'success', text: editing ? '更新成功' : '添加成功' });
      setEditing(false);
      setForm({ username: '', password: '', home: '', perms: PERM_READ | PERM_WRITE | PERM_DELETE | PERM_MKDIR | PERM_RENAME });
      refresh();
    }
  }

  async function remove(username) {
    if (!confirm(`删除用户 ${username} ?`)) return;
    await window.serverAPI.removeUser({ username });
    refresh();
  }

  function edit(u) {
    setEditing(true);
    setMessage(null);
    setForm({ username: u.username, password: '', home: u.home, perms: u.perms });
  }

  return (
    <Card sx={{ height: "100%" }}>
      <CardHeader title="用户管理" />
      <CardContent sx={{ height: "calc(100% - 64px)" }}>
        <Stack spacing={2}>
          {message && <Alert severity={message.type}>{message.text}</Alert>}

          <Stack direction="row" spacing={2}>
            <TextField
              label="用户名"
              value={form.username}
              disabled={editing}
              error={editing && !!errors.username}
              helperText={editing && errors.username || ' '}
              onChange={e => setForm({ ...form, username: e.target.value })}
            />
            <TextField
              label="密码"
              type="password"
              value={form.password}
              error={editing && !!errors.password}
              helperText={editing ? (errors.password || '留空表示不修改') : ' '}
              onChange={e => setForm({ ...form, password: e.target.value })}
            />
            <TextField
              label="Home（虚拟根目录）"
              value={form.home}
              disabled={editing}
              error={editing && !!errors.home}
              helperText={editing ? (errors.home || '默认等于用户名') : ' '}
              onChange={e => setForm({ ...form, home: e.target.value })}
            />
          </Stack>

          <Stack direction="row" spacing={1}>
            <Chip label="读" color={(form.perms & PERM_READ) ? 'primary' : 'default'} onClick={() => togglePerm(PERM_READ)} />
            <Chip label="写" color={(form.perms & PERM_WRITE) ? 'success' : 'default'} onClick={() => togglePerm(PERM_WRITE)} />
            <Chip label="删" color={(form.perms & PERM_DELETE) ? 'error' : 'default'} onClick={() => togglePerm(PERM_DELETE)} />
            <Chip label="创建目录" color={(form.perms & PERM_MKDIR) ? 'secondary' : 'default'} onClick={() => togglePerm(PERM_MKDIR)} />
            <Chip label="重命名" color={(form.perms & PERM_RENAME) ? 'warning' : 'default'} onClick={() => togglePerm(PERM_RENAME)} />
          </Stack>

          <Button variant="contained" onClick={submit}>
            {editing ? '保存修改' : '添加用户'} 
          </Button>

          <Table size="small" sx={{ overflow: "auto" }}>
            <TableHead>
              <TableRow>
                <TableCell>用户</TableCell>
                <TableCell>Home</TableCell>
                <TableCell>权限</TableCell>
                <TableCell align="right">操作</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {users.map(u => (
                <TableRow key={u.username}>
                  <TableCell>{u.username}</TableCell>
                  <TableCell>{u.home}</TableCell>
                  <TableCell>
                    {(u.perms & PERM_READ) != 0 && <Chip label="读" size="small" color="primary" sx={{ mr: 0.5 }} />}
                    {(u.perms & PERM_WRITE) != 0 && <Chip label="写" size="small" color="success" sx={{ mr: 0.5 }} />}
                    {(u.perms & PERM_DELETE) != 0 && <Chip label="删" size="small" color="error" sx={{ mr: 0.5 }} />}
                    {(u.perms & PERM_MKDIR) != 0 && <Chip label="创建目录" size="small" color="secondary" sx={{ mr: 0.5 }} />}
                    {(u.perms & PERM_RENAME) != 0 && <Chip label="重命名" size="small" color="warning" />}
                  </TableCell>
                  <TableCell align="right">
                    <Button size="small" onClick={() => edit(u)}>编辑</Button>
                    <Button size="small" color="error" onClick={() => remove(u.username)}>删除</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Stack>
      </CardContent>
    </Card>
  );
}
