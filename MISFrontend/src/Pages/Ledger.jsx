import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Box, Paper, Tab, Tabs, CircularProgress, Stack } from '@mui/material';
import ReceiptLongRoundedIcon from '@mui/icons-material/ReceiptLongRounded';
import GroupRoundedIcon from '@mui/icons-material/GroupRounded';
import MenuBookRoundedIcon from '@mui/icons-material/MenuBookRounded';
import AccountBalanceRoundedIcon from '@mui/icons-material/AccountBalanceRounded';
import EditNoteRoundedIcon from '@mui/icons-material/EditNoteRounded';

// The five money-report screens that used to be separate sidebar entries. They
// are folded into one page here so "Ledger" is the single place to read the
// books. Visited views stay mounted so tab changes preserve their fetched data,
// filters, scroll position and local UI state.
const loadRegister = () => import('../Reports/allTransaction');
const loadPartyBalances = () => import('../Reports/allTransaction1');
const loadStatement = () => import('../Reports/allTransaction3');
const loadCashBank = () => import('../Reports/allTransaction4D');
const loadRegisterEdit = () => import('../Reports/allTransaction5');

const Register = lazy(loadRegister);
const PartyBalances = lazy(loadPartyBalances);
const Statement = lazy(loadStatement);
const CashBank = lazy(loadCashBank);
const RegisterEdit = lazy(loadRegisterEdit);

const LEDGER_PRELOADERS = [
  loadRegister,
  loadPartyBalances,
  loadStatement,
  loadCashBank,
  loadRegisterEdit,
];

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

  const [mountedTabs, setMountedTabs] = useState(() => new Set([TABS[activeIndex].key]));

  useEffect(() => {
    const key = TABS[activeIndex].key;
    setMountedTabs((current) => {
      if (current.has(key)) return current;
      const updated = new Set(current);
      updated.add(key);
      return updated;
    });
  }, [activeIndex]);

  useEffect(() => {
    const preload = () => {
      LEDGER_PRELOADERS.forEach((loader) => loader().catch(() => {}));
    };

    if ('requestIdleCallback' in window) {
      const id = window.requestIdleCallback(preload, { timeout: 2500 });
      return () => window.cancelIdleCallback?.(id);
    }

    const id = window.setTimeout(preload, 800);
    return () => window.clearTimeout(id);
  }, []);

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

      {TABS
        .filter((tab, index) => index === activeIndex || mountedTabs.has(tab.key))
        .map((tab, index) => {
          const TabComponent = tab.Component;
          const isActive = index === activeIndex;
          return (
            <Box
              key={tab.key}
              role="tabpanel"
              aria-hidden={!isActive}
              sx={{ display: isActive ? 'block' : 'none' }}
            >
              <Suspense
                fallback={
                  <Stack alignItems="center" sx={{ py: 6 }}>
                    <CircularProgress />
                  </Stack>
                }
              >
                <TabComponent />
              </Suspense>
            </Box>
          );
        })}
    </Box>
  );
}
