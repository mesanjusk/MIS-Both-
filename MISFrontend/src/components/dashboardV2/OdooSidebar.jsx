import { useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Box,
  Collapse,
  Divider,
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Tooltip,
  Typography,
} from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import DashboardRoundedIcon from '@mui/icons-material/DashboardRounded';
import HubRoundedIcon from '@mui/icons-material/HubRounded';
import AccountBalanceRoundedIcon from '@mui/icons-material/AccountBalanceRounded';
import PeopleRoundedIcon from '@mui/icons-material/PeopleRounded';
import ChatRoundedIcon from '@mui/icons-material/ChatRounded';
import AnalyticsRoundedIcon from '@mui/icons-material/AnalyticsRounded';
import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded';
import ExpandLessRoundedIcon from '@mui/icons-material/ExpandLessRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import { SIDEBAR_GROUPS } from '../../constants/sidebarMenu.jsx';

const RAIL_WIDTH = 64;
const PANEL_WIDTH = 220;
const DRAWER_WIDTH = RAIL_WIDTH + PANEL_WIDTH;

const normalizeRoleKey = (value = '') => {
  const text = String(value || '').trim().toLowerCase().replace(/\s+/g, '');
  if (['admin', 'adminuser', 'superadmin', 'owner'].includes(text)) return 'Admin';
  if (['designer'].includes(text)) return 'Designer';
  if (['dataentry', 'dataentryuser'].includes(text)) return 'DataEntry';
  if (['officestaff', 'officeuser', 'otheroffice'].includes(text)) return 'OfficeStaff';
  if (['accounts', 'accountant', 'accountsuser'].includes(text)) return 'Accounts';
  return value || 'User';
};

const canShow = (item, roleKey) => {
  const roles = item.roles || ['Admin'];
  return roles.includes('all') || roles.includes(roleKey) || roleKey === 'Admin';
};

// Map SIDEBAR_GROUPS labels → module definitions
const MODULE_MAP = [
  { key: 'Overview',          label: 'Overview',    icon: DashboardRoundedIcon },
  { key: 'Operations Center', label: 'Operations',  icon: HubRoundedIcon },
  { key: 'Accounts & UPI',    label: 'Accounts',    icon: AccountBalanceRoundedIcon },
  { key: 'Masters',           label: 'Masters',     icon: SettingsRoundedIcon },
  { key: 'WhatsApp',          label: 'WhatsApp',    icon: ChatRoundedIcon },
  { key: 'Reports',           label: 'Reports',     icon: AnalyticsRoundedIcon },
];

