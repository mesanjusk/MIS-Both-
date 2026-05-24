import { useCallback, useEffect, useState } from 'react';
import {
  Alert, Avatar, Box, Button, Card, CardContent, Chip, CircularProgress,
  Divider, FormControlLabel, Paper, Stack, Switch, Tab, Tabs, Typography,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import ManageAccountsRoundedIcon from '@mui/icons-material/ManageAccountsRounded';
import PersonRoundedIcon from '@mui/icons-material/PersonRounded';
import SaveRoundedIcon from '@mui/icons-material/SaveRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import WidgetsRoundedIcon from '@mui/icons-material/WidgetsRounded';
import MenuRoundedIcon from '@mui/icons-material/MenuRounded';
import LinkRoundedIcon from '@mui/icons-material/LinkRounded';
import toast from 'react-hot-toast';
import axios from '../apiClient';
import { SIDEBAR_GROUPS } from '../constants/sidebarMenu';
import { FOOTER_LINKS } from '../Components/Footer';

const TOP_NAV_ITEMS = ['Attendance', 'Orders', 'Accounts', 'Reports', 'WhatsApp', 'Call Logs', 'SOP', 'Admin'];
const FOOTER_LABELS = FOOTER_LINKS.map((l) => l.label);

const DEFAULT_PERMISSIONS = {
  sidebarGroups: [],
  canCreateOrders: true,
  canEditOrders: true,
  canDeleteOrders: false,
  canViewReports: true,
  canViewAccounts: true,
  canExportData: false,
  dashboardCards: [],
  allowedWidgets: [],
  topNavHidden: [],
  footerHidden: [],
};

const HOME_WIDGETS = [
  { id: 'quickLinks',       label: 'Quick Links',          desc: 'Navigate to all tools & pages',       color: '#16a34a', bg: '#dcfce7' },
  { id: 'attendance',       label: 'Attendance Snapshot',  desc: 'Live team attendance (admin only)',    color: '#2563eb', bg: '#dbeafe', adminOnly: true },
  { id: 'myTasks',          label: 'My Tasks',             desc: 'Current task assignments for user',   color: '#d97706', bg: '#fef3c7' },
  { id: 'recentAttendance', label: 'My Attendance',        desc: 'Recent personal check-in/out logs',   color: '#7c3aed', bg: '#ede9fe' },
  { id: 'pendingTasks',     label: 'Pending Task Queue',   desc: 'Click any task to update progress',   color: '#dc2626', bg: '#fee2e2' },
  { id: 'ordersBoard',      label: 'Orders Pipeline',      desc: 'Full order board & activity stream',  color: '#0891b2', bg: '#cffafe' },
];

const PERMISSION_LABELS = [
  { key: 'canCreateOrders',  label: 'Create Orders',   desc: 'Can create new orders' },
  { key: 'canEditOrders',    label: 'Edit Orders',     desc: 'Can modify existing orders' },
  { key: 'canDeleteOrders',  label: 'Delete Orders',   desc: 'Can cancel/delete orders' },
  { key: 'canViewReports',   label: 'View Reports',    desc: 'Can access all report pages' },
  { key: 'canViewAccounts',  label: 'View Accounts',   desc: 'Can access account & UPI pages' },
  { key: 'canExportData',    label: 'Export Data',     desc: 'Can export reports as CSV/PDF' },
];

const ALL_SIDEBAR_GROUPS = SIDEBAR_GROUPS.map((g) => g.label);

function getInitials(name = '') {
  return name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
}

function getRoleColor(group = '') {
  const g = group.toLowerCase();
  if (g.includes('admin') || g.includes('owner')) return 'success';
  if (g.includes('account')) return 'warning';
  if (g.includes('designer')) return 'info';
  return 'default';
}

function UserPermissionPanel({ user, onSaved }) {
  const [perms, setPerms] = useState(() => ({
    ...DEFAULT_PERMISSIONS,
    ...(user.permissions || {}),
  }));
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState(0);

  const toggleGroup = (group) => {
    setPerms((p) => {
      const current = Array.isArray(p.sidebarGroups) ? p.sidebarGroups : [];
      const next = current.includes(group)
        ? current.filter((g) => g !== group)
        : [...current, group];
      return { ...p, sidebarGroups: next };
    });
  };

  const toggleFlag = (key) => {
    setPerms((p) => ({ ...p, [key]: !p[key] }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await axios.put(`/api/users/updateUserPermissions/${user._id}`, { permissions: perms });
      toast.success(`Permissions saved for ${user.User_name}`);
      onSaved?.({ ...user, permissions: perms });
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to save permissions');
    } finally {
      setSaving(false);
    }
  };

  const toggleWidget = (widgetId) => {
    setPerms((p) => {
      const current = Array.isArray(p.allowedWidgets) ? p.allowedWidgets : [];
      const next = current.includes(widgetId)
        ? current.filter((id) => id !== widgetId)
        : [...current, widgetId];
      return { ...p, allowedWidgets: next };
    });
  };

  const toggleTopNav = (label) => {
    setPerms((p) => {
      const current = Array.isArray(p.topNavHidden) ? p.topNavHidden : [];
      const next = current.includes(label)
        ? current.filter((l) => l !== label)
        : [...current, label];
      return { ...p, topNavHidden: next };
    });
  };

  const toggleFooter = (label) => {
    setPerms((p) => {
      const current = Array.isArray(p.footerHidden) ? p.footerHidden : [];
      const next = current.includes(label)
        ? current.filter((l) => l !== label)
        : [...current, label];
      return { ...p, footerHidden: next };
    });
  };

  const allGroupsChecked = perms.sidebarGroups.length === 0;
  const groupsRestricted = !allGroupsChecked;
  const allWidgetsAllowed = !perms.allowedWidgets?.length;

  return (
    <Box>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }} variant="scrollable" scrollButtons="auto">
        <Tab label="Sidebar Access" />
        <Tab label="Feature Rights" />
        <Tab label="Home Widgets" icon={<WidgetsRoundedIcon sx={{ fontSize: 14 }} />} iconPosition="start" />
        <Tab label="Top Navbar" icon={<MenuRoundedIcon sx={{ fontSize: 14 }} />} iconPosition="start" />
        <Tab label="Footer" icon={<LinkRoundedIcon sx={{ fontSize: 14 }} />} iconPosition="start" />
      </Tabs>

      {tab === 0 && (
        <Box>
          <Alert severity="info" sx={{ mb: 2, borderRadius: 2 }}>
            {allGroupsChecked
              ? 'Showing ALL sidebar groups (role-based defaults apply). Restrict below to limit access.'
              : `Showing ${perms.sidebarGroups.length} of ${ALL_SIDEBAR_GROUPS.length} sidebar groups.`}
          </Alert>
          <Stack spacing={1}>
            {ALL_SIDEBAR_GROUPS.map((group) => {
              const isAllowed = allGroupsChecked || perms.sidebarGroups.includes(group);
              return (
                <Paper
                  key={group}
                  variant="outlined"
                  sx={{
                    p: 1.5,
                    borderRadius: 2,
                    borderColor: isAllowed ? 'primary.main' : 'divider',
                    bgcolor: isAllowed ? (t) => alpha(t.palette.primary.main, 0.04) : 'transparent',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                  onClick={() => toggleGroup(group)}
                >
                  <Stack direction="row" alignItems="center" justifyContent="space-between">
                    <Typography variant="body2" fontWeight={600}>{group}</Typography>
                    {isAllowed
                      ? <CheckCircleRoundedIcon color="primary" fontSize="small" />
                      : <Box sx={{ width: 18, height: 18, borderRadius: '50%', border: '2px solid', borderColor: 'divider' }} />}
                  </Stack>
                </Paper>
              );
            })}
          </Stack>
          <Alert severity="warning" sx={{ mt: 2, borderRadius: 2 }}>
            Sidebar group visibility also depends on the user&apos;s role. Showing a group here does not override role restrictions.
          </Alert>
          {groupsRestricted && (
            <Button
              variant="outlined"
              size="small"
              sx={{ mt: 1.5 }}
              onClick={() => setPerms((p) => ({ ...p, sidebarGroups: [] }))}
            >
              Reset to All Groups
            </Button>
          )}
        </Box>
      )}

      {tab === 1 && (
        <Box>
          <Stack spacing={1.5}>
            {PERMISSION_LABELS.map(({ key, label, desc }) => (
              <Paper key={key} variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={Boolean(perms[key])}
                      onChange={() => toggleFlag(key)}
                      color="primary"
                    />
                  }
                  label={
                    <Box>
                      <Typography variant="body2" fontWeight={700}>{label}</Typography>
                      <Typography variant="caption" color="text.secondary">{desc}</Typography>
                    </Box>
                  }
                  labelPlacement="start"
                  sx={{ width: '100%', m: 0, justifyContent: 'space-between' }}
                />
              </Paper>
            ))}
          </Stack>
        </Box>
      )}

      {tab === 2 && (
        <Box>
          <Alert severity="info" sx={{ mb: 2, borderRadius: 2 }}>
            {allWidgetsAllowed
              ? 'User can see ALL home dashboard widgets. Restrict below to limit which widgets are available.'
              : `User is restricted to ${perms.allowedWidgets.length} of ${HOME_WIDGETS.length} widgets.`}
          </Alert>
          <Stack spacing={1}>
            {HOME_WIDGETS.map((w) => {
              const isAllowed = allWidgetsAllowed || perms.allowedWidgets.includes(w.id);
              return (
                <Paper
                  key={w.id}
                  variant="outlined"
                  onClick={() => toggleWidget(w.id)}
                  sx={{
                    p: 1.5,
                    borderRadius: 2,
                    cursor: 'pointer',
                    borderColor: isAllowed ? w.color : 'divider',
                    bgcolor: isAllowed ? alpha(w.color, 0.05) : 'transparent',
                    transition: 'all 0.15s',
                    '&:hover': { borderColor: w.color },
                  }}
                >
                  <Stack direction="row" alignItems="center" spacing={1.5}>
                    <Box
                      sx={{
                        width: 32, height: 32, borderRadius: 1.5,
                        bgcolor: w.bg, display: 'flex', alignItems: 'center',
                        justifyContent: 'center', flexShrink: 0,
                      }}
                    >
                      <WidgetsRoundedIcon sx={{ fontSize: 16, color: w.color }} />
                    </Box>
                    <Box sx={{ flex: 1 }}>
                      <Stack direction="row" spacing={0.75} alignItems="center">
                        <Typography variant="body2" fontWeight={700}>{w.label}</Typography>
                        {w.adminOnly && (
                          <Chip size="small" label="Admin only" variant="outlined" sx={{ height: 16, fontSize: '0.6rem' }} />
                        )}
                      </Stack>
                      <Typography variant="caption" color="text.secondary">{w.desc}</Typography>
                    </Box>
                    {isAllowed
                      ? <CheckCircleRoundedIcon sx={{ color: w.color, flexShrink: 0 }} fontSize="small" />
                      : <Box sx={{ width: 18, height: 18, borderRadius: '50%', border: '2px solid', borderColor: 'divider', flexShrink: 0 }} />}
                  </Stack>
                </Paper>
              );
            })}
          </Stack>
          <Alert severity="warning" sx={{ mt: 2, borderRadius: 2 }}>
            These settings control widget visibility in the <strong>Widget Library</strong> only. Users can still see widgets already pinned to their layout until they remove them.
          </Alert>
          {!allWidgetsAllowed && (
            <Button
              variant="outlined"
              size="small"
              sx={{ mt: 1.5 }}
              onClick={() => setPerms((p) => ({ ...p, allowedWidgets: [] }))}
            >
              Allow All Widgets
            </Button>
          )}
        </Box>
      )}

      {tab === 3 && (
        <Box>
          <Alert severity="info" sx={{ mb: 2, borderRadius: 2 }}>
            {!(perms.topNavHidden || []).length
              ? 'User can see ALL top navbar dropdowns.'
              : `${(perms.topNavHidden || []).length} dropdown(s) are hidden for this user.`}
          </Alert>
          <Stack spacing={1}>
            {TOP_NAV_ITEMS.map((label) => {
              const isHidden = (perms.topNavHidden || []).includes(label);
              return (
                <Paper
                  key={label}
                  variant="outlined"
                  onClick={() => toggleTopNav(label)}
                  sx={{
                    p: 1.25,
                    borderRadius: 2,
                    cursor: 'pointer',
                    borderColor: isHidden ? 'divider' : 'primary.main',
                    bgcolor: isHidden ? 'transparent' : (t) => alpha(t.palette.primary.main, 0.04),
                    transition: 'all 0.15s',
                  }}
                >
                  <Stack direction="row" alignItems="center" justifyContent="space-between">
                    <Stack direction="row" spacing={1} alignItems="center">
                      <MenuRoundedIcon sx={{ fontSize: 15, color: isHidden ? 'text.disabled' : 'primary.main' }} />
                      <Typography variant="body2" fontWeight={600} color={isHidden ? 'text.disabled' : 'text.primary'}>{label}</Typography>
                    </Stack>
                    {!isHidden
                      ? <CheckCircleRoundedIcon color="primary" fontSize="small" />
                      : <Box sx={{ width: 18, height: 18, borderRadius: '50%', border: '2px solid', borderColor: 'divider' }} />}
                  </Stack>
                </Paper>
              );
            })}
          </Stack>
          {!!(perms.topNavHidden || []).length && (
            <Button variant="outlined" size="small" sx={{ mt: 1.5 }}
              onClick={() => setPerms((p) => ({ ...p, topNavHidden: [] }))}>
              Show All Nav Items
            </Button>
          )}
        </Box>
      )}

      {tab === 4 && (
        <Box>
          <Alert severity="info" sx={{ mb: 2, borderRadius: 2 }}>
            {!(perms.footerHidden || []).length
              ? 'User can see ALL footer links.'
              : `${(perms.footerHidden || []).length} footer link(s) are hidden for this user.`}
          </Alert>
          <Stack spacing={0.75}>
            {FOOTER_LABELS.map((label) => {
              const isHidden = (perms.footerHidden || []).includes(label);
              return (
                <Paper
                  key={label}
                  variant="outlined"
                  onClick={() => toggleFooter(label)}
                  sx={{
                    px: 1.5, py: 1,
                    borderRadius: 2,
                    cursor: 'pointer',
                    borderColor: isHidden ? 'divider' : 'primary.main',
                    bgcolor: isHidden ? 'transparent' : (t) => alpha(t.palette.primary.main, 0.04),
                    transition: 'all 0.15s',
                  }}
                >
                  <Stack direction="row" alignItems="center" justifyContent="space-between">
                    <Stack direction="row" spacing={1} alignItems="center">
                      <LinkRoundedIcon sx={{ fontSize: 14, color: isHidden ? 'text.disabled' : 'primary.main' }} />
                      <Typography variant="body2" fontWeight={600} color={isHidden ? 'text.disabled' : 'text.primary'}>{label}</Typography>
                    </Stack>
                    {!isHidden
                      ? <CheckCircleRoundedIcon color="primary" fontSize="small" />
                      : <Box sx={{ width: 18, height: 18, borderRadius: '50%', border: '2px solid', borderColor: 'divider' }} />}
                  </Stack>
                </Paper>
              );
            })}
          </Stack>
          {!!(perms.footerHidden || []).length && (
            <Button variant="outlined" size="small" sx={{ mt: 1.5 }}
              onClick={() => setPerms((p) => ({ ...p, footerHidden: [] }))}>
              Show All Footer Links
            </Button>
          )}
        </Box>
      )}

      <Button
        variant="contained"
        startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <SaveRoundedIcon />}
        onClick={handleSave}
        disabled={saving}
        sx={{ mt: 3 }}
        fullWidth
      >
        {saving ? 'Saving…' : 'Save Permissions'}
      </Button>
    </Box>
  );
}

