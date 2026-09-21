import {
  Box,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Button,
  Stack,
  Typography,
} from '@mui/material';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import ErrorRoundedIcon from '@mui/icons-material/ErrorRounded';

function statusMeta(audit) {
  if (audit?.status === 'verified') {
    return { label: '3-way verified', color: 'success', Icon: CheckCircleRoundedIcon };
  }
  if (audit?.status === 'warning') {
    return { label: 'Verified with warnings', color: 'warning', Icon: WarningAmberRoundedIcon };
  }
  return { label: 'Blocked mismatch', color: 'error', Icon: ErrorRoundedIcon };
}

export default function WorkflowAuditDialog({ open, onClose, row }) {
  const audit = row?.audit || null;
  const meta = statusMeta(audit);
  const Icon = meta.Icon;
  const checks = Array.isArray(audit?.checks) ? audit.checks : [];

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>
        <Stack direction="row" spacing={1} alignItems="center">
          <Icon color={meta.color} />
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h6" fontWeight={900}>
              Workflow Audit · Order #{row?.orderNumber || '—'}
            </Typography>
            <Typography variant="caption" color="text.secondary" noWrap>
              Final ↔ Printing ↔ MIS/Customer/Vendor ↔ PO/Post Press
            </Typography>
          </Box>
          <Chip
            size="small"
            color={meta.color}
            label={meta.label}
            sx={{ ml: 'auto !important', fontWeight: 800 }}
          />
        </Stack>
      </DialogTitle>

      <DialogContent dividers>
        <Stack spacing={0.75}>
          {checks.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No audit details are available yet. Refresh Payable Account after the backend deployment finishes.
            </Typography>
          ) : checks.map((check) => {
            const CheckIcon = check.ok
              ? CheckCircleRoundedIcon
              : check.severity === 'block'
                ? ErrorRoundedIcon
                : WarningAmberRoundedIcon;
            const color = check.ok ? 'success.main' : check.severity === 'block' ? 'error.main' : 'warning.main';

            return (
              <Stack
                key={check.key}
                direction="row"
                spacing={1}
                alignItems="flex-start"
                sx={{
                  p: 0.8,
                  border: '1px solid',
                  borderColor: check.ok ? 'divider' : check.severity === 'block' ? 'error.light' : 'warning.light',
                  borderRadius: 1.5,
                }}
              >
                <CheckIcon sx={{ fontSize: 18, color, mt: 0.1, flexShrink: 0 }} />
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="body2" fontWeight={800}>
                    {check.label}
                  </Typography>
                  {check.detail ? (
                    <Typography variant="caption" color="text.secondary">
                      {check.detail}
                    </Typography>
                  ) : null}
                </Box>
              </Stack>
            );
          })}
        </Stack>

        {audit?.canCreateFinancials === false ? (
          <Typography variant="body2" color="error.main" fontWeight={800} sx={{ mt: 1.5 }}>
            Financial/post-press actions are blocked until the red identity mismatch is corrected.
          </Typography>
        ) : audit?.status === 'warning' ? (
          <Typography variant="body2" color="warning.dark" sx={{ mt: 1.5 }}>
            Core order identity is valid. Saving the Printing invoice can repair legacy folder/vendor linkage where applicable.
          </Typography>
        ) : null}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
