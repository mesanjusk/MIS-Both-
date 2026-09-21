import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Box,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  IconButton,
  InputAdornment,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import GroupsRoundedIcon from "@mui/icons-material/GroupsRounded";
import LoginRoundedIcon from "@mui/icons-material/LoginRounded";
import LogoutRoundedIcon from "@mui/icons-material/LogoutRounded";
import WhatsAppIcon from "@mui/icons-material/WhatsApp";
import DeliveryDateSidebar from "../Components/reports/DeliveryDateSidebar";
import {
  fetchUserNames,
  fetchAttendanceList,
  processAttendanceDataRange,
} from "../utils/attendanceUtils";

const todayISO = new Date().toISOString().slice(0, 10);
const fmtDate = (value) => {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};

function TimeBadge({ value }) {
  const marked = value && value !== "—" && value !== "N/A";
  return (
    <Chip
      size="small"
      label={marked ? value : "—"}
      color={marked ? "success" : "default"}
      variant="outlined"
      sx={{ height: 20, fontSize: 10.5, fontWeight: 700 }}
    />
  );
}

function SourceBadge({ source }) {
  const isWhatsApp = source === "WhatsApp";
  return (
    <Chip
      size="small"
      icon={isWhatsApp ? <WhatsAppIcon sx={{ fontSize: "13px !important" }} /> : undefined}
      label={isWhatsApp ? "WhatsApp" : "Dashboard"}
      color={isWhatsApp ? "success" : "default"}
      variant="outlined"
      sx={{ height: 20, fontSize: 10.5, fontWeight: 700 }}
    />
  );
}

