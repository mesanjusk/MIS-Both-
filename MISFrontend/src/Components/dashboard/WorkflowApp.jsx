import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Avatar, BottomNavigation, BottomNavigationAction, Box, Button, ButtonBase,
  Chip, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, InputBase,
  LinearProgress, Menu, MenuItem, Paper, Snackbar, Stack, TextField, Typography,
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
import LogoutRounded from '@mui/icons-material/LogoutRounded';
import MoreVertRounded from '@mui/icons-material/MoreVertRounded';
import PauseCircleOutlineRounded from '@mui/icons-material/PauseCircleOutlineRounded';
import PersonOutlineRounded from '@mui/icons-material/PersonOutlineRounded';
import PrintOutlined from '@mui/icons-material/PrintOutlined';
import SearchRounded from '@mui/icons-material/SearchRounded';
import {
  DESIGN_BOARD_COLUMNS, STAGE_LABELS, STAGE_TO_CAPABILITY, WORKFLOW_MOVABLE_STAGES, WORKFLOW_SECTIONS,
} from '../../constants/orderStages';
import { usePermission } from '../../hooks/usePermission';
import { assignDesignFile, moveDesignFileOrderToPrint, scanDesignFiles } from '../../services/designFileService';
import { initialsFor } from '../../utils/avatarColor';

const ICONS = [CalendarTodayOutlined, FolderOutlined, GroupsOutlined, PauseCircleOutlineRounded,
  AssignmentOutlined, PrintOutlined, LayersOutlined, Inventory2Outlined, LocalShippingOutlined];
const NAV = [
  ['home', 'Home', HomeRounded], ['jobs', 'Jobs', LayersOutlined],
  ['activity', 'Activity', HistoryRounded], ['account', 'Account', PersonOutlineRounded],
];
const EMPTY_TASKS = [];
const DESIGN_BY_STAGE = new Map(DESIGN_BOARD_COLUMNS.map((column) => [column.stageNumber, column]));
const DESIGN_KEYS = new Set(DESIGN_BOARD_COLUMNS.map(({ key }) => key));
const PRINT_OR_LATER = new Set(['print', 'fitting', 'bind_packing', 'ready', 'delivered', 'paid', 'lost', 'cancelled']);
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
        <Box component="li" key={job.key} sx={{ borderBottom: '1px solid', borderColor: 'divider' }}>
          <ButtonBase onClick={() => onOpen(job.key)} sx={{ width: '100%', textAlign: 'left', gap: 1.25, p: 1.25, justifyContent: 'flex-start' }}>
            <Avatar sx={{ bgcolor: job.overdue ? '#fce4e7' : '#dcefff', color: job.overdue ? '#9b273e' : '#075699', width: 42, height: 42, fontSize: 15 }}>
              {initialsFor(job.name)}
            </Avatar>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="body2" fontWeight={800} noWrap>{job.name}</Typography>
              <Typography variant="caption" color="text.secondary" component="div" noWrap>
                {[job.orderNumber != null && `#${job.orderNumber}`, job.file?.customerName,
                  activity ? job.stageLabel : job.assignee].filter(Boolean).join(' · ')}
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

