import { useEffect, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import axios from '../../apiClient';

/**
 * Our regular WhatsApp Business number (the phone-app one staff actually
 * chat on) is not API-connected, so nothing in the system can auto-detect a
 * new order that arrives there. This button is the deliberate manual
 * counterpart: a few-second shortcut so a message spotted on that number
 * gets logged as an Enquiry right away instead of depending on someone
 * remembering it, which was the whole reason customers were chasing up
 * orders days later.
 */
export default function WhatsAppQuickLogButton({ onLogged }) {
  const [open, setOpen] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [customer, setCustomer] = useState(null);
  const [customerInput, setCustomerInput] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  useEffect(() => {
    if (!open) return;
    axios.get('/api/customers/GetCustomerList')
      .then((res) => setCustomers(res.data?.result || []))
      .catch(() => {});
  }, [open]);

  const reset = () => {
    setCustomer(null); setCustomerInput(''); setMobileNumber('');
    setMessage(''); setError('');
  };

  const close = () => { setOpen(false); reset(); };

  const submit = async () => {
    const name = customer?.Customer_name || customerInput.trim();
    if (!name) { setError('Customer name is required'); return; }
    if (!message.trim()) { setError('Paste in what the customer asked for'); return; }

    setSubmitting(true); setError('');
    try {
      await axios.post('/api/enquiry/quick-log', {
        customerUuid: customer?.Customer_uuid || null,
        Customer_name: name,
        mobileNumber: mobileNumber.trim() || customer?.Mobile || '',
        message: message.trim(),
      });
      setToast('Logged — visible in Enquiries now.');
      close();
      onLogged?.();
    } catch (err) {
      setError(err?.response?.data?.message || err.message || 'Failed to log enquiry');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredCustomers = customers.filter((c) => {
    if (!customerInput) return true;
    const q = customerInput.toLowerCase();
    return c.Customer_name?.toLowerCase().includes(q) || c.Mobile?.toLowerCase().includes(q);
  });

  return (
    <>
      <Tooltip title="Log a new order/message seen on the regular WhatsApp Business number">
        <Button
          size="small"
          variant="outlined"
          color="success"
          startIcon={<WhatsAppIcon sx={{ fontSize: '16px !important' }} />}
          onClick={() => setOpen(true)}
          sx={{ fontSize: '0.72rem', py: 0.3, px: 0.9, minHeight: 24 }}
        >
          Log WhatsApp message
        </Button>
      </Tooltip>

      <Dialog open={open} onClose={close} maxWidth="xs" fullWidth>
        <DialogTitle>
          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <Typography fontWeight={700}>Log WhatsApp message</Typography>
            <IconButton size="small" onClick={close}><CloseRoundedIcon fontSize="small" /></IconButton>
          </Stack>
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            {error && <Alert severity="error">{error}</Alert>}
            <Autocomplete
              freeSolo
              options={filteredCustomers}
              value={customer}
              onChange={(_, v) => {
                if (typeof v === 'string') { setCustomer(null); setCustomerInput(v); return; }
                setCustomer(v);
                if (v?.Mobile) setMobileNumber(v.Mobile);
              }}
              inputValue={customerInput}
              onInputChange={(_, v) => setCustomerInput(v)}
              getOptionLabel={(c) => (typeof c === 'string' ? c : `${c.Customer_name}${c.Mobile ? ` — ${c.Mobile}` : ''}`)}
              isOptionEqualToValue={(a, b) => a.Customer_uuid === b.Customer_uuid}
              disabled={submitting}
              renderInput={(params) => (
                <TextField {...params} label="Customer name *" placeholder="Search existing or type a new name" size="small" />
              )}
            />
            <TextField
              label="Mobile number"
              value={mobileNumber}
              onChange={(e) => setMobileNumber(e.target.value)}
              size="small"
              disabled={submitting}
              placeholder="9XXXXXXXXX"
            />
            <TextField
              label="What did they ask for? *"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              size="small"
              multiline
              minRows={3}
              disabled={submitting}
              placeholder="Paste or summarize the WhatsApp message"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={close} disabled={submitting}>Cancel</Button>
          <Button
            variant="contained"
            color="success"
            onClick={submit}
            disabled={submitting}
            startIcon={submitting ? <CircularProgress size={14} /> : null}
          >
            Log it
          </Button>
        </DialogActions>
      </Dialog>

      {toast && (
        <Alert
          severity="success"
          onClose={() => setToast('')}
          sx={{ position: 'fixed', bottom: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 1400 }}
        >
          {toast}
        </Alert>
      )}
    </>
  );
}
