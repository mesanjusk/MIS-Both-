import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  Stack,
  Switch,
  Tab,
  Tabs,
  Typography,
} from '@mui/material';
import { SIDEBAR_GROUPS } from '../constants/sidebarMenu.jsx';
import { WIDGET_REGISTRY, LAYOUT_KEY, DEFAULT_LAYOUT } from '../constants/widgetRegistry.jsx';
import { useNavCustomize } from '../hooks/useNavCustomize';
import { FOOTER_LINKS } from './Footer';

const RIGHT_ACTIONS = ['Day Book', 'Send Email', 'UPI Payment', 'Transaction 4D', 'Attendance'];
const RIGHT_LINKS = ['Orders', 'Business', 'Post Print', 'Workflows', 'WhatsApp', 'Reports', 'Attendance', 'Dispatch'];
const TOP_NAV_ITEMS = ['Attendance', 'Orders', 'Accounts', 'Reports', 'WhatsApp', 'Call Logs', 'SOP', 'Admin'];

export default function CustomizeDialog({ open, onClose }) {
  const { prefs, save } = useNavCustomize();
  const [draft, setDraft] = useState({});
  const [tab, setTab] = useState(0);
  const [widgetLayout, setWidgetLayout] = useState(DEFAULT_LAYOUT);

  useEffect(() => {
    if (open) {
      setDraft(prefs);
      const user = localStorage.getItem('User_name') || '';
      try {
        const saved = localStorage.getItem(LAYOUT_KEY(user));
        setWidgetLayout(saved ? JSON.parse(saved) : DEFAULT_LAYOUT);
      } catch {
        setWidgetLayout(DEFAULT_LAYOUT);
      }
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── nav toggles ── */
  const toggleLeft = (path) =>
    setDraft((prev) => {
      const hidden = prev.leftHidden || [];
      return { ...prev, leftHidden: hidden.includes(path) ? hidden.filter((p) => p !== path) : [...hidden, path] };
    });

  const toggleRightAction = (label) =>
    setDraft((prev) => {
      const hidden = prev.rightActionsHidden || [];
      return { ...prev, rightActionsHidden: hidden.includes(label) ? hidden.filter((l) => l !== label) : [...hidden, label] };
    });

  const toggleRightLink = (label) =>
    setDraft((prev) => {
      const hidden = prev.rightLinksHidden || [];
      return { ...prev, rightLinksHidden: hidden.includes(label) ? hidden.filter((l) => l !== label) : [...hidden, label] };
    });

  const toggleTopNav = (label) =>
    setDraft((prev) => {
      const hidden = prev.topNavHidden || [];
      return { ...prev, topNavHidden: hidden.includes(label) ? hidden.filter((l) => l !== label) : [...hidden, label] };
    });

  const toggleFooter = (label) =>
    setDraft((prev) => {
      const hidden = prev.footerHidden || [];
      return { ...prev, footerHidden: hidden.includes(label) ? hidden.filter((l) => l !== label) : [...hidden, label] };
    });

  /* ── widget toggles ── */
  const allWidgetIds = [...(widgetLayout.left || []), ...(widgetLayout.center || []), ...(widgetLayout.right || [])];

  const getPanel = (id) => {
    if ((widgetLayout.left   || []).includes(id)) return 'Left';
    if ((widgetLayout.center || []).includes(id)) return 'Center';
    if ((widgetLayout.right  || []).includes(id)) return 'Right';
    return null;
  };

  const addWidget = (id) =>
    setWidgetLayout((prev) => ({ ...prev, center: [...(prev.center || []), id] }));

  const removeWidget = (id) =>
    setWidgetLayout((prev) => ({
      left:   (prev.left   || []).filter((i) => i !== id),
      center: (prev.center || []).filter((i) => i !== id),
      right:  (prev.right  || []).filter((i) => i !== id),
    }));

  /* ── save / cancel / reset ── */
  const handleSave = () => {
    save(draft);
    const user = localStorage.getItem('User_name') || '';
    localStorage.setItem(LAYOUT_KEY(user), JSON.stringify(widgetLayout));
    window.dispatchEvent(new CustomEvent('mis_widget_layout_changed'));
    onClose();
  };

  const handleCancel = () => {
    setDraft(prefs);
    onClose();
  };

  const handleReset = () => {
    setDraft({});
    setWidgetLayout(DEFAULT_LAYOUT);
  };

  return (
    <Dialog open={open} onClose={handleCancel} fullWidth maxWidth="sm">
      <DialogTitle sx={{ pb: 0, fontWeight: 800 }}>Customize</DialogTitle>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ px: 3 }} variant="scrollable" scrollButtons="auto">
        <Tab label="Top Navbar" />
        <Tab label="Left Sidebar" />
        <Tab label="Right Sidebar" />
        <Tab label="Home Widgets" />
        <Tab label="Footer" />
      </Tabs>

      <Divider />

      <DialogContent sx={{ pt: 1.5, minHeight: 380, maxHeight: '60vh', overflowY: 'auto' }}>
        {/* ── Top Navbar ── */}
        {tab === 0 && (
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
              Choose which dropdown menus appear in the top navigation bar.
            </Typography>
            {TOP_NAV_ITEMS.map((label) => (
              <FormControlLabel
                key={label}
                control={<Switch size="small" checked={!(draft.topNavHidden || []).includes(label)} onChange={() => toggleTopNav(label)} />}
                label={<Typography variant="body2">{label}</Typography>}
                sx={{ display: 'flex', mx: 0, my: 0.2 }}
              />
            ))}
          </Box>
        )}

        {/* ── Left Sidebar ── */}
        {tab === 1 && (
          <Box>
            {SIDEBAR_GROUPS.map((group) => (
              <Box key={group.label} sx={{ mb: 2 }}>
                <Typography variant="caption" fontWeight={800} color="text.disabled" sx={{ textTransform: 'uppercase', letterSpacing: 0.8 }}>
                  {group.label}
                </Typography>
                <Box sx={{ pl: 1, mt: 0.25 }}>
                  {group.items.map((item) => (
                    <FormControlLabel
                      key={item.path}
                      control={
                        <Switch size="small" checked={!(draft.leftHidden || []).includes(item.path)} onChange={() => toggleLeft(item.path)} />
                      }
                      label={<Typography variant="body2">{item.label}</Typography>}
                      sx={{ display: 'flex', mx: 0, my: 0.2 }}
                    />
                  ))}
                </Box>
              </Box>
            ))}
          </Box>
        )}

        {/* ── Right Sidebar ── */}
        {tab === 2 && (
          <Box>
            <Typography variant="caption" fontWeight={800} color="text.disabled" sx={{ textTransform: 'uppercase', letterSpacing: 0.8 }}>
              Quick Actions
            </Typography>
            <Box sx={{ pl: 1, mt: 0.25, mb: 2 }}>
              {RIGHT_ACTIONS.map((label) => (
                <FormControlLabel
                  key={label}
                  control={<Switch size="small" checked={!(draft.rightActionsHidden || []).includes(label)} onChange={() => toggleRightAction(label)} />}
                  label={<Typography variant="body2">{label}</Typography>}
                  sx={{ display: 'flex', mx: 0, my: 0.2 }}
                />
              ))}
            </Box>
            <Typography variant="caption" fontWeight={800} color="text.disabled" sx={{ textTransform: 'uppercase', letterSpacing: 0.8 }}>
              Quick Links
            </Typography>
            <Box sx={{ pl: 1, mt: 0.25 }}>
              {RIGHT_LINKS.map((label) => (
                <FormControlLabel
                  key={`link-${label}`}
                  control={<Switch size="small" checked={!(draft.rightLinksHidden || []).includes(label)} onChange={() => toggleRightLink(label)} />}
                  label={<Typography variant="body2">{label}</Typography>}
                  sx={{ display: 'flex', mx: 0, my: 0.2 }}
                />
              ))}
            </Box>
          </Box>
        )}

        {/* ── Footer ── */}
        {tab === 4 && (
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
              Choose which links appear in the footer bar at the bottom of the screen.
            </Typography>
            {FOOTER_LINKS.map((link) => (
              <FormControlLabel
                key={link.label}
                control={<Switch size="small" checked={!(draft.footerHidden || []).includes(link.label)} onChange={() => toggleFooter(link.label)} />}
                label={<Typography variant="body2">{link.label}</Typography>}
                sx={{ display: 'flex', mx: 0, my: 0.2 }}
              />
            ))}
          </Box>
        )}

        {/* ── Home Widgets ── */}
        {tab === 3 && (
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
              Toggle widgets on/off for your home page. Enabled widgets appear in the center panel.
            </Typography>
            {WIDGET_REGISTRY.map((w) => {
              const active = allWidgetIds.includes(w.id);
              const panel = getPanel(w.id);
              const Icon = w.icon;
              return (
                <Stack
                  key={w.id}
                  direction="row"
                  alignItems="center"
                  spacing={1.5}
                  sx={{ py: 0.85, borderBottom: '1px solid', borderColor: 'divider' }}
                >
                  <Box sx={{ width: 32, height: 32, borderRadius: 1.5, bgcolor: w.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon sx={{ fontSize: 16, color: w.color }} />
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" fontWeight={700} noWrap>{w.label}</Typography>
                    <Typography variant="caption" color="text.secondary" noWrap>{w.description}</Typography>
                  </Box>
                  {panel && (
                    <Chip size="small" label={panel} sx={{ fontSize: '0.62rem', fontWeight: 700, height: 20 }} />
                  )}
                  <Switch
                    size="small"
                    checked={active}
                    onChange={() => active ? removeWidget(w.id) : addWidget(w.id)}
                  />
                </Stack>
              );
            })}
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={handleReset} color="warning" size="small">
          Restore Defaults
        </Button>
        <Box sx={{ flex: 1 }} />
        <Button onClick={handleCancel}>Cancel</Button>
        <Button variant="contained" onClick={handleSave}>
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}

CustomizeDialog.propTypes = {
  open: PropTypes.bool,
  onClose: PropTypes.func,
};
