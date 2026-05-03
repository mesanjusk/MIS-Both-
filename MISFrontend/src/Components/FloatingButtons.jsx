import PropTypes from 'prop-types';
import SpeedDial from '@mui/material/SpeedDial';
import SpeedDialAction from '@mui/material/SpeedDialAction';
import SpeedDialIcon from '@mui/material/SpeedDialIcon';
import AddCircleOutlineRoundedIcon from '@mui/icons-material/AddCircleOutlineRounded';

export default function FloatingButtons({ buttonsList = [] }) {
  return (
    <SpeedDial
      ariaLabel="quick actions"
      icon={<SpeedDialIcon openIcon={<AddCircleOutlineRoundedIcon />} />}
      direction="up"
      FabProps={{
        color: 'primary',
        sx: {
          width: 52,
          height: 52,
          boxShadow: (theme) => theme.shadows[9],
          '&:hover': {
            boxShadow: (theme) => theme.shadows[12],
          },
        },
      }}
      sx={{
        position: 'fixed',
        bottom: { xs: 78, md: 26 },
        right: { xs: 16, md: 24 },
        zIndex: 1245,
      }}
    >
      {buttonsList.map((button) => (
        <SpeedDialAction
          key={button.label}
          icon={<AddCircleOutlineRoundedIcon fontSize="small" />}
          tooltipTitle={button.label}
          tooltipOpen
          onClick={button.onClick}
          FabProps={{
            sx: {
              width: 40,
              height: 40,
              bgcolor: 'background.paper',
              color: 'text.primary',
              boxShadow: 4,
              '&:hover': {
                bgcolor: 'grey.100',
                boxShadow: 7,
              },
            },
          }}
          slotProps={{
            tooltip: {
              sx: {
                bgcolor: 'rgba(15, 23, 42, 0.94)',
                color: '#fff',
                fontSize: '0.75rem',
                fontWeight: 600,
                px: 1.25,
                py: 0.5,
                borderRadius: 1,
                boxShadow: 6,
                maxWidth: 'none',
                whiteSpace: 'nowrap',
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
