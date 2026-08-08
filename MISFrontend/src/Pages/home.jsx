import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Box, Typography, Stack, Paper,
  LinearProgress, Chip, Grid, Tabs, Tab, useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { format } from 'date-fns';
import axios from '../apiClient.js';

import AllOrder from '../Reports/allOrder';
import AllAttandance from './AllAttandance';
import { useAuth } from '../context/AuthContext';
import { SIDEBAR_GROUPS } from '../constants/sidebarMenu';

import { WIDGET_REGISTRY } from '../constants/widgetRegistry';
import DesignFilesWidget from '../Components/dashboard/DesignFilesWidget';
import WorkflowWidget from '../Components/dashboard/WorkflowWidget';
import PendingByAssignedWidget from '../Components/dashboard/PendingByAssignedWidget';
import AttendanceQuickAction from '../Components/dashboard/AttendanceQuickAction';

/* ─── Google-colored name ────────────────────────────────────────── */
const GOOGLE_COLORS = ['#4285F4', '#EA4335', '#FBBC05', '#34A853'];

function ColoredName({ name }) {
  let ci = 0;
  return (
    <Box component="span">
      {(name || '').split('').map((ch, i) => {
        if (ch === ' ') return <Box key={i} component="span" sx={{ display: 'inline-block', width: '0.25em' }} />;
        const col = GOOGLE_COLORS[ci++ % GOOGLE_COLORS.length];
        return <Box key={i} component="span" sx={{ color: col }}>{ch}</Box>;
      })}
    </Box>
  );
}

/* ─── Quick Links Tab ────────────────────────────────────────────── */
function QuickLinksWidget({ userGroup, isAdmin }) {
  const navigate = useNavigate();
  const userGroupShort = (userGroup || '').replace(' User', '').replace(' Staff', '').trim();

  const canAccess = (roles) =>
    roles.includes('all') ||
    isAdmin ||
    roles.some((r) => r === userGroupShort || (userGroup || '').includes(r));

  const groupedLinks = SIDEBAR_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((item) => canAccess(item.roles)),
  })).filter((g) => g.items.length > 0);

  const linkColors = [
    '#dcfce7', '#dbeafe', '#fef3c7', '#ede9fe',
    '#cffafe', '#fee2e2', '#fce7f3', '#f0fdf4',
  ];

  return (
    <Box>
      {groupedLinks.map((group, gi) => (
        <Box key={group.label} sx={{ mb: 2 }}>
          <Typography
            variant="caption"
            fontWeight={800}
            color="text.secondary"
            sx={{ textTransform: 'uppercase', letterSpacing: 1, mb: 0.75, display: 'block', fontSize: '0.6rem' }}
          >
            {group.label}
          </Typography>
          <Grid container spacing={0.75}>
            {group.items.map((item, ii) => (
              <Grid item xs={6} sm={4} md={3} key={item.label}>
                <Paper
                  variant="outlined"
                  onClick={() => navigate(item.path)}
                  sx={{
                    p: 1,
                    borderRadius: 2,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.75,
                    transition: 'all 0.15s',
                    borderColor: 'transparent',
                    bgcolor: linkColors[(gi * 3 + ii) % linkColors.length],
                    '&:hover': {
                      borderColor: '#16a34a',
                      transform: 'translateY(-2px)',
                      boxShadow: '0 4px 14px rgba(22,163,74,0.12)',
                    },
                  }}
                >
                  <Box sx={{ color: '#15803d', display: 'flex', flexShrink: 0, opacity: 0.8 }}>
                    {item.icon}
                  </Box>
                  <Typography variant="caption" fontWeight={600} noWrap sx={{ fontSize: '0.72rem' }}>
                    {item.label}
                  </Typography>
                </Paper>
              </Grid>
            ))}
          </Grid>
        </Box>
      ))}
    </Box>
  );
}

