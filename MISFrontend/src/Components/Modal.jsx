import PropTypes from 'prop-types';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
} from '@mui/material';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';

export default function Modal({
  isOpen,
  onClose,
  title,
  children,
  actions,
}) {
  return (
    <Dialog open={isOpen} onClose={onClose} fullWidth maxWidth="md">
      {title && (
        <DialogTitle sx={{ m: 0, p: 1.5 }}>
          {title}
          <IconButton
            aria-label="Close"
            onClick={onClose}
            sx={{ position: 'absolute', right: 8, top: 8 }}
          >
            <CloseRoundedIcon fontSize="small" />
          </IconButton>
        </DialogTitle>
      )}
      <DialogContent dividers sx={{ p: 1.25 }}>{children}</DialogContent>
      {actions && <DialogActions sx={{ px: 1.25, py: 1 }}>{actions}</DialogActions>}
    </Dialog>
  );
}

Modal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  title: PropTypes.string,
  children: PropTypes.node,
  actions: PropTypes.arrayOf(PropTypes.node),
};