export default function AllAttandance() {
  const [loggedInUser, setLoggedInUser] = useState(null);
  const [records, setRecords] = useState([]);
  const [userLookup, setUserLookup] = useState({});
  const [selectedDate, setSelectedDate] = useState(todayISO);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  const navigate = useNavigate();
  const location = useLocation();

  const loadAttendance = async () => {
    try {
      setLoading(true);
      const [lookup, rawRecords] = await Promise.all([
        fetchUserNames(),
        fetchAttendanceList(),
      ]);
      setUserLookup(lookup || {});
      setRecords(Array.isArray(rawRecords) ? rawRecords : []);
    } catch (e) {
      console.error("Error loading attendance:", e);
      setUserLookup({});
      setRecords([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const userNameFromState = location.state?.id;
    const user = userNameFromState || localStorage.getItem("User_name");
    setLoggedInUser(user);
    if (user) loadAttendance();
    else navigate("/");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  useEffect(() => {
    if (!loggedInUser) return undefined;
    const intervalId = setInterval(loadAttendance, 30000);
    return () => clearInterval(intervalId);
  }, [loggedInUser]);

  const allAttendance = useMemo(
    () => processAttendanceDataRange(records, userLookup, null, null),
    [records, userLookup]
  );

  const availableDates = useMemo(() => {
    const set = new Set(allAttendance.map((r) => r.DateISO).filter(Boolean));
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [allAttendance]);

  const dateCountMap = useMemo(() => {
    const map = {};
    allAttendance.forEach((r) => {
      if (r.DateISO) map[r.DateISO] = (map[r.DateISO] || 0) + 1;
    });
    return map;
  }, [allAttendance]);

  const attendance = useMemo(() => {
    if (!selectedDate) return allAttendance;
    return allAttendance.filter((r) => r.DateISO === selectedDate);
  }, [allAttendance, selectedDate]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return attendance;
    return attendance.filter((r) =>
      String(r.User_name || "").toLowerCase().includes(q)
    );
  }, [attendance, search]);

  const stats = useMemo(() => ({
    members: attendance.length,
    checkedIn: attendance.filter((r) => r.In && r.In !== "—" && r.In !== "N/A").length,
    checkedOut: attendance.filter((r) => r.Out && r.Out !== "—" && r.Out !== "N/A").length,
    whatsapp: attendance.filter((r) => r.Source === "WhatsApp").length,
  }), [attendance]);

  const selectedLabel = selectedDate ? fmtDate(selectedDate) : "All Dates";

  return (
    <Box sx={{ display: "flex", minHeight: "80vh", gap: 2, p: { xs: 1, md: 2 } }}>
      <DeliveryDateSidebar
        title="Attendance"
        selectedDate={selectedDate}
        onSelectDate={setSelectedDate}
        availableDates={availableDates}
        dateCountMap={dateCountMap}
        allCount={allAttendance.length}
        loading={loading}
        countLabel="entries"
        formatDate={fmtDate}
      />

      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={1}
          alignItems={{ xs: "stretch", sm: "center" }}
          sx={{ mb: 1.5 }}
        >
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="h5" fontWeight={900} noWrap>Attendance</Typography>
            <Typography variant="body2" color="text.secondary">
              {selectedLabel} · {attendance.length} entries
            </Typography>
          </Box>

          <TextField
            size="small"
            placeholder="Search member"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            sx={{ width: { xs: "100%", sm: 180 } }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchRoundedIcon fontSize="small" />
                </InputAdornment>
              ),
            }}
          />

          <Tooltip title="Refresh attendance">
            <IconButton size="small" onClick={loadAttendance} disabled={loading}>
              {loading ? <CircularProgress size={17} /> : <RefreshRoundedIcon fontSize="small" />}
            </IconButton>
          </Tooltip>
        </Stack>

        <TextField
          type="date"
          size="small"
          value={selectedDate || ""}
          onChange={(e) => setSelectedDate(e.target.value || null)}
          sx={{ display: { xs: "block", md: "none" }, mb: 1, width: "100%" }}
          InputLabelProps={{ shrink: true }}
        />

        <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ mb: 2 }}>
          {[
            { label: "Members", value: stats.members, color: "text.primary", Icon: GroupsRoundedIcon },
            { label: "Checked In", value: stats.checkedIn, color: "success.dark", Icon: LoginRoundedIcon },
            { label: "Checked Out", value: stats.checkedOut, color: "primary.main", Icon: LogoutRoundedIcon },
            { label: "WhatsApp", value: stats.whatsapp, color: "success.main", Icon: WhatsAppIcon },
          ].map(({ label, value, color, Icon }) => (
            <Card key={label} variant="outlined" sx={{ flex: 1, borderRadius: 3 }}>
              <CardContent sx={{ p: 1.25, "&:last-child": { pb: 1.25 } }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Box>
                    <Typography variant="caption" color="text.secondary">{label}</Typography>
                    <Typography variant="h6" fontWeight={900} color={color}>{value}</Typography>
                  </Box>
                  <Icon sx={{ fontSize: 20, color }} />
                </Stack>
              </CardContent>
            </Card>
          ))}
        </Stack>

        <Box sx={{ display: { xs: "grid", sm: "none" }, gap: 0.75 }}>
          {loading && !allAttendance.length ? (
            <Paper variant="outlined" sx={{ p: 4, textAlign: "center", borderRadius: 3 }}>
              <CircularProgress size={24} />
            </Paper>
          ) : filtered.length === 0 ? (
            <Paper variant="outlined" sx={{ p: 4, textAlign: "center", borderRadius: 3 }}>
              <Typography color="text.secondary">
                No attendance records found{selectedDate ? ` for ${fmtDate(selectedDate)}` : ""}.
              </Typography>
            </Paper>
          ) : (
            filtered.map((r, i) => (
              <Paper key={`${r.User_name}-${r.DateISO}-${i}`} variant="outlined" sx={{ p: 1, borderRadius: 2 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.75 }}>
                  <Box>
                    <Typography variant="body2" fontWeight={900}>{r.User_name}</Typography>
                    {!selectedDate && <Typography variant="caption" color="text.secondary">{fmtDate(r.DateISO)}</Typography>}
                  </Box>
                  <SourceBadge source={r.Source} />
                </Stack>
                <Stack direction="row" spacing={0.5} justifyContent="space-between">
                  {[
                    ["In", r.In],
                    ["Break", r.Break],
                    ["Start", r.Start],
                    ["Out", r.Out],
                  ].map(([label, value]) => (
                    <Box key={label} sx={{ minWidth: 0, textAlign: "center" }}>
                      <Typography variant="caption" color="text.secondary" sx={{ display: "block", fontSize: 10 }}>
                        {label}
                      </Typography>
                      <TimeBadge value={value} />
                    </Box>
                  ))}
                </Stack>
              </Paper>
            ))
          )}
        </Box>

        <TableContainer
          component={Paper}
          variant="outlined"
          sx={{ display: { xs: "none", sm: "block" }, borderRadius: 3, maxHeight: "68vh" }}
        >
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                {!selectedDate && <TableCell sx={{ fontWeight: 700 }}>Date</TableCell>}
                <TableCell sx={{ fontWeight: 700 }}>Name</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>In</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Break</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Start</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Out</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Source</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading && !allAttendance.length ? (
                <TableRow>
                  <TableCell colSpan={selectedDate ? 6 : 7} align="center" sx={{ py: 5 }}>
                    <CircularProgress size={24} />
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={selectedDate ? 6 : 7} align="center" sx={{ py: 4, color: "text.secondary" }}>
                    No attendance records found{selectedDate ? ` for ${fmtDate(selectedDate)}` : ""}.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((r, i) => (
                  <TableRow key={`${r.User_name}-${r.DateISO}-${i}`} hover>
                    {!selectedDate && <TableCell sx={{ whiteSpace: "nowrap" }}>{fmtDate(r.DateISO)}</TableCell>}
                    <TableCell><Typography variant="body2" fontWeight={700}>{r.User_name}</Typography></TableCell>
                    <TableCell><TimeBadge value={r.In} /></TableCell>
                    <TableCell><TimeBadge value={r.Break} /></TableCell>
                    <TableCell><TimeBadge value={r.Start} /></TableCell>
                    <TableCell><TimeBadge value={r.Out} /></TableCell>
                    <TableCell><SourceBadge source={r.Source} /></TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>
    </Box>
  );
}
