import { useEffect, useMemo, useState } from 'react';
import {
  Autocomplete,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import DeleteRoundedIcon from '@mui/icons-material/DeleteRounded';
import ReceiptLongRoundedIcon from '@mui/icons-material/ReceiptLongRounded';
import toast from 'react-hot-toast';
import axios from '../apiClient';
import InvoiceModal from './InvoiceModal';

const emptyItem = () => ({
  itemName: '',
  qty: 1,
  unit: 'Job',
  rate: '',
  amount: 0,
});

const n = (value) => {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const fmtDateForPreview = (dateValue) => {
  if (!dateValue) return '';
  const d = new Date(`${dateValue}T00:00:00`);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-GB');
};

export default function PurchaseInvoiceEditor({
  open,
  onClose,
  row,
  parties = [],
  initialVendorId = '',
  onSaved,
}) {
  const [vendorId, setVendorId] = useState('');
  const [items, setItems] = useState([emptyItem()]);
  const [extraCharges, setExtraCharges] = useState([]);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [savedPo, setSavedPo] = useState(null);

  useEffect(() => {
    if (!open || !row) return;

    const seededItems = Array.isArray(row.poItems) && row.poItems.length
      ? row.poItems.map((item) => ({
          itemName: item.itemName || '',
          qty: n(item.qty) || 1,
          unit: item.unit || 'Job',
          rate: n(item.rate),
          amount: n(item.amount) || n(item.qty) * n(item.rate),
        }))
      : [{
          itemName: row.orderNumber ? `Printing - Order #${row.orderNumber}` : 'Printing Job',
          qty: 1,
          unit: 'Job',
          rate: n(row.invoiceValue) || '',
          amount: n(row.invoiceValue),
        }];

    setVendorId(row.vendorUuid || initialVendorId || '');
    setItems(seededItems);
    setExtraCharges(Array.isArray(row.extraCharges) ? row.extraCharges.map((charge) => ({
      label: charge.label || '',
      amount: n(charge.amount) || '',
    })) : []);
    setNotes(row.notes || '');
    setSavedPo(row.poUuid ? {
      PO_uuid: row.poUuid,
      PO_Number: row.poNumber,
      poDate: row.poDate || row.date,
    } : null);
    setShowPreview(false);
  }, [open, row, initialVendorId]);

  const selectedVendor = useMemo(
    () => parties.find((party) => party.Vendor_uuid === vendorId) || null,
    [parties, vendorId]
  );

  const itemTotal = useMemo(
    () => items.reduce((sum, item) => sum + n(item.amount), 0),
    [items]
  );

  const extrasTotal = useMemo(
    () => extraCharges.reduce((sum, charge) => sum + n(charge.amount), 0),
    [extraCharges]
  );

  const grandTotal = itemTotal + extrasTotal;

  const updateItem = (index, patch) => {
    setItems((prev) => prev.map((item, i) => {
      if (i !== index) return item;
      const next = { ...item, ...patch };
      next.amount = +(n(next.qty) * n(next.rate)).toFixed(2);
      return next;
    }));
  };

  const save = async () => {
    if (!row?.folderId) return;
    if (!vendorId) {
      toast.error('Select the vendor / freelancer.');
      return;
    }

    const validItems = items
      .map((item) => ({
        itemName: String(item.itemName || '').trim(),
        qty: n(item.qty),
        unit: String(item.unit || 'Job').trim() || 'Job',
        rate: n(item.rate),
        amount: +(n(item.qty) * n(item.rate)).toFixed(2),
      }))
      .filter((item) => item.itemName && item.qty > 0 && item.rate > 0);

    if (!validItems.length) {
      toast.error('Add at least one item with quantity and rate.');
      return;
    }

    const validCharges = extraCharges
      .filter((charge) => String(charge.label || '').trim() && n(charge.amount) > 0)
      .map((charge) => ({
        label: String(charge.label).trim(),
        amount: n(charge.amount),
      }));

    setSaving(true);
    try {
      const res = await axios.post('/api/purchaseorder/printing-invoice', {
        sourceDriveFolderId: row.folderId,
        sourceDriveFolderName: row.folderName,
        Vendor_uuid: vendorId,
        orderNumber: row.orderNumber || null,
        poDate: row.date,
        Items: validItems,
        extraCharges: validCharges,
        notes,
        status: row.poStatus || 'draft',
      });

      if (!res.data?.success) {
        throw new Error(res.data?.message || 'Could not save purchase invoice');
      }

      const po = res.data.result;
      setSavedPo(po);
      setItems(validItems);
      setExtraCharges(validCharges);
      toast.success(row.poUuid ? 'Purchase invoice updated.' : 'Purchase invoice created.');
      onSaved?.(po, {
        vendorId,
        items: validItems,
        extraCharges: validCharges,
        notes,
        total: validItems.reduce((sum, item) => sum + n(item.amount), 0)
          + validCharges.reduce((sum, charge) => sum + n(charge.amount), 0),
      });
      setShowPreview(true);
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message || 'Could not save purchase invoice');
    } finally {
      setSaving(false);
    }
  };

  const previewItems = items.map((item) => ({
    Item: item.itemName,
    Quantity: n(item.qty),
    Rate: n(item.rate),
    Amount: n(item.amount),
    Remark: '',
  }));

  return (
    <>
      <Dialog open={open} onClose={saving ? undefined : onClose} fullWidth maxWidth="md">
        <DialogTitle>
          <Stack direction="row" spacing={1} alignItems="center">
            <ReceiptLongRoundedIcon color="primary" />
            <Box>
              <Typography variant="h6" fontWeight={900}>
                {row?.poUuid ? 'Edit Purchase Invoice' : 'Create Purchase Invoice'}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {row?.orderNumber ? `Order #${row.orderNumber}` : 'Printing job'} · {row?.customerName || 'No customer name'}
              </Typography>
            </Box>
          </Stack>
        </DialogTitle>

        <DialogContent dividers>
          <Stack spacing={1.5}>
            <Autocomplete
              options={parties}
              value={selectedVendor}
              onChange={(_event, value) => setVendorId(value?.Vendor_uuid || '')}
              getOptionLabel={(option) => option?.Vendor_name || ''}
              isOptionEqualToValue={(option, value) => option.Vendor_uuid === value.Vendor_uuid}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Vendor / Freelancer"
                  placeholder="Select payable party"
                  required
                />
              )}
            />

            <Stack spacing={1}>
              <Typography variant="subtitle2" fontWeight={800}>Items</Typography>
              {items.map((item, index) => (
                <Stack key={index} direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems="center">
                  <TextField
                    label="Item"
                    value={item.itemName}
                    onChange={(e) => updateItem(index, { itemName: e.target.value })}
                    fullWidth
                    size="small"
                  />
                  <TextField
                    label="Qty"
                    type="number"
                    value={item.qty}
                    onChange={(e) => updateItem(index, { qty: e.target.value })}
                    size="small"
                    sx={{ width: { xs: '100%', md: 95 } }}
                    inputProps={{ min: 0, step: '0.01' }}
                  />
                  <TextField
                    label="Unit"
                    value={item.unit}
                    onChange={(e) => updateItem(index, { unit: e.target.value })}
                    size="small"
                    sx={{ width: { xs: '100%', md: 95 } }}
                  />
                  <TextField
                    label="Rate"
                    type="number"
                    value={item.rate}
                    onChange={(e) => updateItem(index, { rate: e.target.value })}
                    size="small"
                    sx={{ width: { xs: '100%', md: 120 } }}
                    inputProps={{ min: 0, step: '0.01' }}
                  />
                  <TextField
                    label="Amount"
                    value={n(item.amount).toLocaleString('en-IN')}
                    disabled
                    size="small"
                    sx={{ width: { xs: '100%', md: 120 } }}
                  />
                  <IconButton
                    color="error"
                    onClick={() => setItems((prev) => prev.filter((_, i) => i !== index))}
                    disabled={items.length === 1}
                  >
                    <DeleteRoundedIcon />
                  </IconButton>
                </Stack>
              ))}
              <Button
                startIcon={<AddRoundedIcon />}
                onClick={() => setItems((prev) => [...prev, emptyItem()])}
                sx={{ alignSelf: 'flex-start', textTransform: 'none' }}
              >
                Add Item
              </Button>
            </Stack>

            <Stack spacing={1}>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography variant="subtitle2" fontWeight={800}>Additional Charges</Typography>
                <Button
                  size="small"
                  onClick={() => setExtraCharges((prev) => [...prev, { label: '', amount: '' }])}
                  sx={{ textTransform: 'none' }}
                >
                  + Add
                </Button>
              </Stack>

              {extraCharges.map((charge, index) => (
                <Stack key={index} direction="row" spacing={1} alignItems="center">
                  <TextField
                    label="Charge"
                    value={charge.label}
                    onChange={(e) => setExtraCharges((prev) => prev.map((item, i) => (
                      i === index ? { ...item, label: e.target.value } : item
                    )))}
                    fullWidth
                    size="small"
                  />
                  <TextField
                    label="Amount"
                    type="number"
                    value={charge.amount}
                    onChange={(e) => setExtraCharges((prev) => prev.map((item, i) => (
                      i === index ? { ...item, amount: e.target.value } : item
                    )))}
                    size="small"
                    sx={{ width: 140 }}
                    inputProps={{ min: 0, step: '0.01' }}
                  />
                  <IconButton
                    color="error"
                    onClick={() => setExtraCharges((prev) => prev.filter((_, i) => i !== index))}
                  >
                    <DeleteRoundedIcon />
                  </IconButton>
                </Stack>
              ))}
            </Stack>

            <TextField
              label="Notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              multiline
              minRows={2}
            />

            <Paper variant="outlined" sx={{ p: 1.25, borderRadius: 2 }}>
              <Stack direction="row" justifyContent="space-between">
                <Typography color="text.secondary">Items</Typography>
                <Typography fontWeight={700}>₹{itemTotal.toLocaleString('en-IN')}</Typography>
              </Stack>
              <Stack direction="row" justifyContent="space-between">
                <Typography color="text.secondary">Additional Charges</Typography>
                <Typography fontWeight={700}>₹{extrasTotal.toLocaleString('en-IN')}</Typography>
              </Stack>
              <Stack direction="row" justifyContent="space-between" sx={{ mt: 0.5 }}>
                <Typography fontWeight={900}>Grand Total</Typography>
                <Typography variant="h6" fontWeight={900} color="primary.main">
                  ₹{grandTotal.toLocaleString('en-IN')}
                </Typography>
              </Stack>
            </Paper>
          </Stack>
        </DialogContent>

        <DialogActions>
          <Button onClick={onClose} disabled={saving}>Cancel</Button>
          <Button
            variant="contained"
            onClick={save}
            disabled={saving}
            startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <ReceiptLongRoundedIcon />}
          >
            {saving ? 'Saving…' : 'Save & Generate'}
          </Button>
        </DialogActions>
      </Dialog>

      <InvoiceModal
        open={showPreview}
        onClose={() => setShowPreview(false)}
        orderNumber={savedPo?.PO_Number || row?.poNumber || ''}
        dateStr={fmtDateForPreview(row?.date)}
        partyName={selectedVendor?.Vendor_name || row?.vendorName || row?.parsedVendorName || 'Vendor'}
        items={previewItems}
        extraCharges={extraCharges}
        customerMobile={selectedVendor?.Mobile_number || ''}
        docType="purchase_order"
        documentTitle="PURCHASE ORDER"
        partyLabel="Vendor / Freelancer"
        numberLabel="PO No"
        hidePaymentSection
      />
    </>
  );
}
