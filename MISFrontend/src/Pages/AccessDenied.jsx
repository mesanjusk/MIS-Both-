import { Box, Button, Paper, Stack, Typography } from '@mui/material';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import { useNavigate } from 'react-router-dom';
import PropTypes from 'prop-types';

import { ROUTES } from '../constants/routes';

/**
 * Shown when a signed-in user reaches a route their role does not cover.
 *
 * Deliberately not an Alert banner: this is the whole answer to the
 * navigation, not a note attached to a page that still rendered. It also says
 * nothing about what the page contains or which role would open it — a denial
 * screen that describes the thing behind it tells an unauthorized reader what
 * to go looking for.
 */
export default function AccessDenied({ title = 'You do not have access to this page' }) {
  const navigate = useNavigate();

  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh', p: 2 }}>
      <Paper
        elevation={0}
        sx={{ maxWidth: 420, width: '100%', p: 4, textAlign: 'center', borderRadius: 3, border: '1px solid', borderColor: 'divider' }}
      >
        <Stack spacing={2} alignItems="center">
          <LockOutlinedIcon sx={{ fontSize: 40, color: 'text.disabled' }} />
          <Typography variant="h6" sx={{ fontWeight: 700 }}>{title}</Typography>
          <Typography variant="body2" color="text.secondary">
            If you need it, ask an administrator to update your access.
          </Typography>
          <Button variant="contained" onClick={() => navigate(ROUTES.HOME, { replace: true })}>
            Back to Home
          </Button>
        </Stack>
      </Paper>
    </Box>
  );
}

AccessDenied.propTypes = {
  title: PropTypes.string,
};
