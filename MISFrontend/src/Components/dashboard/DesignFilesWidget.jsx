import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  AlertTitle,
  Autocomplete,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  CircularProgress,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Grid,
  IconButton,
  InputAdornment,
  LinearProgress,
  ListItemIcon,
  Menu,
  MenuItem,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import FolderOpenRoundedIcon from '@mui/icons-material/FolderOpenRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import ErrorOutlineRoundedIcon from '@mui/icons-material/ErrorOutlineRounded';
import DesignServicesRoundedIcon from '@mui/icons-material/DesignServicesRounded';
import LocalPrintshopRoundedIcon from '@mui/icons-material/LocalPrintshopRounded';
import DoneAllRoundedIcon from '@mui/icons-material/DoneAllRounded';
import LinkRoundedIcon from '@mui/icons-material/LinkRounded';
import PrintRoundedIcon from '@mui/icons-material/PrintRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import ArchiveRoundedIcon from '@mui/icons-material/ArchiveRounded';
import AutoFixHighRoundedIcon from '@mui/icons-material/AutoFixHighRounded';
import DriveFileRenameOutlineRoundedIcon from '@mui/icons-material/DriveFileRenameOutlineRounded';
import AssignmentTurnedInRoundedIcon from '@mui/icons-material/AssignmentTurnedInRounded';
import ReceiptLongRoundedIcon from '@mui/icons-material/ReceiptLongRounded';
import ShoppingCartRoundedIcon from '@mui/icons-material/ShoppingCartRounded';
import EditNoteRoundedIcon from '@mui/icons-material/EditNoteRounded';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import DescriptionRoundedIcon from '@mui/icons-material/DescriptionRounded';
import EventRoundedIcon from '@mui/icons-material/EventRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import ExpandLessRoundedIcon from '@mui/icons-material/ExpandLessRounded';
import FileDownloadRoundedIcon from '@mui/icons-material/FileDownloadRounded';
import SwapHorizRoundedIcon from '@mui/icons-material/SwapHorizRounded';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import DeleteRoundedIcon from '@mui/icons-material/DeleteRounded';
import PersonAddAltRoundedIcon from '@mui/icons-material/PersonAddAltRounded';
import LocalShippingRoundedIcon from '@mui/icons-material/LocalShippingRounded';
import ViewKanbanRoundedIcon from '@mui/icons-material/ViewKanbanRounded';
import MoreVertRoundedIcon from '@mui/icons-material/MoreVertRounded';
import PersonRoundedIcon from '@mui/icons-material/PersonRounded';
import TagRoundedIcon from '@mui/icons-material/TagRounded';
import axios from '../../apiClient';
import { useAuth } from '../../context/AuthContext';
import { fetchAssignees } from '../../services/assigneeService';

// ─── Tab config ───────────────────────────────────────────────────────────────
// "Design Board" is the default landing tab — it's the authoritative,
// always-accurate view of design-stage work (grouped straight off each
// file's real Drive folder), replacing the old Workflow widget's Design
// parent column, which relied on a separate assigned-tasks query and could
// sit empty even when design work genuinely existed.
//
// "Needs Attention" tab removed by request — Drafts (below) replaces the
// old dismiss-and-forget stale-draft alert with a persistent tab instead.
const TABS = [
  {
    key: 'board', label: 'Design Board', icon: ViewKanbanRoundedIcon,
    stageFilter: null, viewOnly: false, color: 'primary',
  },
  {
    // "Draft" here just means "not yet linked to a real MIS order" — the
    // normal state for most in-progress design work — so All Files (and the
    // Design Board below) show every file regardless of draft status, same
    // as before. Drafts is an additional filtered view, not a replacement.
    key: 'all', label: 'All Files', icon: FolderOpenRoundedIcon,
    stageFilter: () => true, viewOnly: false, color: 'default',
  },
  {
    key: 'draft', label: 'Drafts', icon: DescriptionRoundedIcon,
    stageFilter: (file) => !!file?.isDraft, viewOnly: false, color: 'default',
  },
  {
    key: 'archive', label: 'Archive', icon: ArchiveRoundedIcon,
    stageFilter: null, viewOnly: true, color: 'default',
  },
];

// Design Board columns — folder stage number -> column, in the same order
// the (now-removed) Workflow Design parent column used. Stage 7 (Approval)
// and stages 1-4 are fully folder-auto-synced (see the backend's
// FOLDER_STAGE_TO_ORDER_STAGE); Final(5)/Printing(6) files are deliberately
// excluded here — those are handled by the explicit Confirm Final / Create
// Print Job actions in the other tabs, not by this board.
const BOARD_COLUMNS = [
  { stageNumber: 1, key: 'todaysNew', label: "Today's New" },
  { stageNumber: 2, key: 'oldPending', label: 'Old Pending' },
  { stageNumber: 7, key: 'designApproval', label: 'Design Approval' },
  { stageNumber: 3, key: 'hold', label: 'Hold' },
  { stageNumber: 4, key: 'readyToPrint', label: 'Ready to Print' },
];
const BOARD_STAGE_NUMBERS = new Set(BOARD_COLUMNS.map((c) => c.stageNumber));

// ─── Helpers ──────────────────────────────────────────────────────────────────
function alreadyPrefixedWithOrder(fileName, orderNumber) {
  if (!fileName || orderNumber == null) return false;
  return new RegExp(`^${orderNumber}[\\s\\-_]`).test(String(fileName));
}

function pjLabel(num) {
  return `PJ-${String(num).padStart(3, '0')}`;
}

