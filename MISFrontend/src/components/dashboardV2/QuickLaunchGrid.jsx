import { useNavigate } from 'react-router-dom';
import { Box, Card, CardActionArea, CardContent, Grid, Typography } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import AddShoppingCartRoundedIcon from '@mui/icons-material/AddShoppingCartRounded';
import ReceiptLongRoundedIcon from '@mui/icons-material/ReceiptLongRounded';
import PaymentsRoundedIcon from '@mui/icons-material/PaymentsRounded';
import PersonAddRoundedIcon from '@mui/icons-material/PersonAddRounded';
import LocalShippingRoundedIcon from '@mui/icons-material/LocalShippingRounded';
import AssignmentRoundedIcon from '@mui/icons-material/AssignmentRounded';
import ChatRoundedIcon from '@mui/icons-material/ChatRounded';
import QrCodeScannerRoundedIcon from '@mui/icons-material/QrCodeScannerRounded';
import { ROUTES } from '../../constants/routes';

const ALL_ACTIONS = [
  { label: 'New Order',       icon: AddShoppingCartRoundedIcon, path: ROUTES.ORDERS_NEW,    color: '#6366f1', roles: ['Admin', 'Owner', 'DataEntry'] },
  { label: 'New Receipt',     icon: ReceiptLongRoundedIcon,     path: ROUTES.RECEIPT,        color: '#0ea5e9', roles: ['Admin', 'Owner', 'Accounts'] },
  { label: 'New Payment',     icon: PaymentsRoundedIcon,        path: ROUTES.PAYMENT,        color: '#10b981', roles: ['Admin', 'Owner', 'Accounts'] },
  { label: 'Add Customer',    icon: PersonAddRoundedIcon,       path: ROUTES.ADD_CUSTOMER,   color: '#f59e0b', roles: ['Admin', 'Owner'] },
  { label: 'Dispatch Queue',  icon: LocalShippingRoundedIcon,   path: ROUTES.DISPATCH_QUEUE, color: '#8b5cf6', roles: ['Admin', 'Owner', 'OfficeStaff'] },
  { label: 'My Day',          icon: AssignmentRoundedIcon,      path: ROUTES.MY_TASKS,       color: '#ec4899', roles: ['all'] },
  { label: 'WhatsApp',        icon: ChatRoundedIcon,            path: ROUTES.WHATSAPP,       color: '#22c55e', roles: ['all'] },
  { label: 'UPI Payment',     icon: QrCodeScannerRoundedIcon,   path: ROUTES.UPI_PAYMENT,    color: '#f97316', roles: ['Admin', 'Owner', 'Accounts'] },
];

function canSeeAction(action, roleKey) {
  return action.roles.includes('all') || action.roles.includes(roleKey) || roleKey === 'Admin';
}

export default function QuickLaunchGrid({ roleKey = 'Admin' }) {
  const navigate = useNavigate();
  const theme = useTheme();

  const actions = ALL_ACTIONS.filter((a) => canSeeAction(a, roleKey));

  return (
    <Box>
      <Typography variant="overline" color="text.secondary" sx={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 1.1, mb: 1.5, display: 'block' }}>
        Quick Actions
      </Typography>
      <Grid container spacing={1.5}>
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <Grid item xs={6} sm={4} md={3} lg={2} key={action.label}>
              <Card
                elevation={0}
                sx={{
                  border: `1px solid ${theme.palette.divider}`,
                  borderRadius: 2.5,
                  height: '100%',
                  '&:hover .quick-icon': { transform: 'scale(1.1)' },
                }}
              >
                <CardActionArea onClick={() => navigate(action.path)} sx={{ p: 1.5, height: '100%' }}>
                  <CardContent sx={{ p: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                    <Box
                      className="quick-icon"
                      sx={{
                        width: 44,
                        height: 44,
                        bgcolor: alpha(action.color, 0.12),
                        borderRadius: 2,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'transform 0.15s',
                      }}
                    >
                      <Icon sx={{ fontSize: 22, color: action.color }} />
                    </Box>
                    <Typography variant="caption" fontWeight={600} align="center" sx={{ lineHeight: 1.3, color: 'text.primary' }}>
                      {action.label}
                    </Typography>
                  </CardContent>
                </CardActionArea>
              </Card>
            </Grid>
          );
        })}
      </Grid>
    </Box>
  );
}
