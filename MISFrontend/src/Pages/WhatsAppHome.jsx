import { useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Grid,
  Stack,
  Typography,
} from '@mui/material';
import ChatRoundedIcon from '@mui/icons-material/ChatRounded';
import SendRoundedIcon from '@mui/icons-material/SendRounded';
import GroupsRoundedIcon from '@mui/icons-material/GroupsRounded';
import AutoAwesomeRoundedIcon from '@mui/icons-material/AutoAwesomeRounded';
import TimelineRoundedIcon from '@mui/icons-material/TimelineRounded';
import AccountTreeRoundedIcon from '@mui/icons-material/AccountTreeRounded';
import { ROUTES } from '../constants/routes';

const quickCards = [
  {
    title: 'WhatsApp Inbox',
    description: 'Open chats, reply to customers, send media, and manage conversation flow from one screen.',
    icon: <ChatRoundedIcon color="primary" />,
    actionLabel: 'Open Inbox',
    actionPath: ROUTES.WHATSAPP,
  },
  {
    title: 'Send Message',
    description: 'Send an individual message or approved template quickly from the dedicated composer page.',
    icon: <SendRoundedIcon color="primary" />,
    actionLabel: 'Open Composer',
    actionPath: ROUTES.WHATSAPP_SEND,
  },
  {
    title: 'Bulk Broadcast',
    description: 'Send campaign messages to multiple recipients from the WhatsApp broadcast screen.',
    icon: <GroupsRoundedIcon color="primary" />,
    actionLabel: 'Open Broadcast',
    actionPath: ROUTES.WHATSAPP_BULK,
  },
  {
    title: 'Auto Reply Rules',
    description: 'Create keyword based responses and approved template replies without leaving WhatsApp workspace.',
    icon: <AutoAwesomeRoundedIcon color="primary" />,
    actionLabel: 'Manage Rules',
    actionPath: ROUTES.WHATSAPP,
  },
  {
    title: 'Analytics',
    description: 'Review delivery and engagement information inside the WhatsApp dashboard analytics tab.',
    icon: <TimelineRoundedIcon color="primary" />,
    actionLabel: 'Open Analytics',
    actionPath: ROUTES.WHATSAPP,
  },
  {
    title: 'Flow Builder',
    description: 'Build WhatsApp guided flows and connect them with automation when needed.',
    icon: <AccountTreeRoundedIcon color="primary" />,
    actionLabel: 'Open Flows',
    actionPath: ROUTES.FLOW_BUILDER,
  },
];

export default function WhatsAppHome() {
  const navigate = useNavigate();

  return (
    <Box sx={{ px: { xs: 0.5, md: 1 }, py: 0.25 }}>
      <Card
        elevation={0}
        sx={{
          borderRadius: 3,
          border: '1px solid',
          borderColor: 'divider',
          overflow: 'hidden',
          background: 'linear-gradient(135deg, rgba(37,211,102,0.10), rgba(255,255,255,1))',
        }}
      >
        <CardContent sx={{ p: { xs: 2, md: 3 } }}>
          <Stack spacing={2}>
            <Stack
              direction={{ xs: 'column', md: 'row' }}
              alignItems={{ xs: 'flex-start', md: 'center' }}
              justifyContent="space-between"
              spacing={2}
            >
              <Stack spacing={1}>
                <Chip size="small" color="success" label="WhatsApp only workspace" sx={{ width: 'fit-content' }} />
                <Typography variant="h5" fontWeight={800}>
                  Clean WhatsApp dashboard package
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 780 }}>
                  This build keeps login, logout, home, WhatsApp inbox, send message, bulk broadcast, and flow builder access.
                  Other business modules have been removed from navigation and routing so the app opens like a focused WhatsApp CRM.
                </Typography>
              </Stack>

              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
                <Button variant="contained" startIcon={<ChatRoundedIcon />} onClick={() => navigate(ROUTES.WHATSAPP)}>
                  Open WhatsApp
                </Button>
                <Button variant="outlined" startIcon={<SendRoundedIcon />} onClick={() => navigate(ROUTES.WHATSAPP_SEND)}>
                  Send Message
                </Button>
              </Stack>
            </Stack>

            <Grid container spacing={1.5}>
              {quickCards.map((card) => (
                <Grid item xs={12} sm={6} lg={4} key={card.title}>
                  <Card
                    elevation={0}
                    sx={{
                      height: '100%',
                      borderRadius: 3,
                      border: '1px solid',
                      borderColor: 'divider',
                      bgcolor: 'background.paper',
                    }}
                  >
                    <CardContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.25, height: '100%' }}>
                      <Stack direction="row" spacing={1} alignItems="center">
                        {card.icon}
                        <Typography variant="subtitle1" fontWeight={700}>
                          {card.title}
                        </Typography>
                      </Stack>
                      <Typography variant="body2" color="text.secondary" sx={{ flexGrow: 1 }}>
                        {card.description}
                      </Typography>
                      <Button size="small" variant="text" onClick={() => navigate(card.actionPath)} sx={{ alignSelf: 'flex-start' }}>
                        {card.actionLabel}
                      </Button>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}