// Creation date only — deliberately not modifiedTime, which changes every
// time the file is edited or moved between stage folders and would make a
// card's date jump around instead of anchoring to when the file first
// showed up.
function formatCreatedDate(createdTime) {
  if (!createdTime) return null;
  const d = new Date(createdTime);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

function buildCSV(files) {
  const header = ['File Name', 'Stage', 'Order #', 'Status', 'Print Job'];
  const rows = files.map((f) => [
    f.fileName || '',
    f.stageLabel || '',
    f.orderNumber || '',
    f.matched ? 'Matched' : f.isDraft ? 'Draft' : 'Unmatched',
    f.printJobNumber != null ? pjLabel(f.printJobNumber) : '',
  ]);
  return [header, ...rows]
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
    .join('\n');
}

// ─── Design assignees cache (for the Assign menu — shared across every file
// row) ─── Sourced from Account Payable parties tagged with the 'design'
// capability, same as the order task-assign menu (see
// MISBackend/src/routes/Assignees.js) — not employees.
let _designAssigneesPromise = null;
function loadDesignAssigneesCached() {
  if (!_designAssigneesPromise) {
    _designAssigneesPromise = fetchAssignees()
      .then((res) => (res.data?.result || []).filter((a) => a.capabilities?.includes('design')))
      .catch(() => { _designAssigneesPromise = null; return []; });
  }
  return _designAssigneesPromise;
}

function triggerDownload(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function openPrintWindow(files, tabLabel) {
  const rows = files.map((f) => `
    <tr>
      <td>${(f.fileName || '').replace(/</g, '&lt;')}</td>
      <td>${f.stageLabel || ''}</td>
      <td>${f.orderNumber || ''}</td>
      <td style="color:${f.matched ? '#2e7d32' : '#e65100'}">${f.matched ? 'Matched' : f.isDraft ? 'Draft' : 'Unmatched'}</td>
      <td>${f.printJobNumber != null ? pjLabel(f.printJobNumber) : ''}</td>
    </tr>`).join('');
  const html = `<!DOCTYPE html><html><head><title>Design Files — ${tabLabel}</title>
    <style>
      body{font-family:Arial,sans-serif;font-size:12px;margin:20px}
      h2{font-size:14px;margin-bottom:8px}
      table{border-collapse:collapse;width:100%}
      th,td{border:1px solid #ddd;padding:5px 8px;text-align:left}
      th{background:#f5f5f5;font-weight:bold}
      tr:nth-child(even){background:#fafafa}
    </style></head><body>
    <h2>Design Files — ${tabLabel} &nbsp;&nbsp; <small style="font-weight:normal;color:#888">${new Date().toLocaleString()}</small></h2>
    <table><thead><tr><th>File Name</th><th>Stage</th><th>Order #</th><th>Status</th><th>Print Job</th></tr></thead>
    <tbody>${rows}</tbody></table></body></html>`;
  const w = window.open('', '_blank');
  if (w) { w.document.write(html); w.document.close(); w.print(); }
}

// ─── StageChip ────────────────────────────────────────────────────────────────
function StageChip({ stageLabel: label, stageColor }) {
  const theme = stageColor || { bg: '#F5F5F5', color: '#424242' };
  return (
    <Chip
      label={label} size="small"
      sx={{ bgcolor: theme.bg, color: theme.color, fontWeight: 600, fontSize: 10, height: 18, borderRadius: 1, '& .MuiChip-label': { px: 0.75 } }}
    />
  );
}

// ─── Status badges ────────────────────────────────────────────────────────────
// Compact icon+text mini-badges rather than full chips — each one caps its
// own width and truncates (a long customer/assignee name used to blow out
// the whole row instead of just its own badge). Wraps onto extra lines
// rather than ever being clipped, since columns have vertical room to
// scroll but not horizontal room to spare.
function MiniBadge({ icon: Icon, label, sx }) {
  return (
    <Tooltip title={label}>
      <Stack direction="row" spacing={0.25} alignItems="center" sx={{ maxWidth: 92, ...sx }}>
        {Icon && <Icon sx={{ fontSize: 11, flexShrink: 0 }} />}
        <Typography sx={{ fontSize: 9.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {label}
        </Typography>
      </Stack>
    </Tooltip>
  );
}

function StatusBadges({ file, sx }) {
  const createdLabel = formatCreatedDate(file.createdTime);
  const hasAny = createdLabel || file.isTemporaryOrder || file.printJobNumber != null
    || (file.matched && !file.isDraft) || file.customerName || file.assignedToName;
  if (!hasAny) return null;
  return (
    <Stack direction="row" spacing={0.75} flexWrap="wrap" alignItems="center" sx={{ rowGap: 0.25, ...sx }}>
      {createdLabel && <MiniBadge icon={EventRoundedIcon} label={createdLabel} sx={{ color: 'grey.700' }} />}
      {file.isTemporaryOrder && <MiniBadge label="TEMP" sx={{ color: 'warning.800' }} />}
      {file.printJobNumber != null && <MiniBadge label={pjLabel(file.printJobNumber)} sx={{ color: 'success.800' }} />}
      {file.matched && !file.isDraft && (
        <MiniBadge icon={TagRoundedIcon} label={String(file.orderNumber)} sx={{ color: 'success.700' }} />
      )}
      {file.customerName && (
        <MiniBadge icon={PersonRoundedIcon} label={file.customerName} sx={{ color: 'info.800' }} />
      )}
      {file.assignedToName && (
        <MiniBadge icon={PersonAddAltRoundedIcon} label={file.assignedToName} sx={{ color: 'secondary.800' }} />
      )}
    </Stack>
  );
}

// ─── Actions menu ─────────────────────────────────────────────────────────────
// A single "more actions" kebab instead of a row of separate icon buttons —
// with 4-6 possible actions per file, spelling them all out inline left no
// room for the filename in a narrow card. Everything that used to be its
// own button is now a labeled menu item instead.
function FileActions({ file, onRename, onConfirm, onCreatePrintJob, onEditPrintJob, onRelink, onAssign, onDeliver, viewOnly }) {
  const [anchor, setAnchor] = useState(null);
  const [view, setView] = useState('actions'); // 'actions' | 'assign'
  const [busy, setBusy] = useState(false);
  const [assignParties, setAssignParties] = useState(null);
  if (viewOnly) return null;

  const needsRename = file.matched && file.orderNumber != null && !alreadyPrefixedWithOrder(file.fileName, file.orderNumber);

  const actions = [];
  if (file.stageNumber === 5 && onConfirm) {
    actions.push({ key: 'confirm', label: 'Confirm as real MIS order', icon: AssignmentTurnedInRoundedIcon, color: 'success.main', run: () => onConfirm(file) });
  }
  if (file.stageNumber === 6 && file.printJobNumber != null && onEditPrintJob) {
    actions.push({ key: 'editPJ', label: 'Update print job vendor & amount', icon: EditNoteRoundedIcon, color: 'text.secondary', run: () => onEditPrintJob(file) });
  }
  if (file.stageNumber === 6 && file.printJobNumber == null && onCreatePrintJob) {
    actions.push({ key: 'createPJ', label: 'Create print job', icon: ReceiptLongRoundedIcon, color: 'warning.main', run: () => onCreatePrintJob(file) });
  }
  if (file.orderUuid && onRelink) {
    actions.push({ key: 'relink', label: `Change order (currently #${file.orderNumber})`, icon: SwapHorizRoundedIcon, color: 'info.main', run: () => onRelink(file) });
  }
  if (needsRename && onRename) {
    actions.push({ key: 'rename', label: `Rename to start with #${file.orderNumber}`, icon: DriveFileRenameOutlineRoundedIcon, color: 'text.secondary', run: () => onRename(file) });
  }
  if (file.orderUuid && file.orderStage !== 'delivered' && onDeliver) {
    actions.push({ key: 'deliver', label: `Mark Order #${file.orderNumber} as delivered`, icon: LocalShippingRoundedIcon, color: 'success.main', run: () => onDeliver(file) });
  }
  const hasAssign = !!onAssign;
  if (!actions.length && !hasAssign) return null;

  const openMenu = (e) => { e.stopPropagation(); setView('actions'); setAnchor(e.currentTarget); };
  const closeMenu = (e) => { e?.stopPropagation(); setAnchor(null); setView('actions'); };

  const runAction = async (e, fn) => {
    e.stopPropagation();
    closeMenu();
    if (busy) return;
    setBusy(true);
    try { await fn(); } finally { setBusy(false); }
  };

  const openAssignView = (e) => {
    e.stopPropagation();
    setView('assign');
    if (assignParties === null) loadDesignAssigneesCached().then(setAssignParties);
  };

  const pickAssignee = async (e, party) => {
    e.stopPropagation();
    closeMenu();
    if (!onAssign || busy) return;
    setBusy(true);
    try { await onAssign(file, party); } finally { setBusy(false); }
  };

  return (
    <>
      <IconButton size="small" onClick={openMenu} disabled={busy} sx={{ p: 0.3, flexShrink: 0 }}>
        {busy ? <CircularProgress size={13} /> : <MoreVertRoundedIcon sx={{ fontSize: 16 }} />}
      </IconButton>
      <Menu anchorEl={anchor} open={!!anchor} onClose={closeMenu} onClick={(e) => e.stopPropagation()}>
        {view === 'actions' ? (
          [
            ...actions.map((a) => (
              <MenuItem key={a.key} onClick={(e) => runAction(e, a.run)} sx={{ fontSize: 13 }}>
                <ListItemIcon><a.icon fontSize="small" sx={{ color: a.color }} /></ListItemIcon>
                {a.label}
              </MenuItem>
            )),
            ...(hasAssign ? [
              <MenuItem key="assign" onClick={openAssignView} sx={{ fontSize: 13 }}>
                <ListItemIcon><PersonAddAltRoundedIcon fontSize="small" sx={{ color: 'secondary.main' }} /></ListItemIcon>
                {file.assignedToName ? `Reassign (currently ${file.assignedToName})` : 'Assign'}
              </MenuItem>,
            ] : []),
          ]
        ) : (
          [
            <MenuItem key="hdr" disabled sx={{ opacity: '1 !important', fontSize: 11, fontWeight: 600, color: 'text.secondary' }}>
              {file.matched && file.orderNumber != null
                ? `Order #${file.orderNumber} — ${file.customerName || 'no customer linked'}`
                : 'Not linked to an order'}
            </MenuItem>,
            <Divider key="div" />,
            ...(assignParties === null ? [<MenuItem key="loading" disabled>Loading…</MenuItem>] : []),
            ...(assignParties?.length === 0 ? [<MenuItem key="none" disabled>No one tagged for design yet</MenuItem>] : []),
            ...((assignParties || []).map((p) => (
              <MenuItem key={p.id} onClick={(e) => pickAssignee(e, p)}>{p.name}</MenuItem>
            ))),
          ]
        )}
      </Menu>
    </>
  );
}

// ─── List row ─────────────────────────────────────────────────────────────────
function rowColors(file, checked) {
  const hasPrintJob = file.printJobNumber != null;
  const hasRealOrder = file.matched && !file.isDraft && !file.isTemporaryOrder;
  const isTempOrder = file.isTemporaryOrder;
  const isUnmatched = !file.matched && !file.isDraft;
  if (checked)      return { bg: 'primary.50',   bgHover: 'primary.100',   border: 'primary.main'  };
  if (hasPrintJob)  return { bg: '#f3e5f5',       bgHover: '#e1bee7',       border: '#ce93d8'       };
  if (hasRealOrder) return { bg: 'success.50',    bgHover: 'success.100',   border: 'success.200'   };
  if (isTempOrder)  return { bg: 'warning.50',    bgHover: 'warning.100',   border: 'warning.200'   };
  if (isUnmatched)  return { bg: 'warning.50',    bgHover: 'warning.100',   border: 'warning.200'   };
  return              { bg: 'transparent',        bgHover: 'action.hover',  border: 'divider'       };
}

// Two-line layout: line 1 is the icon + filename + kebab menu only, so the
// filename always gets the row's full width instead of competing with a
// stage chip and a row of separate action buttons; line 2 (if there's
// anything to show) carries the compact status/customer/assignee badges.
// hideStageChip skips the per-file stage chip entirely — used by the
// Design Board, where every card in a column already shares one stage, so
// repeating it on every card added noise without adding information.
function FileListRow({ file, checked, onToggle, onRename, onConfirm, onCreatePrintJob, onEditPrintJob, onRelink, onAssign, onDeliver, viewOnly, hideStageChip }) {
  const isUnmatched = !file.matched && !file.isDraft;
  const { bg, bgHover, border } = rowColors(file, checked);
  const subText = file.isDraft
    ? (file.assignedToName ? `Assigned: ${file.assignedToName}` : '')
    : isUnmatched
    ? `Order #${file.extractedOrderNumber || '?'} not found`
    : file.matched && file.orderStage
    ? `MIS: ${file.orderStage}`
    : '';

  return (
    <Box
      onClick={() => onToggle && onToggle(file.fileId)}
      sx={{
        py: 0.5, px: 0.6, borderRadius: 1.5,
        border: '1px solid',
        borderColor: border,
        bgcolor: bg,
        '&:hover': { bgcolor: bgHover },
        transition: 'background 0.12s',
        cursor: onToggle ? 'pointer' : 'default',
      }}
    >
      <Stack direction="row" alignItems="center" spacing={0.5}>
        {onToggle && (
          <Checkbox
            size="small" checked={!!checked}
            onChange={() => onToggle(file.fileId)}
            onClick={(e) => e.stopPropagation()}
            sx={{ p: 0.2, flexShrink: 0 }}
          />
        )}

        <Box sx={{ flexShrink: 0, display: 'flex' }}>
          {file.stageNumber === 6
            ? <LocalPrintshopRoundedIcon sx={{ fontSize: 13, color: 'error.400' }} />
            : file.stageNumber === 5
            ? <DoneAllRoundedIcon sx={{ fontSize: 13, color: 'success.500' }} />
            : isUnmatched
            ? <ErrorOutlineRoundedIcon sx={{ fontSize: 13, color: 'warning.600' }} />
            : <DesignServicesRoundedIcon sx={{ fontSize: 13, color: 'text.disabled' }} />}
        </Box>

        <Tooltip title={file.fileName}>
          <Typography
            variant="body2" fontWeight={600}
            sx={{ flex: 1, minWidth: 0, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {file.fileName}
          </Typography>
        </Tooltip>

        {!hideStageChip && file.stageLabel && <StageChip stageLabel={file.stageLabel} stageColor={file.stageColor} />}
        <FileActions file={file} onRename={onRename} onConfirm={onConfirm} onCreatePrintJob={onCreatePrintJob} onEditPrintJob={onEditPrintJob} onRelink={onRelink} onAssign={onAssign} onDeliver={onDeliver} viewOnly={viewOnly} />
      </Stack>

      {subText && (
        <Typography
          variant="caption"
          sx={{ display: 'block', fontSize: 9.5, pl: onToggle ? 4 : 2.75, color: isUnmatched ? 'warning.700' : 'text.disabled' }}
        >
          {subText}
        </Typography>
      )}
      <StatusBadges file={file} sx={{ pl: onToggle ? 4 : 2.75, mt: 0.25 }} />
    </Box>
  );
}

// ─── Card view ────────────────────────────────────────────────────────────────
function FileCard({ file, checked, onToggle, onRename, onConfirm, onCreatePrintJob, onEditPrintJob, onRelink, onAssign, onDeliver, viewOnly, hideStageChip }) {
  const isUnmatched = !file.matched && !file.isDraft;
  const { bg, border } = rowColors(file, checked);
  const subText = file.isDraft
    ? (file.assignedToName ? `Assigned: ${file.assignedToName}` : '')
    : isUnmatched
    ? `Order #${file.extractedOrderNumber || '?'} not found`
    : file.matched && file.orderStage
    ? `MIS: ${file.orderStage}`
    : '';

  return (
    <Card
      variant="outlined"
      onClick={() => onToggle && onToggle(file.fileId)}
      sx={{
        height: '100%', display: 'flex', flexDirection: 'column',
        borderColor: border,
        bgcolor: bg === 'transparent' ? 'background.paper' : bg,
        '&:hover': { boxShadow: 1 },
        transition: 'box-shadow 0.15s, border-color 0.12s',
        cursor: onToggle ? 'pointer' : 'default',
      }}
    >
      <CardContent sx={{ flex: 1, pb: 0, pt: 0.75, px: 1 }}>
        <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mb: 0.5 }}>
          {onToggle && (
            <Checkbox
              size="small" checked={!!checked}
              onChange={() => onToggle(file.fileId)}
              onClick={(e) => e.stopPropagation()}
              sx={{ p: 0.2, flexShrink: 0, ml: -0.5 }}
            />
          )}
          {!hideStageChip && file.stageLabel && <StageChip stageLabel={file.stageLabel} stageColor={file.stageColor} />}
          <Box sx={{ flex: 1 }} />
          <FileActions file={file} onRename={onRename} onConfirm={onConfirm} onCreatePrintJob={onCreatePrintJob} onEditPrintJob={onEditPrintJob} onRelink={onRelink} onAssign={onAssign} onDeliver={onDeliver} viewOnly={viewOnly} />
        </Stack>

        <Stack direction="row" spacing={0.5} alignItems="flex-start">
          <Box sx={{ flexShrink: 0, mt: 0.1 }}>
            {file.stageNumber === 6
              ? <LocalPrintshopRoundedIcon sx={{ fontSize: 13, color: 'error.400' }} />
              : file.stageNumber === 5
              ? <DoneAllRoundedIcon sx={{ fontSize: 13, color: 'success.500' }} />
              : isUnmatched
              ? <ErrorOutlineRoundedIcon sx={{ fontSize: 13, color: 'warning.600' }} />
              : <DesignServicesRoundedIcon sx={{ fontSize: 13, color: 'text.disabled' }} />}
          </Box>
          <Tooltip title={file.fileName}>
            <Typography
              variant="body2" fontWeight={600}
              sx={{ fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', lineHeight: 1.3 }}
            >
              {file.fileName}
            </Typography>
          </Tooltip>
        </Stack>

        {subText && (
          <Typography variant="caption" sx={{ display: 'block', mt: 0.25, fontSize: 9.5, color: isUnmatched ? 'warning.700' : 'text.disabled' }}>
            {subText}
          </Typography>
        )}
        <StatusBadges file={file} sx={{ mt: 0.4, mb: 0.5 }} />
      </CardContent>
    </Card>
  );
}

// ─── Confirm Final Dialog ─────────────────────────────────────────────────────
function ConfirmFinalDialog({ open, file, onClose, onSuccess, fromArchive = false }) {
  const [customer, setCustomer] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [customerInput, setCustomerInput] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [orderMode, setOrderMode] = useState('note');
  const [noteText, setNoteText] = useState('');
  const [items, setItems] = useState([{ itemName: '', qty: 1, rate: '', amount: '' }]);
  const [itemOptions, setItemOptions] = useState([]);
  const [loadingData, setLoadingData] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) {
      setCustomer(null); setCustomerInput(''); setMobileNumber('');
      setOrderMode('note'); setError('');
      setItems([{ itemName: '', qty: 1, rate: '', amount: '' }]);
      return;
    }
    setNoteText((file?.fileName || '').replace(/\.[^.]+$/, ''));
    setLoadingData(true);
    Promise.all([
      axios.get('/api/customers/GetCustomerList'),
      axios.get('/api/items/GetItemList'),
    ])
      .then(([custRes, itemRes]) => {
        setCustomers(custRes.data?.result || []);
        setItemOptions(itemRes.data?.result || []);
      })
      .catch(() => {})
      .finally(() => setLoadingData(false));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const addItemRow = () => setItems((prev) => [...prev, { itemName: '', qty: 1, rate: '', amount: '' }]);
  const removeItemRow = (i) => setItems((prev) => prev.filter((_, idx) => idx !== i));
  const updateItem = (i, field, value) => {
    setItems((prev) => prev.map((row, idx) => {
      if (idx !== i) return row;
      const updated = { ...row, [field]: value };
      if (field === 'qty' || field === 'rate') {
        const qty = parseFloat(field === 'qty' ? value : row.qty) || 0;
        const rate = parseFloat(field === 'rate' ? value : row.rate) || 0;
        updated.amount = qty && rate ? String(qty * rate) : '';
      }
      return updated;
    }));
  };

  const total = items.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);

  const handleSubmit = async () => {
    if (!customer) return;
    const isDetailed = orderMode === 'items';
    if (!isDetailed && !noteText.trim()) return;
    if (isDetailed && !items.some((r) => r.itemName.trim())) return;
    setSubmitting(true); setError('');
    try {
      const res = await axios.post('/api/design-files/confirm-final', {
        fileId: file.fileId, fileName: file.fileName,
        customerUuid: customer.Customer_uuid,
        itemDetails: isDetailed ? '' : noteText.trim(),
        mobileNumber: mobileNumber.trim(),
        orderMode: isDetailed ? 'items' : 'note',
        items: isDetailed
          ? items.map((r) => ({ itemName: r.itemName, qty: parseFloat(r.qty) || 1, rate: parseFloat(r.rate) || 0, amount: parseFloat(r.amount) || 0 }))
          : [],
        fromArchive,
      });
      onSuccess(`Order #${res.data.orderNumber} created — "${file.fileName}" confirmed`, 'success');
      onClose();
    } catch (err) {
      setError(err?.response?.data?.message || err.message || 'Failed to confirm');
    } finally { setSubmitting(false); }
  };

  const filteredCustomers = customers.filter((c) => {
    if (!customerInput) return true;
    const q = customerInput.toLowerCase();
    return c.Customer_name?.toLowerCase().includes(q) || c.Mobile?.toLowerCase().includes(q);
  });

  const canSubmit = customer && !submitting && (
    orderMode === 'note' ? noteText.trim() : items.some((r) => r.itemName.trim())
  );

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Typography fontWeight={700}>Confirm Final File → Create Order</Typography>
          <IconButton size="small" onClick={onClose}><CloseRoundedIcon fontSize="small" /></IconButton>
        </Stack>
      </DialogTitle>
      <DialogContent sx={{ pt: 1 }}>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2, fontSize: 12 }}>
          File: <strong>{file?.fileName}</strong>
        </Typography>
        <Stack spacing={2}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <Autocomplete
              sx={{ flex: 1 }}
              options={filteredCustomers} value={customer}
              onChange={(_, v) => { setCustomer(v); if (v?.Mobile) setMobileNumber(v.Mobile); }}
              inputValue={customerInput} onInputChange={(_, v) => setCustomerInput(v)}
              getOptionLabel={(c) => `${c.Customer_name}${c.Mobile ? ` — ${c.Mobile}` : ''}`}
              isOptionEqualToValue={(a, b) => a.Customer_uuid === b.Customer_uuid}
              loading={loadingData} disabled={submitting}
              renderInput={(params) => (
                <TextField {...params} label="Customer *" placeholder="Search by name or mobile…" size="small"
                  InputProps={{ ...params.InputProps, endAdornment: <>{loadingData ? <CircularProgress size={14} /> : null}{params.InputProps.endAdornment}</> }}
                />
              )}
            />
            <TextField label="Mobile Number" value={mobileNumber}
              onChange={(e) => setMobileNumber(e.target.value)}
              size="small" disabled={submitting} sx={{ width: { xs: '100%', sm: 160 } }}
            />
          </Stack>

          {/* Order type toggle */}
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>Order type:</Typography>
            <Button size="small" variant={orderMode === 'note' ? 'contained' : 'outlined'}
              onClick={() => setOrderMode('note')} disabled={submitting}
              sx={{ fontSize: 11, py: 0.3, px: 1, minHeight: 26 }}
            >Simple Note</Button>
            <Button size="small" variant={orderMode === 'items' ? 'contained' : 'outlined'}
              onClick={() => setOrderMode('items')} disabled={submitting}
              sx={{ fontSize: 11, py: 0.3, px: 1, minHeight: 26 }}
            >Detailed Items</Button>
          </Stack>

          {orderMode === 'note' ? (
            <TextField label="Description / Item Details *"
              value={noteText} onChange={(e) => setNoteText(e.target.value)}
              size="small" disabled={submitting} multiline minRows={2}
              placeholder="e.g. Flex Banner 4x3, Visiting Card 100pcs"
            />
          ) : (
            <Box>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontSize: 11, fontWeight: 700 }}>Item Name *</TableCell>
                    <TableCell sx={{ fontSize: 11, fontWeight: 700, width: 70 }}>Qty</TableCell>
                    <TableCell sx={{ fontSize: 11, fontWeight: 700, width: 90 }}>Rate (₹)</TableCell>
                    <TableCell sx={{ fontSize: 11, fontWeight: 700, width: 90 }}>Amount (₹)</TableCell>
                    <TableCell sx={{ width: 32 }} />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {items.map((row, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <Autocomplete
                          freeSolo
                          options={itemOptions}
                          value={row.itemName}
                          onChange={(_, v) => updateItem(i, 'itemName', typeof v === 'string' ? v : v?.Item_name || '')}
                          onInputChange={(_, v) => updateItem(i, 'itemName', v)}
                          getOptionLabel={(o) => (typeof o === 'string' ? o : o?.Item_name || '')}
                          disabled={submitting}
                          renderInput={(params) => (
                            <TextField {...params} size="small" placeholder="Item name…"
                              inputProps={{ ...params.inputProps, style: { fontSize: 11, padding: '3px 6px' } }}
                            />
                          )}
                        />
                      </TableCell>
                      <TableCell>
                        <TextField size="small" type="number" value={row.qty}
                          onChange={(e) => updateItem(i, 'qty', e.target.value)}
                          disabled={submitting} inputProps={{ min: 1, style: { fontSize: 11, padding: '3px 6px' } }}
                          sx={{ width: 60 }}
                        />
                      </TableCell>
                      <TableCell>
                        <TextField size="small" type="number" value={row.rate}
                          onChange={(e) => updateItem(i, 'rate', e.target.value)}
                          disabled={submitting} inputProps={{ min: 0, style: { fontSize: 11, padding: '3px 6px' } }}
                          sx={{ width: 80 }}
                        />
                      </TableCell>
                      <TableCell>
                        <TextField size="small" type="number" value={row.amount}
                          onChange={(e) => updateItem(i, 'amount', e.target.value)}
                          disabled={submitting} inputProps={{ min: 0, style: { fontSize: 11, padding: '3px 6px' } }}
                          sx={{ width: 80 }}
                        />
                      </TableCell>
                      <TableCell sx={{ p: 0.25 }}>
                        {items.length > 1 && (
                          <IconButton size="small" onClick={() => removeItemRow(i)} disabled={submitting} sx={{ color: 'error.main', p: 0.25 }}>
                            <DeleteRoundedIcon sx={{ fontSize: 14 }} />
                          </IconButton>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow>
                    <TableCell colSpan={3} sx={{ fontSize: 12, fontWeight: 700, textAlign: 'right', borderBottom: 'none' }}>Total</TableCell>
                    <TableCell sx={{ fontSize: 12, fontWeight: 700, borderBottom: 'none' }}>₹{total.toFixed(2)}</TableCell>
                    <TableCell sx={{ borderBottom: 'none' }} />
                  </TableRow>
                </TableBody>
              </Table>
              <Button size="small" startIcon={<AddRoundedIcon />} onClick={addItemRow} disabled={submitting}
                sx={{ mt: 0.5, fontSize: 11 }}>
                Add Item
              </Button>
            </Box>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={submitting}>Cancel</Button>
        <Button variant="contained" color="success" onClick={handleSubmit}
          disabled={!canSubmit}
          startIcon={submitting ? <CircularProgress size={14} /> : <AssignmentTurnedInRoundedIcon />}
        >
          Confirm & Create Order
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ─── Edit Print Job Dialog ────────────────────────────────────────────────────
function EditPrintJobDialog({ open, file, onClose, onSuccess }) {
  const [vendor, setVendor] = useState(null);
  const [vendors, setVendors] = useState([]);
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [loadingVendors, setLoadingVendors] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) { setVendor(null); setAmount(''); setNotes(''); setError(''); return; }
    setLoadingVendors(true);
    axios.get('/api/vendors/masters', { params: { activeOnly: 'true' } })
      .then((r) => setVendors(r.data?.result || []))
      .catch(() => {})
      .finally(() => setLoadingVendors(false));
  }, [open]);

  const handleSubmit = async () => {
    if (!vendor || !file?.printJobId) return;
    setSubmitting(true); setError('');
    try {
      await axios.post('/api/design-files/update-print-job', {
        printJobId: file.printJobId,
        vendorUuid: vendor.Vendor_uuid,
        amount: Number(amount) || 0,
        notes,
      });
      onSuccess(`${pjLabel(file.printJobNumber)} updated`, 'success');
      onClose();
    } catch (err) {
      setError(err?.response?.data?.message || err.message || 'Failed to update');
    } finally { setSubmitting(false); }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Typography fontWeight={700}>
            Update {file?.printJobNumber != null ? pjLabel(file.printJobNumber) : 'Print Job'}
          </Typography>
          <IconButton size="small" onClick={onClose}><CloseRoundedIcon fontSize="small" /></IconButton>
        </Stack>
      </DialogTitle>
      <DialogContent sx={{ pt: 1 }}>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2, fontSize: 12 }}>{file?.fileName}</Typography>
        <Stack spacing={2}>
          <Autocomplete
            options={vendors} value={vendor} onChange={(_, v) => setVendor(v)}
            getOptionLabel={(v) => v.Vendor_name}
            isOptionEqualToValue={(a, b) => a.Vendor_uuid === b.Vendor_uuid}
            loading={loadingVendors} disabled={submitting}
            renderInput={(params) => (
              <TextField {...params} label="Printer / Vendor *" size="small"
                InputProps={{ ...params.InputProps, endAdornment: <>{loadingVendors ? <CircularProgress size={14} /> : null}{params.InputProps.endAdornment}</> }}
              />
            )}
          />
          <TextField label="Amount (₹)" type="number" value={amount}
            onChange={(e) => setAmount(e.target.value)} size="small" disabled={submitting}
            InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }}
            inputProps={{ min: 0 }}
          />
          <TextField label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)}
            size="small" disabled={submitting} multiline minRows={2}
          />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={submitting}>Cancel</Button>
        <Button variant="contained" onClick={handleSubmit}
          disabled={!vendor || submitting}
          startIcon={submitting ? <CircularProgress size={14} /> : <ReceiptLongRoundedIcon />}
        >
          Update Print Job
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ─── Link Order Dialog ────────────────────────────────────────────────────────
function LinkOrderDialog({ open, selectedFiles, onClose, onSuccess, fromArchive = false }) {
  const [order, setOrder] = useState(null);
  const [options, setOptions] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [searching, setSearching] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const debounceRef = useRef(null);

  useEffect(() => { if (!open) { setOrder(null); setOptions([]); setInputValue(''); setError(''); } }, [open]);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await axios.get('/api/design-files/orders/search', { params: { q: inputValue } });
        setOptions(res.data?.result || []);
      } catch { setOptions([]); } finally { setSearching(false); }
    }, 300);
  }, [inputValue]);

  const handleQuickCreate = async () => {
    setSubmitting(true); setError('');
    try {
      const res = await axios.post('/api/design-files/auto-temp-orders', {
        files: selectedFiles.map((f) => ({ fileId: f.fileId, fileName: f.fileName, stageNumber: f.stageNumber, stageLabel: f.stageLabel })),
        fromArchive,
      });
      const { created = 0, renamed = 0, failed = 0 } = res.data || {};
      if (failed > 0) {
        onSuccess(`${created} TEMP order${created !== 1 ? 's' : ''} created, ${renamed} renamed, ${failed} failed`, 'warning');
      } else {
        onSuccess(`${created} TEMP order${created !== 1 ? 's' : ''} created and renamed in Drive`, 'success');
      }
      onClose();
    } catch (err) {
      setError(err?.response?.data?.message || err.message || 'Failed to create temp orders');
    } finally { setSubmitting(false); }
  };

  const handleSubmit = async () => {
    if (!order) return;
    setSubmitting(true); setError('');
    try {
      const res = await axios.post('/api/design-files/link-order', {
        fileIds: selectedFiles.map((f) => f.fileId),
        orderUuid: order.Order_uuid,
        files: selectedFiles.map((f) => ({ fileId: f.fileId, fileName: f.fileName, stageNumber: f.stageNumber, stageLabel: f.stageLabel })),
      });
      const renameResults = res.data?.renameResults || {};
      const renamed = Object.values(renameResults).filter((r) => r.status === 'renamed').length;
      const failed = Object.values(renameResults).filter((r) => r.status === 'failed');
      const n = selectedFiles.length;
      if (failed.length > 0) {
        onSuccess(`${n} file${n !== 1 ? 's' : ''} linked to Order #${order.Order_Number} — ${failed.length} rename failed.`, 'warning');
      } else if (renamed > 0) {
        onSuccess(`${n} file${n !== 1 ? 's' : ''} linked and renamed to Order #${order.Order_Number}`, 'success');
      } else {
        onSuccess(`${n} file${n !== 1 ? 's' : ''} linked to Order #${order.Order_Number}`, 'success');
      }
      onClose();
    } catch (err) {
      setError(err?.response?.data?.message || err.message || 'Failed to link');
    } finally { setSubmitting(false); }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Typography fontWeight={700}>Link to Order</Typography>
          <IconButton size="small" onClick={onClose}><CloseRoundedIcon fontSize="small" /></IconButton>
        </Stack>
      </DialogTitle>
      <DialogContent sx={{ pt: 1 }}>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {selectedFiles.length} file{selectedFiles.length !== 1 ? 's' : ''} selected
        </Typography>
        <Autocomplete
          options={options} value={order} onChange={(_, v) => setOrder(v)}
          inputValue={inputValue} onInputChange={(_, v) => setInputValue(v)}
          getOptionLabel={(o) => `#${o.Order_Number}${o.isTemporary ? ' [TEMP]' : ''}${o.customerName ? ` — ${o.customerName}` : ''} — ${o.orderNote || '(no note)'}`}
          isOptionEqualToValue={(a, b) => a.Order_uuid === b.Order_uuid}
          loading={searching} disabled={submitting}
          renderInput={(params) => (
            <TextField {...params} label="Search Order" placeholder="Type order number or description…" size="small"
              InputProps={{ ...params.InputProps, endAdornment: <>{searching ? <CircularProgress size={14} /> : null}{params.InputProps.endAdornment}</> }}
            />
          )}
        />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={submitting}>Cancel</Button>
        <Button variant="outlined" color="warning" onClick={handleQuickCreate}
          disabled={selectedFiles.length === 0 || submitting}
          startIcon={submitting ? <CircularProgress size={14} /> : <AutoFixHighRoundedIcon />}
          sx={{ mr: 'auto', order: -1 }}
        >
          Quick Create {selectedFiles.length > 0 ? selectedFiles.length : ''} & Rename
        </Button>
        <Button variant="contained" onClick={handleSubmit}
          disabled={!order || submitting}
          startIcon={submitting ? <CircularProgress size={14} /> : <LinkRoundedIcon />}
        >
          Link to Order
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ─── Auto Temp Dialog ─────────────────────────────────────────────────────────
function AutoTempDialog({ open, files, onClose, onSuccess, fromArchive = false }) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => { if (!open) { setResult(null); setError(''); } }, [open]);

  const handleRun = async () => {
    setRunning(true); setError('');
    try {
      const res = await axios.post('/api/design-files/auto-temp-orders', {
        files: files.map((f) => ({ fileId: f.fileId, fileName: f.fileName, stageNumber: f.stageNumber, stageLabel: f.stageLabel })),
        fromArchive,
      });
      setResult(res.data);
    } catch (err) {
      setError(err?.response?.data?.message || err.message || 'Failed');
    } finally { setRunning(false); }
  };

  const handleDone = () => {
    if (result?.created > 0) onSuccess(`Created ${result.created} TEMP order${result.created !== 1 ? 's' : ''} and renamed Drive files`, 'success');
    onClose();
  };

  return (
    <Dialog open={open} onClose={result ? handleDone : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Typography fontWeight={700}>Create Temp Orders</Typography>
          <IconButton size="small" onClick={result ? handleDone : onClose}><CloseRoundedIcon fontSize="small" /></IconButton>
        </Stack>
      </DialogTitle>
      <DialogContent sx={{ pt: 1 }}>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {!result ? (
          <>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              This will create a TEMP placeholder order for each of the <strong>{files.length}</strong> unmatched file{files.length !== 1 ? 's' : ''} and rename them in Drive.
            </Typography>
            <Stack spacing={0.4}>
              {files.map((f) => (
                <Typography key={f.fileId} variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>• {f.fileName}</Typography>
              ))}
            </Stack>
          </>
        ) : (
          <>
            <Alert severity={result.failed > 0 ? 'warning' : 'success'} sx={{ mb: 1.5 }}>
              {result.created} order{result.created !== 1 ? 's' : ''} created
              {result.renamed != null ? `, ${result.renamed} file${result.renamed !== 1 ? 's' : ''} renamed` : ''}
              {result.failed > 0 ? `, ${result.failed} failed` : ''}.
            </Alert>
            {result.results?.map((r, i) => (
              <Typography key={i} variant="caption" sx={{ display: 'block', color: r.status === 'created' ? 'success.main' : 'error.main' }}>
                {r.status === 'created' ? '✓' : '✗'} {r.fileName}{r.status === 'created' ? ` → Order #${r.orderNumber}` : ` — ${r.error || 'failed'}`}
              </Typography>
            ))}
          </>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        {!result ? (
          <>
            <Button onClick={onClose} disabled={running}>Cancel</Button>
            <Button variant="contained" color="warning" onClick={handleRun} disabled={running || files.length === 0}
              startIcon={running ? <CircularProgress size={14} /> : <AutoFixHighRoundedIcon />}
            >
              Create {files.length} Temp Order{files.length !== 1 ? 's' : ''}
            </Button>
          </>
        ) : (
          <Button variant="contained" onClick={handleDone}>Done</Button>
        )}
      </DialogActions>
    </Dialog>
  );
}

// ─── Print Job Dialog ─────────────────────────────────────────────────────────
function PrintJobDialog({ open, selectedFiles, onClose, onSuccess, validateFinal = false }) {
  const [order, setOrder] = useState(null);
  const [options, setOptions] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [searching, setSearching] = useState(false);
  const [vendor, setVendor] = useState(null);
  const [vendors, setVendors] = useState([]);
  const [itemOptions, setItemOptions] = useState([]);
  const [loadingVendors, setLoadingVendors] = useState(false);
  const [rows, setRows] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [validation, setValidation] = useState({});
  const [validating, setValidating] = useState(false);
  const debounceRef = useRef(null);

  useEffect(() => {
    if (!open) { setOrder(null); setOptions([]); setInputValue(''); setVendor(null); setRows([]); setError(''); setValidation({}); setValidating(false); return; }
    setRows(selectedFiles.map((f) => ({
      fileId: f.fileId,
      fileName: f.fileName,
      itemName: (f.fileName || '').replace(/\.[^.]+$/, ''),
      qty: 1, rate: '', amount: '',
    })));
    setLoadingVendors(true);
    Promise.all([
      axios.get('/api/vendors/masters', { params: { activeOnly: 'true' } }),
      axios.get('/api/items/GetItemList'),
    ])
      .then(([vRes, iRes]) => {
        setVendors(vRes.data?.result || []);
        setItemOptions(iRes.data?.result || []);
      })
      .catch(() => {})
      .finally(() => setLoadingVendors(false));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await axios.get('/api/design-files/orders/search', { params: { q: inputValue } });
        setOptions(res.data?.result || []);
      } catch { setOptions([]); } finally { setSearching(false); }
    }, 300);
  }, [inputValue]);

  useEffect(() => {
    if (!open || !validateFinal) return;
    const toCheck = selectedFiles.filter((f) => f.orderUuid);
    if (!toCheck.length) return;
    setValidating(true);
    axios.post('/api/design-files/validate-print-jobs', {
      files: toCheck.map((f) => ({ fileId: f.fileId, orderUuid: f.orderUuid, orderNumber: f.orderNumber })),
    }).then((res) => {
      const map = {};
      (res.data?.results || []).forEach((r) => { map[r.fileId] = r; });
      setValidation(map);
    }).catch(() => {}).finally(() => setValidating(false));
  }, [open, validateFinal, selectedFiles]);

  const updateRow = (fileId, field, value) => {
    setRows((prev) => prev.map((r) => {
      if (r.fileId !== fileId) return r;
      const updated = { ...r, [field]: value };
      if (field === 'qty' || field === 'rate') {
        const qty = parseFloat(field === 'qty' ? value : r.qty) || 0;
        const rate = parseFloat(field === 'rate' ? value : r.rate) || 0;
        updated.amount = qty && rate ? String(qty * rate) : '';
      }
      return updated;
    }));
  };

  const total = rows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);

  const handleSubmit = async () => {
    if (!vendor) return;
    setSubmitting(true); setError('');
    try {
      const res = await axios.post('/api/design-files/create-print-job', {
        orderUuid: order?.Order_uuid || undefined,
        vendorUuid: vendor.Vendor_uuid,
        items: rows.map((r) => ({
          fileId: r.fileId, fileName: r.fileName, itemName: r.itemName || r.fileName,
          qty: parseFloat(r.qty) || 1,
          rate: parseFloat(r.rate) || 0,
          amount: parseFloat(r.amount) || 0,
        })),
        totalAmount: total,
      });
      const pjNum = res.data?.printJobNumber;
      onSuccess(`Print job ${pjNum != null ? pjLabel(pjNum) : ''} created for ${rows.length} file${rows.length !== 1 ? 's' : ''}`, 'success');
      onClose();
    } catch (err) {
      setError(err?.response?.data?.message || err.message || 'Failed to create print job');
    } finally { setSubmitting(false); }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Typography fontWeight={700}>Create Print Bill</Typography>
          <IconButton size="small" onClick={onClose}><CloseRoundedIcon fontSize="small" /></IconButton>
        </Stack>
      </DialogTitle>
      <DialogContent sx={{ pt: 1 }}>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {validateFinal && Object.keys(validation).length > 0 && (
          (() => {
            const invalid = selectedFiles.filter((f) => validation[f.fileId] && !validation[f.fileId].valid);
            if (!invalid.length) return null;
            return (
              <Alert severity="warning" sx={{ mb: 2, fontSize: 12 }}>
                <strong>Missing confirmed Final design:</strong>
                {invalid.map((f) => (
                  <Typography key={f.fileId} variant="caption" sx={{ display: 'block', mt: 0.3 }}>
                    • {validation[f.fileId]?.reason}
                  </Typography>
                ))}
              </Alert>
            );
          })()
        )}
        <Stack spacing={2}>
          <Stack direction="row" spacing={2}>
            <Autocomplete
              sx={{ flex: 1 }}
              options={options} value={order} onChange={(_, v) => setOrder(v)}
              inputValue={inputValue} onInputChange={(_, v) => setInputValue(v)}
              getOptionLabel={(o) => `#${o.Order_Number}${o.isTemporary ? ' [TEMP]' : ''}${o.customerName ? ` — ${o.customerName}` : ''} — ${o.orderNote || '(no note)'}`}
              isOptionEqualToValue={(a, b) => a.Order_uuid === b.Order_uuid}
              loading={searching} disabled={submitting}
              renderInput={(params) => (
                <TextField {...params} label="Link to Order (optional)" placeholder="Search order…" size="small"
                  InputProps={{ ...params.InputProps, endAdornment: <>{searching ? <CircularProgress size={14} /> : null}{params.InputProps.endAdornment}</> }}
                />
              )}
            />
            <Autocomplete
              sx={{ flex: 1 }}
              options={vendors} value={vendor} onChange={(_, v) => setVendor(v)}
              getOptionLabel={(v) => v.Vendor_name}
              isOptionEqualToValue={(a, b) => a.Vendor_uuid === b.Vendor_uuid}
              loading={loadingVendors} disabled={submitting}
              renderInput={(params) => (
                <TextField {...params} label="Printer / Vendor *" size="small"
                  InputProps={{ ...params.InputProps, endAdornment: <>{loadingVendors ? <CircularProgress size={14} /> : null}{params.InputProps.endAdornment}</> }}
                />
              )}
            />
          </Stack>

          <Box sx={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <Table size="small" sx={{ minWidth: 480 }}>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontSize: 11, fontWeight: 700, width: 130 }}>File</TableCell>
                <TableCell sx={{ fontSize: 11, fontWeight: 700 }}>Item Name</TableCell>
                <TableCell sx={{ fontSize: 11, fontWeight: 700, width: 65 }}>Qty</TableCell>
                <TableCell sx={{ fontSize: 11, fontWeight: 700, width: 85 }}>Rate (₹)</TableCell>
                <TableCell sx={{ fontSize: 11, fontWeight: 700, width: 85 }}>Amount (₹)</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.fileId}>
                  <TableCell sx={{ fontSize: 10, maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'text.secondary' }} title={r.fileName}>
                    {r.fileName}
                  </TableCell>
                  <TableCell>
                    <Autocomplete
                      freeSolo
                      options={itemOptions}
                      value={r.itemName}
                      onChange={(_, v) => updateRow(r.fileId, 'itemName', typeof v === 'string' ? v : v?.Item_name || '')}
                      onInputChange={(_, v) => updateRow(r.fileId, 'itemName', v)}
                      getOptionLabel={(o) => (typeof o === 'string' ? o : o?.Item_name || '')}
                      disabled={submitting}
                      renderInput={(params) => (
                        <TextField {...params} size="small" placeholder="Item name…"
                          inputProps={{ ...params.inputProps, style: { fontSize: 11, padding: '3px 6px' } }}
                          sx={{ minWidth: 120 }}
                        />
                      )}
                    />
                  </TableCell>
                  <TableCell>
                    <TextField size="small" type="number" value={r.qty}
                      onChange={(e) => updateRow(r.fileId, 'qty', e.target.value)}
                      disabled={submitting} inputProps={{ min: 1, style: { fontSize: 11, padding: '3px 6px' } }}
                      sx={{ width: 55 }}
                    />
                  </TableCell>
                  <TableCell>
                    <TextField size="small" type="number" value={r.rate}
                      onChange={(e) => updateRow(r.fileId, 'rate', e.target.value)}
                      disabled={submitting} inputProps={{ min: 0, style: { fontSize: 11, padding: '3px 6px' } }}
                      sx={{ width: 75 }}
                    />
                  </TableCell>
                  <TableCell>
                    <TextField size="small" type="number" value={r.amount}
                      onChange={(e) => updateRow(r.fileId, 'amount', e.target.value)}
                      disabled={submitting} inputProps={{ min: 0, style: { fontSize: 11, padding: '3px 6px' } }}
                      sx={{ width: 75 }}
                    />
                  </TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell colSpan={4} sx={{ fontSize: 12, fontWeight: 700, textAlign: 'right', borderBottom: 'none' }}>Total</TableCell>
                <TableCell sx={{ fontSize: 12, fontWeight: 700, borderBottom: 'none' }}>₹{total.toFixed(2)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={submitting}>Cancel</Button>
        <Button variant="contained" color="error" onClick={handleSubmit}
          disabled={!vendor || submitting || validating || (validateFinal && Object.values(validation).some((v) => !v.valid))}
          startIcon={submitting || validating ? <CircularProgress size={14} /> : <ReceiptLongRoundedIcon />}
        >
          Create Print Bill
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ─── Deliver dialog ───────────────────────────────────────────────────────────
function DeliverDialog({ open, file, onClose, onSuccess }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { if (!open) setError(''); }, [open]);

  const handleConfirm = async () => {
    if (!file?.orderUuid) return;
    setSubmitting(true); setError('');
    try {
      await axios.patch(`/api/orders/${file.orderUuid}/stage`, { stage: 'delivered' });
      onSuccess(`Order #${file.orderNumber} marked delivered`, 'success');
      onClose();
    } catch (err) {
      setError(err?.response?.data?.message || err.message || 'Failed to mark delivered');
    } finally { setSubmitting(false); }
  };

  return (
    <Dialog open={open} onClose={submitting ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Mark as Delivered</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary">
          Mark Order #{file?.orderNumber} ({file?.customerName || 'this order'}) as delivered? The customer will be notified on WhatsApp.
        </Typography>
        {error && <Alert severity="error" sx={{ mt: 1.5 }}>{error}</Alert>}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={submitting}>Cancel</Button>
        <Button variant="contained" color="success" onClick={handleConfirm} disabled={submitting}
          startIcon={submitting ? <CircularProgress size={14} /> : <LocalShippingRoundedIcon />}
        >
          Mark Delivered
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ─── Archive panel ────────────────────────────────────────────────────────────
function ArchiveDateSection({ section, onConfirm, onCreatePrintJob, onEditPrintJob, selectedIds, onToggle, onRelink, onAssign, onDeliver, viewMode }) {
  const [expanded, setExpanded] = useState(true);
  if (!section.files?.length) return null;
  const isActionable = section.stageNumber === 5 || section.stageNumber === 6;

  return (
    <Box>
      <Stack
        direction="row" alignItems="center" spacing={0.75}
        onClick={() => setExpanded((v) => !v)}
        sx={{ py: 0.4, cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' }, borderRadius: 1, px: 0.5 }}
      >
        {section.stageLabel && <StageChip stageLabel={section.stageLabel} stageColor={section.stageColor} />}
        <Typography variant="caption" color="text.secondary" sx={{ flex: 1, fontSize: 11 }}>
          {section.sectionName} — {section.files.length} file{section.files.length !== 1 ? 's' : ''}
        </Typography>
        {expanded ? <ExpandLessRoundedIcon sx={{ fontSize: 13 }} /> : <ExpandMoreRoundedIcon sx={{ fontSize: 13 }} />}
      </Stack>
      <Collapse in={expanded}>
        {viewMode === 'grid' ? (
          <Grid container spacing={0.75} sx={{ pl: 1, mt: 0.25 }}>
            {section.files.map((file) => (
              <Grid item xs={6} sm={4} md={3} key={file.fileId}>
                <FileCard
                  file={file}
                  viewOnly={!isActionable}
                  hideStageChip
                  checked={isActionable && selectedIds?.has(file.fileId)}
                  onToggle={isActionable && onToggle ? () => onToggle(file) : undefined}
                  onConfirm={section.stageNumber === 5 ? onConfirm : undefined}
                  onCreatePrintJob={section.stageNumber === 6 && file.printJobNumber == null ? onCreatePrintJob : undefined}
                  onEditPrintJob={section.stageNumber === 6 && file.printJobId ? onEditPrintJob : undefined}
                  onRelink={isActionable ? onRelink : undefined}
                  onAssign={isActionable ? onAssign : undefined}
                  onDeliver={onDeliver}
                />
              </Grid>
            ))}
          </Grid>
        ) : (
          <Stack spacing={0.35} sx={{ pl: 1, mt: 0.35 }}>
            {section.files.map((file) => (
              <FileListRow
                key={file.fileId}
                file={file}
                viewOnly={!isActionable}
                hideStageChip
                checked={isActionable && selectedIds?.has(file.fileId)}
                onToggle={isActionable && onToggle ? () => onToggle(file) : undefined}
                onConfirm={section.stageNumber === 5 ? onConfirm : undefined}
                onCreatePrintJob={section.stageNumber === 6 && file.printJobNumber == null ? onCreatePrintJob : undefined}
                onEditPrintJob={section.stageNumber === 6 && file.printJobId ? onEditPrintJob : undefined}
                onRelink={isActionable ? onRelink : undefined}
                onAssign={isActionable ? onAssign : undefined}
                onDeliver={onDeliver}
              />
            ))}
          </Stack>
        )}
      </Collapse>
    </Box>
  );
}

function ArchiveDateGroup({ dateGroup, onConfirm, onCreatePrintJob, onEditPrintJob, selectedIds, onToggle, onRelink, onAssign, onDeliver, viewMode }) {
  const [expanded, setExpanded] = useState(true);
  return (
    <Box sx={{ mb: 0.75 }}>
      <Stack
        direction="row" alignItems="center" spacing={1}
        onClick={() => setExpanded((v) => !v)}
        sx={{ py: 0.6, px: 1.5, cursor: 'pointer', bgcolor: 'action.hover', borderRadius: 1.5, '&:hover': { bgcolor: 'action.selected' } }}
      >
        {expanded ? <ExpandLessRoundedIcon sx={{ fontSize: 14, color: 'text.secondary' }} /> : <ExpandMoreRoundedIcon sx={{ fontSize: 14, color: 'text.secondary' }} />}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="body2" fontWeight={600} sx={{ fontSize: 12 }}>{dateGroup.dateName}</Typography>
          {dateGroup.monthName && (
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10, lineHeight: 1 }}>{dateGroup.monthName}</Typography>
          )}
        </Box>
        <Chip label={`${dateGroup.fileCount} file${dateGroup.fileCount !== 1 ? 's' : ''}`} size="small"
          sx={{ fontSize: 10, height: 18, bgcolor: 'background.paper', '& .MuiChip-label': { px: 0.75 } }} />
      </Stack>
      <Collapse in={expanded}>
        <Stack spacing={0.6} sx={{ px: 1, pt: 0.6 }}>
          {dateGroup.sections.map((section, i) => (
            <ArchiveDateSection key={i} section={section}
              onConfirm={onConfirm} onCreatePrintJob={onCreatePrintJob} onEditPrintJob={onEditPrintJob}
              selectedIds={selectedIds} onToggle={onToggle} onRelink={onRelink} onAssign={onAssign} onDeliver={onDeliver} viewMode={viewMode}
            />
          ))}
        </Stack>
      </Collapse>
    </Box>
  );
}

// "By Type" view — flat rows per type, grouped by date
function ArchiveTypeSection({ label, icon: Icon, color, filesByDate, onConfirm, onCreatePrintJob, onEditPrintJob, selectedIds, onToggle, onRelink, onAssign, onDeliver, stageNumber, viewMode }) {
  const [expanded, setExpanded] = useState(true);
  const totalFiles = filesByDate.reduce((s, d) => s + d.files.length, 0);
  if (!totalFiles) return null;
  return (
    <Box sx={{ mb: 1 }}>
      <Stack
        direction="row" alignItems="center" spacing={1}
        onClick={() => setExpanded((v) => !v)}
        sx={{ py: 0.7, px: 1.5, cursor: 'pointer', bgcolor: `${color}.50`, borderRadius: 1.5, '&:hover': { bgcolor: `${color}.100` }, border: '1px solid', borderColor: `${color}.200` }}
      >
        {expanded ? <ExpandLessRoundedIcon sx={{ fontSize: 14, color: `${color}.700` }} /> : <ExpandMoreRoundedIcon sx={{ fontSize: 14, color: `${color}.700` }} />}
        <Icon sx={{ fontSize: 14, color: `${color}.700` }} />
        <Typography variant="body2" fontWeight={700} color={`${color}.800`} sx={{ flex: 1, fontSize: 12 }}>{label}</Typography>
        <Chip label={`${totalFiles} file${totalFiles !== 1 ? 's' : ''}`} size="small"
          sx={{ fontSize: 10, height: 18, bgcolor: `${color}.100`, color: `${color}.800`, '& .MuiChip-label': { px: 0.75 } }} />
      </Stack>
      <Collapse in={expanded}>
        <Stack spacing={0.5} sx={{ px: 1, pt: 0.6 }}>
          {filesByDate.map((dg) => (
            <Box key={dg.dateFolderId || dg.dateName} sx={{ mb: 0.5 }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10, fontWeight: 600, px: 0.5, display: 'block', mb: 0.25 }}>
                {dg.dateName}
              </Typography>
              {viewMode === 'grid' ? (
                <Grid container spacing={0.75} sx={{ pl: 1 }}>
                  {dg.files.map((file) => (
                    <Grid item xs={6} sm={4} md={3} key={file.fileId}>
                      <FileCard
                        file={file}
                        viewOnly={false}
                        hideStageChip
                        checked={selectedIds?.has(file.fileId)}
                        onToggle={onToggle ? () => onToggle(file) : undefined}
                        onConfirm={stageNumber === 5 ? onConfirm : undefined}
                        onCreatePrintJob={stageNumber === 6 && file.printJobNumber == null ? onCreatePrintJob : undefined}
                        onEditPrintJob={stageNumber === 6 && file.printJobId ? onEditPrintJob : undefined}
                        onRelink={onRelink}
                        onAssign={onAssign}
                        onDeliver={onDeliver}
                      />
                    </Grid>
                  ))}
                </Grid>
              ) : (
                <Stack spacing={0.3} sx={{ pl: 1 }}>
                  {dg.files.map((file) => (
                    <FileListRow
                      key={file.fileId}
                      file={file}
                      viewOnly={false}
                      hideStageChip
                      checked={selectedIds?.has(file.fileId)}
                      onToggle={onToggle ? () => onToggle(file) : undefined}
                      onConfirm={stageNumber === 5 ? onConfirm : undefined}
                      onCreatePrintJob={stageNumber === 6 && file.printJobNumber == null ? onCreatePrintJob : undefined}
                      onEditPrintJob={stageNumber === 6 && file.printJobId ? onEditPrintJob : undefined}
                      onRelink={onRelink}
                      onAssign={onAssign}
                      onDeliver={onDeliver}
                    />
                  ))}
                </Stack>
              )}
            </Box>
          ))}
        </Stack>
      </Collapse>
    </Box>
  );
}

function ArchivePanel({ onConfirm, onEditPrintJob, viewMode }) {
  const { userName } = useAuth();
  const [archiveData, setArchiveData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [archiveViewMode, setArchiveViewMode] = useState('byDate'); // 'byDate' | 'byType'

  const [selectedMap, setSelectedMap] = useState({});
  const [relinkFile, setRelinkFile] = useState(null);
  const [deliverFile, setDeliverFile] = useState(null);
  const [archiveLinkOpen, setArchiveLinkOpen] = useState(false);
  const [archivePrintJobOpen, setArchivePrintJobOpen] = useState(false);
  const [archivePrintJobFiles, setArchivePrintJobFiles] = useState([]);
  const [archiveTempOpen, setArchiveTempOpen] = useState(false);
  const [archiveToast, setArchiveToast] = useState(null);
  const [autoPORunning, setAutoPORunning] = useState(false);

  const loadArchive = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await axios.get('/api/design-files/scan-archive');
      setArchiveData(res.data);
      setLoaded(true);
      setSelectedMap({});
    } catch (err) {
      setError(err?.response?.data?.message || err.message || 'Could not load archive.');
    } finally { setLoading(false); }
  }, []);

  const runAutoPO = useCallback(async () => {
    setAutoPORunning(true);
    try {
      const res = await axios.post('/api/design-files/auto-po');
      const count = res.data?.created ?? 0;
      if (count > 0) {
        setArchiveToast({ message: `Auto PO: ${count} purchase order${count > 1 ? 's' : ''} created`, severity: 'success' });
        await loadArchive();
      } else {
        setArchiveToast({ message: 'No new vendor folders found to process', severity: 'info' });
      }
    } catch (err) {
      setArchiveToast({ message: err?.response?.data?.message || 'Auto PO failed', severity: 'error' });
    } finally {
      setAutoPORunning(false);
    }
  }, [loadArchive]);

  const toggleSelect = useCallback((file) => {
    setSelectedMap((prev) => {
      const next = { ...prev };
      if (next[file.fileId]) delete next[file.fileId];
      else next[file.fileId] = file;
      return next;
    });
  }, []);

  const openPrintJobDialog = useCallback((files) => {
    setArchivePrintJobFiles(files);
    setArchivePrintJobOpen(true);
  }, []);

  const handleSinglePrintJob = useCallback((file) => {
    openPrintJobDialog([file]);
  }, [openPrintJobDialog]);

  const handleAssign = useCallback(async (file, party) => {
    try {
      const res = await axios.post('/api/design-files/assign', {
        fileId: file.fileId, fileName: file.fileName,
        orderUuid: file.orderUuid || null, orderNumber: file.orderNumber || null,
        assigneeId: party.id, assignedBy: userName,
      });
      setArchiveToast({ message: `Assigned to ${res.data?.assignedToName || party.name}`, severity: 'success' });
      loadArchive();
    } catch (err) {
      setArchiveToast({ message: err?.response?.data?.message || err.message || 'Failed to assign', severity: 'error' });
    }
  }, [loadArchive, userName]);

  const selectedFiles = Object.values(selectedMap);
  const selectedIds = new Set(Object.keys(selectedMap));

  const allFiles = archiveData?.dates?.flatMap((d) => d.sections.flatMap((s) => s.files)) || [];
  const unmatchedFiles = allFiles.filter((f) => !f.matched && !f.isDraft);

  const exportArchiveCSV = (selectedOnly = false) => {
    const rows = selectedOnly ? selectedFiles : allFiles;
    const dateStr = new Date().toISOString().slice(0, 10);
    triggerDownload(buildCSV(rows), `archive-${dateStr}.csv`, 'text/csv');
  };

  // Derive "by type" data from dates
  const { printingByDate, finalByDate } = (() => {
    const dates = archiveData?.dates || [];
    const pbd = dates.map((d) => ({
      dateName: d.dateName,
      dateFolderId: d.dateFolderId,
      files: d.sections.flatMap((s) => s.files.filter((f) => f.stageNumber === 6)),
    })).filter((d) => d.files.length > 0);
    const fbd = dates.map((d) => ({
      dateName: d.dateName,
      dateFolderId: d.dateFolderId,
      files: d.sections.flatMap((s) => s.files.filter((f) => f.stageNumber === 5)),
    })).filter((d) => d.files.length > 0);
    return { printingByDate: pbd, finalByDate: fbd };
  })();

  if (!loaded && !loading) {
    return (
      <Box sx={{ py: 4, textAlign: 'center' }}>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>Scan the month archive to find historical files.</Typography>
        <Button size="small" variant="outlined" startIcon={<ArchiveRoundedIcon />} onClick={loadArchive}>Load Archive</Button>
      </Box>
    );
  }

  if (loading) return <Box sx={{ py: 2 }}><LinearProgress sx={{ height: 2 }} /></Box>;

  if (error) {
    return (
      <Alert severity="error" sx={{ m: 1.5 }} action={<Button size="small" onClick={loadArchive}>Retry</Button>}>{error}</Alert>
    );
  }

  const { months = [], dates = [], summary } = archiveData || {};

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Archive header */}
      <Stack direction="row" alignItems="center" sx={{ px: 1.5, pb: 0.75, flexShrink: 0 }} spacing={1} flexWrap="wrap">
        <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
          <strong>
            {months.length === 0 ? '—'
              : months.length === 1 ? months[0]
              : `${months.length} months`}
          </strong>
          {summary && ` · ${summary.total} files · ${summary.unmatched} unmatched`}
        </Typography>
        {/* View mode toggle */}
        <ToggleButtonGroup
          value={archiveViewMode} exclusive
          onChange={(_, v) => { if (v) setArchiveViewMode(v); }}
          size="small"
          sx={{ height: 24, '& .MuiToggleButton-root': { px: 0.75, py: 0, fontSize: 10, textTransform: 'none' } }}
        >
          <ToggleButton value="byDate">By Date</ToggleButton>
          <ToggleButton value="byType">By Type</ToggleButton>
        </ToggleButtonGroup>
        {unmatchedFiles.length > 0 && (
          <Button size="small" variant="outlined" color="warning"
            startIcon={<AutoFixHighRoundedIcon sx={{ fontSize: '13px !important' }} />}
            onClick={() => setArchiveTempOpen(true)}
            sx={{ fontSize: '0.72rem', py: 0.3, px: 0.9, minHeight: 24 }}
          >
            Create Temp ({unmatchedFiles.length})
          </Button>
        )}
        {allFiles.length > 0 && (
          <>
            <Tooltip title="Export all to CSV">
              <IconButton size="small" onClick={() => exportArchiveCSV(false)} sx={{ p: 0.4, color: 'text.secondary' }}>
                <FileDownloadRoundedIcon sx={{ fontSize: 14 }} />
              </IconButton>
            </Tooltip>
            <Tooltip title="Print archive list">
              <IconButton size="small" onClick={() => openPrintWindow(allFiles, 'Archive')} sx={{ p: 0.4, color: 'text.secondary' }}>
                <PrintRoundedIcon sx={{ fontSize: 14 }} />
              </IconButton>
            </Tooltip>
          </>
        )}
        <Tooltip title="Run Auto Purchase Order — creates POs from new vendor folders in Print section">
          <span>
            <IconButton
              size="small"
              onClick={runAutoPO}
              disabled={autoPORunning || loading}
              color="primary"
              sx={{ p: 0.4 }}
            >
              {autoPORunning
                ? <CircularProgress size={12} />
                : <ShoppingCartRoundedIcon sx={{ fontSize: 14 }} />}
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Refresh archive">
          <IconButton size="small" onClick={loadArchive} disabled={loading} sx={{ p: 0.4 }}>
            <RefreshRoundedIcon sx={{ fontSize: 14 }} />
          </IconButton>
        </Tooltip>
      </Stack>

      {/* File list */}
      <Box sx={{ flex: 1, overflowY: 'auto' }}>
        {dates.length === 0 ? (
          <Box sx={{ py: 3, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">No files found in archive folder.</Typography>
          </Box>
        ) : archiveViewMode === 'byDate' ? (
          <Stack spacing={0.5} sx={{ px: 1, pb: 1 }}>
            {dates.map((dateGroup) => (
              <ArchiveDateGroup
                key={dateGroup.dateFolderId}
                dateGroup={dateGroup}
                onConfirm={onConfirm}
                onCreatePrintJob={handleSinglePrintJob}
                onEditPrintJob={onEditPrintJob}
                selectedIds={selectedIds}
                onToggle={toggleSelect}
                onRelink={(file) => setRelinkFile(file)}
                onAssign={handleAssign}
                onDeliver={(file) => setDeliverFile(file)}
                viewMode={viewMode}
              />
            ))}
          </Stack>
        ) : (
          <Stack spacing={0.5} sx={{ px: 1, pb: 1 }}>
            <ArchiveTypeSection
              label="Printing Files"
              icon={LocalPrintshopRoundedIcon}
              color="error"
              stageNumber={9}
              filesByDate={printingByDate}
              onCreatePrintJob={handleSinglePrintJob}
              onEditPrintJob={onEditPrintJob}
              selectedIds={selectedIds}
              onToggle={toggleSelect}
              onRelink={(file) => setRelinkFile(file)}
              onAssign={handleAssign}
              onDeliver={(file) => setDeliverFile(file)}
              viewMode={viewMode}
            />
            <ArchiveTypeSection
              label="Design / Final Files"
              icon={DoneAllRoundedIcon}
              color="success"
              stageNumber={8}
              filesByDate={finalByDate}
              onConfirm={onConfirm}
              selectedIds={selectedIds}
              onToggle={toggleSelect}
              onRelink={(file) => setRelinkFile(file)}
              onAssign={handleAssign}
              onDeliver={(file) => setDeliverFile(file)}
              viewMode={viewMode}
            />
          </Stack>
        )}
      </Box>

      {/* Selection action bar */}
      {selectedFiles.length > 0 && (
        <>
          <Divider />
          <Stack
            direction="row" alignItems="center" spacing={0.75}
            sx={{ px: 1.5, py: 0.65, bgcolor: 'primary.50', flexWrap: 'wrap', gap: 0.75, flexShrink: 0 }}
          >
            <Typography variant="body2" fontWeight={600} color="primary.main" sx={{ flex: 1, fontSize: 12 }}>
              {selectedFiles.length} selected
            </Typography>
            <Button size="small" variant="outlined"
              startIcon={<LinkRoundedIcon sx={{ fontSize: '13px !important' }} />}
              onClick={() => setArchiveLinkOpen(true)}
              sx={{ fontSize: '0.72rem', py: 0.3, px: 0.9, minHeight: 24 }}
            >Link to Order</Button>
            {selectedFiles.some((f) => f.stageNumber === 6) && (
              <Button size="small" variant="outlined" color="error"
                startIcon={<ReceiptLongRoundedIcon sx={{ fontSize: '13px !important' }} />}
                onClick={() => openPrintJobDialog(selectedFiles.filter((f) => f.stageNumber === 6))}
                sx={{ fontSize: '0.72rem', py: 0.3, px: 0.9, minHeight: 24 }}
              >Bulk Create Print Bill ({selectedFiles.filter((f) => f.stageNumber === 6).length})</Button>
            )}
            <Tooltip title="Export selected to CSV">
              <IconButton size="small" onClick={() => exportArchiveCSV(true)} sx={{ p: 0.35, color: 'primary.main' }}>
                <FileDownloadRoundedIcon sx={{ fontSize: 14 }} />
              </IconButton>
            </Tooltip>
            <Tooltip title="Print selected">
              <IconButton size="small" onClick={() => openPrintWindow(selectedFiles, 'Archive')} sx={{ p: 0.35, color: 'primary.main' }}>
                <PrintRoundedIcon sx={{ fontSize: 14 }} />
              </IconButton>
            </Tooltip>
            <IconButton size="small" onClick={() => setSelectedMap({})} sx={{ p: 0.35 }}>
              <CloseRoundedIcon sx={{ fontSize: 14 }} />
            </IconButton>
          </Stack>
        </>
      )}

      {/* Archive-internal dialogs */}
      <LinkOrderDialog
        open={archiveLinkOpen || !!relinkFile}
        selectedFiles={relinkFile ? [relinkFile] : selectedFiles}
        fromArchive
        onClose={() => { setArchiveLinkOpen(false); setRelinkFile(null); }}
        onSuccess={(msg, severity = 'success') => {
          setArchiveToast({ message: msg, severity });
          setArchiveLinkOpen(false); setRelinkFile(null); setSelectedMap({});
          loadArchive();
        }}
      />
      <AutoTempDialog
        open={archiveTempOpen} files={unmatchedFiles}
        fromArchive
        onClose={() => setArchiveTempOpen(false)}
        onSuccess={(msg, severity = 'success') => {
          setArchiveToast({ message: msg, severity });
          setArchiveTempOpen(false); loadArchive();
        }}
      />
      <PrintJobDialog
        open={archivePrintJobOpen}
        selectedFiles={archivePrintJobFiles}
        validateFinal={true}
        onClose={() => { setArchivePrintJobOpen(false); setArchivePrintJobFiles([]); }}
        onSuccess={(msg, severity = 'success') => {
          setArchiveToast({ message: msg, severity });
          setArchivePrintJobOpen(false); setArchivePrintJobFiles([]); setSelectedMap({}); loadArchive();
        }}
      />
      <DeliverDialog
        open={!!deliverFile} file={deliverFile}
        onClose={() => setDeliverFile(null)}
        onSuccess={(msg, severity = 'success') => { setArchiveToast({ message: msg, severity }); loadArchive(); }}
      />
      <Snackbar
        open={!!archiveToast} autoHideDuration={archiveToast?.severity === 'error' ? 7000 : 4000}
        onClose={() => setArchiveToast(null)} anchorOrigin={{ vertical: 'top', horizontal: 'left' }}
      >
        <Alert onClose={() => setArchiveToast(null)} severity={archiveToast?.severity || 'success'} variant="filled" sx={{ width: '100%', fontSize: 13 }}>
          {archiveToast?.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}

// ─── Create new design file dialog (the "+" button) ───────────────────────────
function CreateFileDialog({ open, onClose, onSuccess }) {
  const [fileName, setFileName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { if (!open) { setFileName(''); setError(''); } }, [open]);

  const handleSubmit = async () => {
    if (!fileName.trim() || submitting) return;
    setSubmitting(true); setError('');
    try {
      const res = await axios.post('/api/design-files/create-file', { fileName: fileName.trim() });
      onSuccess(`Created "${res.data?.file?.name}" in New Design`, 'success');
      onClose();
    } catch (err) {
      setError(err?.response?.data?.message || err.message || 'Failed to create file');
    } finally { setSubmitting(false); }
  };

  return (
    <Dialog open={open} onClose={submitting ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Typography fontWeight={700}>New Design File</Typography>
          <IconButton size="small" onClick={onClose} disabled={submitting}><CloseRoundedIcon fontSize="small" /></IconButton>
        </Stack>
      </DialogTitle>
      <DialogContent sx={{ pt: 1 }}>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5, fontSize: 12 }}>
          Copies the design template into the "1 - New Design" Drive folder under the name you type — it'll sync down to the local folder like any other file.
        </Typography>
        <TextField
          autoFocus fullWidth size="small" label="File name"
          value={fileName} onChange={(e) => setFileName(e.target.value)}
          disabled={submitting}
          placeholder="e.g. Rahul Visiting Card"
          onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
        />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={submitting}>Cancel</Button>
        <Button variant="contained" onClick={handleSubmit} disabled={!fileName.trim() || submitting}
          startIcon={submitting ? <CircularProgress size={14} /> : <AddRoundedIcon />}
        >
          Create
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ─── Design Board panel ───────────────────────────────────────────────────────
// Groups files into BOARD_COLUMNS by their real Drive-folder stage number —
// the same grouping the Workflow board's Design parent column used to show,
// but always accurate since it's sourced directly from this scan rather than
// a separate assigned-tasks query. No "move to stage" control here: a file's
// column is decided purely by which Drive folder it's physically in, synced
// automatically (see the backend's syncOrderStagesFromFolders).
function DesignBoardPanel({ files, onRename, onAssign, onRelink, onDeliver, onConfirm, onCreatePrintJob, onEditPrintJob }) {
  return (
    // Fixed 5-column grid, always one row — `auto-fit`+`minmax` used to wrap
    // a 5th column onto its own row on narrower desktop widths (columns
    // shrinking to fit still beats one column stranded alone below).
    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 0.75, p: 0.75 }}>
      {BOARD_COLUMNS.map((col) => {
        const colFiles = files.filter((f) => f.stageNumber === col.stageNumber);
        return (
          <Box
            key={col.key}
            sx={{
              minWidth: 0,
              display: 'flex',
              flexDirection: 'column',
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: 2,
              bgcolor: 'background.paper',
              maxHeight: 420,
              overflow: 'hidden',
            }}
          >
            <Stack
              direction="row"
              alignItems="center"
              spacing={1}
              sx={{ px: 1, py: 0.65, borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'rgba(240,253,244,0.6)', flexShrink: 0 }}
            >
              <Typography variant="caption" fontWeight={800} sx={{ flex: 1, whiteSpace: 'normal' }}>{col.label}</Typography>
              <Chip size="small" label={colFiles.length} />
            </Stack>
            <Stack spacing={0.4} sx={{ p: 0.75, overflowY: 'auto', flex: 1, minHeight: 0 }}>
              {colFiles.length === 0 ? (
                <Typography variant="caption" color="text.disabled" sx={{ textAlign: 'center', py: 2 }}>Nothing here.</Typography>
              ) : (
                colFiles.map((file) => (
                  <FileListRow
                    key={file.fileId}
                    file={file}
                    viewOnly={false}
                    hideStageChip
                    onRename={onRename}
                    onConfirm={file.stageNumber === 5 ? onConfirm : undefined}
                    onCreatePrintJob={file.stageNumber === 6 && file.printJobNumber == null ? onCreatePrintJob : undefined}
                    onEditPrintJob={file.stageNumber === 6 && file.printJobId ? onEditPrintJob : undefined}
                    onRelink={onRelink}
                    onAssign={onAssign}
                    onDeliver={onDeliver}
                  />
                ))
              )}
            </Stack>
          </Box>
        );
      })}
    </Box>
  );
}

// ─── Main widget ──────────────────────────────────────────────────────────────
export default function DesignFilesWidget() {
  const { userName } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [configMissing, setConfigMissing] = useState(false);
  const [archiveConfigured, setArchiveConfigured] = useState(false);
  const [reconnectRequired, setReconnectRequired] = useState(false);
  const [activeTab, setActiveTab] = useState('board');
  // List/grid toggle removed by request — grid is the only view now.
  const viewMode = 'grid';
  const [confirmFile, setConfirmFile] = useState(null);
  const [editPrintJobFile, setEditPrintJobFile] = useState(null);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [relinkFile, setRelinkFile] = useState(null);
  const [deliverFile, setDeliverFile] = useState(null);
  const [autoTempOpen, setAutoTempOpen] = useState(false);
  const [printDialogOpen, setPrintDialogOpen] = useState(false);
  const [createFileOpen, setCreateFileOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [toast, setToast] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const cfgRes = await axios.get('/api/design-files/config-check');
      if (!cfgRes.data?.configured) { setConfigMissing(true); return; }
      setArchiveConfigured(!!cfgRes.data?.archiveConfigured);
      const res = await axios.get('/api/design-files/scan');
      setData(res.data);
      setSelectedIds(new Set());

      const allFiles = res.data?.files || [];
      // Stages 1-7 so fileStageHistory captures the full path a file takes,
      // including when it enters Approval or Final/Printing — not just the
      // early stages.
      const trackedStages = allFiles.filter((f) => f.stageNumber >= 1 && f.stageNumber <= 7);
      if (trackedStages.length) {
        axios.post('/api/design-files/auto-scan-link', {
          files: trackedStages.map((f) => ({ fileId: f.fileId, fileName: f.fileName, stageNumber: f.stageNumber, stageLabel: f.stageLabel })),
        }).catch(() => {});
      }
      const printingWithoutJob = allFiles.filter((f) => f.stageNumber === 6 && !f.printJobId);
      if (printingWithoutJob.length) {
        axios.post('/api/design-files/auto-print-job', {
          files: printingWithoutJob.map((f) => ({ fileId: f.fileId, fileName: f.fileName, orderUuid: f.orderUuid || null, orderNumber: f.orderNumber || null, stageNumber: f.stageNumber })),
        }).catch(() => {});
      }
    } catch (err) {
      const msg = err?.response?.data?.message || err.message || '';
      if (err?.response?.data?.reconnectRequired) { setReconnectRequired(true); return; }
      if (err?.response?.status === 400) { setConfigMissing(true); return; }
      setError(msg || 'Could not load Drive files.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreatePrintJob = useCallback(async (file) => {
    try {
      const res = await axios.post('/api/design-files/auto-print-job', {
        files: [{
          fileId: file.fileId,
          fileName: file.fileName,
          orderUuid: file.orderUuid || null,
          orderNumber: file.orderNumber || null,
          stageNumber: file.stageNumber,
        }],
      });
      const job = res.data?.jobs?.[0];
      if (job) {
        setToast({ message: `Print job ${pjLabel(job.printJobNumber)} created`, severity: 'success' });
        load();
      } else {
        setToast({ message: 'Print job already exists for this file', severity: 'info' });
      }
    } catch (err) {
      setToast({ message: err?.response?.data?.message || err.message || 'Failed to create print job', severity: 'error' });
    }
  }, [load]);

  const handleRename = useCallback(async (file) => {
    try {
      const res = await axios.post('/api/design-files/rename-file', {
        fileId: file.fileId, fileName: file.fileName, orderNumber: file.orderNumber,
      });
      if (res.data?.status === 'renamed') {
        setToast({ message: `Renamed to "${res.data.newName}"`, severity: 'success' });
        load();
      } else if (res.data?.status === 'skipped') {
        setToast({ message: res.data.message || 'Filename already correct', severity: 'info' });
      } else {
        setToast({ message: res.data?.message || 'Rename failed — close the file in CorelDraw and retry', severity: 'warning' });
      }
    } catch (err) {
      setToast({ message: err?.response?.data?.message || err.message || 'Rename failed', severity: 'error' });
    }
  }, [load]);

  const handleAssign = useCallback(async (file, party) => {
    try {
      const res = await axios.post('/api/design-files/assign', {
        fileId: file.fileId, fileName: file.fileName,
        orderUuid: file.orderUuid || null, orderNumber: file.orderNumber || null,
        assigneeId: party.id, assignedBy: userName,
      });
      setToast({ message: `Assigned to ${res.data?.assignedToName || party.name}`, severity: 'success' });
      load();
    } catch (err) {
      setToast({ message: err?.response?.data?.message || err.message || 'Failed to assign', severity: 'error' });
    }
  }, [load, userName]);

  if (configMissing) {
    return (
      <Box sx={{ borderRadius: 2, border: '1px solid', borderColor: 'divider', p: 2 }}>
        <Stack direction="row" spacing={1.5} alignItems="flex-start">
          <FolderOpenRoundedIcon color="action" sx={{ mt: 0.2 }} />
          <Box>
            <Typography variant="subtitle2" fontWeight={600}>Design Files Tracker</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              Add <code>DRIVE_DAILY_FOLDER_ID</code> to your Render environment variables.
            </Typography>
          </Box>
        </Stack>
      </Box>
    );
  }

  if (reconnectRequired) {
    return (
      <Box sx={{ borderRadius: 2, border: '1px solid', borderColor: 'warning.300', p: 2 }}>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <ErrorOutlineRoundedIcon color="warning" />
          <Box sx={{ flex: 1 }}>
            <Typography variant="subtitle2" fontWeight={600}>Google Drive disconnected</Typography>
            <Typography variant="body2" color="text.secondary">Reconnect to track design files.</Typography>
          </Box>
          <Button size="small" variant="outlined" color="warning" onClick={() => window.open('/api/google-drive/connect', '_blank')}>
            Reconnect
          </Button>
        </Stack>
      </Box>
    );
  }

  const files = data?.files || [];
  const staleLinks = data?.staleLinks || [];

  const visibleTabs = TABS.filter((t) => t.key !== 'archive' || archiveConfigured);
  const activeTabDef = TABS.find((t) => t.key === activeTab) || TABS[0];
  const filteredFiles = activeTabDef.stageFilter ? files.filter((f) => activeTabDef.stageFilter(f)) : [];
  const selectedFiles = filteredFiles.filter((f) => selectedIds.has(f.fileId));
  const canSelect = !activeTabDef.viewOnly && activeTab !== 'archive';
  const unmatchedInView = filteredFiles.filter((f) => !f.matched && !f.isDraft);

  function tabCount(tab) {
    if (tab.key === 'board') return files.filter((f) => BOARD_STAGE_NUMBERS.has(f.stageNumber)).length;
    if (!tab.stageFilter || !files.length) return 0;
    return files.filter((f) => tab.stageFilter(f)).length;
  }

  const exportCSV = (selectedOnly = false) => {
    const rows = selectedOnly ? selectedFiles : filteredFiles;
    const dateStr = new Date().toISOString().slice(0, 10);
    triggerDownload(buildCSV(rows), `design-files-${activeTab}-${dateStr}.csv`, 'text/csv');
  };

  const handlePrint = () => openPrintWindow(filteredFiles, activeTabDef.label);

  return (
    <Box sx={{ borderRadius: 2, border: '1px solid', borderColor: 'divider', overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: { xs: 'auto', md: 480 } }}>

      {/* ── Toolbar: tabs + actions + refresh, single row ── */}
      <Stack
        direction="row" alignItems="center" spacing={0.75}
        sx={{ px: 1.5, py: 0.65, borderBottom: '1px solid', borderColor: 'divider', flexShrink: 0, flexWrap: 'wrap', rowGap: 0.5, bgcolor: 'grey.50' }}
      >
        {visibleTabs.map((tab) => {
          const Icon = tab.icon;
          const count = tab.key !== 'archive' ? tabCount(tab) : null;
          const isActive = activeTab === tab.key;
          const colorKey = tab.color === 'default' ? null : tab.color;
          return (
            <Stack
              key={tab.key}
              direction="row" alignItems="center" spacing={0.75}
              onClick={() => { setActiveTab(tab.key); setSelectedIds(new Set()); }}
              sx={{
                px: 1, py: 0.4, cursor: 'pointer',
                flexShrink: 0,
                whiteSpace: 'nowrap',
                borderRadius: 1.5,
                bgcolor: isActive ? (colorKey ? `${colorKey}.50` : 'action.selected') : 'transparent',
                '&:hover': { bgcolor: isActive ? (colorKey ? `${colorKey}.50` : 'action.selected') : 'action.hover' },
                transition: 'background 0.1s',
              }}
            >
              <Icon sx={{ fontSize: 15, color: isActive ? (colorKey ? `${colorKey}.main` : 'text.primary') : 'text.secondary', flexShrink: 0 }} />
              <Typography variant="body2" sx={{ fontSize: 12, fontWeight: isActive ? 700 : 400, color: isActive ? (colorKey ? `${colorKey}.main` : 'text.primary') : 'text.primary' }}>
                {tab.label}
              </Typography>
              {count != null && count > 0 && (
                <Chip label={count} size="small"
                  sx={{ fontSize: 10, height: 18, minWidth: 22, bgcolor: isActive ? (colorKey ? `${colorKey}.main` : 'grey.600') : 'action.hover', color: isActive ? 'white' : 'text.secondary', fontWeight: 700, '& .MuiChip-label': { px: 0.5 } }}
                />
              )}
            </Stack>
          );
        })}

        <Box sx={{ flex: 1 }} />

        {/* Create Temp Orders */}
        {activeTab !== 'archive' && unmatchedInView.length > 0 && (
          <Button size="small" variant="outlined" color="warning"
            startIcon={<AutoFixHighRoundedIcon sx={{ fontSize: '13px !important' }} />}
            onClick={() => setAutoTempOpen(true)}
            sx={{ fontSize: '0.72rem', py: 0.3, px: 0.9, minHeight: 24 }}
          >
            Create Temp ({unmatchedInView.length})
          </Button>
        )}

        {/* Export + print buttons */}
        {activeTab !== 'archive' && filteredFiles.length > 0 && (
          <>
            <Tooltip title="Export CSV / Excel">
              <IconButton size="small" onClick={() => exportCSV(false)} sx={{ p: 0.4, color: 'text.secondary' }}>
                <FileDownloadRoundedIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
            <Tooltip title="Print / Save as PDF">
              <IconButton size="small" onClick={handlePrint} sx={{ p: 0.4, color: 'text.secondary' }}>
                <PrintRoundedIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
          </>
        )}

        {/* New design file */}
        <Tooltip title="New design file">
          <IconButton size="small" onClick={() => setCreateFileOpen(true)} sx={{ p: 0.4 }}>
            <AddRoundedIcon sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>

        {/* Refresh */}
        <Tooltip title="Refresh">
          <IconButton size="small" onClick={load} disabled={loading} sx={{ p: 0.4 }}>
            {loading ? <CircularProgress size={14} /> : <RefreshRoundedIcon sx={{ fontSize: 16 }} />}
          </IconButton>
        </Tooltip>
      </Stack>

      {/* ── Right panel ── */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, width: '100%' }}>

        {loading && <LinearProgress sx={{ height: 2 }} />}

        {/* Stale drafts (tracked but vanished from Drive) only show here, in
            the Drafts tab itself — not as a global dismiss-and-forget banner
            that reappeared every refresh since "closing" it never persisted
            anything server-side. */}
        {activeTab === 'draft' && staleLinks.length > 0 && (
          <Alert severity="warning" icon={<WarningAmberRoundedIcon fontSize="small" />} sx={{ mx: 1.5, mt: 1, fontSize: 12 }}>
            <AlertTitle sx={{ fontSize: 12, fontWeight: 700 }}>
              {staleLinks.length} draft file{staleLinks.length !== 1 ? 's' : ''} no longer visible in Drive
            </AlertTitle>
            {staleLinks.map((l) => (
              <Typography key={l.driveFileId} variant="caption" sx={{ display: 'block', color: 'warning.900' }}>
                • {l.fileName || l.driveFileId}
              </Typography>
            ))}
          </Alert>
        )}

        {error && (
          <Alert severity="error" sx={{ mx: 1.5, mt: 1 }} action={<Button size="small" onClick={load}>Retry</Button>}>
            {error}
          </Alert>
        )}

        {/* Design Board */}
        {activeTab === 'board' ? (
          <Box sx={{ flex: 1, overflowY: 'auto' }}>
            <DesignBoardPanel
              files={files}
              onRename={handleRename}
              onAssign={handleAssign}
              onRelink={setRelinkFile}
              onDeliver={setDeliverFile}
              onConfirm={setConfirmFile}
              onCreatePrintJob={handleCreatePrintJob}
              onEditPrintJob={setEditPrintJobFile}
            />
          </Box>
        ) : activeTab === 'archive' ? (
          <Box sx={{ flex: 1, overflowY: 'auto', py: 1 }}>
            <ArchivePanel onConfirm={setConfirmFile} onEditPrintJob={setEditPrintJobFile} viewMode={viewMode} />
          </Box>
        ) : (
          /* File list / grid */
          <Box sx={{ flex: 1, overflowY: 'auto', px: 1.5, py: 1 }}>
            {!loading && !error && filteredFiles.length === 0 && (
              <Box sx={{ py: 5, textAlign: 'center' }}>
                <Typography variant="body2" color="text.secondary">No files found.</Typography>
              </Box>
            )}

            {viewMode === 'grid' ? (
              <Grid container spacing={0.75}>
                {filteredFiles.map((file) => (
                  <Grid item xs={6} sm={4} md={3} key={file.fileId}>
                    <FileCard
                      file={file}
                      checked={canSelect && selectedIds.has(file.fileId)}
                      onToggle={canSelect ? (id) => setSelectedIds((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; }) : undefined}
                      viewOnly={activeTabDef.viewOnly}
                      onRename={handleRename}
                      onConfirm={file.stageNumber === 5 ? setConfirmFile : undefined}
                      onCreatePrintJob={file.stageNumber === 6 && file.printJobNumber == null ? handleCreatePrintJob : undefined}
                      onEditPrintJob={file.stageNumber === 6 && file.printJobId ? setEditPrintJobFile : undefined}
                      onRelink={!activeTabDef.viewOnly ? setRelinkFile : undefined}
                      onAssign={!activeTabDef.viewOnly ? handleAssign : undefined}
                      onDeliver={!activeTabDef.viewOnly ? setDeliverFile : undefined}
                    />
                  </Grid>
                ))}
              </Grid>
            ) : (
              <Stack spacing={0.4}>
                {filteredFiles.map((file) => (
                  <FileListRow
                    key={file.fileId}
                    file={file}
                    checked={canSelect && selectedIds.has(file.fileId)}
                    onToggle={canSelect ? (id) => setSelectedIds((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; }) : undefined}
                    viewOnly={activeTabDef.viewOnly}
                    onRename={handleRename}
                    onConfirm={file.stageNumber === 5 ? setConfirmFile : undefined}
                    onCreatePrintJob={file.stageNumber === 6 && file.printJobNumber == null ? handleCreatePrintJob : undefined}
                    onEditPrintJob={file.stageNumber === 6 && file.printJobId ? setEditPrintJobFile : undefined}
                    onRelink={!activeTabDef.viewOnly ? setRelinkFile : undefined}
                    onAssign={!activeTabDef.viewOnly ? handleAssign : undefined}
                    onDeliver={!activeTabDef.viewOnly ? setDeliverFile : undefined}
                  />
                ))}
              </Stack>
            )}
          </Box>
        )}

        {/* Selection action bar — Final, Printing, All tabs */}
        {canSelect && selectedIds.size > 0 && (
          <>
            <Divider />
            <Stack
              direction="row" alignItems="center" spacing={0.75}
              sx={{ px: 1.5, py: 0.65, bgcolor: 'primary.50', flexWrap: 'wrap', gap: 0.75, flexShrink: 0 }}
            >
              <Typography variant="body2" fontWeight={600} color="primary.main" sx={{ flex: 1, fontSize: 12 }}>
                {selectedIds.size} selected
              </Typography>

              <Button size="small" variant="outlined"
                startIcon={<LinkRoundedIcon sx={{ fontSize: '13px !important' }} />}
                onClick={() => setLinkDialogOpen(true)}
                sx={{ fontSize: '0.72rem', py: 0.3, px: 0.9, minHeight: 24 }}
              >
                Link to Order
              </Button>

              {/* Create Print Bill — shown when any selected file is in the Printing stage */}
              {selectedFiles.some((f) => f.stageNumber === 6) && (
                <Button size="small" variant="outlined" color="error"
                  startIcon={<ReceiptLongRoundedIcon sx={{ fontSize: '13px !important' }} />}
                  onClick={() => setPrintDialogOpen(true)}
                  sx={{ fontSize: '0.72rem', py: 0.3, px: 0.9, minHeight: 24 }}
                >
                  Create Print Bill
                </Button>
              )}

              {/* Export selected */}
              <Tooltip title="Export selected to CSV">
                <IconButton size="small" onClick={() => exportCSV(true)} sx={{ p: 0.35, color: 'primary.main' }}>
                  <FileDownloadRoundedIcon sx={{ fontSize: 14 }} />
                </IconButton>
              </Tooltip>

              {/* Print selected */}
              <Tooltip title="Print selected">
                <IconButton size="small"
                  onClick={() => openPrintWindow(selectedFiles, activeTabDef.label)}
                  sx={{ p: 0.35, color: 'primary.main' }}
                >
                  <PrintRoundedIcon sx={{ fontSize: 14 }} />
                </IconButton>
              </Tooltip>

              <IconButton size="small" onClick={() => setSelectedIds(new Set())} sx={{ p: 0.35 }}>
                <CloseRoundedIcon sx={{ fontSize: 14 }} />
              </IconButton>
            </Stack>
          </>
        )}
      </Box>

      {/* Dialogs */}
      <ConfirmFinalDialog
        open={!!confirmFile} file={confirmFile}
        fromArchive={activeTab === 'archive'}
        onClose={() => setConfirmFile(null)}
        onSuccess={(msg, severity = 'success') => { setToast({ message: msg, severity }); setConfirmFile(null); load(); }}
      />
      <EditPrintJobDialog
        open={!!editPrintJobFile} file={editPrintJobFile}
        onClose={() => setEditPrintJobFile(null)}
        onSuccess={(msg, severity = 'success') => { setToast({ message: msg, severity }); setEditPrintJobFile(null); load(); }}
      />
      <LinkOrderDialog
        open={linkDialogOpen || !!relinkFile}
        selectedFiles={relinkFile ? [relinkFile] : selectedFiles}
        onClose={() => { setLinkDialogOpen(false); setRelinkFile(null); }}
        onSuccess={(msg, severity = 'success') => { setToast({ message: msg, severity }); setLinkDialogOpen(false); setRelinkFile(null); setSelectedIds(new Set()); load(); }}
      />
      <AutoTempDialog
        open={autoTempOpen} files={unmatchedInView}
        onClose={() => setAutoTempOpen(false)}
        onSuccess={(msg, severity = 'success') => { setToast({ message: msg, severity }); setAutoTempOpen(false); load(); }}
      />
      <PrintJobDialog
        open={printDialogOpen} selectedFiles={selectedFiles}
        onClose={() => setPrintDialogOpen(false)}
        onSuccess={(msg, severity = 'success') => { setToast({ message: msg, severity }); setPrintDialogOpen(false); setSelectedIds(new Set()); load(); }}
      />
      <CreateFileDialog
        open={createFileOpen}
        onClose={() => setCreateFileOpen(false)}
        onSuccess={(msg, severity = 'success') => { setToast({ message: msg, severity }); setCreateFileOpen(false); load(); }}
      />
      <DeliverDialog
        open={!!deliverFile} file={deliverFile}
        onClose={() => setDeliverFile(null)}
        onSuccess={(msg, severity = 'success') => { setToast({ message: msg, severity }); load(); }}
      />
      <Snackbar
        open={!!toast}
        autoHideDuration={toast?.severity === 'warning' || toast?.severity === 'error' ? 7000 : 4000}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'left' }}
      >
        <Alert onClose={() => setToast(null)} severity={toast?.severity || 'success'} variant="filled" sx={{ width: '100%', fontSize: 13 }}>
          {toast?.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
