import { useMemo, useState } from 'react';
import {
  Alert, BottomNavigation, BottomNavigationAction, Box, Button, Chip, Divider, IconButton, LinearProgress, Paper, Stack, Typography,
} from '@mui/material';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import ChecklistRoundedIcon from '@mui/icons-material/ChecklistRounded';
import HistoryRoundedIcon from '@mui/icons-material/HistoryRounded';
import HomeRoundedIcon from '@mui/icons-material/HomeRounded';
import LocalShippingOutlinedIcon from '@mui/icons-material/LocalShippingOutlined';
import PrintOutlinedIcon from '@mui/icons-material/PrintOutlined';
import RateReviewOutlinedIcon from '@mui/icons-material/RateReviewOutlined';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';

const stages = {
  other: { icon: RateReviewOutlinedIcon, background: '#eee8ff', color: '#5d36a6' },
  print: { icon: PrintOutlinedIcon, background: '#fff1dd', color: '#875000' },
  ready: { icon: LocalShippingOutlinedIcon, background: '#e0f5ea', color: '#176649' },
};

const PAGE_SIZE = 20;
const EMPTY_TASKS = [];
const indiaDateTime = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
});

const views = {
  today: { title: 'Today', icon: HomeRoundedIcon },
  jobs: { title: 'Jobs', icon: ChecklistRoundedIcon },
  activity: { title: 'Activity', icon: HistoryRoundedIcon },
};

function JobRow({ job, showActivity }) {
  const stage = stages[job.section] || stages.other;
  const Icon = stage.icon;
  return (
    <Stack component="li" direction="row" alignItems="center" gap={1.25} sx={{ p: 1.25, minWidth: 0 }}>
      <Box sx={{ width: 36, height: 36, flexShrink: 0, display: 'grid', placeItems: 'center', borderRadius: 2, bgcolor: stage.background, color: stage.color }}>
        <Icon fontSize="small" />
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2" fontWeight={750} sx={{ overflowWrap: 'anywhere', lineHeight: 1.3 }}>{job.name}</Typography>
        <Typography variant="caption" color="text.secondary" display="block" sx={{ overflowWrap: 'anywhere' }}>
          {[job.number != null && `#${job.number}`, showActivity ? indiaDateTime.format(job.updatedAt) : job.assignee].filter(Boolean).join(' · ')}
        </Typography>
        {!showActivity && job.overdue && <Typography variant="caption" color="error.main" fontWeight={700}>Overdue</Typography>}
      </Box>
      <Chip size="small" label={job.stageLabel} sx={{ maxWidth: '40%', bgcolor: stage.background, color: stage.color, fontWeight: 700, fontSize: '0.65rem', height: 'auto', minHeight: 23, '& .MuiChip-label': { whiteSpace: 'normal', overflowWrap: 'anywhere', py: 0.35 } }} />
    </Stack>
  );
}