function JobDetail({ job, assignees, canManageDesign, disabled, onUpdate }) {
  const [action, setAction] = useState('');
  const [destination, setDestination] = useState('');
  const file = job.file;
  const canAssign = !file || canManageDesign;
  const canMove = !file || Boolean(canManageDesign && file.orderUuid && file.orderStage && !PRINT_OR_LATER.has(file.orderStage));
  const stagePicker = action === 'move' && !file;
  const capability = action === 'move' ? 'print' : file ? 'design' : STAGE_TO_CAPABILITY[job.stage];
  const tagged = assignees.filter((party) => party.capabilities?.includes(capability));
  const eligible = file
    ? (action === 'move' && !tagged.length ? assignees : tagged)
    : assignees.filter((party) => !capability || !party.capabilities?.length || party.capabilities.includes(capability));
  const options = stagePicker
    ? WORKFLOW_MOVABLE_STAGES.filter(({ stage }) => stage !== job.stage).map(({ stage, label }) => ({ id: stage, name: label }))
    : [...eligible, ...(!file ? [{ id: 'Customer', name: 'Waiting on customer', type: 'employee' }] : [])];
  const open = (next) => {
    setDestination('');
    setAction(next);
  };
  const entries = [
    ['Current stage', job.stageLabel, formatTime(job.updatedAt)],
    ['Assigned to', job.assignee],
    ['MIS order stage', file && STAGE_LABELS[file.orderStage] !== job.stageLabel ? STAGE_LABELS[file.orderStage] : ''],
    ['Customer', file?.customerName],
    ['Due', formatTime(timestamp(job.dueDate)), job.overdue ? 'Overdue' : ''],
    ['Order note', job.description],
    ['Source file', file ? '' : job.sourceFile],
  ];
  return (
    <Stack spacing={1.4} sx={{ p: 2 }}>
      {(canMove || canAssign) && <Stack direction="row" gap={1} flexWrap="wrap">
        {canMove && <Button variant="contained" disabled={disabled} onClick={() => open('move')}>
          {file ? 'Move to Print' : 'Move stage'}
        </Button>}
        {canAssign && <Button variant="outlined" disabled={disabled} onClick={() => open('assign')}>Assign</Button>}
      </Stack>}
      {file && canAssign && !file.orderUuid && <Typography variant="body2" color="text.secondary">
        Link this file to an MIS order before sending it to Print.
      </Typography>}
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
      <Dialog open={Boolean(action)} onClose={() => setAction('')} fullWidth maxWidth="xs">
        <DialogTitle>{stagePicker ? 'Move stage' : action === 'move' ? 'Move to Print and assign' : 'Assign'}</DialogTitle>
        <DialogContent>
          {options.length ? (
            <TextField select fullWidth margin="dense" label={stagePicker ? 'Destination stage' : 'Assign to'}
              value={destination} onChange={(event) => setDestination(event.target.value)}>
              {options.map(({ id, name }) => <MenuItem key={id} value={id}>{name}</MenuItem>)}
            </TextField>
          ) : <Typography color="text.secondary">No eligible assignees for this stage.</Typography>}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAction('')}>Cancel</Button>
          <Button variant="contained" disabled={!destination || disabled} onClick={() => {
            const option = options.find(({ id }) => id === destination);
            setAction('');
            if (option) onUpdate(job, action, option);
          }}>{action === 'move' ? 'Move' : 'Assign'}</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

export default function WorkflowApp({
  tasks = EMPTY_TASKS, isLoading, error, onRefresh, getSection, getStageLabel,
  userName, userGroup, onSignOut, assignees, onAssign, onMoveStage, standalone = false,
}) {
  const [view, setView] = useState('home');
  const [section, setSection] = useState('');
  const [query, setQuery] = useState('');
  const [selection, setSelection] = useState(null);
  const [menu, setMenu] = useState(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [designFiles, setDesignFiles] = useState(null);
  const [designError, setDesignError] = useState('');
  const [designLoading, setDesignLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const canManageDesign = usePermission('canManageDesignFiles');

  const loadDesignFiles = useCallback(async (force = false) => {
    setDesignLoading(true);
    setDesignError('');
    try {
      const { data } = await scanDesignFiles(force);
      if (!Array.isArray(data?.files)) throw new Error('Could not load the Design Board.');
      setDesignFiles(data.files);
    } catch (err) {
      setDesignError(err?.response?.data?.message || 'Could not load the Design Board.');
    } finally {
      setDesignLoading(false);
    }
  }, []);
  useEffect(() => { void loadDesignFiles(); }, [loadDesignFiles]);

  const refresh = () => {
    void onRefresh();
    void loadDesignFiles(true);
  };

  const updateJob = async (job, action, option) => {
    setSaving(true);
    setFeedback(null);
    try {
      if (job.file) {
        if (action === 'move') await moveDesignFileOrderToPrint(job.file, option.id);
        else await assignDesignFile(job.file, option.id, userName);
        await Promise.all([loadDesignFiles(true), onRefresh()]);
      } else {
        const saved = action === 'move'
          ? await onMoveStage(job.orderId, option.id)
          : await onAssign(job.orderId, option.id, option.type === 'employee' ? 'user' : 'vendor');
        if (!saved) return;
      }
      setFeedback({ severity: 'success', message: action === 'move'
        ? job.file ? `Moved to Print and assigned to ${option.name}.` : `Moved to ${option.name}.`
        : option.id === 'Customer' ? 'Marked as waiting on customer.' : `Assigned to ${option.name}.` });
    } catch (err) {
      setFeedback({ severity: 'error', message: err?.response?.data?.message || 'Could not update the job.' });
    } finally {
      setSaving(false);
    }
  };

  const jobs = useMemo(() => tasks.map((task) => ({
    ...task,
    key: `order:${task.orderId}`,
    name: task.customerName || task.sourceFile || task.description || (task.orderNumber != null ? `Order #${task.orderNumber}` : 'Untitled job'),
    assignee: task.assignedTo || 'Unassigned',
    section: getSection(task),
    stageLabel: getStageLabel(task),
    updatedAt: timestamp(task.stageUpdatedAt),
  })).sort((a, b) => Number(Boolean(b.overdue)) - Number(Boolean(a.overdue))), [tasks, getSection, getStageLabel]);

  const designJobs = useMemo(() => (designFiles || []).flatMap((file) => {
    const column = DESIGN_BY_STAGE.get(file.stageNumber);
    return column ? [{
      key: `file:${file.fileId}`, file, name: file.fileName,
      orderNumber: file.orderNumber, assignee: file.assignedToName || 'Unassigned',
      section: column.key, stageLabel: column.label, sourceFile: file.fileName,
      updatedAt: timestamp(file.modifiedTime),
    }] : [];
  }), [designFiles]);
  const allJobs = useMemo(() => {
    const linked = new Set(designJobs.map(({ file }) => file.orderUuid).filter(Boolean));
    return [...jobs.filter((job) => !DESIGN_KEYS.has(job.section) || !linked.has(job.orderId)), ...designJobs];
  }, [designJobs, jobs]);
  const selected = jobs.find((job) => job.key === selection) || designJobs.find((job) => job.key === selection);
  const activeSection = WORKFLOW_SECTIONS.find((item) => item.key === section);
  const activity = view === 'activity';
  const designSection = DESIGN_KEYS.has(section);
  const filter = query.trim().toLowerCase();
  const list = (activity ? jobs : designSection ? designJobs : section ? jobs : allJobs).filter((job) => {
    if (activity && !Number.isFinite(job.updatedAt)) return false;
    if (view === 'jobs' && section && job.section !== section) return false;
    return [job.name, job.orderNumber, job.description, job.sourceFile, job.file?.customerName, job.assignee, job.stageLabel]
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
  const showDesignStatus = view === 'home' || (view === 'jobs' && (!section || designSection));

  return (
    <Box component="section" aria-label="Mobile workflow app" sx={{ display: 'grid', placeItems: 'center', p: standalone ? 0 : { xs: 0, sm: 2 }, minWidth: 0 }}>
      <Paper variant="outlined" sx={{
        width: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column',
        ...(standalone
          ? { height: '100vh', '@supports (height: 100dvh)': { height: '100dvh' }, border: 0, borderRadius: 0 }
          : { maxWidth: 445, minHeight: 610, borderRadius: { xs: 3, sm: 5 } }),
      }}>
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
            <MenuItem disabled={isLoading || designLoading || saving} onClick={() => { setMenu(null); refresh(); }}>Refresh jobs</MenuItem>
            <MenuItem onClick={() => { setMenu(null); changeView('jobs'); }}>All jobs</MenuItem>
            <MenuItem onClick={() => { setMenu(null); changeView('account'); }}>Account</MenuItem>
          </Menu>
        </Stack>

        {(isLoading || saving || (showDesignStatus && designLoading)) && <LinearProgress aria-label="Updating workflow jobs" />}
        {error && <Alert severity="error">{error}</Alert>}
        <Box sx={{ flex: 1, minWidth: 0, minHeight: 0, maxHeight: standalone ? undefined : 'min(68dvh, 650px)', overflowY: 'auto', ...(selected || view === 'home' ? WALLPAPER : {}) }}>
          {!selected && showDesignStatus && designError && (
            <Alert severity="warning" action={<Button color="inherit" size="small" onClick={() => loadDesignFiles(true)}>Retry</Button>}>
              {designFiles ? 'Could not refresh Design Board. Showing the last loaded files.' : designError}
            </Alert>
          )}
          {selected && <JobDetail key={selected.key} job={selected} assignees={assignees}
            canManageDesign={canManageDesign} disabled={saving} onUpdate={updateJob} />}
          {!selected && view === 'home' && (
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: { xs: 0.8, sm: 1.25 }, p: { xs: 1.25, sm: 2 }, maxWidth: standalone ? 580 : undefined, mx: 'auto' }}>
              {WORKFLOW_SECTIONS.map((item, index) => {
                const Icon = ICONS[index] || ChecklistRounded;
                const count = DESIGN_KEYS.has(item.key)
                  ? designFiles ? designJobs.filter((job) => job.section === item.key).length : '—'
                  : noCounts ? '—' : jobs.filter((job) => job.section === item.key).length;
                return (
                  <ButtonBase key={item.key} onClick={() => changeView('jobs', item.key)} sx={{
                    aspectRatio: '1', minWidth: 0, flexDirection: 'column', gap: 0.35, p: 0.5,
                    borderRadius: 3, bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider',
                    boxShadow: '0 3px 8px rgba(7, 73, 125, .12)',
                  }}>
                    <Icon sx={{ fontSize: { xs: 25, sm: 34 }, color: '#0876bd' }} />
                    <Typography variant="body2" fontWeight={850}>{count}</Typography>
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
            {!list.length && !isLoading && !error && (!designSection || (!designLoading && designFiles)) && <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>{activity && !filter ? 'No dated updates for active jobs.' : 'No matching jobs.'}</Typography>}
            {visibleCount < list.length && <Button onClick={() => setVisibleCount((count) => count + PAGE_SIZE)} sx={{ m: 1, textTransform: 'none' }}>Show more</Button>}
          </>}
          {!selected && view === 'account' && (
            <Stack spacing={1} alignItems="center" sx={{ px: 2, py: 4 }}>
              <Avatar sx={{ bgcolor: '#1976b8', width: 56, height: 56 }}>{initialsFor(userName || '')}</Avatar>
              <Typography component="h2" variant="subtitle1" fontWeight={850}>{userName || 'Account'}</Typography>
              {userGroup && <Typography variant="body2" color="text.secondary">{userGroup}</Typography>}
              {userName && <Typography variant="body2" color="text.secondary">{noCounts ? '—' : jobs.filter((job) => job.assignee === userName).length} assigned jobs</Typography>}
              {userName && <Button onClick={onSignOut} startIcon={<LogoutRounded />} variant="outlined" color="error">Sign out</Button>}
            </Stack>
          )}
        </Box>

        <BottomNavigation component="nav" aria-label="Mobile workflow navigation" showLabels value={view}
          onChange={(_, next) => changeView(next)} sx={{ borderTop: '1px solid', borderColor: 'divider', minHeight: 57, flexShrink: 0, '& .MuiBottomNavigationAction-root': { minWidth: 0 }, '& .Mui-selected': { color: '#0876bd' } }}>
          {NAV.map(([key, label, Icon]) => <BottomNavigationAction key={key} value={key} label={label} icon={<Icon />} aria-current={view === key ? 'page' : undefined} />)}
        </BottomNavigation>
        <Snackbar open={Boolean(feedback)} autoHideDuration={6000} onClose={() => setFeedback(null)}>
          {feedback ? <Alert severity={feedback.severity} onClose={() => setFeedback(null)}>{feedback.message}</Alert> : undefined}
        </Snackbar>
      </Paper>
    </Box>
  );
}
