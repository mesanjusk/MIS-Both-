import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import toast from 'react-hot-toast';
import {
  Autocomplete,
  Box,
  Button,
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
  TextField,
  Typography,
} from '@mui/material';
import { SIDEBAR_GROUPS } from '../constants/sidebarMenu.jsx';
import { useNavCustomize } from '../hooks/useNavCustomize';
import { useAuth } from '../context/AuthContext';
import { FOOTER_LINKS } from './Footer';
import { fetchMobileVisibilitySettings, saveMobileVisibilitySettings } from '../services/mobileVisibilityService';
import { fetchCustomerGroups, fetchCustomers } from '../services/customerService';
import axios from '../apiClient.js';

const RIGHT_ACTIONS = ['Day Book', 'Send Email', 'UPI Payment', 'Transaction 4D', 'Attendance'];
const RIGHT_LINKS = ['Orders', 'Business', 'Post Print', 'Workflows', 'WhatsApp', 'Reports', 'Attendance', 'Dispatch'];
const TOP_NAV_ITEMS = ['Attendance', 'Orders', 'Accounts', 'Reports', 'WhatsApp', 'Social', 'Call Logs', 'SOP', 'Admin'];

const DEFAULT_MOBILE_SETTINGS = {
  defaultHidden: true,
  customerGroups: [],
  customers: [],
  userGroups: [],
  users: [],
};

