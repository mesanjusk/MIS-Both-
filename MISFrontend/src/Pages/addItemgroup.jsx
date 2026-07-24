import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Alert, Checkbox, FormControlLabel, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';
import axios from '../apiClient.js';
import { FullscreenAddFormLayout } from '../Components/ui';
import { compactCardSx, compactFieldSx } from '../Components/ui/addFormStyles';

export default function AddItemGroup() {
  const navigate = useNavigate();
  const [parentOptions, setParentOptions] = useState([]);
  const [form, setForm] = useState({
    Item_group: '',
    groupType: 'general',
    description: '',
    defaultItemType: 'finished_item',
    stockTrackedDefault: false,
    parentGroup_uuid: '',
  });

  useEffect(() => {
    const loadParents = async () => {
      try {
        const res = await axios.get('/api/itemgroup/GetItemgroupList');
        if (res.data?.success) {
          // Only top-level groups can be a parent, so sub groups stay a single level deep.
          setParentOptions((res.data.result || []).filter((g) => !g.parentGroup_uuid));
        }
      } catch (error) {
        console.error('Error loading item groups:', error);
      }
    };
    loadParents();
  }, []);

  const setField = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  async function submit(e) {
    e.preventDefault();
    try {
      await axios.post('/api/itemgroup/addItemgroup', form);
      toast.success(form.parentGroup_uuid ? 'Sub group added successfully' : 'Group added successfully');
      navigate('/home');
    } catch (error) {
      if (error.response?.status === 409) {
        toast.error('Group already exists');
      } else {
        toast.error(error.response?.data?.message || 'Unable to save item group');
        console.error(error);
      }
    }
  }

  return (
    <FullscreenAddFormLayout
      title="Add Item Group"
      subtitle="Use group type so item master can default to finished goods, raw materials, services or consumables."
      onClose={() => navigate('/home')}
      onSubmit={submit}
      submitLabel="Save Group"
    >
      <Paper variant="outlined" sx={{ ...compactCardSx, p: 1.5 }}>
        <Stack spacing={1.25}>
          <Alert severity="info" sx={{ borderRadius: 2 }}>
            Recommended: Finished Goods, Raw Materials, Services, Consumables, Outsourced Work.
          </Alert>
          <Typography variant="subtitle2">Group Setup</Typography>
          <TextField
            select
            label="Parent Group (optional — creates a sub group)"
            value={form.parentGroup_uuid}
            onChange={(e) => setField('parentGroup_uuid', e.target.value)}
            size="small"
            fullWidth
            sx={compactFieldSx}
            helperText="Leave blank for a top-level group, or pick one to add this as its sub item group."
          >
            <MenuItem value="">None (top-level group)</MenuItem>
            {parentOptions.map((group) => (
              <MenuItem key={group.Item_group_uuid} value={group.Item_group_uuid}>{group.Item_group}</MenuItem>
            ))}
          </TextField>
          <TextField label={form.parentGroup_uuid ? 'Sub Item Group' : 'Item Group'} value={form.Item_group} onChange={(e) => setField('Item_group', e.target.value)} size="small" fullWidth sx={compactFieldSx} />
          <TextField select label="Group Type" value={form.groupType} onChange={(e) => setField('groupType', e.target.value)} size="small" fullWidth sx={compactFieldSx}>
            <MenuItem value="general">General</MenuItem>
            <MenuItem value="finished_goods">Finished Goods</MenuItem>
            <MenuItem value="raw_materials">Raw Materials</MenuItem>
            <MenuItem value="services">Services</MenuItem>
            <MenuItem value="consumables">Consumables</MenuItem>
            <MenuItem value="outsourced_work">Outsourced Work</MenuItem>
          </TextField>
          <TextField select label="Default Item Type" value={form.defaultItemType} onChange={(e) => setField('defaultItemType', e.target.value)} size="small" fullWidth sx={compactFieldSx}>
            <MenuItem value="finished_item">Finished Item</MenuItem>
            <MenuItem value="raw_material">Raw Material</MenuItem>
            <MenuItem value="service">Service</MenuItem>
            <MenuItem value="consumable">Consumable</MenuItem>
          </TextField>
          <FormControlLabel control={<Checkbox checked={form.stockTrackedDefault} onChange={(e) => setField('stockTrackedDefault', e.target.checked)} />} label="Track stock by default for items in this group" />
          <TextField label="Description" value={form.description} onChange={(e) => setField('description', e.target.value)} size="small" fullWidth multiline minRows={3} sx={compactFieldSx} />
        </Stack>
      </Paper>
    </FullscreenAddFormLayout>
  );
}
