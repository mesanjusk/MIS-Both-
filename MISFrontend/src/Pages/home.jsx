import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Box, Typography, IconButton, Tooltip, Stack, Paper,
  Button, Drawer, LinearProgress,
  Chip, Grid, useMediaQuery,
} from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import axios from '../apiClient.js';

import AllOrder from '../Reports/allOrder';
import AllAttandance from './AllAttandance';
import { useAuth } from '../context/AuthContext';
import { SIDEBAR_GROUPS } from '../constants/sidebarMenu';
import { useDashboardCustomize } from './Layout';

import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import DragIndicatorRoundedIcon from '@mui/icons-material/DragIndicatorRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import WidgetsRoundedIcon from '@mui/icons-material/WidgetsRounded';

import { WIDGET_REGISTRY, LAYOUT_KEY, DEFAULT_LAYOUT } from '../constants/widgetRegistry';
import DesignFilesWidget from '../Components/dashboard/DesignFilesWidget';
import WorkflowWidget from '../Components/dashboard/WorkflowWidget';
import OrderStatsCards from '../Components/dashboard/OrderStatsCards';
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

// The merged 'workflow' widget adapts to admin/non-admin internally, so the
// default layout no longer needs an admin-only widget appended here.
const getDefaultLayout = () => DEFAULT_LAYOUT;

/* ─── Quick Links Widget ─────────────────────────────────────────── */
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

/* ─── Recent Attendance Widget ──────────────────────────────────── */
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

