import { useState } from 'react';
import { Box, useMediaQuery } from '@mui/material';
import OdooTopbar from './OdooTopbar';
import OdooSidebar, { DRAWER_WIDTH } from './OdooSidebar';

export default function OdooShell({ children }) {
  const isDesktop = useMediaQuery((theme) => theme.breakpoints.up('md'));
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', bgcolor: 'background.default' }}>
      <OdooTopbar onToggleSidebar={() => setMobileOpen((v) => !v)} />

      <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <OdooSidebar mobileOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)} />

        {/* Main content */}
        <Box
          component="main"
          sx={{
            flex: 1,
            overflow: 'auto',
            p: { xs: 2, md: 3 },
            // Offset for permanent desktop sidebar already handled by Drawer layout
          }}
        >
          {children}
        </Box>
      </Box>
    </Box>
  );
}