export default function WorkflowApp({ tasks = EMPTY_TASKS, isLoading, error, onRefresh, getSection, getStageLabel }) {
  const [view, setView] = useState('today');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const isToday = view === 'today';
  const showActivity = view === 'activity';
  const jobs = useMemo(() => tasks.map((task) => ({
    id: task.orderId,
    number: task.orderNumber,
    name: task.description || task.sourceFile || task.customerName || (task.orderNumber != null ? `Order #${task.orderNumber}` : 'Untitled job'),
    assignee: task.assignedTo || 'Unassigned',
    overdue: Boolean(task.overdue),
    section: getSection(task),
    stageLabel: getStageLabel(task),
    updatedAt: task.stageUpdatedAt ? Date.parse(task.stageUpdatedAt) : NaN,
  })).sort((a, b) => Number(b.overdue) - Number(a.overdue)), [tasks, getSection, getStageLabel]);
  const counts = [
    ['Active jobs', jobs.length],
    ['In print', jobs.filter((job) => job.section === 'print').length],
    ['Ready', jobs.filter((job) => job.section === 'ready').length],
  ];
  const list = showActivity
    ? jobs.filter((job) => Number.isFinite(job.updatedAt)).sort((a, b) => b.updatedAt - a.updatedAt)
    : jobs;
  const countsUnavailable = !jobs.length && (isLoading || error);
  const changeView = (next) => { setView(next); setVisibleCount(PAGE_SIZE); };

  return (
    <Box component="section" aria-label="Mobile workflow app" sx={{ display: 'grid', placeItems: 'center', p: { xs: 0, sm: 3 }, borderRadius: 3, bgcolor: { sm: 'action.hover' } }}>
      <Paper variant="outlined" sx={{ width: '100%', maxWidth: 400, minHeight: 575, borderRadius: { xs: 3, sm: 5 }, overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: { sm: '0 14px 40px rgba(36, 25, 76, 0.10)' } }}>
        <Stack component="header" direction="row" alignItems="center" justifyContent="space-between" gap={1} sx={{ px: 2, py: 1.5 }}>
          <Stack direction="row" alignItems="center" spacing={0.9}>
            <Box sx={{ width: 32, height: 32, display: 'grid', placeItems: 'center', bgcolor: '#382461', color: '#fff', borderRadius: 2 }}>
              <ChecklistRoundedIcon fontSize="small" />
            </Box>
            <Typography variant="subtitle2" fontWeight={850}>SK Digital</Typography>
          </Stack>
          <IconButton size="small" aria-label="Refresh jobs" onClick={onRefresh} disabled={isLoading}><RefreshRoundedIcon /></IconButton>
        </Stack>

        <Stack spacing={2} sx={{ p: { xs: 1.5, sm: 2 }, flex: 1, bgcolor: 'action.hover' }}>
          {isLoading && <LinearProgress aria-label="Loading workflow jobs" />}
          {error && <Alert severity="error">{error}</Alert>}
          <Box sx={{ p: 2, borderRadius: 3, color: '#fff', bgcolor: '#382461', backgroundImage: 'linear-gradient(130deg, #382461, #58418c)' }}>
            <Typography component="h2" variant="h5" fontWeight={850}>{views[view].title}</Typography>
            {isToday && (
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 0.75, mt: 1.5 }}>
                {counts.map(([label, count]) => (
                  <Box key={label} sx={{ px: 1, py: 0.75, borderRadius: 2, bgcolor: 'rgba(255,255,255,0.12)' }}>
                    <Typography fontWeight={850} fontSize="1.2rem">{countsUnavailable ? '—' : count}</Typography>
                    <Typography variant="caption" sx={{ color: '#f3eaff' }}>{label}</Typography>
                  </Box>
                ))}
              </Box>
            )}
          </Box>

          <Stack spacing={0.75}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1}>
              <Typography component="h3" variant="subtitle2" fontWeight={850}>{showActivity ? 'Recent updates' : 'Active jobs'}</Typography>
              {isToday && (
                <Button size="small" endIcon={<ArrowForwardRoundedIcon />} onClick={() => changeView('jobs')} sx={{ textTransform: 'none' }}>View jobs</Button>
              )}
            </Stack>
            <Paper variant="outlined" sx={{ borderRadius: 3, maxHeight: 'min(48dvh, 460px)', overflowY: 'auto' }}>
              <Stack component="ul" divider={<Divider component="li" aria-hidden="true" />} sx={{ listStyle: 'none', p: 0, m: 0 }}>
                {list.slice(0, isToday ? 3 : visibleCount).map((job) => <JobRow key={job.id} job={job} showActivity={showActivity} />)}
                {!list.length && !isLoading && !error && <Typography component="li" variant="body2" color="text.secondary" sx={{ p: 1.5 }}>{showActivity ? 'No dated updates for active jobs.' : 'No active jobs.'}</Typography>}
              </Stack>
              {!isToday && visibleCount < list.length && <Button size="small" onClick={() => setVisibleCount((count) => count + PAGE_SIZE)} sx={{ m: 1, textTransform: 'none' }}>Show more</Button>}
            </Paper>
          </Stack>
        </Stack>

        <BottomNavigation component="nav" aria-label="Mobile workflow navigation" showLabels value={view} onChange={(_, next) => changeView(next)}
          sx={{ borderTop: '1px solid', borderColor: 'divider', minHeight: 60, '& .MuiBottomNavigationAction-root': { minWidth: 0, flex: 1 } }}>
          {Object.entries(views).map(([key, { title, icon: Icon }]) => (
            <BottomNavigationAction key={key} value={key} label={title} icon={<Icon fontSize="small" />} aria-current={view === key ? 'page' : undefined} />
          ))}
        </BottomNavigation>
      </Paper>
    </Box>
  );
}
