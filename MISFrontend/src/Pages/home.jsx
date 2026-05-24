import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Box, Typography, IconButton, Tooltip, Stack, Paper,
  Button, Drawer, LinearProgress, Dialog, DialogContent,
  Chip, Grid, Divider,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import axios from '../apiClient.js';
import ClickAwayListener from '@mui/material/ClickAwayListener';

import AllOrder from '../Reports/allOrder';
import UserTask from './userTask';
import PendingTasks from './PendingTasks';
import AllAttandance from './AllAttandance';
import TaskUpdate from './taskUpdate';
import { useAuth } from '../context/AuthContext';
import { SIDEBAR_GROUPS } from '../constants/sidebarMenu';
import { useDashboardCustomize } from './Layout';

import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import DragIndicatorRoundedIcon from '@mui/icons-material/DragIndicatorRounded';
import GridViewRoundedIcon from '@mui/icons-material/GridViewRounded';
import DashboardCustomizeRoundedIcon from '@mui/icons-material/DashboardCustomizeRounded';
import EventAvailableRoundedIcon from '@mui/icons-material/EventAvailableRounded';
import AssignmentRoundedIcon from '@mui/icons-material/AssignmentRounded';
import PendingActionsRoundedIcon from '@mui/icons-material/PendingActionsRounded';
import LocalShippingRoundedIcon from '@mui/icons-material/LocalShippingRounded';
import AccessTimeRoundedIcon from '@mui/icons-material/AccessTimeRounded';
import WidgetsRoundedIcon from '@mui/icons-material/WidgetsRounded';
import RestartAltRoundedIcon from '@mui/icons-material/RestartAltRounded';
import WbSunnyRoundedIcon from '@mui/icons-material/WbSunnyRounded';
import Brightness3RoundedIcon from '@mui/icons-material/Brightness3Rounded';
import WbTwilightRoundedIcon from '@mui/icons-material/WbTwilightRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import AddShoppingCartRoundedIcon from '@mui/icons-material/AddShoppingCartRounded';
import ReceiptLongRoundedIcon from '@mui/icons-material/ReceiptLongRounded';
import PaymentsRoundedIcon from '@mui/icons-material/PaymentsRounded';
import NotificationsActiveRoundedIcon from '@mui/icons-material/NotificationsActiveRounded';
import AddTaskRoundedIcon from '@mui/icons-material/AddTaskRounded';
import AddCardRoundedIcon from '@mui/icons-material/AddCardRounded';

import { ROUTES } from '../constants/routes';

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

/* ─── Widget Registry ─────────────────────────────────────────────── */
export const WIDGET_REGISTRY = [
  {
    id: 'quickLinks',
    label: 'Quick Links',
    icon: GridViewRoundedIcon,
    color: '#16a34a',
    bg: '#dcfce7',
    defaultPanel: 'center',
    adminOnly: false,
    description: 'Navigate to all tools & pages',
  },
  {
    id: 'attendance',
    label: 'Attendance Snapshot',
    icon: EventAvailableRoundedIcon,
    color: '#2563eb',
    bg: '#dbeafe',
    defaultPanel: 'left',
    adminOnly: true,
    description: 'Live team attendance overview',
  },
  {
    id: 'myTasks',
    label: 'My Tasks',
    icon: AssignmentRoundedIcon,
    color: '#d97706',
    bg: '#fef3c7',
    defaultPanel: 'left',
    adminOnly: false,
    description: 'Current task assignments',
  },
  {
    id: 'recentAttendance',
    label: 'My Attendance',
    icon: AccessTimeRoundedIcon,
    color: '#7c3aed',
    bg: '#ede9fe',
    defaultPanel: 'left',
    adminOnly: false,
    description: 'Recent check-in / check-out logs',
  },
  {
    id: 'pendingTasks',
    label: 'Pending Task Queue',
    icon: PendingActionsRoundedIcon,
    color: '#dc2626',
    bg: '#fee2e2',
    defaultPanel: 'center',
    adminOnly: false,
    description: 'Click any task to update progress',
  },
  {
    id: 'ordersBoard',
    label: 'Orders Pipeline',
    icon: LocalShippingRoundedIcon,
    color: '#0891b2',
    bg: '#cffafe',
    defaultPanel: 'center',
    adminOnly: false,
    description: 'Full order board & activity stream',
  },
];

