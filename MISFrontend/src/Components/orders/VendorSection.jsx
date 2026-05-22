import {
  Alert,
  Autocomplete,
  Button,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';

const inputLabelProps = { shrink: true };

export default function VendorSection({
  rows,
  vendorOptions,
  autocompleteSlotProps,
  compactFieldSx,
  onUpdate,
  onAdd,
  onRemove,
}) {
  return (
    <Stack spacing={1}>
      <Alert severity="info" sx={{ py: 0, borderRadius: 2, '& .MuiAlert-message': { py: 0.75 } }}>
        Pick any existing customer / party as vendor.
      </Alert>

      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Typography variant="body2" fontWeight={700}>
          Vendor Details
        </Typography>
        <Button
          type="button"
          variant="outlined"
          size="small"
          startIcon={<AddIcon />}
          onClick={onAdd}
          sx={{ borderRadius: 2 }}
        >
          Add Vendor
        </Button>
      </Stack>

      {rows.map((row, index) => (
        <Paper
          key={`vendor-${index}`}
          variant="outlined"
          sx={{ p: 1, borderRadius: 2, boxShadow: 'none' }}
        >
          <Stack spacing={1}>
            <Stack direction="row" alignItems="center" justifyContent="space-between">
              <Typography variant="caption" color="text.secondary">
                Vendor {index + 1}
              </Typography>
              <IconButton size="small" color="error" onClick={() => onRemove(index)}>
                <DeleteOutlineRoundedIcon fontSize="small" />
              </IconButton>
            </Stack>

            <Autocomplete
              options={vendorOptions}
              slotProps={autocompleteSlotProps}
              value={
                vendorOptions.find(
                  (v) => v.Vendor_uuid === (row.vendorUuid || row.vendorCustomerUuid)
                ) || null
              }
              onChange={(_, value) =>
                onUpdate(index, {
                  vendorCustomerUuid: value?.Vendor_uuid || '',
                  vendorUuid: value?.Vendor_uuid || '',
                  vendorName: value?.Vendor_name || '',
                })
              }
              getOptionLabel={(option) => option?.Vendor_name || ''}
              isOptionEqualToValue={(option, value) => option?.Vendor_uuid === value?.Vendor_uuid}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Vendor / Job Worker"
                  size="small"
                  sx={compactFieldSx}
                />
              )}
            />

            <TextField
              label="Work Type"
              value={row.workType}
              onChange={(e) => onUpdate(index, { workType: e.target.value })}
              size="small"
              fullWidth
              sx={compactFieldSx}
            />

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <TextField
                label="Stage No."
                type="number"
                value={row.sequence || index + 1}
                onChange={(e) => onUpdate(index, { sequence: e.target.value })}
                size="small"
                fullWidth
                sx={compactFieldSx}
              />
              <TextField
                select
                label="Vendor Mode"
                value={row.jobMode || 'jobwork_only'}
                onChange={(e) => onUpdate(index, { jobMode: e.target.value })}
                size="small"
                fullWidth
                sx={compactFieldSx}
              >
                <MenuItem value="jobwork_only">Jobwork only</MenuItem>
                <MenuItem value="own_material_sent">Own material sent</MenuItem>
                <MenuItem value="vendor_with_material">Vendor with material</MenuItem>
                <MenuItem value="mixed">Mixed</MenuItem>
              </TextField>
            </Stack>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <TextField
                label="Input Item"
                value={row.inputItem || ''}
                onChange={(e) => onUpdate(index, { inputItem: e.target.value })}
                size="small"
                fullWidth
                sx={compactFieldSx}
              />
              <TextField
                label="Output Item"
                value={row.outputItem || ''}
                onChange={(e) => onUpdate(index, { outputItem: e.target.value })}
                size="small"
                fullWidth
                sx={compactFieldSx}
              />
            </Stack>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <TextField
                label="Qty"
                type="number"
                value={row.qty}
                onChange={(e) => onUpdate(index, { qty: e.target.value })}
                size="small"
                fullWidth
                sx={compactFieldSx}
              />
              <TextField
                label="Cost / Bill"
                type="number"
                value={row.amount}
                onChange={(e) => onUpdate(index, { amount: e.target.value })}
                size="small"
                fullWidth
                sx={compactFieldSx}
              />
              <TextField
                label="Advance Paid"
                type="number"
                value={row.advanceAmount || ''}
                onChange={(e) => onUpdate(index, { advanceAmount: e.target.value })}
                size="small"
                fullWidth
                sx={compactFieldSx}
              />
            </Stack>

            <TextField
              label="Due Date"
              type="date"
              value={row.dueDate}
              onChange={(e) => onUpdate(index, { dueDate: e.target.value })}
              size="small"
              fullWidth
              sx={compactFieldSx}
              InputLabelProps={inputLabelProps}
            />

            <TextField
              label="Note"
              value={row.note}
              onChange={(e) => onUpdate(index, { note: e.target.value })}
              size="small"
              fullWidth
              sx={compactFieldSx}
            />
          </Stack>
        </Paper>
      ))}
    </Stack>
  );
}
