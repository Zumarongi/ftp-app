import React, { useEffect, useState } from 'react';
import {
  Card, CardHeader, CardContent,
  Stack, Typography, LinearProgress, Box, Chip
} from '@mui/material';

export default function DownloadQueue() {
  const [tasks, setTasks] = useState({});

  useEffect(() => {
    const api = window.electronAPI;

    api.onProgress(p => {
      console.log('Download progress', p);
      setTasks(prev => {
        const old = prev[p.taskId] || {};
        return {
          ...prev,
          [p.taskId]: {
            ...old,
            taskId: p.taskId,
            filename: p.filename || old.filename,
            remotePath: p.remotePath || old.remotePath,
            bytes: p.bytes,
            total: p.total,
            status: 'downloading'
          }
        };
      });
    });

    api.onCompleted(p => {
      setTasks(prev => ({
        ...prev,
        [p.taskId]: {
          ...prev[p.taskId],
          status: 'completed'
        }
      }));
    });

    api.onError(p => {
      setTasks(prev => ({
        ...prev,
        [p.taskId]: {
          ...prev[p.taskId],
          status: 'error',
          error: p.error
        }
      }));
    });

    api.onCancelled(p => {
      setTasks(prev => ({
        ...prev,
        [p.taskId]: {
          ...prev[p.taskId],
          status: 'cancelled'
        }
      }));
    });
  }, []);

  const list = Object.values(tasks);

  return (
    <Card sx={{ height: '100%' }}>
      <CardHeader title="下载队列" />
      <CardContent sx={{ overflow: 'auto' }}>
        <Stack spacing={1}>
          {list.length === 0 && (
            <Typography color="text.secondary">
              暂无下载任务
            </Typography>
          )}

          {list.map(t => {
            console.log(t);

            const progress = t.total
              ? Math.min(100, (t.bytes / t.total) * 100)
              : 0;

            return (
              <Box key={t.taskId || Math.random()}>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Typography variant="body2" noWrap sx={{ flex: 1 }}>
                    {t.filename || t.remotePath}
                  </Typography>
                  <Chip size="small" label={t.status} />
                </Stack>

                <LinearProgress
                  variant="determinate"
                  value={t.status === 'completed' ? 100 : progress}
                />
              </Box>
            );
          })}
        </Stack>
      </CardContent>
    </Card>
  );
}
