import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { Alert, Snackbar } from '@mui/material';

const listeners = new Set();

function emit(payload) {
  listeners.forEach((listener) => listener(payload));
}

// eslint-disable-next-line react-refresh/only-export-components
export function toast(message, variant = 'info') {
  emit({ message, variant });
}

toast.success = (message) => emit({ message, variant: 'success' });
toast.error = (message) => emit({ message, variant: 'error' });

export function ToastContainer({ autoHideDuration = 3500 }) {
  const [toastState, setToastState] = useState({ open: false, message: '', variant: 'info' });

  useEffect(() => {
    const handler = (payload) => setToastState({ open: true, ...payload });
    listeners.add(handler);
    return () => listeners.delete(handler);
  }, []);

  return (
    <Snackbar
      open={toastState.open}
      autoHideDuration={autoHideDuration}
      onClose={() => setToastState((prev) => ({ ...prev, open: false }))}
      anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
    >
      <Alert
        elevation={6}
        variant="filled"
        severity={toastState.variant}
        onClose={() => setToastState((prev) => ({ ...prev, open: false }))}
        sx={{ width: '100%' }}
      >
        {toastState.message}
      </Alert>
    </Snackbar>
  );
}

ToastContainer.propTypes = {
  autoHideDuration: PropTypes.number,
};
