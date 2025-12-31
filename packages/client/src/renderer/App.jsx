import React, { useState } from 'react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { CssBaseline, Box, AppBar, Toolbar, Typography, Grid } from '@mui/material';
import SiteManager from './components/SiteManager';
import DirectoryTree from './components/DirectoryTree';
import DownloadQueue from './components/DownloadQueue';

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#1976d2' },
    background: {
      default: '#f4f6f8'
    }
  }
});

export default function App() {
  const [sessionInfo, setSessionInfo] = useState(null);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />

      <AppBar position="static" elevation={1}>
        <Toolbar>
          <Typography variant="h6" component="div">
            FTP Client 端面板
          </Typography>
        </Toolbar>
      </AppBar>

      <Box p={2} sx={{ height: 'calc(100vh - 64px - 16px)' }}>
        <Grid container spacing={2} sx={{ height: '100%' }}>
          <Grid size={{ xs: 12, md: 3 }}>
            <SiteManager onConnected={info => setSessionInfo(info)} />
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <DirectoryTree sessionId={sessionInfo ? sessionInfo.sessionId : null} />
          </Grid>
          <Grid size={{ xs: 12, md: 3 }}>
            <DownloadQueue />
          </Grid>
        </Grid>
      </Box>
    </ThemeProvider>
  );
}
