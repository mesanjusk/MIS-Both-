import { Box } from "@mui/material";
import BulkSender from "../Components/whatsappCloud/BulkSender";

export default function WhatsAppBroadcastPage() {
  return (
    <Box sx={{ px: { xs: 0.5, md: 1 }, pb: { xs: 0.5, md: 0.75 } }}>
      <BulkSender />
    </Box>
  );
}
