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
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import ReceiptLongRoundedIcon from '@mui/icons-material/ReceiptLongRounded';
import toast from 'react-hot-toast';
import axios from '../apiClient';
import InvoiceModal from './InvoiceModal';

export const POST_PRESS_TYPES = [
  { value: 'lamination', label: 'Lamination' },
  { value: 'uv_coating', label: 'UV Coating' },
  { value: 'cutting', label: 'Cutting' },
  { value: 'foiling', label: 'Foiling' },
  { value: 'binding', label: 'Binding' },
  { value: 'packing', label: 'Packing' },
  { value: 'finishing', label: 'Finishing' },
  { value: 'embossing', label: 'Embossing' },
  { value: 'quality_check', label: 'Quality Check' },
  { value: 'other', label: 'Other' },
];

export const POST_PRESS_STATUS = [
  { value: 'draft', label: 'Required' },
  { value: 'sent', label: 'Sent' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: 'Completed' },
];

const n = (value) => {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toInputDate = (value) => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
};

const toPreviewDate = (value) => {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-GB');
};

const typeLabel = (value) =>
  POST_PRESS_TYPES.find((item) => item.value === value)?.label || value || 'Post Press';

export default function PostPressJobEditor({
  open,
  onClose,
  row,
  job = null,
  parties = [],
  onSaved,
}) {
  const [jobType, setJobType] = useState('lamination');
  const [vendorId, setVendorId] = useState('');
  const [qty, setQty] = useState(1);
  const [unit, setUnit] = useState('Pcs');
  const [rate, setRate] = useState('');
  const [extraCharges, setExtraCharges] = useState('');
  const [expectedCompletion, setExpectedCompletion] = useState('');
  const [status, setStatus] = useState('draft');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [savedJob, setSavedJob] = useState(null);

  useEffect(() => {
    if (!open || !row) return;

    const outputItems = Array.isArray(job?.outputItems) ? job.outputItems : [];
    const extra = outputItems.find(
      (item) => String(item?.itemName || '').toLowerCase() === 'extra charges'
    );
    const primary = outputItems.find(
      (item) => String(item?.itemName || '').toLowerCase() !== 'extra charges'
    );

    const primaryAmount = n(primary?.amount) || (n(primary?.quantity) * n(primary?.rate));
    const knownExtra = n(extra?.amount);
    const grand = n(job?.jobValue);
    const inferredExtra = knownExtra || Math.max(0, grand - primaryAmount);

    setJobType(job?.job_type || 'lamination');
    setVendorId(job?.payableVendorUuid || job?.vendor_uuid || '');
    setQty(n(primary?.quantity) || 1);
    setUnit(primary?.uom || 'Pcs');
    setRate(n(primary?.rate) || (primaryAmount && n(primary?.quantity)
      ? +(primaryAmount / n(primary.quantity)).toFixed(2)
      : ''));
    setExtraCharges(inferredExtra || '');
    setExpectedCompletion(toInputDate(job?.expected_completion));
    setStatus(job?.status || 'draft');
    setNotes(job?.notes || '');
    setSavedJob(job || null);
    setShowPreview(false);
  }, [open, row, job]);

  const selectedVendor = useMemo(
    () => parties.find((party) => party.Vendor_uuid === vendorId) || null,
    [parties, vendorId]
  );

  const subtotal = +(n(qty) * n(rate)).toFixed(2);
  const grandTotal = +(subtotal + n(extraCharges)).toFixed(2);

  const save = async () => {
    if (!row?.orderUuid) {
      toast.error('This Printing folder is not linked to an MIS order.');
      return;
    }
    if (!vendorId || !selectedVendor) {
      toast.error('Select the post-press vendor / freelancer.');
      return;
    }
    if (!jobType) {
      toast.error('Select a post-press service.');
      return;
    }
    if (!(n(qty) > 0) || !(n(rate) > 0) || !(grandTotal > 0)) {
      toast.error('Enter quantity and rate for the post-press service.');
      return;
    }

    const serviceLabel = typeLabel(jobType);
    const outputItems = [
      {
        itemName: serviceLabel,
        itemType: 'service',
        quantity: n(qty),
        uom: unit || 'Pcs',
        rate: n(rate),
        amount: subtotal,
        remarks: notes || '',
      },
    ];
    if (n(extraCharges) > 0) {
      outputItems.push({
        itemName: 'Extra Charges',
        itemType: 'service',
        quantity: 1,
        uom: 'Job',
        rate: n(extraCharges),
        amount: n(extraCharges),
        remarks: '',
      });
    }

    setSaving(true);
    try {
      const res = await axios.post('/api/vendors/production-jobs', {
        ...(job?.job_uuid ? { job_uuid: job.job_uuid } : {}),
        job_category: 'post_printing',
        job_type: jobType,
        job_mode: 'jobwork_only',
        vendor_uuid: vendorId,
        vendor_name: selectedVendor.Vendor_name,
        payable_account: vendorId,
        order_uuid: row.orderUuid,
        order_number: row.orderNumber || null,
        job_date: job?.job_date || row.date,
        expected_completion: expectedCompletion || null,
        status,
        outputItems,
        inputItems: [],
        jobValue: grandTotal,
        materialValue: 0,
        otherCharges: 0,
        notes,
        driveFileId: row.folderId,
        createdBy: localStorage.getItem('User_name') || 'System',
      });

      if (!res.data?.success) {
        throw new Error(res.data?.message || 'Could not save post-press job');
      }

      const saved = res.data.result;
      setSavedJob(saved);
      toast.success(job?.job_uuid ? 'Post-press job updated.' : 'Post-press job created.');
      await onSaved?.(saved);
      setShowPreview(true);
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message || 'Could not save post-press job');
    } finally {
      setSaving(false);
    }
  };

  const previewItems = [
    {
      Item: typeLabel(jobType),
      Quantity: n(qty),
      Rate: n(rate),
      Amount: subtotal,
      Remark: notes || '',
    },
    ...(n(extraCharges) > 0
      ? [{
          Item: 'Extra Charges',
          Quantity: 1,
          Rate: n(extraCharges),
          Amount: n(extraCharges),
          Remark: '',
        }]
      : []),
  ];

  const previewNumber = savedJob?.job_number || job?.job_number || '';

  return (
    <>
      <Dialog open={open} onClose={saving ? undefined : onClose} fullWidth maxWidth="sm">
        <DialogTitle>
          <Typography variant="h6" fontWeight={900}>
            {job?.job_uuid ? 'Edit Post-Press Invoice' : 'Add Post-Press Service'}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Order #{row?.orderNumber || '—'} · {row?.customerName || 'Customer'}
          </Typography>
        </DialogTitle>

        <DialogContent dividers>
          <Stack spacing={1.5}>
            <TextField
              select
              label="Post-Press Service"
              value={jobType}
              onChange={(e) => setJobType(e.target.value)}
              fullWidth
            >
              {POST_PRESS_TYPES.map((item) => (
                <MenuItem key={item.value} value={item.value}>{item.label}</MenuItem>
              ))}
            </TextField>

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

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <TextField
                label="Qty"
                type="number"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                inputProps={{ min: 0, step: '0.01' }}
                fullWidth
              />
              <TextField
                label="Unit"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                fullWidth
              />
              <TextField
                label="Rate"
                type="number"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                inputProps={{ min: 0, step: '0.01' }}
                fullWidth
              />
            </Stack>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <TextField
                label="Extra Charges"
                type="number"
                value={extraCharges}
                onChange={(e) => setExtraCharges(e.target.value)}
                inputProps={{ min: 0, step: '0.01' }}
                fullWidth
              />
              <TextField
                type="date"
                label="Expected Completion"
                value={expectedCompletion}
                onChange={(e) => setExpectedCompletion(e.target.value)}
                InputLabelProps={{ shrink: true }}
                fullWidth
              />
              <TextField
                select
                label="Status"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                fullWidth
              >
                {POST_PRESS_STATUS.map((item) => (
                  <MenuItem key={item.value} value={item.value}>{item.label}</MenuItem>
                ))}
              </TextField>
            </Stack>

            <TextField
              label="Notes / Instructions"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              multiline
              minRows={2}
            />

            <Paper variant="outlined" sx={{ p: 1.25, borderRadius: 2 }}>
              <Stack direction="row" justifyContent="space-between">
                <Typography color="text.secondary">Service Amount</Typography>
                <Typography fontWeight={700}>₹{subtotal.toLocaleString('en-IN')}</Typography>
              </Stack>
              <Stack direction="row" justifyContent="space-between">
                <Typography color="text.secondary">Extra Charges</Typography>
                <Typography fontWeight={700}>₹{n(extraCharges).toLocaleString('en-IN')}</Typography>
              </Stack>
              <Stack direction="row" justifyContent="space-between" sx={{ mt: 0.5 }}>
                <Typography fontWeight={900}>Vendor Cost</Typography>
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
        onClose={async () => {
          setShowPreview(false);
          await onSaved?.(savedJob || job);
        }}
        orderNumber={previewNumber ? `PPJ-${previewNumber}` : ''}
        dateStr={toPreviewDate(savedJob?.job_date || job?.job_date || row?.date)}
        partyName={selectedVendor?.Vendor_name || savedJob?.vendor_name || job?.vendor_name || 'Vendor'}
        items={previewItems}
        extraCharges={[]}
        customerMobile={selectedVendor?.Mobile_number || ''}
        docType="purchase_order"
        documentTitle="JOB WORK ORDER"
        partyLabel="Vendor / Freelancer"
        numberLabel="Job No"
        hidePaymentSection
      />
    </>
  );
}
