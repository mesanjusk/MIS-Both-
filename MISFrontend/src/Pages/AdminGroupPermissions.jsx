import { useCallback, useEffect, useState } from 'react';
import {
  Alert, Box, Card, CardContent, Chip, CircularProgress,
  FormControlLabel, Paper, Stack, Switch, Typography,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import GroupsRoundedIcon from '@mui/icons-material/GroupsRounded';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import toast from 'react-hot-toast';
import axios from '../apiClient';

const PERMISSION_FIELDS = [
  { key: 'viewOrders', label: 'View orders', desc: 'Can run "MIS orders" / "MIS order <number>" to look up orders' },
  { key: 'advanceOrderStage', label: 'Advance order stage', desc: 'Can tap "Move to next stage / Mark ready / Mark delivered" buttons' },
  { key: 'assignOrders', label: 'Self-assign orders', desc: 'Can tap "Assign to me" on an unassigned order' },
  { key: 'createOrders', label: 'Create orders', desc: 'Can run "MIS new order" to create an order for a customer by chat' },
  { key: 'receivePayments', label: 'Record payments', desc: 'Can tap "Receive payment" and record an amount collected against an order' },
];

// Defaults mirror MISBackend/src/services/permissionService.js — shown so
// admins understand what a group gets before they touch anything here.
function defaultsForGroup(name = '') {
  const g = name.toLowerCase();
  const tier = g.includes('admin') || g.includes('owner') ? 4
    : g.includes('manager') ? 3
    : g.includes('office') ? 2
    : 1;
  return {
    viewOrders: true,
    advanceOrderStage: tier >= 2,
    assignOrders: tier >= 3,
    createOrders: tier >= 2,
    receivePayments: tier >= 3,
  };
}

function GroupPermissionCard({ group, onSaved }) {
  const configured = group.modulePermissions && Object.keys(group.modulePermissions).length > 0;
  const defaults = defaultsForGroup(group.User_group);
  const [perms, setPerms] = useState({ ...defaults, ...(group.modulePermissions || {}) });
  const [saving, setSaving] = useState(false);

  const toggle = (key) => setPerms((p) => ({ ...p, [key]: !p[key] }));

  const handleSave = async () => {
    setSaving(true);
    try {
      const id = group.User_group_uuid || group._id;
      const { data } = await axios.put(`/api/usergroup/updateUsergroupPermissions/${id}`, perms);
      toast.success(`WhatsApp permissions saved for "${group.User_group}"`);
      onSaved?.(data.result);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to save group permissions');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card variant="outlined" sx={{ borderRadius: 2 }}>
      <CardContent>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.5 }}>
          <Stack direction="row" alignItems="center" spacing={1}>
            <Typography variant="subtitle1" fontWeight={800}>{group.User_group}</Typography>
            <Chip
              size="small"
              label={configured ? 'Custom' : 'Using role default'}
              color={configured ? 'primary' : 'default'}
              variant={configured ? 'filled' : 'outlined'}
              sx={{ height: 20, fontSize: '0.65rem' }}
            />
          </Stack>
        </Stack>

        <Stack spacing={1}>
          {PERMISSION_FIELDS.map(({ key, label, desc }) => (
            <Paper key={key} variant="outlined" sx={{ p: 1.25, borderRadius: 2 }}>
              <FormControlLabel
                control={<Switch checked={Boolean(perms[key])} onChange={() => toggle(key)} color="primary" size="small" />}
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

        <Stack direction="row" justifyContent="flex-end" sx={{ mt: 1.5 }}>
          <Chip
            label={saving ? 'Saving…' : 'Save'}
            color="primary"
            onClick={saving ? undefined : handleSave}
            clickable={!saving}
            sx={{ fontWeight: 700, px: 1 }}
          />
        </Stack>
      </CardContent>
    </Card>
  );
}

export default function AdminGroupPermissions() {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const { data } = await axios.get('/api/usergroup/GetUsergroupList');
      setGroups(Array.isArray(data?.result) ? data.result : []);
    } catch {
      toast.error('Failed to load user groups');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSaved = (updatedGroup) => {
    setGroups((prev) => prev.map((g) => (
      (g.User_group_uuid || g._id) === (updatedGroup.User_group_uuid || updatedGroup._id) ? updatedGroup : g
    )));
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
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ mb: 1 }}>
        <GroupsRoundedIcon color="primary" sx={{ fontSize: 30 }} />
        <Box>
          <Typography variant="h5" fontWeight={900}>Group Permissions</Typography>
          <Typography variant="caption" color="text.secondary">
            Set who in each user group can act on orders from WhatsApp — applies to everyone in the group at once
          </Typography>
        </Box>
      </Stack>

      <Alert icon={<WhatsAppIcon fontSize="small" />} severity="info" sx={{ mb: 2.5, borderRadius: 2 }}>
        These rights govern the "MIS orders" / "MIS new order" WhatsApp commands only (view / advance stage /
        self-assign / create / record payment). A group left as "Using role default" follows the built-in tier:
        Admin/Owner get full control including payments, Office/Manager get view + advance + create, everyone
        else gets view of their own assigned orders only.
      </Alert>

      <Stack spacing={2}>
        {groups.map((group) => (
          <GroupPermissionCard
            key={group.User_group_uuid || group._id}
            group={group}
            onSaved={handleSaved}
          />
        ))}
      </Stack>

      {!groups.length && (
        <Alert severity="warning" sx={{ borderRadius: 2, bgcolor: (t) => alpha(t.palette.warning.main, 0.08) }}>
          No user groups found. Add one from "Add User Group" first.
        </Alert>
      )}
    </Box>
  );
}
