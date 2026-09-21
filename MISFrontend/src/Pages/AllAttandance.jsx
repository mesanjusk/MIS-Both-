import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { FaWhatsapp } from "react-icons/fa";
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
import {
  fetchUserNames,
  fetchAttendanceList,
  processAttendanceDataForDate,
} from "../utils/attendanceUtils";

function TimeBadge({ value }) {
  const marked = value && value !== "—";
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
  const [attendance, setAttendance] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  const navigate = useNavigate();
  const location = useLocation();

  const loadToday = async () => {
    try {
      setLoading(true);
      const [userLookup, records] = await Promise.all([
        fetchUserNames(),
        fetchAttendanceList(),
      ]);
      const todayISO = new Date().toISOString().split("T")[0];
      const formatted = processAttendanceDataForDate(records, userLookup, todayISO);
      setAttendance(formatted);
    } catch (e) {
      console.error("Error loading attendance:", e);
      setAttendance([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const userNameFromState = location.state?.id;
    const user = userNameFromState || localStorage.getItem("User_name");
    setLoggedInUser(user);
    if (user) {
      loadToday();
    } else {
      navigate("/");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  useEffect(() => {
    if (!loggedInUser) return undefined;
    const intervalId = setInterval(loadToday, 30000);
    return () => clearInterval(intervalId);
  }, [loggedInUser]);

  const todayLabel = useMemo(() => {
    const d = new Date();
    return d.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return attendance;
    return attendance.filter((r) =>
      String(r.User_name || "").toLowerCase().includes(q)
    );
  }, [attendance, search]);

  const stats = useMemo(() => ({
    members: attendance.length,
    checkedIn: attendance.filter((r) => r.In && r.In !== "—").length,
    checkedOut: attendance.filter((r) => r.Out && r.Out !== "—").length,
    whatsapp: attendance.filter((r) => r.Source === "WhatsApp").length,
  }), [attendance]);

  return (
    <Box sx={{ minHeight: "80vh", p: { xs: 0.5, md: 1 } }}>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={0.75}
        alignItems={{ xs: "stretch", sm: "center" }}
        sx={{ mb: 1 }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="h5" fontWeight={900} noWrap>
            Attendance
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {todayLabel} · today&apos;s team attendance
          </Typography>
        </Box>

        <TextField
          size="small"
          placeholder="Search member"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ width: { xs: "100%", sm: 200 } }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchRoundedIcon sx={{ fontSize: 18 }} />
              </InputAdornment>
            ),
          }}
        />

        <Tooltip title="Refresh attendance">
          <IconButton
            size="small"
            onClick={loadToday}
            disabled={loading}
            sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1.5 }}
          >
            {loading ? <CircularProgress size={17} /> : <RefreshRoundedIcon fontSize="small" />}
          </IconButton>
        </Tooltip>
      </Stack>

      <Stack direction="row" spacing={0.75} sx={{ mb: 1, overflowX: "auto", pb: 0.25 }}>
        {[
          { label: "Members", value: stats.members, color: "text.primary", Icon: GroupsRoundedIcon },
          { label: "Checked In", value: stats.checkedIn, color: "success.dark", Icon: LoginRoundedIcon },
          { label: "Checked Out", value: stats.checkedOut, color: "primary.main", Icon: LogoutRoundedIcon },
          { label: "WhatsApp", value: stats.whatsapp, color: "success.main", Icon: WhatsAppIcon },
        ].map(({ label, value, color, Icon }) => (
          <Card key={label} variant="outlined" sx={{ minWidth: 125, flex: 1, borderRadius: 2 }}>
            <CardContent sx={{ px: 1.1, py: 0.7, "&:last-child": { pb: 0.7 } }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Box>
                  <Typography variant="caption" color="text.secondary">{label}</Typography>
                  <Typography variant="subtitle1" fontWeight={900} color={color} lineHeight={1.15}>
                    {value}
                  </Typography>
                </Box>
                <Icon sx={{ fontSize: 19, color }} />
              </Stack>
            </CardContent>
          </Card>
        ))}
      </Stack>

      {/* Compact mobile cards */}
      <Box sx={{ display: { xs: "grid", sm: "none" }, gap: 0.75 }}>
        {loading && !attendance.length ? (
          <Paper variant="outlined" sx={{ p: 4, textAlign: "center", borderRadius: 2.5 }}>
            <CircularProgress size={24} />
          </Paper>
        ) : filtered.length === 0 ? (
          <Paper variant="outlined" sx={{ p: 4, textAlign: "center", borderRadius: 2.5 }}>
            <Typography color="text.secondary">No attendance records found for today.</Typography>
          </Paper>
        ) : (
          filtered.map((r, i) => (
            <Paper key={`${r.User_name}-${i}`} variant="outlined" sx={{ p: 1, borderRadius: 2 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.75 }}>
                <Typography variant="body2" fontWeight={900}>{r.User_name}</Typography>
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

      {/* Delivery-style compact desktop table */}
      <TableContainer
        component={Paper}
        variant="outlined"
        sx={{ display: { xs: "none", sm: "block" }, borderRadius: 2.5, maxHeight: "68vh" }}
      >
        <Table size="small" stickyHeader sx={{ "& .MuiTableCell-root": { py: 0.75 } }}>
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 800 }}>Name</TableCell>
              <TableCell sx={{ fontWeight: 800 }}>In</TableCell>
              <TableCell sx={{ fontWeight: 800 }}>Break</TableCell>
              <TableCell sx={{ fontWeight: 800 }}>Start</TableCell>
              <TableCell sx={{ fontWeight: 800 }}>Out</TableCell>
              <TableCell sx={{ fontWeight: 800 }}>Source</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading && !attendance.length ? (
              <TableRow>
                <TableCell colSpan={6} align="center" sx={{ py: 5 }}>
                  <CircularProgress size={24} />
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} align="center" sx={{ py: 5, color: "text.secondary" }}>
                  No attendance records found for today.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((r, i) => (
                <TableRow key={`${r.User_name}-${i}`} hover>
                  <TableCell>
                    <Typography variant="body2" fontWeight={800}>{r.User_name}</Typography>
                  </TableCell>
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

      <Box sx={{ display: "none" }}><FaWhatsapp /></Box>
    </Box>
  );
}
