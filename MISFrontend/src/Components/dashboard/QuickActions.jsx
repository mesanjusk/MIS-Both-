import { Link } from 'react-router-dom';
import {
  Button,
  Card,
  Chip,
  Stack,
  Typography,
} from '@mui/material';
import NorthEastRoundedIcon from '@mui/icons-material/NorthEastRounded';

const actions = [
  { title: 'Add Order', path: '/addOrder', description: 'Capture a new customer order.' },
  { title: 'Order Board', path: '/allOrder', description: 'Open the full workflow board.' },
  { title: 'Customers', path: '/addCustomer', description: 'Create or update customer records.' },
  { title: 'Team Tasks', path: '/PendingTasks', description: 'Review pending team tasks.' },
];

export default function QuickActions() {
  return (
    <Card sx={{ p: 2.25 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <div>
          <Typography variant="caption" color="text.secondary">Admin Controls</Typography>
          <Typography variant="subtitle1">Quick Actions</Typography>
        </div>
        <Chip size="small" label="Operational" />
      </Stack>

      <Stack spacing={1.25} mt={2}>
        {actions.map((action) => (
          <Button
            key={action.path}
            component={Link}
            to={action.path}
            variant="outlined"
            color="inherit"
            endIcon={<NorthEastRoundedIcon fontSize="small" />}
            sx={{ justifyContent: 'space-between', textAlign: 'left', py: 1.25, px: 1.5 }}
          >
            <span>
              <Typography variant="body2" fontWeight={600}>{action.title}</Typography>
              <Typography variant="caption" color="text.secondary">{action.description}</Typography>
            </span>
          </Button>
        ))}
      </Stack>
    </Card>
  );
}
