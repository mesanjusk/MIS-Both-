import GridViewRoundedIcon from '@mui/icons-material/GridViewRounded';
import EventAvailableRoundedIcon from '@mui/icons-material/EventAvailableRounded';
import AssignmentRoundedIcon from '@mui/icons-material/AssignmentRounded';
import AccessTimeRoundedIcon from '@mui/icons-material/AccessTimeRounded';
import LocalShippingRoundedIcon from '@mui/icons-material/LocalShippingRounded';
import FolderOpenRoundedIcon from '@mui/icons-material/FolderOpenRounded';

export const WIDGET_REGISTRY = [
  {
    id: 'tasks',
    label: 'Tasks',
    icon: AssignmentRoundedIcon,
    color: '#d97706',
    bg: '#fef3c7',
    defaultPanel: 'left',
    adminOnly: false,
    description: 'Attendance, SOPs, your pending tasks, then the team’s',
  },
  {
    id: 'designFiles',
    label: 'Design Files',
    icon: FolderOpenRoundedIcon,
    color: '#0891b2',
    bg: '#cffafe',
    defaultPanel: 'right',
    adminOnly: false,
    description: 'Design files and order attachments — Pending tab first',
  },
  {
    id: 'quickLinks',
    label: 'Quick Links',
    icon: GridViewRoundedIcon,
    color: '#16a34a',
    bg: '#dcfce7',
    defaultPanel: 'right',
    adminOnly: false,
    description: 'Navigate to all tools & pages',
  },
  {
    id: 'attendance',
    label: 'Attendance Snapshot',
    icon: EventAvailableRoundedIcon,
    color: '#2563eb',
    bg: '#dbeafe',
    defaultPanel: 'right',
    adminOnly: true,
    description: 'Live team attendance overview',
  },
  {
    id: 'recentAttendance',
    label: 'My Attendance',
    icon: AccessTimeRoundedIcon,
    color: '#7c3aed',
    bg: '#ede9fe',
    defaultPanel: 'left',
    adminOnly: false,
    description: 'Recent check-in / check-out logs',
  },
  {
    id: 'ordersBoard',
    label: 'Orders Pipeline',
    icon: LocalShippingRoundedIcon,
    color: '#0891b2',
    bg: '#cffafe',
    defaultPanel: 'right',
    adminOnly: false,
    description: 'Full order board & activity stream',
  },
];

// v8: collapsed the 3-column (left/center/right) layout to 2 columns
// (left/right) and merged the old myTasks + pendingTasks + pendingOverview
// widgets into a single 'tasks' widget.
export const LAYOUT_KEY = (user) => `mis_home_layout_v8_${user}`;

export const DEFAULT_LAYOUT = {
  left: ['tasks'],
  right: ['designFiles'],
};
