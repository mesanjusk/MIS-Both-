import PropTypes from 'prop-types';
import { Alert, Box, Button, Card, CardContent, CardHeader, CircularProgress, Paper, Stack, Typography } from '@mui/material';

export function PageContainer({ title, subtitle, actions, children }) {
  return (
    <Stack
      spacing={1.5}
      sx={{
        px: { xs: 0.25, sm: 0.5 },
        pb: 0.75,
        minWidth: 0,
      }}
    >
      {(title || subtitle || actions) ? (
        <Card
          elevation={0}
          sx={{
            borderRadius: 2,
            border: (theme) => `1px solid ${theme.palette.divider}`,
            bgcolor: 'background.paper',
          }}
        >
          <CardContent sx={{ p: 1.25, '&:last-child': { pb: 1.25 } }}>
            <Stack
              direction={{ xs: 'column', md: 'row' }}
              justifyContent="space-between"
              alignItems={{ xs: 'flex-start', md: 'center' }}
              spacing={1}
            >
              <Box sx={{ minWidth: 0 }}>
                {title ? <Typography variant="h5" noWrap>{title}</Typography> : null}
                {subtitle ? <Typography variant="body2" color="text.secondary">{subtitle}</Typography> : null}
              </Box>
              {actions ? <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>{actions}</Stack> : null}
            </Stack>
          </CardContent>
        </Card>
      ) : null}
      {children}
    </Stack>
  );
}

export function SectionCard({ title, subtitle, action, children, contentSx }) {
  return (
    <Card elevation={0} sx={{ minWidth: 0 }}>
      {(title || subtitle || action) ? (
        <CardHeader
          sx={{ py: 1, px: 1.25 }}
          title={title ? <Typography variant="subtitle1">{title}</Typography> : null}
          subheader={subtitle ? <Typography variant="caption">{subtitle}</Typography> : null}
          action={action}
        />
      ) : null}
      <CardContent sx={{ p: 1, '&:last-child': { pb: 1 }, minWidth: 0, ...contentSx }}>{children}</CardContent>
    </Card>
  );
}

export function FormSection({ title, subtitle, children }) {
  return (
    <Stack spacing={1} sx={{ minWidth: 0 }}>
      {(title || subtitle) ? (
        <Box>
          {title ? <Typography variant="subtitle2">{title}</Typography> : null}
          {subtitle ? <Typography variant="caption" color="text.secondary">{subtitle}</Typography> : null}
        </Box>
      ) : null}
      {children}
    </Stack>
  );
}

export function ActionButtonGroup({ primaryLabel = 'Save', onCancel, cancelLabel = 'Cancel', busy, type = 'submit' }) {
  return (
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
      <Button type={type} variant="contained" disabled={busy}>
        {primaryLabel}
      </Button>
      {onCancel ? <Button variant="outlined" color="inherit" onClick={onCancel}>{cancelLabel}</Button> : null}
    </Stack>
  );
}

export function FilterToolbar({ children }) {
  return (
    <Stack
      direction={{ xs: 'column', md: 'row' }}
      spacing={1}
      sx={{ p: 1, borderBottom: (theme) => `1px solid ${theme.palette.divider}`, minWidth: 0 }}
    >
      {children}
    </Stack>
  );
}

export function DataTableWrapper({ children }) {
  return <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'auto', minWidth: 0 }}>{children}</Paper>;
}

export function StatusChip({ label, color = 'default' }) {
  return (
    <Button size="small" variant="outlined" color={color} sx={{ borderRadius: 999, px: 1.25, minWidth: 0, pointerEvents: 'none' }}>
      {label}
    </Button>
  );
}

export function LoadingState({ label = 'Loading...' }) {
  return (
    <Stack alignItems="center" spacing={1} py={4}>
      <CircularProgress size={24} />
      <Typography variant="caption" color="text.secondary">{label}</Typography>
    </Stack>
  );
}

export function EmptyState({ title = 'No data available', description }) {
  return (
    <Stack alignItems="center" spacing={0.5} py={3}>
      <Typography variant="subtitle2">{title}</Typography>
      {description ? <Typography variant="caption" color="text.secondary">{description}</Typography> : null}
    </Stack>
  );
}

export function ErrorState({ message }) {
  return <Alert severity="error" sx={{ borderRadius: 2 }}>{message}</Alert>;
}

PageContainer.propTypes = {
  title: PropTypes.string,
  subtitle: PropTypes.string,
  actions: PropTypes.node,
  children: PropTypes.node,
};

SectionCard.propTypes = {
  title: PropTypes.string,
  subtitle: PropTypes.string,
  action: PropTypes.node,
  children: PropTypes.node,
  contentSx: PropTypes.object,
};

FormSection.propTypes = {
  title: PropTypes.string,
  subtitle: PropTypes.string,
  children: PropTypes.node,
};

ActionButtonGroup.propTypes = {
  primaryLabel: PropTypes.string,
  onCancel: PropTypes.func,
  cancelLabel: PropTypes.string,
  busy: PropTypes.bool,
  type: PropTypes.string,
};

FilterToolbar.propTypes = { children: PropTypes.node };
DataTableWrapper.propTypes = { children: PropTypes.node };
StatusChip.propTypes = { label: PropTypes.node, color: PropTypes.string };
LoadingState.propTypes = { label: PropTypes.string };
EmptyState.propTypes = { title: PropTypes.string, description: PropTypes.string };
ErrorState.propTypes = { message: PropTypes.string.isRequired };
export { default as LoadingSkeleton } from '../whatsappCloud/LoadingSkeleton';
export { default as FullscreenAddFormLayout } from './FullscreenAddFormLayout';

export { compactCardSx, compactFieldSx } from './addFormStyles';
