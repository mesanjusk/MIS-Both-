import { Box } from "@mui/material";
import SendMessagePanel from "../Components/whatsappCloud/SendMessagePanel";

export default function WhatsAppSendPage() {
  return (
    <Box sx={{ px: { xs: 0.5, md: 1 }, pb: { xs: 0.5, md: 0.75 } }}>
      <SendMessagePanel />
    </Box>
  );
}
