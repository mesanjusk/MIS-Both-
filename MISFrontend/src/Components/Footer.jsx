import { Box, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import { ROUTES } from '../constants/routes';

const FOOTER_LINKS = [
  { label: 'Home', path: ROUTES.HOME },
  { label: 'Orders', path: ROUTES.REPORTS_ORDERS_LIST },
  { label: 'Attendance', path: ROUTES.ATTENDANCE },
  { label: 'Tasks', path: ROUTES.PENDING_TASKS },
  { label: 'WhatsApp', path: ROUTES.WHATSAPP },
  { label: 'Day Book', path: ROUTES.DAY_BOOK },
  { label: 'Call Logs', path: ROUTES.CALL_LOGS },
  { label: 'SOP Tasks', path: ROUTES.SOP },
  { label: 'Account Book', path: ROUTES.ALL_TRANSACTION },
  { label: 'Business', path: ROUTES.BUSINESS_CONTROL },
  { label: 'Post Print', path: ROUTES.POST_PRINTING_CONTROL },
  { label: 'Invoices', path: ROUTES.INVOICES_LIST },
  { label: 'UPI Payment', path: ROUTES.UPI_PAYMENT },
  { label: 'Reports', path: ROUTES.REPORTS_BILLS },
  { label: 'Customers', path: ROUTES.REPORTS_CUSTOMERS },
  { label: 'Items', path: ROUTES.REPORTS_ITEMS },
];

export default function Footer() {
  return (
    <Box
      component="footer"
      sx={{
        px: 2,
        py: 1,
        display: { xs: 'none', md: 'flex' },
        alignItems: 'center',
        justifyContent: 'center',
        flexWrap: 'wrap',
        gap: 0.25,
        borderTop: (t) => `1px solid ${t.palette.divider}`,
        bgcolor: 'background.paper',
      }}
    >
      {FOOTER_LINKS.map((link, i) => (
        <Box key={link.path} sx={{ display: 'flex', alignItems: 'center' }}>
          <Typography
            component={Link}
            to={link.path}
            sx={{
              fontSize: '0.7rem',
              color: 'text.secondary',
              textDecoration: 'none',
              px: 0.5,
              '&:hover': { color: 'primary.main' },
            }}
          >
            {link.label}
          </Typography>
          {i < FOOTER_LINKS.length - 1 && (
            <Typography sx={{ fontSize: '0.7rem', color: 'text.disabled', lineHeight: 1 }}>·</Typography>
          )}
        </Box>
      ))}
    </Box>
  );
}
