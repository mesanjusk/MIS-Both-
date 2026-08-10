import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Box, Paper, LinearProgress } from '@mui/material';
import { useAuth } from '../context/AuthContext';

import WorkflowWidget from '../Components/dashboard/WorkflowWidget';

/* ─── Main Home Component ───────────────────────────────────────── */
export default function Home() {
  const navigate = useNavigate();
  const location = useLocation();
  const { userName } = useAuth();

  const [loggedInUser, setLoggedInUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  /* Init user */
  useEffect(() => {
    const user = location.state?.id || localStorage.getItem('User_name') || userName;
    if (!user) { navigate('/'); return; }
    setLoggedInUser(user);
    const timer = setTimeout(() => setIsLoading(false), 1500);
    return () => clearTimeout(timer);
  }, []);

  if (!loggedInUser) return <LinearProgress sx={{ borderRadius: 1, mt: 2, bgcolor: '#dcfce7' }} />;

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', bgcolor: '#f0fdf4' }}>

      {isLoading && (
        <LinearProgress sx={{ mx: { xs: 1, md: 1.5 }, mt: 1.5, mb: 1, borderRadius: 1, bgcolor: '#dcfce7', '& .MuiLinearProgress-bar': { bgcolor: '#16a34a' } }} />
      )}

      {/* ── Workflow ── */}
      <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto', px: { xs: 1, md: 1.5 }, py: 1.5 }}>
        <Paper
          elevation={0}
          sx={{
            borderRadius: 2.5,
            border: '1px solid',
            borderColor: 'divider',
            bgcolor: 'white',
            p: 1.5,
            minHeight: '100%',
            boxShadow: '0 1px 6px rgba(0,0,0,0.04)',
          }}
        >
          <WorkflowWidget />
        </Paper>
      </Box>
    </Box>
  );
}
