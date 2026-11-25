import { useState } from 'react';
import {
  BottomNavigation, BottomNavigationAction, Box, Button, Chip, Divider, Paper, Stack, Typography,
} from '@mui/material';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import ChecklistRoundedIcon from '@mui/icons-material/ChecklistRounded';
import HistoryRoundedIcon from '@mui/icons-material/HistoryRounded';
import HomeRoundedIcon from '@mui/icons-material/HomeRounded';
import LocalShippingOutlinedIcon from '@mui/icons-material/LocalShippingOutlined';
import PrintOutlinedIcon from '@mui/icons-material/PrintOutlined';
import RateReviewOutlinedIcon from '@mui/icons-material/RateReviewOutlined';

const stages = {
  design: { label: 'Design approval', icon: RateReviewOutlinedIcon, background: '#eee8ff', color: '#5d36a6' },
  print: { label: 'In print', icon: PrintOutlinedIcon, background: '#fff1dd', color: '#875000' },
  ready: { label: 'Ready', icon: LocalShippingOutlinedIcon, background: '#e0f5ea', color: '#176649' },
};

const jobs = [
  { number: '1048', name: 'Wedding invitation set', stage: 'design', activity: 'Moved to design approval' },
  { number: '1042', name: 'Shopfront flex banner', stage: 'print', activity: 'Moved to print' },
  { number: '1036', name: 'Annual awards trophies', stage: 'ready', activity: 'Marked ready' },
];

const views = {
  today: { title: 'Today', icon: HomeRoundedIcon },
  jobs: { title: 'Jobs', icon: ChecklistRoundedIcon },
  activity: { title: 'Activity', icon: HistoryRoundedIcon },
};

function JobRow({ job, showActivity }) {
  const stage = stages[job.stage];
  const Icon = stage.icon;
  return (
    <Stack component="li" direction="row" alignItems="center" gap={1.25} sx={{ p: 1.25, minWidth: 0 }}>
      <Box sx={{ width: 36, height: 36, flexShrink: 0, display: 'grid', placeItems: 'center', borderRadius: 2, bgcolor: stage.background, color: stage.color }}>
        <Icon fontSize="small" />
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2" fontWeight={750} sx={{ overflowWrap: 'anywhere', lineHeight: 1.3 }}>{job.name}</Typography>
        <Typography variant="caption" color="text.secondary">#{job.number}{showActivity ? ` · ${job.activity}` : ''}</Typography>
      </Box>
      {!showActivity && (
        <Chip size="small" label={stage.label} sx={{ bgcolor: stage.background, color: stage.color, fontWeight: 700, fontSize: '0.65rem', height: 23 }} />
      )}
    </Stack>
  );
}

export default function WorkflowAppPreview() {
  const [view, setView] = useState('today');
  const isToday = view === 'today';
  const showActivity = view === 'activity';

  return (
    <Box component="section" aria-label="Mobile app layout preview" sx={{ display: 'grid', placeItems: 'center', p: { xs: 0, sm: 3 }, borderRadius: 3, bgcolor: { sm: 'action.hover' } }}>
      <Paper variant="outlined" sx={{ width: '100%', maxWidth: 400, minHeight: 575, borderRadius: { xs: 3, sm: 5 }, overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: { sm: '0 14px 40px rgba(36, 25, 76, 0.10)' } }}>
        <Stack component="header" direction="row" alignItems="center" justifyContent="space-between" gap={1} sx={{ px: 2, py: 1.5 }}>
          <Stack direction="row" alignItems="center" spacing={0.9}>
            <Box sx={{ width: 32, height: 32, display: 'grid', placeItems: 'center', bgcolor: '#382461', color: '#fff', borderRadius: 2 }}>
              <ChecklistRoundedIcon fontSize="small" />
            </Box>
            <Typography variant="subtitle2" fontWeight={850}>SK Digital</Typography>
          </Stack>
          <Chip label="Sample data" size="small" variant="outlined" />
        </Stack>

        <Stack spacing={2} sx={{ p: { xs: 1.5, sm: 2 }, flex: 1, bgcolor: 'action.hover' }}>
          <Box sx={{ p: 2, borderRadius: 3, color: '#fff', bgcolor: '#382461', backgroundImage: 'linear-gradient(130deg, #382461, #58418c)' }}>
            <Typography component="h2" variant="h5" fontWeight={850}>{views[view].title}</Typography>
            {isToday && (
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 0.75, mt: 1.5 }}>
                {[['Active jobs', jobs.length], ['In print', 1], ['Ready', 1]].map(([label, count]) => (
                  <Box key={label} sx={{ px: 1, py: 0.75, borderRadius: 2, bgcolor: 'rgba(255,255,255,0.12)' }}>
                    <Typography fontWeight={850} fontSize="1.2rem">{count}</Typography>
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
                <Button size="small" endIcon={<ArrowForwardRoundedIcon />} onClick={() => setView('jobs')} sx={{ textTransform: 'none' }}>View jobs</Button>
              )}
            </Stack>
            <Paper variant="outlined" sx={{ borderRadius: 3, overflow: 'hidden' }}>
              <Stack component="ul" divider={<Divider component="li" aria-hidden="true" />} sx={{ listStyle: 'none', p: 0, m: 0 }}>
                {jobs.map((job) => <JobRow key={job.number} job={job} showActivity={showActivity} />)}
              </Stack>
            </Paper>
          </Stack>
        </Stack>

        <BottomNavigation component="nav" aria-label="Mobile preview navigation" showLabels value={view} onChange={(_, next) => setView(next)}
          sx={{ borderTop: '1px solid', borderColor: 'divider', minHeight: 60, '& .MuiBottomNavigationAction-root': { minWidth: 0, flex: 1 } }}>
          {Object.entries(views).map(([key, { title, icon: Icon }]) => (
            <BottomNavigationAction key={key} value={key} label={title} icon={<Icon fontSize="small" />} aria-current={view === key ? 'page' : undefined} />
          ))}
        </BottomNavigation>
      </Paper>
    </Box>
  );
}
