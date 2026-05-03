import { Box, Skeleton, Stack } from '@mui/material';
import PropTypes from 'prop-types';

export default function LoadingSkeleton({ lines = 6 }) {
  return (
    <Stack spacing={1} sx={{ p: { xs: 1, md: 1.25 }, height: '100%', minHeight: 0 }}>
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton key={index} variant="rounded" height={48} />
      ))}
      <Box sx={{ height: 4 }} />
    </Stack>
  );
}

LoadingSkeleton.propTypes = {
  lines: PropTypes.number,
};

LoadingSkeleton.defaultProps = {
  lines: 6,
};
