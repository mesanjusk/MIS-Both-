import { useEffect, useState } from 'react';
import {
  Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle,
  Stack, TextField, Typography,
} from '@mui/material';
import { formatStatementDescription } from '../utils/statementDescription';

// Preserve the existing full transaction/invoice editor as a second option.
// This popup only changes the narration, not journal amounts or item pricing.
export default function StatementDescriptionEditModal({
  transaction, invoiceDetails, partyName = '', isInvoice = false,
  onClose, onSave, onFullEdit,
}) {
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    setDescription(transaction?.Description || '');
    setError('');
  }, [transaction?.Transaction_uuid, transaction?.Description]);

  const save = async () => {
    const clean = description.trim();
    if (!clean || clean.length > 2000) {
      setError('Description must contain 1–2000 characters.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onSave?.(clean);
    } catch (err) {
      setError(err?.response?.data?.message || err.message || 'Could not update description.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={Boolean(transaction)} onClose={saving ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>Edit Description / Narration · Txn #{transaction?.Transaction_id || '—'}</DialogTitle>
      <DialogContent>
        <Stack spacing={1.5} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField label="Description / Voucher Narration" multiline minRows={3} fullWidth
            inputProps={{ maxLength: 2000 }} value={description}
            onChange={(event) => setDescription(event.target.value)} disabled={saving}
            helperText="Changes only the statement narration. Amounts, accounts, invoice items and already-issued PDFs are not altered." />
          {isInvoice && invoiceDetails?.items?.length > 0 && (
            <Stack spacing={0.5}>
              <Typography variant="subtitle2">Actual invoice items (read-only here)</Typography>
              <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                {formatStatementDescription({ Description: partyName }, invoiceDetails, partyName)}
              </Typography>
            </Stack>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2, flexWrap: 'wrap' }}>
        <Button disabled={saving} onClick={onClose}>Cancel</Button>
        <Button disabled={saving} onClick={onFullEdit} variant="outlined">
          {isInvoice ? 'Edit Invoice Items / Rates' : 'Edit Full Transaction'}
        </Button>
        <Button disabled={saving || !description.trim() || description.trim().length > 2000}
          variant="contained" onClick={save}>Save Description</Button>
      </DialogActions>
    </Dialog>
  );
}
