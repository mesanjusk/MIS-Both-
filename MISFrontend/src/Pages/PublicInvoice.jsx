import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Alert, Box, CircularProgress, Container, Stack } from '@mui/material';
import InvoicePreview from '../Components/InvoicePreview';
import { getApiBase } from '../apiClient.js';

export default function PublicInvoice() {
  const { shareToken } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [inv, setInv] = useState(null);

  useEffect(() => {
    let active = true;
    fetch(`${getApiBase()}/api/public-invoices/p/${shareToken}`)
      .then((r) => r.json())
      .then((data) => {
        if (!active) return;
        if (data.success) setInv(data.result);
        else setError(data.message || 'Invoice not found');
      })
      .catch(() => active && setError('Failed to load invoice'))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [shareToken]);

  if (loading) {
    return (
      <Stack alignItems="center" justifyContent="center" sx={{ minHeight: '100vh' }}>
        <CircularProgress color="error" />
      </Stack>
    );
  }

  if (error || !inv) {
    return (
      <Container maxWidth="xs" sx={{ py: 4 }}>
        <Alert severity="error">{error || 'Invoice not found'}</Alert>
      </Container>
    );
  }

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#f5f5f5', py: 3 }}>
      <InvoicePreview
        store={inv.storeName}
        addressLines={inv.addressLines || []}
        phone={inv.phone}
        email={inv.email}
        gst={inv.gst}
        upiId={inv.upiId}
        upiName={inv.upiName}
        orderNumber={inv.orderNumber}
        dateStr={inv.dateStr}
        partyName={inv.partyName}
        items={inv.items || []}
        extraCharges={inv.extraCharges || []}
      />
    </Box>
  );
}
