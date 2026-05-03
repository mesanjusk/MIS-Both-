import PropTypes from 'prop-types';
import { Stack, TextField, Typography, Paper } from '@mui/material';
import { FullscreenAddFormLayout } from '../ui';
import { compactCardSx, compactFieldSx } from '../ui/addFormStyles';

export default function SimpleEntityCreateForm({
  title,
  description,
  label,
  value,
  placeholder,
  onChange,
  onSubmit,
  submitLabel,
  children,
  secondaryActionLabel,
  onSecondaryAction,
}) {
  return (
    <FullscreenAddFormLayout
      onSubmit={onSubmit}
      onClose={onSecondaryAction}
      submitLabel={submitLabel}
      cancelLabel={secondaryActionLabel}
    >
      <Paper sx={compactCardSx}>
        <Stack spacing={1.2}>
          <Typography variant="h6" fontWeight={700}>{title}</Typography>
          {description ? <Typography variant="caption" color="text.secondary">{description}</Typography> : null}

          {label ? (
            <TextField
              autoFocus
              fullWidth
              size="small"
              sx={compactFieldSx}
              label={label}
              value={value}
              placeholder={placeholder}
              onChange={(event) => onChange(event.target.value)}
            />
          ) : null}

          {children}
        </Stack>
      </Paper>
    </FullscreenAddFormLayout>
  );
}

SimpleEntityCreateForm.propTypes = {
  title: PropTypes.string.isRequired,
  description: PropTypes.string,
  label: PropTypes.string,
  value: PropTypes.string,
  placeholder: PropTypes.string,
  onChange: PropTypes.func,
  onSubmit: PropTypes.func.isRequired,
  submitLabel: PropTypes.string,
  children: PropTypes.node,
  secondaryActionLabel: PropTypes.string,
  onSecondaryAction: PropTypes.func,
};

SimpleEntityCreateForm.defaultProps = {
  description: 'Create and organize master data without changing existing workflows.',
  label: '',
  value: '',
  placeholder: '',
  onChange: undefined,
  submitLabel: 'Submit',
  children: null,
  secondaryActionLabel: 'Cancel',
  onSecondaryAction: undefined,
};
