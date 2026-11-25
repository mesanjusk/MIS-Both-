import { useMemo, useState } from 'react';
import {
  Alert, Avatar, BottomNavigation, BottomNavigationAction, Box, Button, ButtonBase,
  Chip, IconButton, InputBase, LinearProgress, Menu, MenuItem, Paper, Stack, Typography,
} from '@mui/material';
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import AssignmentOutlined from '@mui/icons-material/AssignmentOutlined';
import CalendarTodayOutlined from '@mui/icons-material/CalendarTodayOutlined';
import ChecklistRounded from '@mui/icons-material/ChecklistRounded';
import FolderOutlined from '@mui/icons-material/FolderOutlined';
import GroupsOutlined from '@mui/icons-material/GroupsOutlined';
import HistoryRounded from '@mui/icons-material/HistoryRounded';
import HomeRounded from '@mui/icons-material/HomeRounded';
import Inventory2Outlined from '@mui/icons-material/Inventory2Outlined';
import LayersOutlined from '@mui/icons-material/LayersOutlined';
import LocalShippingOutlined from '@mui/icons-material/LocalShippingOutlined';
import MoreVertRounded from '@mui/icons-material/MoreVertRounded';
import PauseCircleOutlineRounded from '@mui/icons-material/PauseCircleOutlineRounded';
import PersonOutlineRounded from '@mui/icons-material/PersonOutlineRounded';
import PrintOutlined from '@mui/icons-material/PrintOutlined';
import SearchRounded from '@mui/icons-material/SearchRounded';
import { WORKFLOW_SECTIONS } from '../../constants/orderStages';
import { initialsFor } from '../../utils/avatarColor';

const ICONS = [CalendarTodayOutlined, FolderOutlined, GroupsOutlined, PauseCircleOutlineRounded,
  AssignmentOutlined, PrintOutlined, LayersOutlined, Inventory2Outlined, LocalShippingOutlined];
const NAV = [
  ['home', 'Home', HomeRounded], ['jobs', 'Jobs', LayersOutlined],
  ['activity', 'Activity', HistoryRounded], ['account', 'Account', PersonOutlineRounded],
];
const EMPTY_TASKS = [];
const PAGE_SIZE = 20;
const WALLPAPER = {
  bgcolor: 'action.hover',
  backgroundImage: 'radial-gradient(circle, rgba(65,151,221,.16) 1px, transparent 1.5px)',
  backgroundSize: '16px 16px',
};
const indiaDateTime = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
});
const timestamp = (value) => value ? new Date(value).getTime() : NaN;
const formatTime = (time) => Number.isFinite(time) ? indiaDateTime.format(time) : '';

function JobList({ jobs, activity, onOpen }) {
  return (
    <Stack component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
      {jobs.map((job) => (
        <Box component="li" key={job.orderId} sx={{ borderBottom: '1px solid', borderColor: 'divider' }}>
          <ButtonBase onClick={() => onOpen(job.orderId)} sx={{ width: '100%', textAlign: 'left', gap: 1.25, p: 1.25, justifyContent: 'flex-start' }}>
            <Avatar sx={{ bgcolor: job.overdue ? '#fce4e7' : '#dcefff', color: job.overdue ? '#9b273e' : '#075699', width: 42, height: 42, fontSize: 15 }}>
              {initialsFor(job.name)}
            </Avatar>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="body2" fontWeight={800} noWrap>{job.name}</Typography>
              <Typography variant="caption" color="text.secondary" component="div" noWrap>
                {[job.orderNumber != null && `#${job.orderNumber}`, activity ? job.stageLabel : job.assignee].filter(Boolean).join(' · ')}
              </Typography>
            </Box>
            <Typography variant="caption" color={job.overdue ? 'error.main' : 'text.secondary'} textAlign="right" sx={{ maxWidth: '32%', overflowWrap: 'anywhere' }}>
              {activity ? formatTime(job.updatedAt) : job.overdue ? 'Overdue' : job.stageLabel}
            </Typography>
          </ButtonBase>
        </Box>
      ))}
    </Stack>
  );
}

