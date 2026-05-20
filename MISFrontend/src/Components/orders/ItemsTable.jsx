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

export default function ItemsTable({
  items,
  itemNameOptions,
  itemGroupOptions,
  selectedItemCatalogMap,
  autocompleteSlotProps,
  selectMenuProps,
  compactFieldSx,
  compactCardSx,
  onUpdate,
  onAdd,
  onRemove,
}) {
  return (
    <Paper sx={compactCardSx}>
      <Stack spacing={1}>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Typography variant="body2" fontWeight={700}>
            Detailed Items
          </Typography>
          <Button
            type="button"
            variant="outlined"
            size="small"
            startIcon={<AddIcon />}
            onClick={onAdd}
            sx={{ borderRadius: 2 }}
          >
            Add Item
          </Button>
        </Stack>

        {items.map((item, index) => (
          <Paper
            key={`item-${index}`}
            variant="outlined"
            sx={{ p: 1, borderRadius: 2, boxShadow: 'none' }}
          >
            <Stack spacing={1}>
              <Stack direction="row" alignItems="center" justifyContent="space-between">
                <Typography variant="caption" color="text.secondary">
                  Item {index + 1}
                </Typography>
                <IconButton size="small" color="error" onClick={() => onRemove(index)}>
                  <DeleteOutlineRoundedIcon fontSize="small" />
                </IconButton>
              </Stack>

              <Autocomplete
                options={itemNameOptions}
                freeSolo
                slotProps={autocompleteSlotProps}
                value={item.Item || ''}
                getOptionLabel={(option) =>
                  typeof option === 'string' ? option : option?.Item_name || ''
                }
                onChange={(_, value) =>
                  onUpdate(index, 'Item', typeof value === 'string' ? value : value?.Item_name || '')
                }
                inputValue={item.Item || ''}
                onInputChange={(_, value) => onUpdate(index, 'Item', value || '')}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Item Name"
                    size="small"
                    fullWidth
                    sx={compactFieldSx}
                  />
                )}
              />

              <TextField
                select
                label="Item Group"
                value={item.Item_group}
                onChange={(e) => onUpdate(index, 'Item_group', e.target.value)}
                size="small"
                fullWidth
                sx={compactFieldSx}
                MenuProps={selectMenuProps}
              >
                <MenuItem value="">Select Group</MenuItem>
                {itemGroupOptions.map((option) => (
                  <MenuItem key={option} value={option}>
                    {option}
                  </MenuItem>
                ))}
              </TextField>

              {selectedItemCatalogMap.get(item.Item)?.itemType === 'finished_item' &&
              (selectedItemCatalogMap.get(item.Item)?.bomCount || 0) > 0 ? (
                <Alert severity="info" sx={{ borderRadius: 2 }}>
                  This item has {selectedItemCatalogMap.get(item.Item)?.bomCount} BOM rows.
                  Raw material/service work will be created automatically after saving.
                </Alert>
              ) : null}

              {selectedItemCatalogMap.get(item.Item)?.itemType ? (
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                  <TextField
                    label="Item Type"
                    value={selectedItemCatalogMap.get(item.Item)?.itemType || item.itemType || ''}
                    size="small"
                    fullWidth
                    disabled
                    sx={compactFieldSx}
                  />
                  <TextField
                    label="Execution"
                    value={selectedItemCatalogMap.get(item.Item)?.executionMode || '-'}
                    size="small"
                    fullWidth
                    disabled
                    sx={compactFieldSx}
                  />
                </Stack>
              ) : null}

              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                <TextField
                  label="Qty"
                  type="number"
                  value={item.Quantity}
                  onChange={(e) => onUpdate(index, 'Quantity', e.target.value)}
                  inputProps={{ min: 0, step: '1' }}
                  size="small"
                  fullWidth
                  sx={compactFieldSx}
                />
                <TextField
                  label="Rate (₹)"
                  type="number"
                  value={item.Rate}
                  onChange={(e) => onUpdate(index, 'Rate', e.target.value)}
                  inputProps={{ min: 0, step: '0.01' }}
                  size="small"
                  fullWidth
                  sx={compactFieldSx}
                />
                <TextField
                  label="Amount (₹)"
                  type="number"
                  value={item.Amount}
                  onChange={(e) => onUpdate(index, 'Amount', e.target.value)}
                  inputProps={{ min: 0, step: '0.01' }}
                  size="small"
                  fullWidth
                  sx={compactFieldSx}
                />
              </Stack>

              <TextField
                label="Remark / Description"
                value={item.Remark}
                onChange={(e) => onUpdate(index, 'Remark', e.target.value)}
                size="small"
                fullWidth
                sx={compactFieldSx}
              />
            </Stack>
          </Paper>
        ))}
      </Stack>
    </Paper>
  );
}
