import React, { useEffect, useState, useMemo } from 'react';
import {
  Card, CardHeader, CardContent, Box,
  Stack, Button, Typography, List, ListItem, ListItemButton,
  ListItemText, IconButton, Divider,
  Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, Breadcrumbs, Link
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import UploadIcon from '@mui/icons-material/Upload';
import FolderIcon from '@mui/icons-material/Folder';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import RefreshIcon from '@mui/icons-material/Refresh';
import HomeIcon from '@mui/icons-material/Home';

export default function DirectoryTree({ sessionId }) {
  const [cwd, setCwd] = useState('/');
  const [entries, setEntries] = useState([]);
  const [selected, setSelected] = useState(null);

  const [mkdirOpen, setMkdirOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [downloadEntry, setDownloadEntry] = useState(null);


  const joinPath = (base, name) => {
    if (!base || base === '/') return `/${name}`;
    return `${base}/${name}`;
  };

  const parentPath = (path) => {
    if (!path || path === '/') return '/';
    const parts = path.split('/').filter(Boolean);
    parts.pop();
    return '/' + parts.join('/');
  };

  const refresh = async () => {
    if (!sessionId) {
      setEntries([]);
      return;
    }
    try {
      const res = await window.electronAPI.ftpList({ sessionId, path: cwd });
      setEntries(res.list || []);
    } catch (err) {
      console.error('ftpList error', err);
      setEntries([]);
    }
  };

  useEffect(() => { refresh(); }, [cwd, sessionId]);

  const sortedEntries = useMemo(() => {
    return [...entries].sort((a, b) => {
      if (a.isDir && !b.isDir) return -1;
      if (!a.isDir && b.isDir) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [entries]);

  const enter = async (e) => {
    if (e.isDir) {
      setCwd(joinPath(cwd, e.name));
    } else {
      setDownloadEntry(e);
      setDownloadOpen(true);
    }
  };

  const confirmDownload = async () => {
    if (!downloadEntry) return;

    const res = await window.electronAPI.selectDownloadDir();
    console.log('selectDownloadDir result', res);
    if (!res?.canceled && res?.path) {
      await window.electronAPI.ftpDownload({
        sessionId,
        remotePath: joinPath(cwd, downloadEntry.name),
        localPath: res.path
      });
    }

    setDownloadOpen(false);
    setDownloadEntry(null);
  };

  const doUpload = async () => {
    if (!sessionId) return;

    const res = await window.electronAPI.selectUploadFile();
    if (res?.canceled || !res?.filePath) return;

    await window.electronAPI.ftpUpload({
      sessionId,
      localPath: res.filePath,
      remotePath: joinPath(cwd, res.fileName)
    });

    refresh();
  };

  const doUp = () => {
    if (cwd !== '/') {
      setSelected(null);
      setCwd(parentPath(cwd));
    }
  };

  const doMkdir = async () => {
    if (!inputValue) return;
    await window.electronAPI.ftpMkdir({
      sessionId,
      remotePath: joinPath(cwd, inputValue)
    });
    setInputValue('');
    setMkdirOpen(false);
    refresh();
  };

  const doRename = async () => {
    const e = sortedEntries[selected];
    if (!e || !inputValue || inputValue === e.name) return;
    await window.electronAPI.ftpRename({
      sessionId,
      oldPath: joinPath(cwd, e.name),
      newPath: joinPath(cwd, inputValue)
    });
    setRenameOpen(false);
    setSelected(null);
    refresh();
  };

  const doRemove = async () => {
    const e = sortedEntries[selected];
    if (!e) return;
    await window.electronAPI.ftpRemove({
      sessionId,
      remotePath: joinPath(cwd, e.name),
      isDir: !!e.isDir
    });
    setConfirmOpen(false);
    setSelected(null);
    refresh();
  };

  const breadcrumbs = useMemo(() => {
    const parts = cwd.split('/').filter(Boolean);
    let acc = '';
    return parts.map(p => {
      acc += '/' + p;
      return { name: p, path: acc };
    });
  }, [cwd]);

  return (
    <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <CardHeader title="远程文件浏览" />

      <CardContent sx={{ flex: 1, overflow: 'hidden' }}>
        {!sessionId ? (
          <Box color="text.secondary">请先连接站点</Box>
        ) : (
          <Stack spacing={1} height="100%">
            <Stack direction="row" spacing={1} alignItems="center">
              <Button startIcon={<RefreshIcon />} onClick={refresh}>刷新</Button>
              <Button
                startIcon={<ArrowUpwardIcon />}
                disabled={cwd === '/'}
                onClick={doUp}
              >
                上一级
              </Button>
              <Button
                startIcon={<HomeIcon />}
                onClick={() => setCwd('/')}
              >
                根目录
              </Button>
              <Button
                startIcon={<UploadIcon />}
                onClick={doUpload}
              >
                上传文件
              </Button>
            </Stack>

            <Breadcrumbs sx={{ fontSize: 12 }}>
              <Link
                underline="hover"
                color="inherit"
                onClick={() => setCwd('/')}
                sx={{ cursor: 'pointer' }}
              >
                /
              </Link>
              {breadcrumbs.map(b => (
                <Link
                  key={b.path}
                  underline="hover"
                  color="inherit"
                  onClick={() => setCwd(b.path)}
                  sx={{ cursor: 'pointer' }}
                >
                  {b.name}
                </Link>
              ))}
            </Breadcrumbs>

            <Divider />

            <Box sx={{ flex: 1, overflow: 'auto' }} onClick={() => setSelected(null)}>
              <List dense>
                {sortedEntries.map((e, i) => (
                  <ListItem
                    key={e.name + i}
                    disablePadding
                    secondaryAction={
                      !e.isDir && (
                        <IconButton onClick={() => enter(e)}>
                          <DownloadIcon />
                        </IconButton>
                      )
                    }
                  >
                    <ListItemButton
                      selected={selected === i}onClick={(evt) => {
                        evt.stopPropagation();
                        setSelected(i);
                      }}
                      onDoubleClick={(evt) => {
                        evt.stopPropagation();
                        enter(e);
                      }}
                      sx={{
                        '&:hover': {
                          backgroundColor: 'action.hover',
                        },
                        '&.Mui-selected': {
                          backgroundColor: 'primary.light',
                        },
                        '&.Mui-selected:hover': {
                          backgroundColor: 'primary.main',
                          color: 'primary.contrastText',
                        },
                      }}
                    >
                      {e.isDir && <FolderIcon sx={{ mr: 1 }} />}
                      <ListItemText
                        primary={e.name}
                        secondary={e.isDir ? '目录' : '文件'}
                      />
                    </ListItemButton>
                  </ListItem>
                ))}
                {!sortedEntries.length && (
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ p: 2 }}
                  >
                    当前目录为空
                  </Typography>
                )}
              </List>
            </Box>

            {selected !== null && sortedEntries[selected] && (
              <Stack direction="row" spacing={1}>
                <Button color="error" onClick={() => setConfirmOpen(true)}>删除</Button>
                <Button onClick={() => {
                  setInputValue(sortedEntries[selected].name);
                  setRenameOpen(true);
                }}>
                  重命名
                </Button>
                {!sortedEntries[selected].isDir && (
                  <Button onClick={() => enter(sortedEntries[selected])}>
                    下载
                  </Button>
                )}
              </Stack>
            )}

            <Button
              variant="outlined"
              onClick={() => setMkdirOpen(true)}
            >
              新建文件夹
            </Button>
          </Stack>
        )}
      </CardContent>

      <Dialog open={mkdirOpen} onClose={() => setMkdirOpen(false)}>
        <DialogTitle>新建文件夹</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus fullWidth
            label="文件夹名称"
            value={inputValue}
            sx={{ mt: 1 }}
            onChange={e => setInputValue(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMkdirOpen(false)}>取消</Button>
          <Button variant="contained" onClick={doMkdir}>确定</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={renameOpen} onClose={() => setRenameOpen(false)}>
        <DialogTitle>重命名</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus fullWidth
            label="新名称"
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRenameOpen(false)}>取消</Button>
          <Button variant="contained" onClick={doRename}>确定</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)}>
        <DialogTitle>确认删除</DialogTitle>
        <DialogContent>
          <Typography>
            确认删除「{sortedEntries[selected]?.name}」？
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)}>取消</Button>
          <Button color="error" variant="contained" onClick={doRemove}>删除</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={downloadOpen} onClose={() => setDownloadOpen(false)}>
        <DialogTitle>确认下载</DialogTitle>
        <DialogContent>
          <Typography>
            是否下载文件「{downloadEntry?.name}」？
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDownloadOpen(false)}>取消</Button>
          <Button variant="contained" onClick={confirmDownload}>
            选择位置并下载
          </Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
}
