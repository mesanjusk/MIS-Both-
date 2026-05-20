import { Autocomplete, Button, Stack, TextField } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';

export default function CustomerSelector({
  options,
  value,
  inputValue,
  onInputChange,
  onChange,
  loading,
  slotProps,
  compactFieldSx,
  onAddNew,
}) {
  return (
    <Stack direction="row" spacing={1} alignItems="stretch">
      <Autocomplete
        loading={loading}
        options={options}
        value={value}
        inputValue={inputValue}
        onInputChange={(_, val, reason) => {
          onInputChange(val, reason);
        }}
        onChange={(_, val) => onChange(val)}
        getOptionLabel={(option) => option?.Customer_name || ''}
        isOptionEqualToValue={(option, val) => option?.Customer_uuid === val?.Customer_uuid}
        slotProps={slotProps}
        sx={{ flex: 1, minWidth: 0 }}
        renderInput={(params) => (
          <TextField
            {...params}
            label="Customer / Party"
            placeholder="Search by name"
            size="small"
            sx={compactFieldSx}
          />
        )}
      />
      <Button
        type="button"
        variant="outlined"
        size="small"
        onClick={onAddNew}
        sx={{ minWidth: 42, width: 42, flexShrink: 0, borderRadius: 2, px: 0 }}
      >
        <AddIcon />
      </Button>
    </Stack>
  );
}
