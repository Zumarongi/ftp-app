import React, { useEffect, useState } from 'react';
import {
  Card, CardHeader, CardContent,
  Stack, Typography, LinearProgress, Box
} from '@mui/material';

export default function DownloadQueue() {
  const [tasks, setTasks] = useState([]);

  useEffect(() => {
    window.electronAPI?.onProgress?.(p => {
      setTasks(prev => {
        const idx = prev.findIndex(t => t.taskId === p.taskId);
        const next = { ...p, progress: p.total ? p.bytes / p.total * 100 : 0 };
        if (idx === -1) return [next, ...prev];
        const arr = [...prev]; arr[idx] = next; return arr;
      });
    });
  }, []);

  return (
    <Card sx={{ height: '100%' }}>
      <CardHeader title="下载队列" />
      <CardContent sx={{ height: '100%', overflow: 'auto' }}>
        <Stack spacing={1}>
          {tasks.length === 0 && (
            <Typography color="text.secondary">暂无下载任务</Typography>
          )}
          {tasks.map(t => (
            <Box key={t.taskId}>
              <Typography variant="caption">{t.remotePath}</Typography>
              <LinearProgress variant="determinate" value={t.progress || 0} />
            </Box>
          ))}
        </Stack>
      </CardContent>
    </Card>
  );
}
