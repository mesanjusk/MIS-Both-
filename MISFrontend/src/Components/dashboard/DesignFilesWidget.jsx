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
import { STAGE_LABELS } from '../../constants/orderStages';

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

// Printing (stage 6) — its files are hidden in the Archive tab, which lists
// design files only.
const PRINTING_STAGE_NUMBER = 6;

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
function loadPayablesCached() {
  if (!_designAssigneesPromise) {
    _designAssigneesPromise = fetchAssignees()
      .then((res) => res.data?.result || [])
      .catch(() => { _designAssigneesPromise = null; return []; });
  }
  return _designAssigneesPromise;
}

/**
 * Account Payable parties tagged with a capability. Nobody tagged for that
 * stage yet → the full payable list, so the picker is never a dead end.
 */
function loadAssigneesFor(capability) {
  return loadPayablesCached().then((list) => {
    const tagged = list.filter((a) => a.capabilities?.includes(capability));
    return tagged.length ? tagged : list;
  });
}

function loadDesignAssigneesCached() {
  return loadPayablesCached().then((list) => list.filter((a) => a.capabilities?.includes('design')));
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
function FileActions({ file, onRename, onConfirm, onCreatePrintJob, onEditPrintJob, onRelink, onAssign, onDeliver, onMoveToPrint, viewOnly }) {
  const [anchor, setAnchor] = useState(null);
  const [view, setView] = useState('actions'); // 'actions' | 'assign'
  const [busy, setBusy] = useState(false);
  const [assignParties, setAssignParties] = useState(null);
  const [printParties, setPrintParties] = useState(null);
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
  // Design Board → Print: one step that moves the order on, assigns it, and
  // names its Printing folder after the person picked.
  const canMoveToPrint = Boolean(
    onMoveToPrint && file.orderUuid && file.orderStage && file.orderStage !== 'print'
    && !['fitting', 'bind_packing', 'ready', 'delivered', 'paid', 'lost', 'cancelled'].includes(file.orderStage)
  );
  if (canMoveToPrint) {
    actions.push({
      key: 'movePrint',
      label: `Move Order #${file.orderNumber} to Print & assign`,
      icon: LocalPrintshopRoundedIcon,
      color: 'primary.main',
      submenu: 'print',
    });
  }
  if (file.orderUuid && file.orderStage !== 'delivered' && onDeliver) {
    actions.push({ key: 'deliver', label: `Mark Order #${file.orderNumber} as delivered`, icon: LocalShippingRoundedIcon, color: 'success.main', run: () => onDeliver(file) });
  }
  const confirmed = isConfirmedOrder(file);
  const hasAssign = !!onAssign;
  if (!actions.length && !hasAssign && !confirmed) return null;

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

  const openPrintView = (e) => {
    e.stopPropagation();
    setView('print');
    if (printParties === null) loadAssigneesFor('print').then(setPrintParties);
  };

  const pickPrintAssignee = async (e, party) => {
    e.stopPropagation();
    closeMenu();
    if (!onMoveToPrint || busy) return;
    setBusy(true);
    try { await onMoveToPrint(file, party); } finally { setBusy(false); }
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
        {view === 'print' ? (
          [
            <MenuItem key="hdr" disabled sx={{ opacity: '1 !important', fontSize: 11, fontWeight: 700, color: 'text.secondary' }}>
              Move #{file.orderNumber} to Print — assign to
            </MenuItem>,
            <Divider key="div" />,
            ...(printParties === null ? [<MenuItem key="loading" disabled>Loading…</MenuItem>] : []),
            ...(printParties?.length === 0 ? [<MenuItem key="none" disabled>No Account Payable parties yet</MenuItem>] : []),
            ...((printParties || []).map((p) => (
              <MenuItem key={p.id} onClick={(e) => pickPrintAssignee(e, p)} sx={{ fontSize: 13 }}>{p.name}</MenuItem>
            ))),
          ]
        ) : view === 'actions' ? (
          [
            // Confirmed orders say so at the top of the menu, matching the
            // green the card is filled with.
            ...(confirmed ? [
              <MenuItem key="confirmed" disabled sx={{ opacity: '1 !important', fontSize: 12, fontWeight: 700, color: 'success.dark' }}>
                <ListItemIcon><AssignmentTurnedInRoundedIcon fontSize="small" sx={{ color: 'success.main' }} /></ListItemIcon>
                Confirmed as real MIS order{file.orderNumber != null ? ` #${file.orderNumber}` : ''}
              </MenuItem>,
              <Divider key="confirmed-div" />,
            ] : []),
            ...actions.map((a) => (
              <MenuItem
                key={a.key}
                onClick={(e) => (a.submenu === 'print' ? openPrintView(e) : runAction(e, a.run))}
                sx={{ fontSize: 13 }}
              >
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
/** A file confirmed as a real MIS order — not a draft, not a temp order. */
function isConfirmedOrder(file) {
  return Boolean(file?.matched && !file?.isDraft && !file?.isTemporaryOrder);
}

function rowColors(file, checked) {
  const hasPrintJob = file.printJobNumber != null;
  const hasRealOrder = isConfirmedOrder(file);
  const isTempOrder = file.isTemporaryOrder;
  const isUnmatched = !file.matched && !file.isDraft;
  if (checked)      return { bg: 'primary.50',   bgHover: 'primary.100',   border: 'primary.main'  };
  // Confirmed orders read green first — that is the state people scan for.
  if (hasRealOrder) return { bg: '#e8f5e9',       bgHover: '#c8e6c9',       border: 'success.300'   };
  if (hasPrintJob)  return { bg: '#f3e5f5',       bgHover: '#e1bee7',       border: '#ce93d8'       };
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
function FileListRow({ file, checked, onToggle, onRename, onConfirm, onCreatePrintJob, onEditPrintJob, onRelink, onAssign, onDeliver, onMoveToPrint, viewOnly, hideStageChip }) {
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
        <FileActions file={file} onRename={onRename} onConfirm={onConfirm} onCreatePrintJob={onCreatePrintJob} onEditPrintJob={onEditPrintJob} onRelink={onRelink} onAssign={onAssign} onDeliver={onDeliver} onMoveToPrint={onMoveToPrint} viewOnly={viewOnly} />
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
function FileCard({ file, checked, onToggle, onRename, onConfirm, onCreatePrintJob, onEditPrintJob, onRelink, onAssign, onDeliver, onMoveToPrint, viewOnly, hideStageChip }) {
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
          <FileActions file={file} onRename={onRename} onConfirm={onConfirm} onCreatePrintJob={onCreatePrintJob} onEditPrintJob={onEditPrintJob} onRelink={onRelink} onAssign={onAssign} onDeliver={onDeliver} onMoveToPrint={onMoveToPrint} viewOnly={viewOnly} />
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
  const [items, setItems] = useState([{ itemName: '', qty: 1, rate: '', amount: '', remark: '' }]);
  const [extraCharges, setExtraCharges] = useState([]);
  const [itemOptions, setItemOptions] = useState([]);
  const [stage, setStage] = useState(fromArchive ? 'print' : 'new_design');
  const [assigneeId, setAssigneeId] = useState('');
  const [assignees, setAssignees] = useState([]);
  const [loadingData, setLoadingData] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) {
      setCustomer(null); setCustomerInput(''); setMobileNumber('');
      setOrderMode('note'); setError(''); setExtraCharges([]); setAssigneeId('');
      setItems([{ itemName: '', qty: 1, rate: '', amount: '', remark: '' }]);
      return;
    }
    setStage(fromArchive ? 'print' : 'new_design');
    setNoteText((file?.fileName || '').replace(/\.[^.]+$/, ''));
    setLoadingData(true);
    Promise.all([
      axios.get('/api/customers/GetCustomerList'),
      axios.get('/api/items/GetItemList'),
      fetchAssignees().catch(() => ({ data: { result: [] } })),
    ])
      .then(([custRes, itemRes, assigneeRes]) => {
        setCustomers(custRes.data?.result || []);
        setItemOptions(itemRes.data?.result || []);
        // Account Payable parties only — same list the assign menu uses.
        setAssignees((assigneeRes.data?.result || []).filter((a) => a.type === 'payable'));
      })
      .catch(() => {})
      .finally(() => setLoadingData(false));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const addItemRow = () => setItems((prev) => [...prev, { itemName: '', qty: 1, rate: '', amount: '', remark: '' }]);
  const removeItemRow = (i) => setItems((prev) => prev.filter((_, idx) => idx !== i));
  const sortItemsAZ = () => setItems((prev) => [...prev].sort((a, b) =>
    String(a.itemName || '').localeCompare(String(b.itemName || ''), undefined, { sensitivity: 'base' })
  ));
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

  const updateCharge = (i, field, value) =>
    setExtraCharges((prev) => prev.map((c, idx) => (idx === i ? { ...c, [field]: value } : c)));

  const itemsTotal = items.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
  const chargesTotal = extraCharges.reduce((s, c) => s + (parseFloat(c.amount) || 0), 0);
  const grandTotal = itemsTotal + chargesTotal;

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
          ? items
              .filter((r) => r.itemName.trim())
              .map((r) => ({
                itemName: r.itemName,
                qty: parseFloat(r.qty) || 1,
                rate: parseFloat(r.rate) || 0,
                amount: parseFloat(r.amount) || 0,
                remark: r.remark || '',
              }))
          : [],
        extraCharges: isDetailed
          ? extraCharges
              .filter((c) => String(c.label || '').trim() && parseFloat(c.amount) > 0)
              .map((c) => ({ label: c.label.trim(), amount: parseFloat(c.amount) }))
          : [],
        stage,
        assigneeId: assigneeId || null,
        fromArchive,
      });
      const folderNote = res.data?.printFolderName ? ` · Printing/${res.data.printFolderName}` : '';
      onSuccess(`Order #${res.data.orderNumber} created — "${file.fileName}" confirmed${folderNote}`, 'success');
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

          {/* Stage + assignee — the assignee also names the Printing folder
              this order gets ("793 Anand"). */}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              select label="Stage" size="small" value={stage}
              onChange={(e) => setStage(e.target.value)} disabled={submitting}
              sx={{ flex: 1 }}
            >
              {Object.entries(STAGE_LABELS).map(([value, label]) => (
                <MenuItem key={value} value={value} sx={{ fontSize: 13 }}>{label}</MenuItem>
              ))}
            </TextField>
            <TextField
              select label="Assign to" size="small" value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
              disabled={submitting || loadingData}
              helperText="Account Payable parties · names the Printing folder"
              sx={{ flex: 1 }}
            >
              <MenuItem value="" sx={{ fontSize: 13, fontStyle: 'italic' }}>Unassigned</MenuItem>
              {assignees.map((a) => (
                <MenuItem key={a.id} value={a.id} sx={{ fontSize: 13 }}>{a.name}</MenuItem>
              ))}
            </TextField>
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
            /* Same shape as the delivery report's Create Invoice form: one
               row per line (item · qty · rate · amount · delete) with the
               line remark under it, then additional charges and a grand
               total. */
            <Box>
              {items.map((row, i) => (
                <Grid container spacing={1} key={i} alignItems="center" sx={{ mb: 1 }}>
                  <Grid item xs={12} md={5}>
                    <Autocomplete
                      freeSolo
                      options={itemOptions}
                      value={row.itemName}
                      onChange={(_, v) => updateItem(i, 'itemName', typeof v === 'string' ? v : v?.Item_name || '')}
                      onInputChange={(_, v) => updateItem(i, 'itemName', v)}
                      getOptionLabel={(o) => (typeof o === 'string' ? o : o?.Item_name || '')}
                      disabled={submitting}
                      renderInput={(params) => (
                        <TextField {...params} size="small" placeholder="Select item" />
                      )}
                    />
                  </Grid>
                  <Grid item xs={4} md={2}>
                    <TextField size="small" type="number" placeholder="Qty" fullWidth value={row.qty}
                      onChange={(e) => updateItem(i, 'qty', e.target.value)}
                      disabled={submitting} inputProps={{ min: 1 }}
                    />
                  </Grid>
                  <Grid item xs={4} md={2}>
                    <TextField size="small" type="number" placeholder="Rate" fullWidth value={row.rate}
                      onChange={(e) => updateItem(i, 'rate', e.target.value)}
                      disabled={submitting} inputProps={{ min: 0 }}
                    />
                  </Grid>
                  <Grid item xs={3} md={2}>
                    <Box sx={{ px: 1, py: 0.9, bgcolor: 'action.hover', borderRadius: 1, fontWeight: 700, fontSize: 13, textAlign: 'right' }}>
                      ₹{Number(row.amount || 0).toLocaleString('en-IN')}
                    </Box>
                  </Grid>
                  <Grid item xs={1} md={1}>
                    <IconButton size="small" onClick={() => removeItemRow(i)}
                      disabled={submitting || items.length === 1}
                      sx={{ color: 'error.main' }}
                    >
                      <DeleteRoundedIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Grid>
                  <Grid item xs={12}>
                    <TextField size="small" fullWidth placeholder="Remark (this line)"
                      value={row.remark || ''} onChange={(e) => updateItem(i, 'remark', e.target.value)}
                      disabled={submitting}
                      inputProps={{ style: { fontSize: 12 } }}
                    />
                  </Grid>
                </Grid>
              ))}

              <Stack direction="row" spacing={1} sx={{ mb: 1.5 }}>
                <Button size="small" variant="contained" startIcon={<AddRoundedIcon />}
                  onClick={addItemRow} disabled={submitting}
                >
                  Add Item
                </Button>
                <Button size="small" variant="outlined" onClick={sortItemsAZ}
                  disabled={submitting || items.length < 2}
                >
                  Sort A→Z
                </Button>
              </Stack>

              <Divider />

              <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mt: 1.5, mb: 0.5 }}>
                <Typography variant="body2" fontWeight={700}>Additional Charges</Typography>
                <Button size="small" onClick={() => setExtraCharges((prev) => [...prev, { label: '', amount: '' }])}
                  disabled={submitting}
                >
                  + Add
                </Button>
              </Stack>
              {extraCharges.length === 0 ? (
                <Typography variant="caption" color="text.disabled" sx={{ fontStyle: 'italic' }}>
                  No extra charges (e.g. freight, packing)
                </Typography>
              ) : extraCharges.map((c, i) => (
                <Stack direction="row" spacing={1} alignItems="center" key={i} sx={{ mb: 0.75 }}>
                  <TextField size="small" placeholder="Label (e.g. Freight)" value={c.label}
                    onChange={(e) => updateCharge(i, 'label', e.target.value)}
                    disabled={submitting} sx={{ flex: 1 }}
                  />
                  <TextField size="small" type="number" placeholder="Amount" value={c.amount}
                    onChange={(e) => updateCharge(i, 'amount', e.target.value)}
                    disabled={submitting} inputProps={{ min: 0 }} sx={{ width: 120 }}
                  />
                  <IconButton size="small" sx={{ color: 'error.main' }} disabled={submitting}
                    onClick={() => setExtraCharges((prev) => prev.filter((_, idx) => idx !== i))}
                  >
                    <DeleteRoundedIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </Stack>
              ))}

              <Divider sx={{ mt: 1.5 }} />
              <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ pt: 1.5 }}>
                <Typography variant="body2" color="text.secondary">Grand Total</Typography>
                <Typography variant="h6" fontWeight={800} color="primary.main">
                  ₹{grandTotal.toLocaleString('en-IN')}
                </Typography>
              </Stack>
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

  const loadArchive = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await axios.get('/api/design-files/scan-archive');
      // Printing folders are hidden here for now — this tab lists design
      // files only.
      const data = res.data || {};
      const dates = (data.dates || [])
        .map((d) => {
          const sections = (d.sections || []).filter((sec) => sec.stageNumber !== PRINTING_STAGE_NUMBER);
          return { ...d, sections, fileCount: sections.reduce((n, sec) => n + (sec.files?.length || 0), 0) };
        })
        .filter((d) => d.fileCount > 0);
      setArchiveData({ ...data, dates });
      setLoaded(true);
      setSelectedMap({});
    } catch (err) {
      setError(err?.response?.data?.message || err.message || 'Could not load archive.');
    } finally { setLoading(false); }
  }, []);

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
  const { finalByDate } = (() => {
    const dates = archiveData?.dates || [];
    const fbd = dates.map((d) => ({
      dateName: d.dateName,
      dateFolderId: d.dateFolderId,
      files: d.sections.flatMap((s) => s.files.filter((f) => f.stageNumber === 5)),
    })).filter((d) => d.files.length > 0);
    return { finalByDate: fbd };
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
            {/* Printing files are hidden here for now — design files only. */}
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

// ─── Renumber design files ────────────────────────────────────────────────────
/**
 * Renumbers the archive's Final files to "<orderNumber> - <name>" and creates
 * a folder of the same number in that date's Printing folder. Always previews
 * first (server-side dry run) — nothing in Drive changes until Apply.
 */
function RenumberDialog({ open, onClose, onSuccess }) {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) { setReport(null); setError(''); }
  }, [open]);

  const run = async (dryRun) => {
    if (dryRun) setLoading(true); else setApplying(true);
    setError('');
    try {
      const res = await axios.post('/api/design-files/renumber', { dryRun });
      setReport(res.data);
      if (!dryRun) {
        const renamed = res.data?.summary?.renamed || 0;
        const folders = res.data?.summary?.folders?.created || 0;
        onSuccess(
          `${renamed} file${renamed === 1 ? '' : 's'} renumbered · ${folders} Printing folder${folders === 1 ? '' : 's'} created`,
          renamed || folders ? 'success' : 'info'
        );
      }
    } catch (err) {
      setError(err?.response?.data?.message || err.message || 'Renumber failed');
    } finally {
      setLoading(false); setApplying(false);
    }
  };

  const summary = report?.summary || {};
  const folderCounts = summary.folders || {};
  const rows = report?.files || [];
  const pendingRenames = rows.filter((r) => r.status === 'pending');
  const pendingFolders = rows.filter((r) => r.folderStatus === 'pending');
  const failed = rows.filter((r) => r.status === 'failed' || r.folderStatus === 'failed');
  const noOrder = rows.filter((r) => r.status === 'no-order');
  const todo = pendingRenames.length
    + noOrder.length
    + new Set(pendingFolders.map((r) => r.orderNumber)).size;
  const visible = [...new Map(
    [...failed, ...pendingRenames, ...noOrder, ...pendingFolders].map((r) => [r.fileId, r])
  ).values()];

  const exportReport = () => {
    const head = ['Type', 'Rename', 'Folder', 'Order', 'Location', 'Current name', 'New name', 'Error'];
    const body = rows.map((r) => [
      r.kind || 'file', r.status, r.folderStatus || '', r.orderNumber ?? '', r.location || '',
      r.fileName || '', r.newName || '', r.error || r.folderError || '',
    ]);
    const csv = [head, ...body]
      .map((cols) => cols.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    triggerDownload(csv, `design-renumber-${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv');
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ fontSize: 15, fontWeight: 700 }}>Renumber Final files</DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          Goes through every <strong>Final</strong> folder in the archive, renames what sits{' '}
          <strong>directly</strong> in it to <strong>&lt;order number&gt; - &lt;name&gt;</strong>, and
          creates a folder with that same number in the <strong>Printing</strong> folder of the same
          date. A job folder inside Final is renamed as a folder — the working files inside it
          (photos, name lists, scans) are never touched.
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1.5 }}>
          e.g. <code>04 April 2026 / 01.04.2026 / Final / 153 - ….cdr</code> →{' '}
          <code>04 April 2026 / 01.04.2026 / Printing / 153</code>. A file with no order at all
          gets a new temporary order (dated from its own date folder) so it can be numbered too.
          Printing files and the daily folders are never touched.
        </Typography>

        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }} flexWrap="wrap">
          <Button
            size="small" variant="outlined" onClick={() => run(true)} disabled={loading || applying}
            startIcon={loading ? <CircularProgress size={12} /> : <TagRoundedIcon sx={{ fontSize: '14px !important' }} />}
          >
            Preview
          </Button>
          {rows.length > 0 && (
            <Button size="small" onClick={exportReport} startIcon={<FileDownloadRoundedIcon sx={{ fontSize: '14px !important' }} />}>
              CSV
            </Button>
          )}
        </Stack>

        {error && <Alert severity="error" sx={{ mb: 1.5 }}>{error}</Alert>}
        {(loading || applying) && <LinearProgress sx={{ mb: 1.5, height: 2 }} />}

        {report && (
          <>
            <Stack direction="row" spacing={0.75} sx={{ mb: 1.5 }} flexWrap="wrap" useFlexGap>
              <Chip size="small" label={`${summary.total || 0} Final files`} />
              {summary.pending > 0 && <Chip size="small" color="primary" label={`${summary.pending} to rename`} />}
              {summary.renamed > 0 && <Chip size="small" color="success" label={`${summary.renamed} renamed`} />}
              {summary['already-ok'] > 0 && <Chip size="small" variant="outlined" label={`${summary['already-ok']} already numbered`} />}
              {summary['no-order'] > 0 && (
                <Chip size="small" color="warning" label={`${summary['no-order']} need a new order`} />
              )}
              {summary.ordersCreated > 0 && (
                <Chip size="small" color="success" label={`${summary.ordersCreated} orders created`} />
              )}
              {summary.jobFolders > 0 && (
                <Chip size="small" variant="outlined" label={`${summary.jobFolders} job folders`} />
              )}
              {folderCounts.pending > 0 && <Chip size="small" color="primary" variant="outlined" label={`${new Set(pendingFolders.map((r) => r.orderNumber)).size} folders to create`} />}
              {folderCounts.created > 0 && <Chip size="small" color="success" variant="outlined" label={`${folderCounts.created} folders created`} />}
              {folderCounts.exists > 0 && <Chip size="small" variant="outlined" label={`${folderCounts.exists} folders already there`} />}
              {(summary.failed > 0 || folderCounts.failed > 0) && (
                <Chip size="small" color="error" label={`${(summary.failed || 0) + (folderCounts.failed || 0)} failed`} />
              )}
            </Stack>

            {/* What was actually walked — one row per month folder, so a
                month or a date folder that was missed is visible at a glance. */}
            {report.scan?.months?.length > 0 && (
              <Box sx={{ mb: 1.5 }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontSize: 11, fontWeight: 700 }}>Month folder</TableCell>
                      <TableCell sx={{ fontSize: 11, fontWeight: 700 }} align="right">Dates</TableCell>
                      <TableCell sx={{ fontSize: 11, fontWeight: 700 }} align="right">Final folders</TableCell>
                      <TableCell sx={{ fontSize: 11, fontWeight: 700 }} align="right">Files</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {report.scan.months.map((m) => (
                      <TableRow key={m.name}>
                        <TableCell sx={{ fontSize: 11 }}>
                          {m.name}
                          {/* When a month yields nothing, show what its child
                              folders are actually called — that is usually the
                              whole explanation. */}
                          {m.finalFolders === 0 && m.sampleFolders?.length > 0 && (
                            <Typography variant="caption" sx={{ display: 'block', color: 'warning.main', fontSize: 10 }}>
                              contains: {m.sampleFolders.join(', ')}
                              {m.dateFolders > m.sampleFolders.length ? ' …' : ''}
                            </Typography>
                          )}
                          {m.emptyDates?.length > 0 && (
                            <Typography variant="caption" sx={{ display: 'block', color: 'text.disabled', fontSize: 10 }}>
                              empty Final: {m.emptyDates.slice(0, 10).join(', ')}
                              {m.emptyDates.length > 10 ? ` … (+${m.emptyDates.length - 10})` : ''}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell sx={{ fontSize: 11 }} align="right">{m.dateFolders}</TableCell>
                        <TableCell sx={{ fontSize: 11, color: m.finalFolders === 0 ? 'warning.main' : 'inherit' }} align="right">{m.finalFolders}</TableCell>
                        <TableCell sx={{ fontSize: 11, fontWeight: 700 }} align="right">{m.files}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {report.scan.datesWithoutFinal?.length > 0 && (
                  <Alert severity="warning" sx={{ mt: 1, fontSize: 11, py: 0.25 }}>
                    {report.scan.datesWithoutFinal.length} date folder
                    {report.scan.datesWithoutFinal.length === 1 ? '' : 's'} have no Final folder:{' '}
                    {report.scan.datesWithoutFinal.slice(0, 8).join(', ')}
                    {report.scan.datesWithoutFinal.length > 8 ? ' …' : ''}
                  </Alert>
                )}
              </Box>
            )}

            {visible.length > 0 && (
              <Box sx={{ maxHeight: 320, overflowY: 'auto' }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontSize: 11, fontWeight: 700 }}>Date folder</TableCell>
                      <TableCell sx={{ fontSize: 11, fontWeight: 700 }}>Current name</TableCell>
                      <TableCell sx={{ fontSize: 11, fontWeight: 700 }}>New name</TableCell>
                      <TableCell sx={{ fontSize: 11, fontWeight: 700 }}>Printing folder</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {visible.slice(0, 200).map((r) => (
                      <TableRow key={r.fileId}>
                        <TableCell sx={{ fontSize: 11, color: 'text.secondary' }}>{r.dateFolderName}</TableCell>
                        <TableCell sx={{ fontSize: 11 }}>
                          {r.kind === 'folder' && (
                            <FolderOpenRoundedIcon sx={{ fontSize: 12, mr: 0.4, verticalAlign: 'middle', color: 'warning.main' }} />
                          )}
                          {r.fileName}
                        </TableCell>
                        <TableCell sx={{ fontSize: 11, color: r.status === 'failed' ? 'error.main' : 'success.main' }}>
                          {r.status === 'failed' ? (r.error || 'Rename failed')
                            : r.status === 'no-order' ? 'new order number'
                            : r.status === 'pending' || r.status === 'renamed' ? r.newName : '—'}
                        </TableCell>
                        <TableCell sx={{ fontSize: 11, color: r.folderStatus === 'failed' ? 'error.main' : 'text.secondary' }}>
                          {r.folderStatus === 'failed' ? (r.folderError || 'Failed')
                            : r.folderStatus === 'exists' ? 'already there'
                            : r.orderNumber != null ? `Printing/${r.orderNumber}` : '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {visible.length > 200 && (
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', p: 1 }}>
                    Showing first 200 — download the CSV for the full list.
                  </Typography>
                )}
              </Box>
            )}

            {report.dryRun && todo === 0 && !error && (
              <Alert severity="success">
                Nothing to do — every Final file is numbered and has its Printing folder.
              </Alert>
            )}
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button size="small" onClick={onClose}>Close</Button>
        <Button
          size="small" variant="contained" color="warning"
          disabled={!report?.dryRun || todo === 0 || applying || loading}
          onClick={() => run(false)}
          startIcon={applying ? <CircularProgress size={12} color="inherit" /> : null}
        >
          Apply ({todo})
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function DesignBoardPanel({ files, onRename, onAssign, onRelink, onDeliver, onConfirm, onCreatePrintJob, onEditPrintJob, onMoveToPrint }) {
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
                    onMoveToPrint={onMoveToPrint}
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
  const { userName, isAdmin } = useAuth();
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
  const [singlePrintFile, setSinglePrintFile] = useState(null);
  const [createFileOpen, setCreateFileOpen] = useState(false);
  const [renumberOpen, setRenumberOpen] = useState(false);
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
    } catch (err) {
      const msg = err?.response?.data?.message || err.message || '';
      if (err?.response?.data?.reconnectRequired) { setReconnectRequired(true); return; }
      if (err?.response?.status === 400) { setConfigMissing(true); return; }
      setError(msg || 'Could not load Drive files.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // No print job is ever created automatically — the row action opens the
  // print bill dialog so a real vendor and amount are always chosen.
  const handleCreatePrintJob = useCallback((file) => {
    setSinglePrintFile(file);
  }, []);

  // Design Board → Print in one step: stage moves on, the person is assigned,
  // and their name goes on the order's Printing folder.
  const handleMoveToPrint = useCallback(async (file, party) => {
    try {
      const res = await axios.post('/api/design-files/move-to-print', {
        fileId: file.fileId,
        fileName: file.fileName,
        orderUuid: file.orderUuid,
        orderNumber: file.orderNumber,
        assigneeId: party.id,
      });
      const folder = res.data?.printFolderName ? ` · Printing/${res.data.printFolderName}` : '';
      setToast({
        message: `Order #${res.data?.orderNumber ?? file.orderNumber} moved to Print · ${res.data?.assignedToName || party.name}${folder}`,
        severity: 'success',
      });
      load();
    } catch (err) {
      setToast({ message: err?.response?.data?.message || err.message || 'Could not move to Print', severity: 'error' });
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

        {/* Renumber design files (admin) */}
        {isAdmin && (
          <Tooltip title="Renumber Final files and create their Printing folders">
            <IconButton size="small" onClick={() => setRenumberOpen(true)} sx={{ p: 0.4 }}>
              <TagRoundedIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
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
              onMoveToPrint={handleMoveToPrint}
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
                      onMoveToPrint={!activeTabDef.viewOnly ? handleMoveToPrint : undefined}
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
                    onMoveToPrint={!activeTabDef.viewOnly ? handleMoveToPrint : undefined}
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
        open={printDialogOpen || !!singlePrintFile}
        selectedFiles={singlePrintFile ? [singlePrintFile] : selectedFiles}
        onClose={() => { setPrintDialogOpen(false); setSinglePrintFile(null); }}
        onSuccess={(msg, severity = 'success') => { setToast({ message: msg, severity }); setPrintDialogOpen(false); setSinglePrintFile(null); setSelectedIds(new Set()); load(); }}
      />
      <RenumberDialog
        open={renumberOpen}
        onClose={() => { setRenumberOpen(false); load(); }}
        onSuccess={(msg, severity = 'success') => setToast({ message: msg, severity })}
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
