import PropTypes from 'prop-types';
import { alpha } from '@mui/material/styles';
import {
  Box,
  Card,
  CardContent,
  Chip,
  Grid,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import TableRowsRoundedIcon from '@mui/icons-material/TableRowsRounded';
import GridViewRoundedIcon from '@mui/icons-material/GridViewRounded';

export function ReportPageShell({ title, subtitle, count, actions, viewMode, onViewModeChange, children }) {
  return (
    <Stack spacing={1.25} sx={{ px: { xs: 0.25, sm: 0.5 }, pb: 1 }}>
      <Card elevation={0} sx={{ borderRadius: 3, overflow: 'hidden' }}>
        <Box
          sx={(theme) => ({
            background: `linear-gradient(135deg, ${alpha(theme.palette.primary.main, 0.15)} 0%, ${alpha(theme.palette.background.paper, 0.98)} 70%)`,
            borderBottom: `1px solid ${theme.palette.divider}`,
          })}
        >
          <CardContent sx={{ p: { xs: 1.25, md: 1.5 }, '&:last-child': { pb: { xs: 1.25, md: 1.5 } } }}>
            <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', md: 'center' }} spacing={1.25}>
              <Stack spacing={0.6} minWidth={0}>
                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                  <Typography variant="h5" sx={{ fontWeight: 800 }} noWrap>
                    {title}
                  </Typography>
                  {typeof count === 'number' ? <Chip size="small" color="primary" variant="outlined" label={`${count} records`} /> : null}
                </Stack>
                {subtitle ? (
                  <Typography variant="body2" color="text.secondary">
                    {subtitle}
                  </Typography>
                ) : null}
              </Stack>

              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ xs: 'stretch', sm: 'center' }}>
                {typeof onViewModeChange === 'function' ? (
                  <ToggleButtonGroup
                    exclusive
                    size="small"
                    value={viewMode}
                    onChange={(_, nextValue) => nextValue && onViewModeChange(nextValue)}
                    sx={{ bgcolor: 'background.paper', borderRadius: 2 }}
                  >
                    <ToggleButton value="table">
                      <TableRowsRoundedIcon sx={{ fontSize: 18, mr: 0.75 }} /> Table
                    </ToggleButton>
                    <ToggleButton value="grid">
                      <GridViewRoundedIcon sx={{ fontSize: 18, mr: 0.75 }} /> Cards
                    </ToggleButton>
                  </ToggleButtonGroup>
                ) : null}
                {actions}
              </Stack>
            </Stack>
          </CardContent>
        </Box>
      </Card>
      {children}
    </Stack>
  );
}

export function ReportFilterBar({ children }) {
  return (
    <Card elevation={0} sx={{ borderRadius: 3 }}>
      <CardContent sx={{ p: { xs: 1.1, md: 1.25 }, '&:last-child': { pb: { xs: 1.1, md: 1.25 } } }}>
        <Grid container spacing={1.1} alignItems="center">
          {children}
        </Grid>
      </CardContent>
    </Card>
  );
}

export function ReportTableCard({ children }) {
  return (
    <Card elevation={0} sx={{ borderRadius: 3, overflow: 'hidden' }}>
      <Box sx={{ overflowX: 'auto' }}>{children}</Box>
    </Card>
  );
}

export function ReportCardGrid({ children }) {
  return (
    <Grid container spacing={1.1}>
      {children}
    </Grid>
  );
}

ReportPageShell.propTypes = {
  title: PropTypes.string.isRequired,
  subtitle: PropTypes.string,
  count: PropTypes.number,
  actions: PropTypes.node,
  viewMode: PropTypes.oneOf(['table', 'grid']),
  onViewModeChange: PropTypes.func,
  children: PropTypes.node,
};

ReportFilterBar.propTypes = {
  children: PropTypes.node,
};

ReportTableCard.propTypes = {
  children: PropTypes.node,
};

ReportCardGrid.propTypes = {
  children: PropTypes.node,
};