/* ─── Drop Zone gap ─────────────────────────────────────────────── */
function DropZoneGap({ panelId, index, isDragging, onDropAt }) {
  const [over, setOver] = useState(false);

  return (
    <Box
      onDragOver={isDragging ? (e) => { e.preventDefault(); setOver(true); } : undefined}
      onDragLeave={isDragging ? () => setOver(false) : undefined}
      onDrop={isDragging ? (e) => { e.preventDefault(); setOver(false); onDropAt(e, panelId, index); } : undefined}
      sx={{
        height: over ? 44 : isDragging ? 14 : 10,
        borderRadius: 2,
        bgcolor: over ? alpha('#16a34a', 0.1) : 'transparent',
        border: isDragging ? '2px dashed' : 'none',
        borderColor: over ? '#16a34a' : alpha('#16a34a', 0.2),
        transition: 'all 0.15s ease',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {over && (
        <Typography variant="caption" color="#16a34a" fontWeight={700} sx={{ fontSize: '0.6rem' }}>
          Drop here
        </Typography>
      )}
    </Box>
  );
}

/* ─── Widget Card Wrapper ──────────────────────────────────────── */
function WidgetWrapper({ widgetId, editMode, onRemove, children, panelId, onDragStart, onDragEnd, collapsible, isExpanded, onToggleExpand }) {
  const wdef = WIDGET_REGISTRY.find((w) => w.id === widgetId);
  const Icon = wdef?.icon;
  const expanded = !collapsible || isExpanded;

  return (
    <Paper
      draggable={editMode}
      onDragStart={editMode ? (e) => onDragStart(e, widgetId, panelId) : undefined}
      onDragEnd={editMode ? onDragEnd : undefined}
      elevation={0}
      sx={{
        borderRadius: 2.5,
        border: '1px solid',
        borderColor: editMode ? alpha('#16a34a', 0.4) : 'divider',
        bgcolor: 'white',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        cursor: editMode ? 'grab' : 'default',
        transition: 'box-shadow 0.2s, border-color 0.2s',
        boxShadow: '0 1px 6px rgba(0,0,0,0.04)',
        '&:hover': editMode ? { boxShadow: '0 4px 20px rgba(22,163,74,0.12)' } : {},
        '&:active': editMode ? { cursor: 'grabbing' } : {},
      }}
    >
      <Stack
        direction="row"
        alignItems="center"
        spacing={0.75}
        onClick={collapsible ? () => onToggleExpand(widgetId) : undefined}
        sx={{
          px: 1.5,
          py: 0.9,
          borderBottom: '1px solid',
          borderColor: 'divider',
          bgcolor: editMode ? alpha('#16a34a', 0.03) : 'rgba(240,253,244,0.5)',
          cursor: collapsible ? 'pointer' : editMode ? 'grab' : 'default',
        }}
      >
        {editMode && (
          <DragIndicatorRoundedIcon sx={{ fontSize: 15, color: 'text.disabled', cursor: 'grab', flexShrink: 0 }} />
        )}
        {Icon && (
          <Box sx={{ color: wdef?.color || '#16a34a', display: 'flex', flexShrink: 0 }}>
            <Icon sx={{ fontSize: 15 }} />
          </Box>
        )}
        <Typography variant="caption" fontWeight={700} sx={{ flex: 1, color: 'text.secondary', fontSize: '0.72rem' }}>
          {wdef?.label || widgetId}
        </Typography>
        {collapsible && (
          <ExpandMoreRoundedIcon
            sx={{
              fontSize: 18,
              color: 'text.disabled',
              flexShrink: 0,
              transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 0.2s',
            }}
          />
        )}
        {/* Close button — always visible on hover */}
        <Tooltip title="Remove widget">
          <IconButton
            size="small"
            onClick={(e) => { e.stopPropagation(); onRemove(widgetId); }}
            sx={{
              p: 0.25,
              opacity: editMode ? 1 : 0,
              '.MuiPaper-root:hover &': { opacity: 1 },
              transition: 'opacity 0.15s',
              color: 'text.disabled',
              '&:hover': { color: 'error.main' },
            }}
          >
            <CloseRoundedIcon sx={{ fontSize: 14 }} />
          </IconButton>
        </Tooltip>
      </Stack>
      <Box sx={{ display: expanded ? 'block' : 'none', p: 1.25, overflowY: 'auto', flex: 1, minHeight: 0 }}>
        {children}
      </Box>
    </Paper>
  );
}

/* ─── Panel Column ──────────────────────────────────────────────── */
function DashboardPanel({
  panelId, widgetIds, editMode, isDragging,
  onDragStart, onDragEnd, onDropAt, onDropOnPanel,
  onRemoveWidget, renderWidget,
  collapsible, expandedWidgetId, onToggleWidget,
}) {
  const [panelOver, setPanelOver] = useState(false);
  const isEmpty = widgetIds.length === 0;
  const panelLabels = { left: 'Left Panel', right: 'Right Panel' };

  return (
    <Box
      onDragOver={isEmpty ? (e) => { e.preventDefault(); setPanelOver(true); } : undefined}
      onDragLeave={isEmpty ? () => setPanelOver(false) : undefined}
      onDrop={isEmpty ? (e) => { e.preventDefault(); setPanelOver(false); onDropOnPanel(e, panelId); } : undefined}
      sx={{
        minHeight: editMode ? 140 : 'auto',
        borderRadius: 2.5,
        border: editMode ? '2px dashed' : 'none',
        borderColor: panelOver ? '#16a34a' : editMode ? alpha('#16a34a', 0.28) : 'transparent',
        bgcolor: panelOver ? alpha('#16a34a', 0.04) : 'transparent',
        transition: 'all 0.2s',
        p: editMode ? 0.75 : 0,
      }}
    >
      {editMode && (
        <Typography
          variant="caption"
          fontWeight={800}
          color="#16a34a"
          sx={{ mb: 0.75, display: 'block', textAlign: 'center', textTransform: 'uppercase', letterSpacing: 1.2, fontSize: '0.58rem', opacity: 0.7 }}
        >
          {panelLabels[panelId]}
        </Typography>
      )}

      <Box sx={{ display: 'flex', flexDirection: 'column' }}>
        <DropZoneGap panelId={panelId} index={0} isDragging={isDragging} onDropAt={onDropAt} />
        {widgetIds.map((id, idx) => (
          <React.Fragment key={id}>
            <WidgetWrapper
              widgetId={id}
              editMode={editMode}
              onRemove={onRemoveWidget}
              panelId={panelId}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              collapsible={collapsible}
              isExpanded={expandedWidgetId === id}
              onToggleExpand={onToggleWidget}
            >
              {renderWidget(id)}
            </WidgetWrapper>
            <DropZoneGap panelId={panelId} index={idx + 1} isDragging={isDragging} onDropAt={onDropAt} />
          </React.Fragment>
        ))}

        {isEmpty && editMode && (
          <Box sx={{ textAlign: 'center', py: 5, color: 'text.disabled' }}>
            <WidgetsRoundedIcon sx={{ fontSize: 28, opacity: 0.3, mb: 0.5 }} />
            <Typography variant="caption" display="block">Drag widgets here</Typography>
          </Box>
        )}
      </Box>
    </Box>
  );
}

/* ─── Widget Library Drawer ─────────────────────────────────────── */
function WidgetLibrary({ open, onClose, unusedWidgets, isAdmin, permissions, onAdd }) {
  const available = unusedWidgets.filter((w) => {
    if (w.adminOnly && !isAdmin) return false;
    const allowed = permissions?.allowedWidgets;
    if (allowed?.length > 0 && !allowed.includes(w.id)) return false;
    return true;
  });

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{ sx: { width: 300, p: 2, bgcolor: '#f0fdf4' } }}
    >
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
        <Stack direction="row" spacing={1} alignItems="center">
          <WidgetsRoundedIcon sx={{ color: '#16a34a', fontSize: 20 }} />
          <Typography variant="subtitle2" fontWeight={800}>Widget Library</Typography>
        </Stack>
        <IconButton size="small" onClick={onClose}>
          <CloseRoundedIcon fontSize="small" />
        </IconButton>
      </Stack>

      <Typography variant="caption" color="text.secondary" sx={{ mb: 2, display: 'block' }}>
        Click a widget to add it to your center panel. Then drag to reposition.
      </Typography>

      {available.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 6 }}>
          <CheckRoundedIcon sx={{ fontSize: 36, color: '#16a34a', mb: 1 }} />
          <Typography variant="body2" color="text.secondary">All widgets are on your dashboard!</Typography>
        </Box>
      ) : (
        <Stack spacing={1}>
          {available.map((w) => {
            const Icon = w.icon;
            return (
              <Paper
                key={w.id}
                variant="outlined"
                onClick={() => onAdd(w.id)}
                sx={{
                  p: 1.5,
                  borderRadius: 2,
                  cursor: 'pointer',
                  borderColor: 'divider',
                  bgcolor: 'white',
                  transition: 'all 0.15s',
                  '&:hover': {
                    borderColor: '#16a34a',
                    boxShadow: '0 4px 14px rgba(22,163,74,0.1)',
                    transform: 'translateY(-1px)',
                  },
                }}
              >
                <Stack direction="row" spacing={1.25} alignItems="center">
                  <Box
                    sx={{
                      width: 36, height: 36, borderRadius: 1.5,
                      bgcolor: w.bg || '#dcfce7',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <Icon sx={{ fontSize: 18, color: w.color }} />
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="caption" fontWeight={700} display="block">{w.label}</Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
                      {w.description}
                    </Typography>
                  </Box>
                  <AddRoundedIcon sx={{ color: '#16a34a', flexShrink: 0, fontSize: 18 }} />
                </Stack>
              </Paper>
            );
          })}
        </Stack>
      )}
    </Drawer>
  );
}

