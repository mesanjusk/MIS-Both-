import PropTypes from 'prop-types';
import MuiCard from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';

export default function Card({ className = '', children, contentSx, sx, ...props }) {
  return (
    <MuiCard
      className={className}
      elevation={0}
      sx={{ border: (theme) => `1px solid ${theme.palette.divider}`, borderRadius: 2, ...sx }}
      {...props}
    >
      <CardContent sx={{ p: 1.25, '&:last-child': { pb: 1.25 }, ...contentSx }}>{children}</CardContent>
    </MuiCard>
  );
}

Card.propTypes = {
  className: PropTypes.string,
  children: PropTypes.node,
  contentSx: PropTypes.object,
  sx: PropTypes.object,
};
