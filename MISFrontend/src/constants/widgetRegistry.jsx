import GridViewRoundedIcon from '@mui/icons-material/GridViewRounded';
import EventAvailableRoundedIcon from '@mui/icons-material/EventAvailableRounded';
import AssignmentRoundedIcon from '@mui/icons-material/AssignmentRounded';
import AccessTimeRoundedIcon from '@mui/icons-material/AccessTimeRounded';
import PendingActionsRoundedIcon from '@mui/icons-material/PendingActionsRounded';
import LocalShippingRoundedIcon from '@mui/icons-material/LocalShippingRounded';
import FolderOpenRoundedIcon from '@mui/icons-material/FolderOpenRounded';

export const WIDGET_REGISTRY = [
  {
    id: 'myTasks',
    label: 'My Tasks',
    icon: AssignmentRoundedIcon,
    color: '#d97706',
    bg: '#fef3c7',
    defaultPanel: 'left',
    adminOnly: false,
    description: 'Attendance actions + task assignments',
  },
  {
    id: 'designFiles',
    label: 'Design Files',
    icon: FolderOpenRoundedIcon,
    color: '#0891b2',
    bg: '#cffafe',
    defaultPanel: 'center',
    adminOnly: false,
    description: 'Design files and order attachments',
  },
  {
    id: 'quickLinks',
    label: 'Quick Links',
    icon: GridViewRoundedIcon,
    color: '#16a34a',
    bg: '#dcfce7',
    defaultPanel: 'center',
    adminOnly: false,
    description: 'Navigate to all tools & pages',
  },
  {
    id: 'attendance',
    label: 'Attendance Snapshot',
    icon: EventAvailableRoundedIcon,
    color: '#2563eb',
    bg: '#dbeafe',
    defaultPanel: 'left',
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
    id: 'pendingTasks',
    label: 'Pending Task Queue',
    icon: PendingActionsRoundedIcon,
    color: '#dc2626',
    bg: '#fee2e2',
    defaultPanel: 'center',
    adminOnly: false,
    description: 'Click any task to update progress',
  },
  {
    id: 'ordersBoard',
    label: 'Orders Pipeline',
    icon: LocalShippingRoundedIcon,
    color: '#0891b2',
    bg: '#cffafe',
    defaultPanel: 'center',
    adminOnly: false,
    description: 'Full order board & activity stream',
  },
];

export const LAYOUT_KEY = (user) => `mis_home_layout_v6_${user}`;

export const DEFAULT_LAYOUT = {
  left: ['myTasks'],
  center: ['designFiles'],
  right: [],
};
