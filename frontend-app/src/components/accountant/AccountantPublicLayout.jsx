import React from 'react';
import { Box, Paper, Typography } from '@mui/material';

export default function AccountantPublicLayout({ children, title }) {
  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: '#F5F5F5',
        p: 2,
      }}
    >
      <Paper elevation={3} sx={{ maxWidth: 440, width: '100%', p: 4, borderRadius: 2 }}>
        <Typography
          variant="h5"
          align="center"
          sx={{ color: '#B8942E', fontWeight: 700, mb: 0.5 }}
        >
          KAVIAR
        </Typography>
        <Typography
          variant="body2"
          align="center"
          color="text.secondary"
          sx={{ mb: 3 }}
        >
          Portal do Contador
        </Typography>
        {title && (
          <Typography variant="h6" sx={{ mb: 2 }}>
            {title}
          </Typography>
        )}
        {children}
      </Paper>
    </Box>
  );
}
