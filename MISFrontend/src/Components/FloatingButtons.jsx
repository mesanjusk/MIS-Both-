import PropTypes from 'prop-types';
import SpeedDial from '@mui/material/SpeedDial';
import SpeedDialAction from '@mui/material/SpeedDialAction';
import SpeedDialIcon from '@mui/material/SpeedDialIcon';
import AddCircleOutlineRoundedIcon from '@mui/icons-material/AddCircleOutlineRounded';
import AddShoppingCartRoundedIcon from '@mui/icons-material/AddShoppingCartRounded';
import ReceiptLongRoundedIcon from '@mui/icons-material/ReceiptLongRounded';
import PaymentsRoundedIcon from '@mui/icons-material/PaymentsRounded';
import NotificationsActiveRoundedIcon from '@mui/icons-material/NotificationsActiveRounded';
import AddTaskRoundedIcon from '@mui/icons-material/AddTaskRounded';
import AddCardRoundedIcon from '@mui/icons-material/AddCardRounded';

/* Icon map keyed by action label */
const ACTION_ICONS = {
  'New Order': <AddShoppingCartRoundedIcon fontSize="small" />,
  'Receipt':   <ReceiptLongRoundedIcon fontSize="small" />,
  'Payment':   <PaymentsRoundedIcon fontSize="small" />,
  'Followup':  <NotificationsActiveRoundedIcon fontSize="small" />,
  'Task':      <AddTaskRoundedIcon fontSize="small" />,
  'Add UPI':   <AddCardRoundedIcon fontSize="small" />,
};

/* Action accent colours */
const ACTION_COLORS = {
  'New Order': 'primary.main',
  'Receipt':   'success.main',
  'Payment':   'warning.main',
  'Followup':  'error.main',
  'Task':      'secondary.main',
  'Add UPI':   'info.main',
};

export default function FloatingButtons({ buttonsList = [] }) {
  return (
    <SpeedDial
      ariaLabel="quick actions"
      icon={<SpeedDialIcon openIcon={<AddCircleOutlineRoundedIcon />} />}
      direction="up"
      FabProps={{
        color: 'primary',
        sx: {
          width: 48,
          height: 48,
          boxShadow: (theme) => theme.shadows[8],
          '&:hover': { boxShadow: (theme) => theme.shadows[12] },
        },
      }}
      sx={{
        position: 'fixed',
        bottom: { xs: 78, md: 24 },
        /* right sidebar is 80px on lg+; keep 16px gutter = 96px */
        right: { xs: 16, lg: 96 },
        zIndex: 1245,
      }}
    >
      {buttonsList.map((button) => (
        <SpeedDialAction
          key={button.label}
          icon={ACTION_ICONS[button.label] || <AddCircleOutlineRoundedIcon fontSize="small" />}
          tooltipTitle={button.label}
          tooltipOpen
          onClick={button.onClick}
          FabProps={{
            sx: {
              width: 38,
              height: 38,
              bgcolor: 'background.paper',
              color: ACTION_COLORS[button.label] || 'text.primary',
              boxShadow: 4,
              border: '1px solid',
              borderColor: 'divider',
              '&:hover': {
                bgcolor: (t) => t.palette.background.default,
                boxShadow: 7,
              },
            },
          }}
          TooltipProps={{
            componentsProps: {
              tooltip: {
                sx: {
                  bgcolor: 'rgba(15, 23, 42, 0.9)',
                  color: '#fff',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  px: 1.25,
                  py: 0.4,
                  borderRadius: 1.5,
                  boxShadow: 6,
                  maxWidth: 'none',
                  whiteSpace: 'nowrap',
                },
              },
            },
          }}
        />
      ))}
    </SpeedDial>
  );
}

FloatingButtons.propTypes = {
  buttonsList: PropTypes.arrayOf(
    PropTypes.shape({
      label: PropTypes.string.isRequired,
      onClick: PropTypes.func.isRequired,
    }),
  ),
};
