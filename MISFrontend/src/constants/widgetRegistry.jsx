import GridViewRoundedIcon from '@mui/icons-material/GridViewRounded';
import EventAvailableRoundedIcon from '@mui/icons-material/EventAvailableRounded';
import AssignmentRoundedIcon from '@mui/icons-material/AssignmentRounded';
import AccessTimeRoundedIcon from '@mui/icons-material/AccessTimeRounded';
import LocalShippingRoundedIcon from '@mui/icons-material/LocalShippingRounded';
import FolderOpenRoundedIcon from '@mui/icons-material/FolderOpenRounded';

export const WIDGET_REGISTRY = [
  {
    id: 'workflow',
    label: 'Workflow',
    icon: AssignmentRoundedIcon,
    color: '#d97706',
    bg: '#fef3c7',
    defaultPanel: 'left',
    adminOnly: false,
    description: 'SOPs, your pending tasks, the team’s pending tasks grouped by stage, and design files',
  },
  {
    id: 'designFiles',
    label: 'Design Files (standalone)',
    icon: FolderOpenRoundedIcon,
    color: '#0891b2',
    bg: '#cffafe',
    defaultPanel: 'right',
    adminOnly: false,
    description: 'Full-height design files view — also embedded inside Workflow',
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

// v9: merged 'tasks' + 'designFiles' into a single 'workflow' widget (pending
// tasks grouped by stage, with design files embedded as a collapsible
// section) — the punch-in/out action moved out of the widget grid entirely,
// next to the user's name in the header, so 'recentAttendance' is no longer
// a default widget either.
export const LAYOUT_KEY = (user) => `mis_home_layout_v9_${user}`;

export const DEFAULT_LAYOUT = {
  left: ['workflow'],
  right: ['quickLinks'],
};
