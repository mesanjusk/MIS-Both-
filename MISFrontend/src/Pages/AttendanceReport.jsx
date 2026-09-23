import React, { useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { useNavigate } from "react-router-dom";
import {
  fetchUserNames,
  fetchAttendanceList,
  processAttendanceDataRange,
} from "../utils/attendanceUtils";

const indiaToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

const isMarked = (value) => Boolean(value && value !== "N/A" && value !== "—");

const isSundayISO = (iso) => {
  const [year, month, day] = String(iso || "").split("-").map(Number);
  if (!year || !month || !day) return false;
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay() === 0;
};

const monthRange = (monthValue) => {
  const [year, month] = String(monthValue || "").split("-").map(Number);
  if (!year || !month) return { start: "", end: "", label: "" };
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const end = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  const label = new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  return { start, end, label };
};

const countWorkingDays = (startISO, endISO) => {
  if (!startISO || !endISO || endISO < startISO) return 0;
  const [sy, sm, sd] = startISO.split("-").map(Number);
  const [ey, em, ed] = endISO.split("-").map(Number);
  const cursor = new Date(Date.UTC(sy, sm - 1, sd));
  const last = new Date(Date.UTC(ey, em - 1, ed));
  let count = 0;
  while (cursor <= last) {
    if (cursor.getUTCDay() !== 0) count += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count;
};

const fmtDate = (iso) => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
};

export default function AttendanceReport() {
  const navigate = useNavigate();
  const today = indiaToday();
  const [selectedMonth, setSelectedMonth] = useState(today.slice(0, 7));
  const [selectedUser, setSelectedUser] = useState("");
  const [userLookup, setUserLookup] = useState({});
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);

  const loggedInUserName = localStorage.getItem("user_name") || localStorage.getItem("User_name") || "";
  const userGroup = localStorage.getItem("User_group") || "";
  const isAdmin = userGroup === "Admin User" || userGroup === "Owner";

  useEffect(() => {
    if (!isAdmin && loggedInUserName) setSelectedUser(loggedInUserName);
  }, [isAdmin, loggedInUserName]);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      try {
        const [lookup, rawRecords] = await Promise.all([
          fetchUserNames(),
          fetchAttendanceList(),
        ]);
        if (!active) return;
        setUserLookup(lookup || {});
        setRecords(Array.isArray(rawRecords) ? rawRecords : []);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  const memberOptions = useMemo(
    () => Object.values(userLookup)
      .filter((u) => u?.name)
      .sort((a, b) => String(a.name).localeCompare(String(b.name))),
    [userLookup]
  );

  const range = useMemo(() => monthRange(selectedMonth), [selectedMonth]);
  const effectiveEnd = useMemo(() => {
    if (!range.end) return "";
    return range.start <= today && range.end >= today ? today : range.end;
  }, [range, today]);

  const monthAttendance = useMemo(() => {
    if (!range.start || !effectiveEnd) return [];
    return processAttendanceDataRange(
      records,
      userLookup,
      range.start,
      effectiveEnd,
      !isAdmin ? loggedInUserName || null : null
    );
  }, [records, userLookup, range, effectiveEnd, isAdmin, loggedInUserName]);

  const workingDays = useMemo(
    () => countWorkingDays(range.start, effectiveEnd),
    [range.start, effectiveEnd]
  );

  const summaryRows = useMemo(() => {
    const presentDays = new Map();
    monthAttendance.forEach((row) => {
      if (!row?.User_uuid || !row?.DateISO || isSundayISO(row.DateISO) || !isMarked(row.In)) return;
      if (!presentDays.has(row.User_uuid)) presentDays.set(row.User_uuid, new Set());
      presentDays.get(row.User_uuid).add(row.DateISO);
    });

    return memberOptions
      .filter((member) => {
        if (!isAdmin) return member.name === loggedInUserName;
        return !selectedUser || member.name === selectedUser;
      })
      .map((member) => {
        const present = presentDays.get(member.uuid)?.size || 0;
        const absent = Math.max(0, workingDays - present);
        const attendancePercent = workingDays ? (present / workingDays) * 100 : 0;
        return { ...member, present, absent, attendancePercent };
      });
  }, [monthAttendance, memberOptions, isAdmin, loggedInUserName, selectedUser, workingDays]);

  const detailRows = useMemo(() => {
    return monthAttendance
      .filter((row) => !selectedUser || row.User_name === selectedUser)
      .sort((a, b) => {
        const dateCompare = String(b.DateISO).localeCompare(String(a.DateISO));
        return dateCompare || String(a.User_name).localeCompare(String(b.User_name));
      });
  }, [monthAttendance, selectedUser]);

  return (
    <Box sx={{ p: { xs: 1, md: 2 }, maxWidth: 1400, mx: "auto" }}>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1} alignItems={{ xs: "stretch", sm: "center" }} sx={{ mb: 2 }}>
        <Button variant="outlined" onClick={() => navigate(-1)}>← Back</Button>
        <Box sx={{ flex: 1 }}>
          <Typography variant="h5" fontWeight={900}>Month-wise Attendance Report</Typography>
          <Typography variant="body2" color="text.secondary">
            Sunday is treated as the official weekly holiday. Duplicate check-ins count only once per employee per India calendar date.
          </Typography>
        </Box>
      </Stack>

      <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 3, mb: 2 }}>
        <Stack direction={{ xs: "column", md: "row" }} spacing={1.25} alignItems={{ xs: "stretch", md: "center" }}>
          <TextField
            type="month"
            size="small"
            label="Month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ minWidth: 190 }}
          />

          <TextField
            select
            size="small"
            label="Member"
            value={isAdmin ? selectedUser : loggedInUserName}
            onChange={(e) => setSelectedUser(e.target.value)}
            disabled={!isAdmin}
            sx={{ minWidth: 240 }}
          >
            {isAdmin && <MenuItem value="">All members</MenuItem>}
            {memberOptions.map((member) => (
              <MenuItem key={member.uuid} value={member.name}>{member.name}</MenuItem>
            ))}
          </TextField>

          <Chip label={range.label || "Selected month"} variant="outlined" />
          <Chip label={`${workingDays} working days`} color="primary" variant="outlined" />
          {range.end && effectiveEnd !== range.end ? <Chip label={`Through ${fmtDate(effectiveEnd)}`} color="info" variant="outlined" /> : null}
        </Stack>
      </Paper>

      <Paper variant="outlined" sx={{ borderRadius: 3, overflow: "hidden", mb: 2 }}>
        <Box sx={{ px: 2, py: 1.25, borderBottom: "1px solid", borderColor: "divider" }}>
          <Typography variant="subtitle1" fontWeight={800}>Monthly Summary</Typography>
          <Typography variant="caption" color="text.secondary">
            Present = at least one valid check-in on a non-Sunday working day.
          </Typography>
        </Box>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>Member</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>Working Days</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>Present</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>Absent</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>Attendance</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={5} align="center" sx={{ py: 4 }}><CircularProgress size={24} /></TableCell></TableRow>
              ) : summaryRows.length === 0 ? (
                <TableRow><TableCell colSpan={5} align="center" sx={{ py: 4, color: "text.secondary" }}>No staff found.</TableCell></TableRow>
              ) : summaryRows.map((row) => (
                <TableRow key={row.uuid} hover>
                  <TableCell>
                    <Typography variant="body2" fontWeight={700}>{row.name}</Typography>
                    <Typography variant="caption" color="text.secondary">{row.group || "—"}</Typography>
                  </TableCell>
                  <TableCell align="right">{workingDays}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 800, color: "success.dark" }}>{row.present}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 800, color: "error.dark" }}>{row.absent}</TableCell>
                  <TableCell align="right">
                    <Chip
                      size="small"
                      variant="outlined"
                      label={`${row.attendancePercent.toFixed(1)}%`}
                      color={row.attendancePercent >= 90 ? "success" : row.attendancePercent >= 75 ? "warning" : "error"}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Paper variant="outlined" sx={{ borderRadius: 3, overflow: "hidden" }}>
        <Box sx={{ px: 2, py: 1.25, borderBottom: "1px solid", borderColor: "divider" }}>
          <Typography variant="subtitle1" fontWeight={800}>Daily Attendance Detail</Typography>
          <Typography variant="caption" color="text.secondary">
            {detailRows.length} unique employee-day attendance records for {range.label || "the selected month"}.
          </Typography>
        </Box>
        <TableContainer sx={{ maxHeight: 520 }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>Date</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Member</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>In</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Break</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Start</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Out</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>Hours</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Source</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={8} align="center" sx={{ py: 4 }}><CircularProgress size={24} /></TableCell></TableRow>
              ) : detailRows.length === 0 ? (
                <TableRow><TableCell colSpan={8} align="center" sx={{ py: 4, color: "text.secondary" }}>No attendance records for this month.</TableCell></TableRow>
              ) : detailRows.map((row) => (
                <TableRow key={`${row.User_uuid}-${row.DateISO}`} hover>
                  <TableCell sx={{ whiteSpace: "nowrap" }}>{fmtDate(row.DateISO)}</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>{row.User_name}</TableCell>
                  <TableCell>{row.In || "—"}</TableCell>
                  <TableCell>{row.Break || "—"}</TableCell>
                  <TableCell>{row.Start || "—"}</TableCell>
                  <TableCell>{row.Out || "—"}</TableCell>
                  <TableCell align="right">{Number(row.TotalHours || 0).toFixed(2)}</TableCell>
                  <TableCell>{row.Source || "Dashboard"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  );
}
