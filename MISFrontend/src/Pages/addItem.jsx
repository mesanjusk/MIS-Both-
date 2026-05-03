import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import AddIcon from '@mui/icons-material/Add';
import axios from '../apiClient.js';
import { FullscreenAddFormLayout } from '../components/ui';
import { compactCardSx, compactFieldSx } from '../components/ui/addFormStyles';

const ITEM_TYPES = [
  { value: 'finished_item', label: 'Finished Item' },
  { value: 'raw_material', label: 'Raw Material' },
  { value: 'service', label: 'Service' },
  { value: 'consumable', label: 'Consumable' },
];

const EXECUTION_MODES = [
  { value: 'stock', label: 'Stock' },
  { value: 'purchase', label: 'Purchase' },
  { value: 'in_house', label: 'In House' },
  { value: 'vendor', label: 'Vendor' },
  { value: 'hybrid', label: 'Hybrid' },
];

const emptyBomRow = () => ({
  componentItemName: '',
  componentType: 'raw_material',
  itemGroup: '',
  qty: 1,
  unit: 'Nos',
  wastePercent: 0,
  executionMode: 'stock',
  defaultCost: 0,
  note: '',
});

export default function AddItem() {
  const navigate = useNavigate();
  const [groupOptions, setGroupOptions] = useState([]);
  const [catalogOptions, setCatalogOptions] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    Item_name: '',
    Item_group: '',
    itemType: 'finished_item',
    unit: 'Nos',
    stockTracked: false,
    openingStock: 0,
    reorderLevel: 0,
    defaultPurchaseRate: 0,
    defaultSaleRate: 0,
    executionMode: 'stock',
    description: '',
    bom: [],
  });

  useEffect(() => {
    const load = async () => {
      try {
        const [groupRes, itemRes] = await Promise.all([
          axios.get('/api/itemgroup/GetItemgroupList'),
          axios.get('/api/items/GetItemList'),
        ]);
        if (groupRes.data?.success) setGroupOptions(groupRes.data.result || []);
        if (itemRes.data?.success) setCatalogOptions(itemRes.data.result || []);
      } catch (err) {
        console.error('Error loading item setup data', err);
      }
    };
    load();
  }, []);

  const selectedGroup = useMemo(
    () => groupOptions.find((group) => group.Item_group === form.Item_group) || null,
    [groupOptions, form.Item_group]
  );

  const showBom = form.itemType === 'finished_item';

  const setField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const addBomRow = () => setForm((prev) => ({ ...prev, bom: [...prev.bom, emptyBomRow()] }));
  const removeBomRow = (index) => setForm((prev) => ({ ...prev, bom: prev.bom.filter((_, i) => i !== index) }));
  const updateBomRow = (index, patch) =>
    setForm((prev) => ({
      ...prev,
      bom: prev.bom.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)),
    }));

  const onSelectGroup = (value) => {
    const group = groupOptions.find((g) => g.Item_group === value);
    setForm((prev) => ({
      ...prev,
      Item_group: value,
      itemType: group?.defaultItemType || prev.itemType,
      stockTracked: typeof group?.stockTrackedDefault === 'boolean' ? group.stockTrackedDefault : prev.stockTracked,
    }));
  };

  async function submit(e) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await axios.post('/api/items/addItem', {
        ...form,
        openingStock: Number(form.openingStock || 0),
        reorderLevel: Number(form.reorderLevel || 0),
        defaultPurchaseRate: Number(form.defaultPurchaseRate || 0),
        defaultSaleRate: Number(form.defaultSaleRate || 0),
        bom: (form.bom || []).map((row) => ({
          ...row,
          qty: Number(row.qty || 0),
          wastePercent: Number(row.wastePercent || 0),
          defaultCost: Number(row.defaultCost || 0),
        })),
      });

      if (res.data === 'exist') {
        alert('Item already exists');
      } else if (res.data === 'notexist') {
        alert('Item added successfully');
        navigate('/home');
      }
    } catch (err) {
      alert('Unable to save item');
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FullscreenAddFormLayout
      title="Add Item"
      subtitle="Create finished items, raw materials and services. Finished items can keep BOM rows for later vendor or user assignment."
      onClose={() => navigate('/home')}
      onSubmit={submit}
      submitLabel={submitting ? 'Saving...' : 'Save Item'}
      isSubmitting={submitting}
    >
      <Stack spacing={1.5}>
        {selectedGroup && (
          <Alert severity="info" sx={{ borderRadius: 2 }}>
            Group type: <strong>{selectedGroup.groupType || 'general'}</strong>
          </Alert>
        )}

        <Paper variant="outlined" sx={{ ...compactCardSx, p: 1.5 }}>
          <Stack spacing={1.25}>
            <Typography variant="subtitle2">Item Master</Typography>
            <TextField label="Item Name" value={form.Item_name} onChange={(e) => setField('Item_name', e.target.value)} size="small" fullWidth sx={compactFieldSx} />
            <TextField select label="Item Group" value={form.Item_group} onChange={(e) => onSelectGroup(e.target.value)} size="small" fullWidth sx={compactFieldSx}>
              <MenuItem value="">Select Group</MenuItem>
              {groupOptions.map((group) => (
                <MenuItem key={group.Item_group_uuid || group.Item_group} value={group.Item_group}>{group.Item_group}</MenuItem>
              ))}
            </TextField>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
              <TextField select label="Item Type" value={form.itemType} onChange={(e) => setField('itemType', e.target.value)} size="small" fullWidth sx={compactFieldSx}>
                {ITEM_TYPES.map((option) => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}
              </TextField>
              <TextField label="Unit" value={form.unit} onChange={(e) => setField('unit', e.target.value)} size="small" fullWidth sx={compactFieldSx} />
            </Stack>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
              <TextField label="Purchase Rate" type="number" value={form.defaultPurchaseRate} onChange={(e) => setField('defaultPurchaseRate', e.target.value)} size="small" fullWidth sx={compactFieldSx} />
              <TextField label="Sale Rate" type="number" value={form.defaultSaleRate} onChange={(e) => setField('defaultSaleRate', e.target.value)} size="small" fullWidth sx={compactFieldSx} />
            </Stack>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
              <TextField label="Opening Stock" type="number" value={form.openingStock} onChange={(e) => setField('openingStock', e.target.value)} size="small" fullWidth sx={compactFieldSx} disabled={!form.stockTracked} />
              <TextField label="Reorder Level" type="number" value={form.reorderLevel} onChange={(e) => setField('reorderLevel', e.target.value)} size="small" fullWidth sx={compactFieldSx} disabled={!form.stockTracked} />
            </Stack>
            <TextField select label="Execution Mode" value={form.executionMode} onChange={(e) => setField('executionMode', e.target.value)} size="small" fullWidth sx={compactFieldSx}>
              {EXECUTION_MODES.map((option) => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}
            </TextField>
            <FormControlLabel control={<Checkbox checked={form.stockTracked} onChange={(e) => setField('stockTracked', e.target.checked)} />} label="Track stock / inventory for this item" />
            <TextField label="Description" value={form.description} onChange={(e) => setField('description', e.target.value)} size="small" fullWidth multiline minRows={2} sx={compactFieldSx} />
          </Stack>
        </Paper>

        {showBom && (
          <Paper variant="outlined" sx={{ ...compactCardSx, p: 1.5 }}>
            <Stack spacing={1.25}>
              <Stack direction="row" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography variant="subtitle2">Finished Item BOM</Typography>
                  <Typography variant="caption" color="text.secondary">Add raw materials and services. Vendor or user can be decided later at order time.</Typography>
                </Box>
                <Button size="small" startIcon={<AddIcon />} onClick={addBomRow}>Add BOM Row</Button>
              </Stack>

              {!form.bom.length && <Alert severity="warning" sx={{ borderRadius: 2 }}>No BOM rows added yet. This item will behave like a simple finished item.</Alert>}

              {form.bom.map((row, index) => (
                <Paper key={`bom-${index}`} variant="outlined" sx={{ p: 1, borderRadius: 2 }}>
                  <Stack spacing={1}>
                    <Stack direction="row" alignItems="center" justifyContent="space-between">
                      <Typography variant="caption" color="text.secondary">Component {index + 1}</Typography>
                      <IconButton size="small" color="error" onClick={() => removeBomRow(index)}><DeleteOutlineRoundedIcon fontSize="small" /></IconButton>
                    </Stack>
                    <TextField select label="Component" value={row.componentItemName} onChange={(e) => {
                      const selected = catalogOptions.find((item) => item.Item_name === e.target.value);
                      updateBomRow(index, {
                        componentItemName: e.target.value,
                        componentItemUuid: selected?.Item_uuid || '',
                        itemGroup: selected?.Item_group || row.itemGroup,
                        componentType: selected?.itemType === 'service' ? 'service' : selected?.itemType === 'consumable' ? 'consumable' : 'raw_material',
                        unit: selected?.unit || row.unit,
                        executionMode: selected?.executionMode || row.executionMode,
                        defaultCost: selected?.defaultPurchaseRate || row.defaultCost,
                      });
                    }} size="small" fullWidth sx={compactFieldSx}>
                      <MenuItem value="">Select component item</MenuItem>
                      {catalogOptions.map((item) => <MenuItem key={item.Item_uuid || item.Item_name} value={item.Item_name}>{item.Item_name}</MenuItem>)}
                    </TextField>
                    <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
                      <TextField select label="Type" value={row.componentType} onChange={(e) => updateBomRow(index, { componentType: e.target.value })} size="small" fullWidth sx={compactFieldSx}>
                        <MenuItem value="raw_material">Raw Material</MenuItem>
                        <MenuItem value="service">Service</MenuItem>
                        <MenuItem value="consumable">Consumable</MenuItem>
                      </TextField>
                      <TextField label="Group" value={row.itemGroup} onChange={(e) => updateBomRow(index, { itemGroup: e.target.value })} size="small" fullWidth sx={compactFieldSx} />
                    </Stack>
                    <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
                      <TextField label="Qty" type="number" value={row.qty} onChange={(e) => updateBomRow(index, { qty: e.target.value })} size="small" fullWidth sx={compactFieldSx} />
                      <TextField label="Unit" value={row.unit} onChange={(e) => updateBomRow(index, { unit: e.target.value })} size="small" fullWidth sx={compactFieldSx} />
                      <TextField label="Waste %" type="number" value={row.wastePercent} onChange={(e) => updateBomRow(index, { wastePercent: e.target.value })} size="small" fullWidth sx={compactFieldSx} />
                    </Stack>
                    <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
                      <TextField select label="Execution" value={row.executionMode} onChange={(e) => updateBomRow(index, { executionMode: e.target.value })} size="small" fullWidth sx={compactFieldSx}>
                        {EXECUTION_MODES.map((option) => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}
                      </TextField>
                      <TextField label="Est. Cost" type="number" value={row.defaultCost} onChange={(e) => updateBomRow(index, { defaultCost: e.target.value })} size="small" fullWidth sx={compactFieldSx} />
                    </Stack>
                    <TextField label="Note" value={row.note} onChange={(e) => updateBomRow(index, { note: e.target.value })} size="small" fullWidth sx={compactFieldSx} />
                  </Stack>
                </Paper>
              ))}
            </Stack>
          </Paper>
        )}
      </Stack>
    </FullscreenAddFormLayout>
  );
}
