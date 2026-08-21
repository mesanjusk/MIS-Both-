import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Alert, Box, CircularProgress, Container, Stack } from '@mui/material';
import AccountStatement from '../Components/AccountStatement';
import InvoicePreview from '../Components/InvoicePreview';
import ReceiptVoucher from '../Components/ReceiptVoucher';
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
        else setError(data.message || 'Document not found');
      })
      .catch(() => active && setError('Failed to load the document'))
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
        <Alert severity="error">{error || 'Document not found'}</Alert>
      </Container>
    );
  }

  if (inv.docType === 'statement') {
    return (
      <Box sx={{ minHeight: '100vh', bgcolor: '#f5f5f5', py: 3, overflowX: 'auto' }}>
        <AccountStatement
          store={inv.storeName}
          addressLines={inv.addressLines || []}
          phone={inv.phone}
          email={inv.email}
          gst={inv.gst}
          upiId={inv.upiId}
          upiName={inv.upiName}
          partyName={inv.partyName}
          periodFrom={inv.periodFrom}
          periodTo={inv.periodTo}
          generatedOn={inv.generatedOn || inv.dateStr}
          openingBalance={inv.openingBalance}
          totalDebit={inv.totalDebit}
          totalCredit={inv.totalCredit}
          closingBalance={inv.closingBalance ?? inv.grandTotal}
          rows={inv.rows || []}
        />
      </Box>
    );
  }

  if (inv.docType === 'receipt') {
    return (
      <Box sx={{ minHeight: '100vh', bgcolor: '#f5f5f5', py: 3 }}>
        <ReceiptVoucher
          store={inv.storeName}
          addressLines={inv.addressLines || []}
          phone={inv.phone}
          email={inv.email}
          gst={inv.gst}
          voucherType={inv.voucherType}
          voucherNo={inv.transactionId}
          dateStr={inv.dateStr}
          partyName={inv.partyName}
          amount={inv.amount ?? inv.grandTotal}
          paymentMode={inv.paymentMode}
          narration={inv.narration}
          orderNumber={inv.orderNumber}
        />
      </Box>
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
