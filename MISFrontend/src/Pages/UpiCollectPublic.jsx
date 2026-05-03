import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Alert, Box, Button, CircularProgress, Container, Paper, Stack, Typography } from '@mui/material';
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded';
import ReactQRCode from 'react-qr-code';
import { getPublicUpiPaymentAttempt } from '../services/upiPaymentService';

export default function UpiCollectPublic() {
  const { transactionRef } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [request, setRequest] = useState(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        setLoading(true);
        setError('');
        const response = await getPublicUpiPaymentAttempt(transactionRef);
        if (!active) return;
        setRequest(response?.result || null);
      } catch (err) {
        if (!active) return;
        setError(err?.message || 'Unable to load payment request');
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => { active = false; };
  }, [transactionRef]);

  const canPay = useMemo(() => Boolean(request?.upiLink), [request?.upiLink]);

  if (loading) {
    return <Stack alignItems="center" justifyContent="center" sx={{ minHeight: '100vh' }}><CircularProgress /></Stack>;
  }

  return (
    <Container maxWidth="sm" sx={{ py: 3 }}>
      <Paper sx={{ p: 2.5, borderRadius: 3 }}>
        <Stack spacing={2} alignItems="center">
          <Typography variant="h5" fontWeight={700}>Pay by UPI</Typography>
          {error ? <Alert severity="error" sx={{ width: '100%' }}>{error}</Alert> : null}
          {request ? (
            <>
              <Typography variant="body1">{request.customerName || 'Customer Payment'}</Typography>
              <Typography variant="h4" fontWeight={700}>₹{Number(request.amount || 0).toLocaleString('en-IN')}</Typography>
              <Typography variant="body2" color="text.secondary">Ref: {request.transactionRef}</Typography>
              {request.note ? <Typography variant="body2" color="text.secondary">{request.note}</Typography> : null}
              <Box sx={{ p: 2, bgcolor: '#fff', borderRadius: 2 }}>
                {canPay ? <ReactQRCode value={request.upiLink} size={220} /> : <Typography variant="body2">UPI details not configured.</Typography>}
              </Box>
              {canPay ? (
                <Button
                  variant="contained"
                  size="large"
                  fullWidth
                  startIcon={<OpenInNewRoundedIcon />}
                  onClick={() => { window.location.href = request.upiLink; }}
                >
                  Pay Now
                </Button>
              ) : null}
              <Alert severity="info" sx={{ width: '100%' }}>
                After payment, you do not need to send a screenshot if the business has already shared this link. Their accounts team can confirm the payment from the bank statement using this request reference.
              </Alert>
            </>
          ) : null}
        </Stack>
      </Paper>
    </Container>
  );
}