/* ─── Recent Attendance Tab ──────────────────────────────────────── */
function RecentAttendanceWidget({ attendanceData }) {
  const rows = (attendanceData || []).slice(0, 12);
  if (!rows.length) {
    return (
      <Box sx={{ textAlign: 'center', py: 3 }}>
        <Typography variant="caption" color="text.disabled">No recent attendance records</Typography>
      </Box>
    );
  }
  return (
    <Stack spacing={0.4}>
      {rows.map((row, i) => (
        <Stack
          key={i}
          direction="row"
          justifyContent="space-between"
          alignItems="center"
          sx={{ py: 0.5, px: 1, borderRadius: 1.5, bgcolor: 'rgba(240,253,244,0.8)' }}
        >
          <Stack direction="row" spacing={0.75} alignItems="center">
            <Chip
              size="small"
              label={row.Type}
              sx={{
                height: 20,
                fontSize: '0.62rem',
                fontWeight: 700,
                bgcolor: row.Type === 'CheckIn' ? '#dcfce7' : '#fee2e2',
                color: row.Type === 'CheckIn' ? '#16a34a' : '#dc2626',
              }}
            />
            <Typography variant="caption" color="text.secondary">{row.Date}</Typography>
          </Stack>
          <Typography variant="caption" fontWeight={700} color="#15803d">{row.Time}</Typography>
        </Stack>
      ))}
    </Stack>
  );
}

/* ─── Active tab key (per-user last-viewed tab) ─────────────────── */
const ACTIVE_TAB_KEY = (user) => `mis_home_active_tab_${user}`;

