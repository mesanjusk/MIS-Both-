import ChatBubbleOutlineRoundedIcon from '@mui/icons-material/ChatBubbleOutlineRounded';
import { Box, Stack, Typography } from '@mui/material';
import PropTypes from 'prop-types';

export default function EmptyState({ title = 'No data', description = '' }) {
  return (
    <Stack
      spacing={1.5}
      alignItems="center"
      justifyContent="center"
      sx={{ height: '100%', minHeight: 220, px: 3, textAlign: 'center', color: 'text.secondary' }}
    >
      <Box
        sx={{
          width: 56,
          height: 56,
          borderRadius: '50%',
          bgcolor: 'grey.100',
          display: 'grid',
          placeItems: 'center',
        }}
      >
        <ChatBubbleOutlineRoundedIcon fontSize="medium" />
      </Box>
      <Typography variant="subtitle1" fontWeight={700} color="text.primary">
        {title}
      </Typography>
      {description ? <Typography variant="body2">{description}</Typography> : null}
    </Stack>
  );
}

EmptyState.propTypes = {
  title: PropTypes.string,
  description: PropTypes.string,
};

EmptyState.defaultProps = {
  title: 'No data',
  description: '',
};
