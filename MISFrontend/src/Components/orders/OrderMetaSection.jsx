import { Alert, Chip, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';

const inputLabelProps = { shrink: true };

export default function OrderMetaSection({
  assignableUsers,
  selectedAssignee,
  orderDueDate,
  orderPriority,
  selectedAssigneeName,
  formErrors,
  selectMenuProps,
  compactFieldSx,
  compactCardSx,
  minDate,
  onAssigneeChange,
  onDueDateChange,
  onPriorityChange,
}) {
  return (
    <Paper sx={compactCardSx}>
      <Stack spacing={1}>
        <Typography variant="body2" fontWeight={700}>
          Ownership &amp; Delivery
        </Typography>

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          <TextField
            select
            required
            label="Assigned To Office User"
            value={selectedAssignee}
            onChange={(e) => onAssigneeChange(e.target.value)}
            error={Boolean(formErrors?.assignedTo)}
            helperText={formErrors?.assignedTo || 'Only Office User group is shown here'}
            size="small"
            fullWidth
            sx={compactFieldSx}
            SelectProps={{ MenuProps: selectMenuProps }}
          >
            <MenuItem value="">Select office user</MenuItem>
            {assignableUsers.map((user) => (
              <MenuItem
                key={user.User_uuid || user._id || user.User_name}
                value={user.User_uuid || user._id || user.User_name}
              >
                {user.User_name} {user.User_group ? `(${user.User_group})` : ''}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            required
            label="Delivery Date"
            type="date"
            value={orderDueDate}
            onChange={(e) => onDueDateChange(e.target.value)}
            error={Boolean(formErrors?.dueDate)}
            helperText={formErrors?.dueDate || 'Cannot select past date'}
            inputProps={{ min: minDate }}
            size="small"
            fullWidth
            sx={compactFieldSx}
            InputLabelProps={inputLabelProps}
          />

          <TextField
            select
            label="Priority"
            value={orderPriority}
            onChange={(e) => onPriorityChange(e.target.value)}
            size="small"
            fullWidth
            sx={compactFieldSx}
            SelectProps={{ MenuProps: selectMenuProps }}
          >
            <MenuItem value="low">
              <Chip size="small" color="success" label="Low" />
            </MenuItem>
            <MenuItem value="medium">
              <Chip size="small" color="warning" label="Medium" />
            </MenuItem>
            <MenuItem value="high">
              <Chip size="small" color="error" label="High" />
            </MenuItem>
          </TextField>
        </Stack>

        <Alert
          severity="info"
          sx={{ py: 0, borderRadius: 2, '& .MuiAlert-message': { py: 0.75 } }}
        >
          Assigned to {selectedAssigneeName || '—'} | Due: {orderDueDate || '—'} | Priority: {orderPriority}
        </Alert>
      </Stack>
    </Paper>
  );
}