function SidebarInner({ onNavigate, onClose }) {
  const { pathname } = useLocation();
  const theme = useTheme();
  const roleKey = normalizeRoleKey(localStorage.getItem('User_group') || '');

  const [activeModule, setActiveModule] = useState(MODULE_MAP[0].key);
  const [expandedSections, setExpandedSections] = useState({});

  const bg = theme.palette.primary.dark || theme.palette.primary.main;
  const text = theme.palette.primary.contrastText || '#fff';
  const muted = alpha(text, 0.65);
  const hover = alpha(text, 0.1);
  const selected = alpha(text, 0.18);

  // Build groups filtered by role
  const filteredGroups = useMemo(
    () =>
      SIDEBAR_GROUPS.map((g) => ({
        ...g,
        items: g.items.filter((item) => canShow(item, roleKey)),
      })).filter((g) => g.items.length > 0),
    [roleKey],
  );

  const activeGroup = filteredGroups.find((g) => g.label === activeModule);

  // Group items by sub-label if they exist (for potential future nesting), else flat
  const toggleSection = (label) =>
    setExpandedSections((prev) => ({ ...prev, [label]: !prev[label] }));

  return (
    <Box sx={{ display: 'flex', height: '100%', bgcolor: bg }}>
      {/* Rail: module icons */}
      <Box
        sx={{
          width: RAIL_WIDTH,
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          py: 1,
          gap: 0.5,
          borderRight: `1px solid ${alpha(text, 0.08)}`,
        }}
      >
        {/* Logo mark */}
        <Box sx={{ width: 36, height: 36, bgcolor: alpha(text, 0.15), borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 1 }}>
          <Typography variant="caption" fontWeight={900} sx={{ color: text, fontSize: 11 }}>MIS</Typography>
        </Box>

        <Divider sx={{ width: '60%', bgcolor: alpha(text, 0.12), mb: 0.5 }} />

        {MODULE_MAP.filter((m) => filteredGroups.some((g) => g.label === m.key)).map((mod) => {
          const ModIcon = mod.icon;
          const isActive = activeModule === mod.key;
          return (
            <Tooltip key={mod.key} title={mod.label} placement="right" arrow>
              <Box
                onClick={() => setActiveModule(mod.key)}
                sx={{
                  width: 44,
                  height: 44,
                  borderRadius: 2.5,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  bgcolor: isActive ? alpha(text, 0.2) : 'transparent',
                  color: isActive ? text : muted,
                  transition: 'all 0.15s',
                  '&:hover': { bgcolor: hover, color: text },
                  gap: 0.25,
                }}
              >
                <ModIcon sx={{ fontSize: 20 }} />
                <Typography sx={{ fontSize: 8.5, fontWeight: 600, lineHeight: 1, opacity: 0.85 }}>
                  {mod.label}
                </Typography>
              </Box>
            </Tooltip>
          );
        })}
      </Box>

      {/* Sub-menu panel */}
      <Box sx={{ width: PANEL_WIDTH, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Module header */}
        <Box sx={{ px: 2, pt: 2, pb: 1 }}>
          <Typography variant="overline" sx={{ color: muted, fontSize: 10, letterSpacing: 1.2, fontWeight: 700 }}>
            {MODULE_MAP.find((m) => m.key === activeModule)?.label || activeModule}
          </Typography>
        </Box>

        <List disablePadding dense sx={{ flex: 1, overflowY: 'auto', px: 1 }}>
          {(activeGroup?.items || []).map((item) => {
            const isSelected = pathname === item.path;
            return (
              <ListItemButton
                key={item.path}
                selected={isSelected}
                onClick={() => { onNavigate(item.path); if (onClose) onClose(); }}
                sx={{
                  borderRadius: 2,
                  mb: 0.25,
                  px: 1.5,
                  py: 0.75,
                  color: isSelected ? text : muted,
                  bgcolor: isSelected ? selected : 'transparent',
                  '&:hover': { bgcolor: hover, color: text },
                  '&.Mui-selected': { bgcolor: selected, color: text },
                  '&.Mui-selected:hover': { bgcolor: alpha(text, 0.22) },
                }}
              >
                <ListItemIcon sx={{ minWidth: 28, color: 'inherit' }}>
                  {item.icon}
                </ListItemIcon>
                <ListItemText
                  primary={item.label}
                  primaryTypographyProps={{ variant: 'body2', fontWeight: isSelected ? 600 : 400, noWrap: true, fontSize: 13 }}
                />
              </ListItemButton>
            );
          })}
        </List>
      </Box>
    </Box>
  );
}

export default function OdooSidebar({ mobileOpen, onCloseMobile }) {
  const navigate = useNavigate();

  const handleNavigate = (path) => navigate(path);

  const drawerContent = (
    <SidebarInner onNavigate={handleNavigate} onClose={onCloseMobile} />
  );

  return (
    <>
      {/* Mobile drawer */}
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={onCloseMobile}
        ModalProps={{ keepMounted: true }}
        sx={{
          display: { xs: 'block', md: 'none' },
          '& .MuiDrawer-paper': { width: DRAWER_WIDTH, boxSizing: 'border-box', border: 'none' },
        }}
      >
        {drawerContent}
      </Drawer>

      {/* Desktop permanent drawer */}
      <Drawer
        variant="permanent"
        sx={{
          display: { xs: 'none', md: 'block' },
          '& .MuiDrawer-paper': { width: DRAWER_WIDTH, boxSizing: 'border-box', border: 'none', position: 'relative' },
        }}
        open
      >
        {drawerContent}
      </Drawer>
    </>
  );
}

export { DRAWER_WIDTH };
