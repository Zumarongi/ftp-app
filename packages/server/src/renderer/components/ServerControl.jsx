import React, { useEffect, useState } from 'react';
import {
  Card, CardContent, CardHeader,
  TextField, Button, Stack,
  Typography, Divider, Box
} from '@mui/material';

export default function ServerControl() {
  const [running, setRunning] = useState(false);
  const [port, setPort] = useState(2121);
  const [pasvStart, setPasvStart] = useState(30000);
  const [pasvEnd, setPasvEnd] = useState(30100);
  const [rootBase, setRootBase] = useState('');
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    if (!window.serverAPI) return;

    window.serverAPI.onLog(data => {
      setLogs(l => [JSON.stringify(data), ...l].slice(0, 200));
    });
    window.serverAPI.onStarted(() => setRunning(true));
    window.serverAPI.onStopped(() => setRunning(false));
  }, []);

  async function start() {
    await window.serverAPI.start({
      port: Number(port),
      pasvRange: [Number(pasvStart), Number(pasvEnd)],
      rootBase: rootBase || undefined
    });
  }

  async function stop() {
    await window.serverAPI.stop();
  }

  return (
    <Card sx={{ height: "100%" }}>
      <CardHeader title="服务器控制" />
      <CardContent sx={{ height: "calc(100% - 64px)" }}>
        <Stack spacing={2} sx={{ height: "100%" }}>
          <Stack direction="row" spacing={2}>
            <TextField label="Port" value={port} onChange={e => setPort(e.target.value)} />
            <TextField label="PASV Start" value={pasvStart} onChange={e => setPasvStart(e.target.value)} />
            <TextField label="PASV End" value={pasvEnd} onChange={e => setPasvEnd(e.target.value)} />
          </Stack>

          <TextField
            label="Root Base（可选）"
            placeholder="/absolute/path/to/ftp-root"
            value={rootBase}
            onChange={e => setRootBase(e.target.value)}
            fullWidth
          />

          <Button
            variant="contained"
            color={running ? 'error' : 'primary'}
            onClick={running ? stop : start}
          >
            {running ? '停止服务器' : '启动服务器'}
          </Button>

          <Divider />

          <Typography variant="subtitle2">日志</Typography>
          <Box
            sx={{
              minHeight: 0,
              flexGrow: 1,
              overflow: 'auto',
              bgcolor: '#0b1220',
              color: '#bcd',
              p: 1,
              borderRadius: 1,
              fontFamily: 'monospace',
              fontSize: 12
            }}
          >
            {logs.map((l, i) => (
              <div key={i}>{l}</div>
            ))}
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}