export default function CustomizeDialog({ open, onClose }) {
  const { prefs, save } = useNavCustomize();
  const { isAdmin } = useAuth();
  const [draft, setDraft] = useState({});
  const [tab, setTab] = useState(0);

  const [mobileDraft, setMobileDraft] = useState(DEFAULT_MOBILE_SETTINGS);
  const [customerGroupOptions, setCustomerGroupOptions] = useState([]);
  const [userGroupOptions, setUserGroupOptions] = useState([]);
  const [customerOptions, setCustomerOptions] = useState([]);
  const [userOptions, setUserOptions] = useState([]);

  useEffect(() => {
    if (open) {
      setDraft(prefs);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open || !isAdmin) return;

    fetchMobileVisibilitySettings()
      .then((res) => {
        if (res.data.success) setMobileDraft({ ...DEFAULT_MOBILE_SETTINGS, ...res.data.result });
      })
      .catch(() => toast.error('Failed to load mobile number visibility settings'));

    fetchCustomerGroups()
      .then((res) => {
        if (res.data.success) setCustomerGroupOptions(res.data.result.map((g) => g.Customer_group).filter(Boolean));
      })
      .catch(() => {});

    axios.get('/api/usergroup/GetUsergroupList')
      .then((res) => {
        if (res.data.success) setUserGroupOptions(res.data.result.map((g) => g.User_group).filter(Boolean));
      })
      .catch(() => {});

    fetchCustomers()
      .then((res) => {
        if (res.data.success) {
          setCustomerOptions((res.data.result || []).map((c) => ({ uuid: c.Customer_uuid, name: c.Customer_name })));
        }
      })
      .catch(() => {});

    axios.get('/api/users/GetUserList')
      .then((res) => {
        if (res.data.success) {
          setUserOptions((res.data.result || []).map((u) => ({ uuid: u.User_uuid, name: u.User_name })));
        }
      })
      .catch(() => {});
  }, [open, isAdmin]);

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

  const toggleFlag = (key) => setDraft((prev) => ({ ...prev, [key]: !prev[key] }));

  /* ── save / cancel / reset ── */
  const handleSave = () => {
    save(draft);

    if (isAdmin) {
      saveMobileVisibilitySettings(mobileDraft)
        .then((res) => {
          if (res.data.success) toast.success('Mobile number visibility settings saved');
        })
        .catch(() => toast.error('Failed to save mobile number visibility settings'));
    }

    onClose();
  };

  const handleCancel = () => {
    setDraft(prefs);
    onClose();
  };

  const handleReset = () => {
    setDraft({});
  };

  return (
    <Dialog open={open} onClose={handleCancel} fullWidth maxWidth="sm">
      <DialogTitle sx={{ pb: 0, fontWeight: 800 }}>Customize</DialogTitle>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ px: 3 }} variant="scrollable" scrollButtons="auto">
        <Tab label="Top Navbar" />
        <Tab label="Left Sidebar" />
        <Tab label="Right Sidebar" />
        <Tab label="Footer" />
        {isAdmin && <Tab label="Mobile Numbers" />}
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
            <FormControlLabel
              control={<Switch checked={Boolean(draft.leftSidebarOn)} onChange={() => toggleFlag('leftSidebarOn')} />}
              label={<Typography variant="body2" fontWeight={700}>Show left sidebar</Typography>}
              sx={{ display: 'flex', mx: 0, mb: 1.5 }}
            />
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
              Off by default. Turn this on to show the left sidebar rail, then pick which items appear on it below.
            </Typography>
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
            <FormControlLabel
              control={<Switch checked={Boolean(draft.rightSidebarOn)} onChange={() => toggleFlag('rightSidebarOn')} />}
              label={<Typography variant="body2" fontWeight={700}>Show right sidebar</Typography>}
              sx={{ display: 'flex', mx: 0, mb: 1.5 }}
            />
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
              Off by default. Turn this on to show the right sidebar rail, then pick which actions/links appear below.
            </Typography>
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
        {tab === 3 && (
          <Box>
            <FormControlLabel
              control={<Switch checked={Boolean(draft.footerOn)} onChange={() => toggleFlag('footerOn')} />}
              label={<Typography variant="body2" fontWeight={700}>Show footer</Typography>}
              sx={{ display: 'flex', mx: 0, mb: 1.5 }}
            />
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
              Off by default. Turn this on to show the footer bar, then pick which links appear below.
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

        {/* ── Mobile Number Visibility (admin only) ── */}
        {tab === 4 && isAdmin && (
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
              Control whether customer and staff mobile numbers are visible to non-admin users. Admins always see full numbers.
            </Typography>

            <FormControlLabel
              control={
                <Switch
                  size="small"
                  checked={mobileDraft.defaultHidden}
                  onChange={(e) => setMobileDraft((prev) => ({ ...prev, defaultHidden: e.target.checked }))}
                />
              }
              label={<Typography variant="body2">Hide mobile numbers by default</Typography>}
              sx={{ display: 'flex', mx: 0, mb: 2 }}
            />

            <Typography variant="caption" fontWeight={800} color="text.disabled" sx={{ textTransform: 'uppercase', letterSpacing: 0.8 }}>
              Customers
            </Typography>
            <Stack spacing={1.5} sx={{ mt: 1, mb: 2.5 }}>
              <Autocomplete
                multiple
                size="small"
                options={customerGroupOptions}
                value={mobileDraft.customerGroups}
                onChange={(_, value) => setMobileDraft((prev) => ({ ...prev, customerGroups: value }))}
                renderInput={(params) => <TextField {...params} label="Customer groups always shown" placeholder="Group" />}
              />
              <Autocomplete
                multiple
                size="small"
                options={customerOptions}
                getOptionLabel={(o) => o.name || ''}
                isOptionEqualToValue={(o, v) => o.uuid === v.uuid}
                value={customerOptions.filter((o) => mobileDraft.customers.includes(o.uuid))}
                onChange={(_, value) => setMobileDraft((prev) => ({ ...prev, customers: value.map((o) => o.uuid) }))}
                renderInput={(params) => <TextField {...params} label="Individual customers always shown" placeholder="Customer" />}
              />
            </Stack>

            <Typography variant="caption" fontWeight={800} color="text.disabled" sx={{ textTransform: 'uppercase', letterSpacing: 0.8 }}>
              Staff / Users
            </Typography>
            <Stack spacing={1.5} sx={{ mt: 1 }}>
              <Autocomplete
                multiple
                size="small"
                options={userGroupOptions}
                value={mobileDraft.userGroups}
                onChange={(_, value) => setMobileDraft((prev) => ({ ...prev, userGroups: value }))}
                renderInput={(params) => <TextField {...params} label="User groups always shown" placeholder="Group" />}
              />
              <Autocomplete
                multiple
                size="small"
                options={userOptions}
                getOptionLabel={(o) => o.name || ''}
                isOptionEqualToValue={(o, v) => o.uuid === v.uuid}
                value={userOptions.filter((o) => mobileDraft.users.includes(o.uuid))}
                onChange={(_, value) => setMobileDraft((prev) => ({ ...prev, users: value.map((o) => o.uuid) }))}
                renderInput={(params) => <TextField {...params} label="Individual users always shown" placeholder="User" />}
              />
            </Stack>
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
