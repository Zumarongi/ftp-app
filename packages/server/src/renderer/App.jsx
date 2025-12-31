import React from 'react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { CssBaseline, Box, AppBar, Toolbar, Typography, Grid } from '@mui/material';
import ServerControl from './components/ServerControl';
import UserManager from './components/UserManager';

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
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />

      <AppBar position="static" elevation={1}>
        <Toolbar>
          <Typography variant="h6" component="div">
            FTP Server 管理控制台
          </Typography>
        </Toolbar>
      </AppBar>

      <Box p={2} sx={{ height: 'calc(100vh - 64px - 16px)' }}>
        <Grid container spacing={2} sx={{ height: '100%' }}>
          <Grid size={{ xs: 12, md: 4 }}>
            <ServerControl />
          </Grid>
          <Grid size={{ xs: 12, md: 8 }}>
            <UserManager />
          </Grid>
        </Grid>
      </Box>
    </ThemeProvider>
  );
}
