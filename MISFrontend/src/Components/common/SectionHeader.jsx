import PropTypes from 'prop-types';
import { Stack, Typography } from '@mui/material';

export default function SectionHeader({ title, subtitle, action }) {
  return (
    <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={2} sx={{ mb: 2 }}>
      <div>
        <Typography variant="subtitle1">{title}</Typography>
        {subtitle ? (
          <Typography variant="caption" color="text.secondary">
            {subtitle}
          </Typography>
        ) : null}
      </div>
      {action ? <div>{action}</div> : null}
    </Stack>
  );
}

SectionHeader.propTypes = {
  title: PropTypes.string.isRequired,
  subtitle: PropTypes.string,
  action: PropTypes.node,
};
