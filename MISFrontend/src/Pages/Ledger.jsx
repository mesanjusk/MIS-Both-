import { Suspense, lazy, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Box, Paper, Tab, Tabs, CircularProgress, Stack } from '@mui/material';
import ReceiptLongRoundedIcon from '@mui/icons-material/ReceiptLongRounded';
import GroupRoundedIcon from '@mui/icons-material/GroupRounded';
import MenuBookRoundedIcon from '@mui/icons-material/MenuBookRounded';
import AccountBalanceRoundedIcon from '@mui/icons-material/AccountBalanceRounded';
import EditNoteRoundedIcon from '@mui/icons-material/EditNoteRounded';

// The five money-report screens that used to be separate sidebar entries. They
// are folded into one page here so "Ledger" is the single place to read the
// books. Each keeps its own proven logic — this page only provides the tabs and
// mounts one view at a time.
const Register     = lazy(() => import('../Reports/allTransaction'));   // Account Book
const PartyBalances = lazy(() => import('../Reports/allTransaction1'));  // receivable / payable
const Statement    = lazy(() => import('../Reports/allTransaction3'));   // per-party statement
const CashBank     = lazy(() => import('../Reports/allTransaction4D'));  // daily cash & bank
const RegisterEdit = lazy(() => import('../Reports/allTransaction5'));   // register with edit

// Order defines the tab index; `key` is what old routes redirect to via ?tab=.
const TABS = [
  { key: 'register',  label: 'Register',        icon: <ReceiptLongRoundedIcon fontSize="small" />,  Component: Register },
  { key: 'parties',   label: 'Party Balances',  icon: <GroupRoundedIcon fontSize="small" />,        Component: PartyBalances },
  { key: 'statement', label: 'Statement',       icon: <MenuBookRoundedIcon fontSize="small" />,     Component: Statement },
  { key: 'cashbank',  label: 'Cash & Bank',     icon: <AccountBalanceRoundedIcon fontSize="small" />, Component: CashBank },
  { key: 'edit',      label: 'Register (edit)', icon: <EditNoteRoundedIcon fontSize="small" />,      Component: RegisterEdit },
];

export default function Ledger() {
  const [searchParams, setSearchParams] = useSearchParams();

  const activeIndex = useMemo(() => {
    const key = searchParams.get('tab');
    const idx = TABS.findIndex((t) => t.key === key);
    return idx === -1 ? 0 : idx;
  }, [searchParams]);

  const ActiveComponent = TABS[activeIndex].Component;

  const handleChange = (_event, next) => {
    const params = new URLSearchParams(searchParams);
    params.set('tab', TABS[next].key);
    setSearchParams(params, { replace: true });
  };

  return (
    <Box sx={{ p: { xs: 0.5, md: 1 } }}>
      <Paper variant="outlined" sx={{ borderRadius: 3, mb: 1.5 }}>
        <Tabs
          value={activeIndex}
          onChange={handleChange}
          variant="scrollable"
          scrollButtons="auto"
          allowScrollButtonsMobile
        >
          {TABS.map((t) => (
            <Tab key={t.key} icon={t.icon} iconPosition="start" label={t.label} sx={{ minHeight: 48 }} />
          ))}
        </Tabs>
      </Paper>

      <Suspense
        fallback={
          <Stack alignItems="center" sx={{ py: 6 }}>
            <CircularProgress />
          </Stack>
        }
      >
        {/* Key forces a fresh mount per tab so each view loads its own data cleanly. */}
        <ActiveComponent key={TABS[activeIndex].key} />
      </Suspense>
    </Box>
  );
}
