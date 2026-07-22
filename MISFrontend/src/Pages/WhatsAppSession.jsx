import { Box, Typography } from '@mui/material';
import BaileysWhatsAppWeb from '../Components/whatsappCloud/BaileysWhatsAppWeb';

export default function WhatsAppSession() {
  return (
    <Box p={2}>
      <Typography variant="h6" fontWeight={700} mb={1.5}>WhatsApp Web</Typography>
      <BaileysWhatsAppWeb />
    </Box>
  );
}