function JobDetail({ job }) {
  const entries = [
    ['Current stage', job.stageLabel, formatTime(job.updatedAt)],
    ['Assigned to', job.assignee],
    ['Due', formatTime(timestamp(job.dueDate)), job.overdue ? 'Overdue' : ''],
    ['Order note', job.description],
    ['Source file', job.sourceFile],
  ];
  return (
    <Stack spacing={1.4} sx={{ p: 2 }}>
      {entries.filter(([, value]) => value).map(([label, value, caption], index) => (
        <Paper elevation={1} key={label} sx={{
          maxWidth: '92%', alignSelf: index % 2 ? 'flex-end' : 'flex-start',
          p: 1.3, px: 1.65, borderRadius: 3, minWidth: 130,
          ...(index % 2 ? { bgcolor: '#d9f0ff', color: '#113953', borderTopRightRadius: 0 } : { borderTopLeftRadius: 0 }),
        }}>
          <Typography variant="caption" fontWeight={800}>{label}</Typography>
          <Typography variant="body2" sx={{ overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>{value}</Typography>
          {caption && <Typography variant="caption" component="div" sx={{ textAlign: 'right', opacity: 0.8, mt: 0.35 }}>{caption}</Typography>}
        </Paper>
      ))}
    </Stack>
  );
}

export default function WorkflowApp({ tasks = EMPTY_TASKS, isLoading, error, onRefresh, getSection, getStageLabel, userName }) {
  const [view, setView] = useState('home');
  const [section, setSection] = useState('');
  const [query, setQuery] = useState('');
  const [selection, setSelection] = useState(null);
  const [menu, setMenu] = useState(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const jobs = useMemo(() => tasks.map((task) => ({
    ...task,
    name: task.customerName || task.sourceFile || task.description || (task.orderNumber != null ? `Order #${task.orderNumber}` : 'Untitled job'),
    assignee: task.assignedTo || 'Unassigned',
    section: getSection(task),
    stageLabel: getStageLabel(task),
    updatedAt: timestamp(task.stageUpdatedAt),
  })).sort((a, b) => Number(Boolean(b.overdue)) - Number(Boolean(a.overdue))), [tasks, getSection, getStageLabel]);

  const selected = jobs.find((job) => job.orderId === selection);
  const activeSection = WORKFLOW_SECTIONS.find((item) => item.key === section);
  const activity = view === 'activity';
  const filter = query.trim().toLowerCase();
  const list = jobs.filter((job) => {
    if (activity && !Number.isFinite(job.updatedAt)) return false;
    if (view === 'jobs' && section && job.section !== section) return false;
    return [job.name, job.orderNumber, job.description, job.sourceFile, job.assignee, job.stageLabel]
      .some((value) => String(value ?? '').toLowerCase().includes(filter.replace(/^#/, '')));
  });
  if (activity) list.sort((a, b) => b.updatedAt - a.updatedAt);

  const changeView = (next, nextSection = '') => {
    setView(next);
    setSection(nextSection);
    setQuery('');
    setSelection(null);
    setVisibleCount(PAGE_SIZE);
  };
  const noCounts = !jobs.length && (isLoading || error);

  return (
    <Box component="section" aria-label="Mobile workflow app" sx={{ display: 'grid', placeItems: 'center', p: { xs: 0, sm: 2 }, minWidth: 0 }}>
      <Paper variant="outlined" sx={{ width: '100%', maxWidth: 445, minHeight: 610, borderRadius: { xs: 3, sm: 5 }, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <Stack component="header" direction="row" gap={1.1} alignItems="center" sx={{ px: 1.25, py: 1.5, bgcolor: '#1976b8', backgroundImage: 'linear-gradient(120deg,#3498d5,#1473b5)', color: '#fff' }}>
          {selected ? <>
            <IconButton color="inherit" aria-label="Back to list" onClick={() => setSelection(null)}><ArrowBackRounded /></IconButton>
            <Avatar sx={{ bgcolor: '#076eae', width: 38, height: 38 }}>{initialsFor(selected.name)}</Avatar>
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography component="h2" fontWeight={800} variant="body1" noWrap>{selected.name}</Typography>
              {selected.orderNumber != null && <Typography variant="caption">#{selected.orderNumber}</Typography>}
            </Box>
          </> : <>
            <Typography aria-label="SK Digital" sx={{ fontSize: 25, fontWeight: 900, letterSpacing: '-.07em', pr: 0.35 }}>SK</Typography>
            <Stack direction="row" alignItems="center" gap={0.65} sx={{ bgcolor: '#ddf2ff', borderRadius: 8, flex: 1, minWidth: 0, px: 1.25, color: '#084e83' }}>
              <SearchRounded fontSize="small" />
              <InputBase fullWidth type="search" placeholder="Search jobs" value={query} inputProps={{ 'aria-label': 'Search jobs' }} onChange={(event) => {
                if (view === 'home' || view === 'account') changeView('jobs');
                setQuery(event.target.value);
                setVisibleCount(PAGE_SIZE);
              }} sx={{ fontSize: 14, color: 'inherit', minHeight: 37 }} />
            </Stack>
          </>}
          <IconButton aria-label="Workflow menu" color="inherit" onClick={(event) => setMenu(event.currentTarget)}><MoreVertRounded /></IconButton>
          <Menu anchorEl={menu} open={Boolean(menu)} onClose={() => setMenu(null)}>
            <MenuItem disabled={isLoading} onClick={() => { setMenu(null); onRefresh(); }}>Refresh jobs</MenuItem>
            <MenuItem onClick={() => { setMenu(null); changeView('jobs'); }}>All jobs</MenuItem>
          </Menu>
        </Stack>

        {isLoading && <LinearProgress aria-label="Loading workflow jobs" />}
        {error && <Alert severity="error">{error}</Alert>}
        <Box sx={{ flex: 1, minWidth: 0, maxHeight: 'min(68dvh, 650px)', overflowY: 'auto', ...(selected || view === 'home' ? WALLPAPER : {}) }}>
          {selected && <JobDetail job={selected} />}
          {!selected && view === 'home' && (
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: { xs: 0.8, sm: 1.25 }, p: { xs: 1.25, sm: 2 } }}>
              {WORKFLOW_SECTIONS.map((item, index) => {
                const Icon = ICONS[index] || ChecklistRounded;
                const count = jobs.filter((job) => job.section === item.key).length;
                return (
                  <ButtonBase key={item.key} onClick={() => changeView('jobs', item.key)} sx={{
                    aspectRatio: '1', minWidth: 0, flexDirection: 'column', gap: 0.35, p: 0.5,
                    borderRadius: 3, bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider',
                    boxShadow: '0 3px 8px rgba(7, 73, 125, .12)',
                  }}>
                    <Icon sx={{ fontSize: { xs: 25, sm: 34 }, color: '#0876bd' }} />
                    <Typography variant="body2" fontWeight={850}>{noCounts ? '—' : count}</Typography>
                    <Typography variant="caption" fontWeight={700} sx={{ lineHeight: 1.15, textAlign: 'center' }}>{item.label}</Typography>
                  </ButtonBase>
                );
              })}
            </Box>
          )}
          {!selected && (view === 'jobs' || activity) && <>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ px: 1.5, py: 1, bgcolor: 'action.hover' }}>
              <Typography component="h2" variant="subtitle2" fontWeight={850}>{activity ? 'Recent updates' : activeSection?.label || 'All jobs'}</Typography>
              {activeSection ? <Chip size="small" label="Clear stage" onClick={() => { setSection(''); setVisibleCount(PAGE_SIZE); }} /> : <Typography variant="caption" color="text.secondary">{noCounts ? '—' : list.length}</Typography>}
            </Stack>
            <JobList jobs={list.slice(0, visibleCount)} activity={activity} onOpen={setSelection} />
            {!list.length && !isLoading && !error && <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>{activity && !filter ? 'No dated updates for active jobs.' : 'No matching jobs.'}</Typography>}
            {visibleCount < list.length && <Button onClick={() => setVisibleCount((count) => count + PAGE_SIZE)} sx={{ m: 1, textTransform: 'none' }}>Show more</Button>}
          </>}
          {!selected && view === 'account' && (
            <Stack spacing={1} alignItems="center" sx={{ py: 4 }}>
              <Avatar sx={{ bgcolor: '#1976b8', width: 56, height: 56 }}>{initialsFor(userName || '')}</Avatar>
              <Typography component="h2" variant="subtitle1" fontWeight={850}>{userName || 'Account'}</Typography>
              {userName && <Typography variant="body2" color="text.secondary">{noCounts ? '—' : jobs.filter((job) => job.assignee === userName).length} assigned jobs</Typography>}
            </Stack>
          )}
        </Box>

        <BottomNavigation component="nav" aria-label="Mobile workflow navigation" showLabels value={view}
          onChange={(_, next) => changeView(next)} sx={{ borderTop: '1px solid', borderColor: 'divider', minHeight: 57, '& .MuiBottomNavigationAction-root': { minWidth: 0 }, '& .Mui-selected': { color: '#0876bd' } }}>
          {NAV.map(([key, label, Icon]) => <BottomNavigationAction key={key} value={key} label={label} icon={<Icon />} aria-current={view === key ? 'page' : undefined} />)}
        </BottomNavigation>
      </Paper>
    </Box>
  );
}
