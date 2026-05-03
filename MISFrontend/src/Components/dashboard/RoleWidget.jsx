import PropTypes from 'prop-types';
import { Avatar, Card, Chip, Divider, Stack, Typography } from '@mui/material';
import { ROLE_TYPES } from '../../constants/roles';

const roleCopy = {
  [ROLE_TYPES.ADMIN]: 'Full operational control across workflows, teams, and closures.',
  [ROLE_TYPES.OFFICE]: 'Assigned pipeline ownership and day-to-day execution tracking.',
  default: 'Track workload, priorities and delivery commitments.',
};

export default function RoleWidget({ role, userName }) {
  const subtitle = roleCopy[role] || roleCopy.default;

  return (
    <Card elevation={0} sx={{ p: 1.25, height: '100%' }}>
      <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
        <Stack direction="row" spacing={1} alignItems="center">
          <Avatar sx={{ bgcolor: 'primary.main', width: 34, height: 34, fontSize: '0.85rem' }}>{(userName || 'U').slice(0, 1)}</Avatar>
          <Stack spacing={0.2}>
            <Typography variant="caption" color="text.secondary">Current Role</Typography>
            <Typography variant="subtitle1">{role || 'User'}</Typography>
          </Stack>
        </Stack>
        <Chip size="small" label={userName || 'User'} color="primary" variant="outlined" />
      </Stack>
      <Divider sx={{ my: 1 }} />
      <Typography variant="body2" color="text.secondary">{subtitle}</Typography>
    </Card>
  );
}

RoleWidget.propTypes = {
  role: PropTypes.string,
  userName: PropTypes.string,
};