const LAYOUT_KEY = (user) => `mis_home_layout_v4_${user}`;

const getDefaultLayout = () => ({
  left: [],
  center: ['myTasks'],
  right: [],
});

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return { text: 'Good morning', icon: WbSunnyRoundedIcon };
  if (h < 17) return { text: 'Good afternoon', icon: WbTwilightRoundedIcon };
  return { text: 'Good evening', icon: Brightness3RoundedIcon };
}

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
function WidgetWrapper({ widgetId, editMode, onRemove, children, panelId, onDragStart, onDragEnd }) {
  const wdef = WIDGET_REGISTRY.find((w) => w.id === widgetId);
  const Icon = wdef?.icon;

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
        sx={{
          px: 1.5,
          py: 0.9,
          borderBottom: '1px solid',
          borderColor: 'divider',
          bgcolor: editMode ? alpha('#16a34a', 0.03) : 'rgba(240,253,244,0.5)',
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
        {/* Close button — always visible on hover */}
        <Tooltip title="Remove widget">
          <IconButton
            size="small"
            onClick={() => onRemove(widgetId)}
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
      <Box sx={{ p: 1.25, overflowY: 'auto', flex: 1, minHeight: 0 }}>
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
}) {
  const [panelOver, setPanelOver] = useState(false);
  const isEmpty = widgetIds.length === 0;
  const panelLabels = { left: 'Left Panel', center: 'Center Panel', right: 'Right Panel' };

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

  const [loggedInUser, setLoggedInUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [attendanceData, setAttendanceData] = useState([]);
  const [task, setTask] = useState([]);
  const [selectedTaskId, setSelectedTaskId] = useState(null);
  const [showTaskModal, setShowTaskModal] = useState(false);

  const [layout, setLayout] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const dragPayload = useRef(null);

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

  /* Plus dropdown */
  const [plusOpen, setPlusOpen] = useState(false);
  const plusAnchorRef = useRef(null);

  const PLUS_SECTIONS = [
    {
      label: '⚡ Quick Add',
      items: [
        { label: 'New Order', icon: <AddShoppingCartRoundedIcon fontSize="small" />, onClick: () => navigate(ROUTES.ORDERS_NEW) },
        { label: 'Receipt', icon: <ReceiptLongRoundedIcon fontSize="small" />, path: ROUTES.RECEIPT },
        { label: 'Payment', icon: <PaymentsRoundedIcon fontSize="small" />, path: ROUTES.PAYMENT },
        { label: 'Followup', icon: <NotificationsActiveRoundedIcon fontSize="small" />, path: ROUTES.FOLLOWUPS },
        { label: 'New Task', icon: <AddTaskRoundedIcon fontSize="small" />, path: ROUTES.TASKS_NEW },
        { label: 'Add UPI', icon: <AddCardRoundedIcon fontSize="small" />, onClick: () => dashCtx?.openUpi?.() },
      ],
    },
  ];

  /* Init user */
  useEffect(() => {
    const user = location.state?.id || localStorage.getItem('User_name') || userName;
    if (!user) { navigate('/'); return; }
    setLoggedInUser(user);
    fetchData();
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
    setLayout(getDefaultLayout());
  }, [userName, isAdmin]);

  /* Persist layout */
  useEffect(() => {
    if (!layout || !loggedInUser) return;
    localStorage.setItem(LAYOUT_KEY(loggedInUser), JSON.stringify(layout));
  }, [layout, loggedInUser]);

  const fetchData = async () => {
    try {
      const res = await axios.get('/api/usertasks/GetUsertaskList');
      setTask(res.data.success ? res.data.result : []);
    } catch { toast.error('Failed to load tasks'); }
  };

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
        center: [...(prev.center || [])],
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
        center: [...(prev.center || [])],
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
      center: (prev.center || []).filter((id) => id !== widgetId),
      right: (prev.right || []).filter((id) => id !== widgetId),
    }));
  }, []);

  const handleAddWidget = useCallback((widgetId) => {
    setLayout((prev) => {
      const all = [...(prev.left || []), ...(prev.center || []), ...(prev.right || [])];
      if (all.includes(widgetId)) return prev;
      return { ...prev, center: [...(prev.center || []), widgetId] };
    });
    setShowLibrary(false);
    toast.success('Widget added to center panel');
  }, []);

  const handleResetLayout = useCallback(() => {
    setLayout(getDefaultLayout());
    toast.success('Layout reset to defaults');
  }, [isAdmin]);

  /* Widget renderer */
  const renderWidget = (id) => {
    switch (id) {
      case 'quickLinks':
        return <QuickLinksWidget userGroup={userGroup} isAdmin={isAdmin} />;
      case 'attendance':
        return isAdmin ? <AllAttandance /> : null;
      case 'myTasks':
        return <UserTask />;
      case 'recentAttendance':
        return <RecentAttendanceWidget attendanceData={attendanceData} />;
      case 'pendingTasks':
        return (
          <PendingTasks
            tasks={isAdmin ? task : task.filter((t) => t.User === loggedInUser)}
            isLoading={isLoading}
            onTaskClick={(t) => { setSelectedTaskId(t); setShowTaskModal(true); }}
          />
        );
      case 'ordersBoard':
        return <AllOrder />;
      default:
        return (
          <Typography variant="caption" color="text.disabled">Unknown widget</Typography>
        );
    }
  };

  if (!layout) return <LinearProgress sx={{ borderRadius: 1, mt: 2, bgcolor: '#dcfce7' }} />;

  const layoutIds = [...(layout.left || []), ...(layout.center || []), ...(layout.right || [])];
  const unusedWidgets = WIDGET_REGISTRY.filter((w) => !layoutIds.includes(w.id));
  const hasLeft = (layout.left || []).length > 0 || editMode;
  const hasRight = (layout.right || []).length > 0 || editMode;

  const greeting = getGreeting();
  const GreetIcon = greeting.icon;

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', bgcolor: '#f0fdf4' }}>

      {/* ── Hero ── */}
      <Box sx={{ textAlign: 'center', pt: { xs: 2, md: 3 }, pb: 1.5, flexShrink: 0 }}>
        <Typography
          variant="h2"
          sx={{
            fontFamily: '"Google Sans","Product Sans",Roboto,sans-serif',
            fontWeight: 900,
            fontSize: { xs: '2.4rem', md: '3.2rem' },
            lineHeight: 1,
            mb: 0.5,
            userSelect: 'none',
          }}
        >
          <ColoredName name={(loggedInUser || userName || 'User').split(' ')[0]} />
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
          <Box component="span" sx={{ color: '#FBBC05' }}>
            <GreetIcon sx={{ fontSize: 12, mr: 0.4, mb: '-2px' }} />
          </Box>
          {greeting.text} · {userGroup || 'User'} · {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
        </Typography>

        {/* Search with + button */}
        <ClickAwayListener onClickAway={() => setPlusOpen(false)}>
          <Box sx={{ position: 'relative', display: 'inline-flex', maxWidth: 560, width: '90%' }}>
            <Box
              ref={plusAnchorRef}
              sx={{
                display: 'flex', alignItems: 'center',
                bgcolor: 'white', border: '1.5px solid', borderColor: alpha('#16a34a', 0.25),
                borderRadius: '28px', width: '100%',
                boxShadow: '0 4px 20px rgba(22,163,74,.1)',
                '&:focus-within': { borderColor: '#16a34a', boxShadow: '0 4px 20px rgba(22,163,74,.18)' },
              }}
            >
              <Tooltip title="Quick Add & Navigate">
                <Box
                  component="button"
                  onClick={() => setPlusOpen((p) => !p)}
                  sx={{
                    width: 44, height: 44, bgcolor: '#16a34a', border: 'none', cursor: 'pointer',
                    borderRadius: '26px 0 0 26px', color: 'white', fontSize: '1.4rem', fontWeight: 300,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    borderRight: '1.5px solid', borderRightColor: alpha('#16a34a', 0.25),
                    '&:hover': { bgcolor: '#15803d' },
                  }}
                >
                  +
                </Box>
              </Tooltip>
              <Box
                component="input"
                placeholder="Search order #, customer name, item, vendor, or amount…"
                sx={{
                  flex: 1, border: 'none', outline: 'none', px: 2, py: 1.25,
                  fontSize: '0.85rem', color: '#334155', bgcolor: 'transparent',
                  '&::placeholder': { color: '#94a3b8' },
                }}
              />
              <Stack direction="row" spacing={0.25} sx={{ pr: 1 }}>
                <Tooltip title="Voice Search">
                  <IconButton size="small" sx={{ color: 'text.disabled' }}>
                    <SearchRoundedIcon sx={{ fontSize: 18 }} />
                  </IconButton>
                </Tooltip>
              </Stack>
            </Box>

            {/* Plus dropdown - Google style */}
            {plusOpen && (
              <Paper
                elevation={4}
                sx={{
                  position: 'absolute', top: 52, left: 0,
                  minWidth: 240, borderRadius: 2.5,
                  border: '1px solid', borderColor: 'divider',
                  zIndex: 1400, py: 0.5, overflow: 'hidden',
                  boxShadow: '0 12px 40px rgba(0,0,0,0.15)',
                }}
              >
                {PLUS_SECTIONS.map((section, si) => (
                  <Box key={section.label}>
                    {si > 0 && <Divider sx={{ my: 0.5 }} />}
                    <Typography sx={{ fontSize: '0.6rem', fontWeight: 800, color: 'text.disabled', textTransform: 'uppercase', letterSpacing: 0.8, px: 2, pt: 0.75, pb: 0.25 }}>
                      {section.label}
                    </Typography>
                    {section.items.map((item) => (
                      <Box
                        key={item.label}
                        component="button"
                        onClick={() => {
                          setPlusOpen(false);
                          if (item.onClick) item.onClick();
                          else if (item.path) navigate(item.path);
                        }}
                        sx={{
                          display: 'flex', alignItems: 'center', gap: 1.25,
                          width: '100%', px: 2, py: 0.85, border: 'none', cursor: 'pointer',
                          bgcolor: 'transparent', textAlign: 'left',
                          fontSize: '0.82rem', color: '#334155', fontWeight: 500,
                          '&:hover': { bgcolor: '#f0fdf4', color: '#16a34a' },
                        }}
                      >
                        <Box sx={{ color: 'text.secondary', display: 'flex' }}>{item.icon || <SearchRoundedIcon sx={{ fontSize: 16 }} />}</Box>
                        {item.label}
                      </Box>
                    ))}
                  </Box>
                ))}
              </Paper>
            )}
          </Box>
        </ClickAwayListener>

      </Box>

      {isLoading && (
        <LinearProgress sx={{ mx: { xs: 1, md: 1.5 }, mb: 1, borderRadius: 1, bgcolor: '#dcfce7', '& .MuiLinearProgress-bar': { bgcolor: '#16a34a' } }} />
      )}

      {/* ── 3-Panel Grid ── */}
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          display: 'grid',
          gridTemplateColumns: {
            xs: '1fr',
            md: [hasLeft ? '260px' : '', '1fr', hasRight ? '260px' : ''].filter(Boolean).join(' '),
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
            />
          </Box>
        )}

        {/* Center Panel */}
        <Box sx={{ overflow: 'auto', minHeight: 0, height: '100%' }}>
          <DashboardPanel
            panelId="center"
            widgetIds={layout.center || []}
            editMode={editMode}
            isDragging={isDragging}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDropAt={handleDropAt}
            onDropOnPanel={handleDropOnPanel}
            onRemoveWidget={handleRemoveWidget}
            renderWidget={renderWidget}
          />
        </Box>

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

      {/* ── Task update dialog ────────────────────────────────── */}
      <Dialog
        open={showTaskModal}
        onClose={() => { setShowTaskModal(false); setSelectedTaskId(null); }}
        maxWidth="md"
        fullWidth
      >
        <DialogContent sx={{ p: 0.5 }}>
          {selectedTaskId && (
            <TaskUpdate
              task={selectedTaskId}
              onClose={() => { setShowTaskModal(false); setSelectedTaskId(null); }}
            />
          )}
        </DialogContent>
      </Dialog>
    </Box>
  );
}