/* ─── Main Home Component ───────────────────────────────────────── */
export default function Home() {
  const navigate = useNavigate();
  const location = useLocation();
  const { search } = useLocation();
  const { userName, userGroup, isAdmin, permissions } = useAuth();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const [loggedInUser, setLoggedInUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [attendanceData, setAttendanceData] = useState([]);

  const [layout, setLayout] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const dragPayload = useRef(null);

  /* Accordion widgets on mobile — only one open at a time */
  const [expandedWidget, setExpandedWidget] = useState(null);
  const handleToggleWidget = useCallback((id) => {
    setExpandedWidget((prev) => (prev === id ? null : id));
  }, []);
  useEffect(() => {
    if (!layout || expandedWidget) return;
    const first = (layout.left || [])[0] || (layout.right || [])[0];
    if (first) setExpandedWidget(first);
  }, [layout, expandedWidget]);

  /* Widget library via context */
  const dashCtx = useDashboardCustomize();
  const showLibrary = dashCtx?.widgetLibOpen ?? false;
  const setShowLibrary = (v) => v ? dashCtx?.openWidgetLib?.() : dashCtx?.closeWidgetLib?.();

  /* Handle ?widgets=1 query param */
  useEffect(() => {
    if (new URLSearchParams(search).get('widgets') === '1') {
      dashCtx?.openWidgetLib?.();
    }
  }, [search]);

  /* Init user */
  useEffect(() => {
    const user = location.state?.id || localStorage.getItem('User_name') || userName;
    if (!user) { navigate('/'); return; }
    setLoggedInUser(user);
    fetchAttendance(user);
    const timer = setTimeout(() => setIsLoading(false), 1500);
    return () => clearTimeout(timer);
  }, []);

  /* Load layout */
  useEffect(() => {
    const user = location.state?.id || localStorage.getItem('User_name') || userName;
    if (!user) return;
    try {
      const saved = localStorage.getItem(LAYOUT_KEY(user));
      if (saved) { setLayout(JSON.parse(saved)); return; }
    } catch {}
    setLayout(getDefaultLayout(isAdmin));
  }, [userName, isAdmin]);

  /* Persist layout */
  useEffect(() => {
    if (!layout || !loggedInUser) return;
    localStorage.setItem(LAYOUT_KEY(loggedInUser), JSON.stringify(layout));
  }, [layout, loggedInUser]);

  /* Sync layout when CustomizeDialog saves */
  useEffect(() => {
    const handler = () => {
      const user = localStorage.getItem('User_name') || userName;
      if (!user) return;
      try {
        const saved = localStorage.getItem(LAYOUT_KEY(user));
        if (saved) setLayout(JSON.parse(saved));
      } catch {}
    };
    window.addEventListener('mis_widget_layout_changed', handler);
    return () => window.removeEventListener('mis_widget_layout_changed', handler);
  }, [userName]);

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

  /* Drag handlers */
  const handleDragStart = useCallback((e, widgetId, panelId) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('widgetId', widgetId);
    e.dataTransfer.setData('fromPanel', panelId);
    dragPayload.current = { widgetId, panelId };
    setIsDragging(true);
  }, []);

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
    dragPayload.current = null;
  }, []);

  const handleDropAt = useCallback((e, toPanel, toIndex) => {
    e.preventDefault();
    const widgetId = e.dataTransfer.getData('widgetId');
    const fromPanel = e.dataTransfer.getData('fromPanel');
    if (!widgetId) return;
    setLayout((prev) => {
      const next = {
        left: [...(prev.left || [])],
        right: [...(prev.right || [])],
      };
      next[fromPanel] = next[fromPanel].filter((id) => id !== widgetId);
      next[toPanel].splice(toIndex, 0, widgetId);
      return next;
    });
    setIsDragging(false);
    dragPayload.current = null;
  }, []);

  const handleDropOnPanel = useCallback((e, toPanel) => {
    e.preventDefault();
    const widgetId = e.dataTransfer.getData('widgetId');
    const fromPanel = e.dataTransfer.getData('fromPanel');
    if (!widgetId) return;
    setLayout((prev) => {
      const next = {
        left: [...(prev.left || [])],
        right: [...(prev.right || [])],
      };
      next[fromPanel] = next[fromPanel].filter((id) => id !== widgetId);
      if (!next[toPanel].includes(widgetId)) next[toPanel].push(widgetId);
      return next;
    });
    setIsDragging(false);
    dragPayload.current = null;
  }, []);

  const handleRemoveWidget = useCallback((widgetId) => {
    setLayout((prev) => ({
      left: (prev.left || []).filter((id) => id !== widgetId),
      right: (prev.right || []).filter((id) => id !== widgetId),
    }));
  }, []);

  const handleAddWidget = useCallback((widgetId) => {
    setLayout((prev) => {
      const all = [...(prev.left || []), ...(prev.right || [])];
      if (all.includes(widgetId)) return prev;
      return { ...prev, right: [...(prev.right || []), widgetId] };
    });
    setShowLibrary(false);
    toast.success('Widget added to right panel');
  }, []);

  const handleResetLayout = useCallback(() => {
    setLayout(getDefaultLayout(isAdmin));
    toast.success('Layout reset to defaults');
  }, [isAdmin]);

  /* Widget renderer */
  const renderWidget = (id) => {
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
      default:
        return (
          <Typography variant="caption" color="text.disabled">Unknown widget</Typography>
        );
    }
  };

  if (!layout) return <LinearProgress sx={{ borderRadius: 1, mt: 2, bgcolor: '#dcfce7' }} />;

  const layoutIds = [...(layout.left || []), ...(layout.right || [])];
  const unusedWidgets = WIDGET_REGISTRY.filter((w) => !layoutIds.includes(w.id));
  const hasLeft = (layout.left || []).length > 0 || editMode;
  const hasRight = (layout.right || []).length > 0 || editMode;

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

      <OrderStatsCards />

      {isLoading && (
        <LinearProgress sx={{ mx: { xs: 1, md: 1.5 }, mb: 1, borderRadius: 1, bgcolor: '#dcfce7', '& .MuiLinearProgress-bar': { bgcolor: '#16a34a' } }} />
      )}

      {/* ── 2-Panel Grid ── */}
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          display: 'grid',
          gridTemplateColumns: {
            xs: '1fr',
            md: hasLeft && hasRight ? 'minmax(0,1fr) minmax(0,1fr)' : '1fr',
          },
          gap: 1.5,
          alignItems: 'stretch',
          px: { xs: 1, md: 1.5 },
          pb: 1,
          overflow: 'hidden',
        }}
      >
        {/* Left Panel */}
        {hasLeft && (
          <Box sx={{ overflow: 'auto', minHeight: 0, height: '100%' }}>
            <DashboardPanel
              panelId="left"
              widgetIds={layout.left || []}
              editMode={editMode}
              isDragging={isDragging}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onDropAt={handleDropAt}
              onDropOnPanel={handleDropOnPanel}
              onRemoveWidget={handleRemoveWidget}
              renderWidget={renderWidget}
              collapsible={isMobile && !editMode}
              expandedWidgetId={expandedWidget}
              onToggleWidget={handleToggleWidget}
            />
          </Box>
        )}

        {/* Right Panel */}
        {hasRight && (
          <Box sx={{ overflow: 'auto', minHeight: 0, height: '100%' }}>
            <DashboardPanel
              panelId="right"
              widgetIds={layout.right || []}
              editMode={editMode}
              isDragging={isDragging}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onDropAt={handleDropAt}
              onDropOnPanel={handleDropOnPanel}
              onRemoveWidget={handleRemoveWidget}
              renderWidget={renderWidget}
              collapsible={isMobile && !editMode}
              expandedWidgetId={expandedWidget}
              onToggleWidget={handleToggleWidget}
            />
          </Box>
        )}
      </Box>

      {/* ── Widget Library Drawer ─────────────────────────────── */}
      <WidgetLibrary
        open={showLibrary}
        onClose={() => setShowLibrary(false)}
        unusedWidgets={unusedWidgets}
        isAdmin={isAdmin}
        permissions={permissions}
        onAdd={handleAddWidget}
      />
    </Box>
  );
}