export default function AdminUserPermissions() {
  const [users, setUsers]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [selected, setSelected] = useState(null);

  const load = useCallback(async () => {
    try {
      const { data } = await axios.get('/api/users/GetUserList');
      setUsers(Array.isArray(data?.result) ? data.result : []);
    } catch {
      toast.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSaved = (updatedUser) => {
    setUsers((prev) => prev.map((u) => (u._id === updatedUser._id ? updatedUser : u)));
    setSelected(updatedUser);
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 10 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: { xs: 1.5, md: 2.5 } }}>
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 3 }}>
        <ManageAccountsRoundedIcon color="primary" sx={{ fontSize: 30 }} />
        <Box>
          <Typography variant="h5" fontWeight={900}>User Permissions</Typography>
          <Typography variant="caption" color="text.secondary">
            Manage sidebar access, feature rights & home dashboard widgets per user
          </Typography>
        </Box>
      </Stack>

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems="flex-start">
        {/* User list */}
        <Box sx={{ width: { xs: '100%', md: 280 }, flexShrink: 0 }}>
          <Typography variant="caption" fontWeight={800} color="text.secondary" sx={{ mb: 1, display: 'block', textTransform: 'uppercase', letterSpacing: 0.8 }}>
            Users ({users.length})
          </Typography>
          <Stack spacing={1}>
            {users.map((user) => (
              <Card
                key={user._id}
                variant="outlined"
                sx={{
                  cursor: 'pointer',
                  borderColor: selected?._id === user._id ? 'primary.main' : 'divider',
                  bgcolor: selected?._id === user._id ? (t) => alpha(t.palette.primary.main, 0.06) : 'background.paper',
                  transition: 'all 0.15s',
                  '&:hover': { borderColor: 'primary.main' },
                }}
                onClick={() => setSelected(user)}
              >
                <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                  <Stack direction="row" alignItems="center" spacing={1.5}>
                    <Avatar sx={{ width: 36, height: 36, bgcolor: 'primary.main', fontSize: 14, fontWeight: 800 }}>
                      {getInitials(user.User_name)}
                    </Avatar>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" fontWeight={700} noWrap>{user.User_name}</Typography>
                      <Chip
                        size="small"
                        label={user.User_group}
                        color={getRoleColor(user.User_group)}
                        variant="outlined"
                        sx={{ height: 18, fontSize: '0.65rem', mt: 0.3 }}
                      />
                    </Box>
                    {(
                      user.permissions?.sidebarGroups?.length > 0 ||
                      user.permissions?.allowedWidgets?.length > 0 ||
                      user.permissions?.topNavHidden?.length > 0 ||
                      user.permissions?.footerHidden?.length > 0
                    ) && (
                      <Chip size="small" label="Custom" color="primary" variant="outlined" sx={{ height: 18, fontSize: '0.65rem' }} />
                    )}
                  </Stack>
                </CardContent>
              </Card>
            ))}
          </Stack>
        </Box>

        {/* Permission editor */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          {selected ? (
            <Card variant="outlined">
              <CardContent sx={{ p: 2.5 }}>
                <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 2.5 }}>
                  <Avatar sx={{ bgcolor: 'primary.main', width: 44, height: 44, fontWeight: 800 }}>
                    {getInitials(selected.User_name)}
                  </Avatar>
                  <Box>
                    <Typography variant="h6" fontWeight={900}>{selected.User_name}</Typography>
                    <Stack direction="row" spacing={0.75} mt={0.25}>
                      <Chip size="small" label={selected.User_group} color={getRoleColor(selected.User_group)} />
                      <Chip size="small" icon={<PersonRoundedIcon />} label={selected.Mobile_number || '—'} variant="outlined" />
                    </Stack>
                  </Box>
                </Stack>
                <Divider sx={{ mb: 2.5 }} />
                <UserPermissionPanel key={selected._id} user={selected} onSaved={handleSaved} />
              </CardContent>
            </Card>
          ) : (
            <Paper
              variant="outlined"
              sx={{ p: 6, textAlign: 'center', borderRadius: 3, borderStyle: 'dashed' }}
            >
              <ManageAccountsRoundedIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
              <Typography color="text.secondary">Select a user to manage their permissions</Typography>
            </Paper>
          )}
        </Box>
      </Stack>
    </Box>
  );
}