/* ─── Main Home Component ───────────────────────────────────────── */
export default function Home() {
  const navigate = useNavigate();
  const location = useLocation();
  const { userName, userGroup, isAdmin, permissions } = useAuth();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const [loggedInUser, setLoggedInUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [attendanceData, setAttendanceData] = useState([]);
  const [activeTab, setActiveTab] = useState(null);

  /* Screens available to this user, shown as tabs on the home screen */
  const availableTabs = useMemo(() => WIDGET_REGISTRY.filter((w) => {
    if (w.adminOnly && !isAdmin) return false;
    const allowed = permissions?.allowedWidgets;
    if (allowed?.length > 0 && !allowed.includes(w.id)) return false;
    return true;
  }), [isAdmin, permissions]);

  /* Init user */
  useEffect(() => {
    const user = location.state?.id || localStorage.getItem('User_name') || userName;
    if (!user) { navigate('/'); return; }
    setLoggedInUser(user);
    fetchAttendance(user);
    const timer = setTimeout(() => setIsLoading(false), 1500);
    return () => clearTimeout(timer);
  }, []);

  /* Pick the active tab — restore the last one this user viewed, else the first available */
  useEffect(() => {
    if (!loggedInUser || availableTabs.length === 0) return;
    let saved = null;
    try { saved = localStorage.getItem(ACTIVE_TAB_KEY(loggedInUser)); } catch {}
    const isValid = availableTabs.some((w) => w.id === saved);
    setActiveTab((prev) => {
      if (prev && availableTabs.some((w) => w.id === prev)) return prev;
      return isValid ? saved : availableTabs[0].id;
    });
  }, [loggedInUser, availableTabs]);

  /* Persist the active tab */
  useEffect(() => {
    if (!activeTab || !loggedInUser) return;
    localStorage.setItem(ACTIVE_TAB_KEY(loggedInUser), activeTab);
  }, [activeTab, loggedInUser]);

  const fetchAttendance = async (currentUser) => {
    try {
      const [userRes, attRes] = await Promise.all([
        axios.get('/api/users/GetUserList'),
        axios.get('/api/attendance/GetAttendanceList'),
      ]);
      const userLookup = {};
      (userRes.data.result || []).forEach((u) => { userLookup[u.User_uuid] = u.User_name?.trim(); });
      const records = (attRes.data.result || []).flatMap((r) => {
        const name = userLookup[r.Employee_uuid?.trim()] || 'Unknown';
        return (r.User || []).map((u) => ({
          User_name: name,
          Date: r.Date,
          Time: u.CreatedAt ? format(new Date(u.CreatedAt), 'hh:mm a') : 'N/A',
          Type: u.Type || 'N/A',
        }));
      });
      setAttendanceData(records.filter((r) => r.User_name === currentUser));
    } catch (e) { console.error(e); }
  };

  /* Tab content renderer */
  const renderTab = (id) => {
    switch (id) {
      case 'quickLinks':
        return <QuickLinksWidget userGroup={userGroup} isAdmin={isAdmin} />;
      case 'attendance':
        return isAdmin ? <AllAttandance /> : null;
      case 'workflow':
        return <WorkflowWidget />;
      case 'recentAttendance':
        return <RecentAttendanceWidget attendanceData={attendanceData} />;
      case 'ordersBoard':
        return <AllOrder />;
      case 'designFiles':
        return <DesignFilesWidget />;
      case 'pendingByAssigned':
        return isAdmin ? <PendingByAssignedWidget /> : null;
      default:
        return (
          <Typography variant="caption" color="text.disabled">Unknown tab</Typography>
        );
    }
  };

  if (!activeTab) return <LinearProgress sx={{ borderRadius: 1, mt: 2, bgcolor: '#dcfce7' }} />;

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', bgcolor: '#f0fdf4' }}>

      {/* ── Hero ── */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1.5, pt: { xs: 2, md: 3 }, pb: 1.5, flexShrink: 0, flexWrap: 'wrap' }}>
        <Typography
          variant="h2"
          sx={{
            fontFamily: '"Google Sans","Product Sans",Roboto,sans-serif',
            fontWeight: 900,
            fontSize: { xs: '2.4rem', md: '3.2rem' },
            lineHeight: 1,
            userSelect: 'none',
          }}
        >
          <ColoredName name={(loggedInUser || userName || 'User').split(' ')[0]} />
        </Typography>
        <AttendanceQuickAction userName={loggedInUser || userName} />
      </Box>

      {isLoading && (
        <LinearProgress sx={{ mx: { xs: 1, md: 1.5 }, mb: 1, borderRadius: 1, bgcolor: '#dcfce7', '& .MuiLinearProgress-bar': { bgcolor: '#16a34a' } }} />
      )}

      {/* ── Tab bar: every screen the user can access ── */}
      <Box sx={{ px: { xs: 1, md: 1.5 }, flexShrink: 0 }}>
        <Paper
          elevation={0}
          sx={{
            borderRadius: 2.5,
            border: '1px solid',
            borderColor: 'divider',
            bgcolor: 'white',
            overflow: 'hidden',
          }}
        >
          <Tabs
            value={activeTab}
            onChange={(_, next) => setActiveTab(next)}
            variant="scrollable"
            scrollButtons={isMobile ? 'auto' : false}
            allowScrollButtonsMobile
            sx={{
              minHeight: 44,
              px: 0.5,
              '& .MuiTab-root': {
                minHeight: 44,
                textTransform: 'none',
                fontWeight: 700,
                fontSize: '0.78rem',
                gap: 0.5,
                color: 'text.secondary',
              },
              '& .Mui-selected': { color: '#16a34a !important' },
              '& .MuiTabs-indicator': { bgcolor: '#16a34a', height: 2.5, borderRadius: 1.5 },
            }}
          >
            {availableTabs.map((w) => {
              const Icon = w.icon;
              return (
                <Tab
                  key={w.id}
                  value={w.id}
                  label={w.label}
                  icon={Icon ? <Icon sx={{ fontSize: 17 }} /> : undefined}
                  iconPosition="start"
                />
              );
            })}
          </Tabs>
        </Paper>
      </Box>

      {/* ── Active tab's screen ── */}
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
          {renderTab(activeTab)}
        </Paper>
      </Box>
    </Box>
  );
}
