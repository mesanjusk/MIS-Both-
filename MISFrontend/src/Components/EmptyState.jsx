import PropTypes from 'prop-types';
import { Paper, Stack, Typography } from '@mui/material';
import InboxRoundedIcon from '@mui/icons-material/InboxRounded';

export default function EmptyState({ message, children }) {
  return (
    <Paper variant="outlined" sx={{ p: 4, borderStyle: 'dashed' }}>
      <Stack alignItems="center" spacing={1.5}>
        <InboxRoundedIcon color="disabled" />
        <Typography color="text.secondary" textAlign="center">
          {message}
        </Typography>
        {children}
      </Stack>
    </Paper>
  );
}

EmptyState.propTypes = {
  message: PropTypes.node.isRequired,
  children: PropTypes.node,
};
