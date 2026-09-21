import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Autocomplete,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
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
  Tooltip,
  Typography,
} from "@mui/material";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import GroupsRoundedIcon from "@mui/icons-material/GroupsRounded";
import LoginRoundedIcon from "@mui/icons-material/LoginRounded";
import LogoutRoundedIcon from "@mui/icons-material/LogoutRounded";
import AccountBalanceWalletRoundedIcon from "@mui/icons-material/AccountBalanceWalletRounded";
import WhatsAppIcon from "@mui/icons-material/WhatsApp";
import toast from "react-hot-toast";
import axios from "../apiClient";
import { isSuperAdminRole } from "../constants/roles";
import DeliveryDateSidebar from "../Components/reports/DeliveryDateSidebar";
import {
  fetchUserNames,
  fetchAttendanceList,
  processAttendanceDataRange,
} from "../utils/attendanceUtils";

const todayISO = new Date().toISOString().slice(0, 10);
const money = (value) =>
  `₹${Number(value || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

const fmtDate = (value) => {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};

const toIndiaISO = (value) => {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
};

const isMarked = (value) => Boolean(value && value !== "—" && value !== "N/A");

function TimeBadge({ value }) {
  const marked = isMarked(value);
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

function MarkFilter({ label, value, onChange }) {
  return (
    <TextField
      select
      size="small"
      label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      sx={{ width: { xs: "100%", sm: 105 } }}
    >
      <MenuItem value="all">All</MenuItem>
      <MenuItem value="marked">Marked</MenuItem>
      <MenuItem value="missing">Missing</MenuItem>
    </TextField>
  );
}

function matchesMarkFilter(value, filter) {
  if (filter === "marked") return isMarked(value);
  if (filter === "missing") return !isMarked(value);
  return true;
}

export default function AllAttandance() {
  const [loggedInUser, setLoggedInUser] = useState(null);
  const [records, setRecords] = useState([]);
  const [userLookup, setUserLookup] = useState({});
  const [selectedDate, setSelectedDate] = useState(todayISO);
  const [memberFilter, setMemberFilter] = useState("");
  const [breakFilter, setBreakFilter] = useState("all");
  const [startFilter, setStartFilter] = useState("all");
  const [outFilter, setOutFilter] = useState("all");
  const [loading, setLoading] = useState(false);

  const [accounts, setAccounts] = useState([]);
  const [ledgerTransactions, setLedgerTransactions] = useState([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [ledgerError, setLedgerError] = useState("");
  const [mapDialogOpen, setMapDialogOpen] = useState(false);
  const [mapTarget, setMapTarget] = useState(null);
  const [mapAccountId, setMapAccountId] = useState("");
  const [mappingAccount, setMappingAccount] = useState(false);

  const canManageMappings = isSuperAdminRole(localStorage.getItem("User_group") || "");
  const navigate = useNavigate();
  const location = useLocation();

  const loadAttendance = useCallback(async () => {
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
  }, []);

  const loadAccounts = useCallback(async () => {
    try {
      const res = await axios.get("/api/accounts");
      setAccounts(Array.isArray(res.data?.accounts) ? res.data.accounts : []);
    } catch (e) {
      console.error("Error loading staff accounts:", e?.message || e);
      setAccounts([]);
    }
  }, []);

  const loadLedger = useCallback(async () => {
    setLedgerLoading(true);
    setLedgerError("");
    try {
      const params = {};
      if (selectedDate) {
        params.fromDate = new Date(`${selectedDate}T00:00:00+05:30`).toISOString();
        params.toDate = new Date(`${selectedDate}T23:59:59.999+05:30`).toISOString();
      }
      const res = await axios.get("/api/transaction", { params });
      setLedgerTransactions(res.data?.success && Array.isArray(res.data.result) ? res.data.result : []);
    } catch (e) {
      console.error("Error loading staff ledger:", e?.message || e);
      setLedgerTransactions([]);
      setLedgerError(
        e?.response?.status === 403
          ? "Ledger access is not enabled for this login."
          : "Could not load matched staff ledger."
      );
    } finally {
      setLedgerLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    const userNameFromState = location.state?.id;
    const user = userNameFromState || localStorage.getItem("User_name");
    setLoggedInUser(user);
    if (user) {
      loadAttendance();
      loadAccounts();
    } else {
      navigate("/");
    }
  }, [navigate, location.state, loadAttendance, loadAccounts]);

  useEffect(() => {
    if (!loggedInUser) return undefined;
    const intervalId = setInterval(loadAttendance, 30000);
    return () => clearInterval(intervalId);
  }, [loggedInUser, loadAttendance]);

  useEffect(() => {
    if (loggedInUser) loadLedger();
  }, [loggedInUser, loadLedger]);

  const memberOptions = useMemo(
    () =>
      Object.values(userLookup)
        .filter((u) => u?.name)
        .sort((a, b) => String(a.name).localeCompare(String(b.name))),
    [userLookup]
  );

  const selectedMember = useMemo(
    () => memberOptions.find((u) => u.uuid === memberFilter) || null,
    [memberOptions, memberFilter]
  );

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

  const attendanceForDate = useMemo(() => {
    if (!selectedDate) return allAttendance;
    return allAttendance.filter((r) => r.DateISO === selectedDate);
  }, [allAttendance, selectedDate]);

  const filteredAttendance = useMemo(
    () =>
      attendanceForDate.filter((r) => {
        if (memberFilter && r.User_uuid !== memberFilter) return false;
        if (!matchesMarkFilter(r.Break, breakFilter)) return false;
        if (!matchesMarkFilter(r.Start, startFilter)) return false;
        if (!matchesMarkFilter(r.Out, outFilter)) return false;
        return true;
      }),
    [attendanceForDate, memberFilter, breakFilter, startFilter, outFilter]
  );

  const accountById = useMemo(() => {
    const map = {};
    accounts.forEach((account) => {
      if (account?.Account_uuid) map[account.Account_uuid] = account;
    });
    return map;
  }, [accounts]);

  const userByAccountId = useMemo(() => {
    const map = {};
    memberOptions.forEach((member) => {
      if (member.accountId) map[member.accountId] = member;
    });
    return map;
  }, [memberOptions]);

  const ledgerRows = useMemo(() => {
    const rows = [];
    ledgerTransactions.forEach((tx) => {
      (tx?.Journal_entry || []).forEach((entry, index) => {
        const member = userByAccountId[entry?.Account_id];
        if (!member) return;
        if (memberFilter && member.uuid !== memberFilter) return;

        const account = accountById[entry.Account_id];
        rows.push({
          key: `${tx.Transaction_uuid || tx._id || tx.Transaction_id}-${entry.Account_id}-${index}`,
          date: toIndiaISO(tx.Transaction_date),
          member,
          accountName: account?.Account_name || entry.Account_name || entry.Account_id,
          accountBalance: Number(account?.Balance || 0),
          description: tx.Description || "—",
          paymentMode: tx.Payment_mode || "—",
          type: entry.Type || "—",
          amount: Number(entry.Amount || 0),
        });
      });
    });

    return rows.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  }, [ledgerTransactions, userByAccountId, accountById, memberFilter]);

  const ledgerSummary = useMemo(() => {
    return ledgerRows.reduce(
      (acc, row) => {
        if (row.type === "Debit") acc.debit += row.amount;
        if (row.type === "Credit") acc.credit += row.amount;
        acc.total += row.amount;
        return acc;
      },
      { debit: 0, credit: 0, total: 0 }
    );
  }, [ledgerRows]);

  const attendanceAmount = useMemo(() => {
    const seen = new Set();
    return filteredAttendance.reduce((sum, row) => {
      if (!row.User_uuid || seen.has(row.User_uuid)) return sum;
      seen.add(row.User_uuid);
      return sum + Number(row.Amount || 0);
    }, 0);
  }, [filteredAttendance]);

  const stats = useMemo(
    () => ({
      entries: filteredAttendance.length,
      checkedIn: filteredAttendance.filter((r) => isMarked(r.In)).length,
      checkedOut: filteredAttendance.filter((r) => isMarked(r.Out)).length,
      missingOut: filteredAttendance.filter((r) => !isMarked(r.Out)).length,
    }),
    [filteredAttendance]
  );

  const selectedLabel = selectedDate ? fmtDate(selectedDate) : "All Dates";

  const refreshAll = () => {
    loadAttendance();
    loadAccounts();
    loadLedger();
  };

  const linkedAccountOwners = useMemo(() => {
    const map = {};
    memberOptions.forEach((member) => {
      if (member.accountId) map[member.accountId] = member;
    });
    return map;
  }, [memberOptions]);

  const openMapDialog = (member) => {
    if (!canManageMappings || !member?.uuid) return;
    setMapTarget(member);
    setMapAccountId(member.accountId || "");
    setMapDialogOpen(true);
  };

  const closeMapDialog = () => {
    if (mappingAccount) return;
    setMapDialogOpen(false);
    setMapTarget(null);
    setMapAccountId("");
  };

  const saveAccountMapping = async () => {
    if (!mapTarget?.uuid) return;
    setMappingAccount(true);
    try {
      const res = await axios.patch(`/api/users/link-account/${mapTarget.uuid}`, {
        AccountID: mapAccountId || "",
      });
      if (!res.data?.success) throw new Error(res.data?.message || "Could not save account mapping");

      toast.success(res.data?.message || "Ledger account linked");
      setMapDialogOpen(false);
      setMapTarget(null);
      setMapAccountId("");
      await Promise.all([loadAttendance(), loadAccounts(), loadLedger()]);
    } catch (error) {
      toast.error(error?.response?.data?.message || error.message || "Could not save account mapping");
    } finally {
      setMappingAccount(false);
    }
  };

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
          direction={{ xs: "column", lg: "row" }}
          spacing={1}
          alignItems={{ xs: "stretch", lg: "center" }}
          sx={{ mb: 1.5 }}
        >
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="h5" fontWeight={900} noWrap>Attendance</Typography>
            <Typography variant="body2" color="text.secondary">
              {selectedLabel} · {filteredAttendance.length} attendance entries
            </Typography>
          </Box>

          <Autocomplete
            size="small"
            options={memberOptions}
            value={selectedMember}
            onChange={(_event, value) => setMemberFilter(value?.uuid || "")}
            getOptionLabel={(option) => option?.name || ""}
            isOptionEqualToValue={(option, value) => option.uuid === value.uuid}
            sx={{ width: { xs: "100%", lg: 190 } }}
            renderInput={(params) => (
              <TextField {...params} label="Member" placeholder="All members" />
            )}
          />

          <MarkFilter label="Break" value={breakFilter} onChange={setBreakFilter} />
          <MarkFilter label="Start" value={startFilter} onChange={setStartFilter} />
          <MarkFilter label="Out" value={outFilter} onChange={setOutFilter} />

          <Tooltip title="Refresh attendance and ledger">
            <IconButton size="small" onClick={refreshAll} disabled={loading || ledgerLoading}>
              {loading || ledgerLoading ? <CircularProgress size={17} /> : <RefreshRoundedIcon fontSize="small" />}
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
            { label: "Attendance Entries", value: stats.entries, color: "text.primary", Icon: GroupsRoundedIcon },
            { label: "Checked In", value: stats.checkedIn, color: "success.dark", Icon: LoginRoundedIcon },
            { label: "Checked Out", value: stats.checkedOut, color: "primary.main", Icon: LogoutRoundedIcon },
            { label: "Missing Out", value: stats.missingOut, color: "warning.dark", Icon: AccountBalanceWalletRoundedIcon },
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

        <Stack direction={{ xs: "column", xl: "row" }} spacing={2} alignItems="flex-start">
          {/* Delivery-style left section: attendance */}
          <Paper variant="outlined" sx={{ borderRadius: 3, flex: 1, minWidth: 0, width: "100%" }}>
            <Stack
              direction="row"
              justifyContent="space-between"
              alignItems="center"
              sx={{ px: 2, py: 1.25, borderBottom: "1px solid", borderColor: "divider" }}
            >
              <Stack direction="row" spacing={1} alignItems="center">
                <LoginRoundedIcon fontSize="small" color="success" />
                <Typography
                  variant="subtitle2"
                  fontWeight={700}
                  color="success.dark"
                  sx={{ textTransform: "uppercase", letterSpacing: 1 }}
                >
                  Staff Attendance (IN)
                </Typography>
              </Stack>
              <Typography variant="subtitle2" fontWeight={700} color="success.dark">
                {attendanceAmount ? money(attendanceAmount) : "—"}
              </Typography>
            </Stack>

            <TableContainer sx={{ maxHeight: "58vh" }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    {!selectedDate && <TableCell sx={{ fontWeight: 700 }}>Date</TableCell>}
                    <TableCell sx={{ fontWeight: 700 }}>Member</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>In</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Break</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Start</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>Out</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>Hours</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>Amount</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {loading && !allAttendance.length ? (
                    <TableRow>
                      <TableCell colSpan={selectedDate ? 7 : 8} align="center" sx={{ py: 5 }}>
                        <CircularProgress size={24} />
                      </TableCell>
                    </TableRow>
                  ) : filteredAttendance.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={selectedDate ? 7 : 8} align="center" sx={{ py: 4, color: "text.secondary" }}>
                        No attendance records found for these filters.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredAttendance.map((row, index) => (
                      <TableRow key={`${row.User_uuid}-${row.DateISO}-${index}`} hover>
                        {!selectedDate && <TableCell sx={{ whiteSpace: "nowrap" }}>{fmtDate(row.DateISO)}</TableCell>}
                        <TableCell>
                          <Typography variant="body2" fontWeight={700}>{row.User_name}</Typography>
                          <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="wrap">
                            {row.User_group && <Typography variant="caption" color="text.secondary">{row.User_group}</Typography>}
                            <SourceBadge source={row.Source} />
                          </Stack>
                          {row.AccountID ? (
                            <Tooltip title={row.AccountID}>
                              <Typography
                                variant="caption"
                                color="primary.main"
                                noWrap
                                sx={{ display: "block", maxWidth: 180 }}
                              >
                                {accountById[row.AccountID]?.Account_name || "Ledger account mapped"}
                              </Typography>
                            </Tooltip>
                          ) : canManageMappings ? (
                            <Button
                              size="small"
                              color="warning"
                              variant="text"
                              onClick={() => openMapDialog({
                                uuid: row.User_uuid,
                                name: row.User_name,
                                accountId: "",
                              })}
                              sx={{ p: 0, minWidth: 0, textTransform: "none", fontSize: 10.5 }}
                            >
                              Account not mapped · Map
                            </Button>
                          ) : (
                            <Typography variant="caption" color="warning.dark">
                              Account not mapped
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell><TimeBadge value={row.In} /></TableCell>
                        <TableCell><TimeBadge value={row.Break} /></TableCell>
                        <TableCell><TimeBadge value={row.Start} /></TableCell>
                        <TableCell><TimeBadge value={row.Out} /></TableCell>
                        <TableCell align="right">{Number(row.TotalHours || 0).toFixed(2)}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700 }}>
                          {Number(row.Amount || 0) ? money(row.Amount) : "—"}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>

          {/* Delivery-style right section: matched staff ledger */}
          <Paper variant="outlined" sx={{ borderRadius: 3, flex: 1, minWidth: 0, width: "100%" }}>
            <Stack
              direction="row"
              justifyContent="space-between"
              alignItems="center"
              sx={{ px: 2, py: 1.25, borderBottom: "1px solid", borderColor: "divider" }}
            >
              <Stack direction="row" spacing={1} alignItems="center">
                <AccountBalanceWalletRoundedIcon fontSize="small" color="error" />
                <Typography
                  variant="subtitle2"
                  fontWeight={700}
                  color="error.dark"
                  sx={{ textTransform: "uppercase", letterSpacing: 1 }}
                >
                  Staff Ledger (OUT)
                </Typography>
              </Stack>
              <Typography variant="subtitle2" fontWeight={700} color="error.dark">
                {ledgerRows.length ? money(ledgerSummary.total) : "—"}
              </Typography>
            </Stack>

            {ledgerError ? (
              <Typography color="text.secondary" sx={{ p: 3, textAlign: "center" }}>
                {ledgerError}
              </Typography>
            ) : (
              <TableContainer sx={{ maxHeight: "58vh" }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 700 }}>Date</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Member / Account</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Description</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>Type</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>Amount</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {ledgerLoading ? (
                      <TableRow>
                        <TableCell colSpan={5} align="center" sx={{ py: 5 }}>
                          <CircularProgress size={24} />
                        </TableCell>
                      </TableRow>
                    ) : ledgerRows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} align="center" sx={{ py: 4, color: "text.secondary" }}>
                          {selectedMember && !selectedMember.accountId
                            ? canManageMappings
                              ? "This member has no ledger account mapped. Use Map Account in the attendance row."
                              : "This member has no ledger account mapped."
                            : "No ledger entries matched to staff AccountID for this selection."}
                        </TableCell>
                      </TableRow>
                    ) : (
                      ledgerRows.map((row) => (
                        <TableRow key={row.key} hover>
                          <TableCell sx={{ whiteSpace: "nowrap" }}>{fmtDate(row.date)}</TableCell>
                          <TableCell>
                            <Typography variant="body2" fontWeight={700}>{row.member.name}</Typography>
                            <Tooltip title={`Current account balance: ${money(row.accountBalance)}`}>
                              <Typography variant="caption" color="text.secondary" noWrap sx={{ maxWidth: 155, display: "block" }}>
                                {row.accountName}
                              </Typography>
                            </Tooltip>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" noWrap sx={{ maxWidth: 180 }}>{row.description}</Typography>
                            <Typography variant="caption" color="text.secondary">{row.paymentMode}</Typography>
                          </TableCell>
                          <TableCell>
                            <Chip
                              size="small"
                              label={row.type}
                              color={row.type === "Debit" ? "success" : "error"}
                              variant="outlined"
                              sx={{ height: 20, fontSize: 10.5 }}
                            />
                          </TableCell>
                          <TableCell align="right" sx={{ fontWeight: 700 }}>{money(row.amount)}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            )}

            <Divider />
            <Stack direction="row" spacing={2} sx={{ px: 2, py: 1 }} justifyContent="flex-end">
              <Typography variant="caption" color="success.dark" fontWeight={700}>
                Debit {money(ledgerSummary.debit)}
              </Typography>
              <Typography variant="caption" color="error.dark" fontWeight={700}>
                Credit {money(ledgerSummary.credit)}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                matched by User.AccountID
              </Typography>
            </Stack>
          </Paper>
        </Stack>
      </Box>

      <Dialog open={mapDialogOpen} onClose={closeMapDialog} fullWidth maxWidth="sm">
        <DialogTitle>Map Ledger Account</DialogTitle>
        <DialogContent sx={{ pt: "12px !important" }}>
          <Stack spacing={1.5}>
            <Box>
              <Typography variant="body2" fontWeight={700}>{mapTarget?.name || "Staff member"}</Typography>
              <Typography variant="caption" color="text.secondary">
                Choose the ledger account by name. The Account UUID is stored automatically.
              </Typography>
            </Box>

            <Autocomplete
              options={accounts}
              value={accounts.find((account) => account.Account_uuid === mapAccountId) || null}
              onChange={(_event, account) => setMapAccountId(account?.Account_uuid || "")}
              getOptionLabel={(account) =>
                [account?.Account_name, account?.Account_group].filter(Boolean).join(" — ")
              }
              isOptionEqualToValue={(option, value) => option.Account_uuid === value.Account_uuid}
              getOptionDisabled={(account) => {
                const owner = linkedAccountOwners[account.Account_uuid];
                return Boolean(owner && owner.uuid !== mapTarget?.uuid);
              }}
              renderOption={(props, account) => {
                const owner = linkedAccountOwners[account.Account_uuid];
                return (
                  <li {...props} key={account.Account_uuid}>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="body2">{account.Account_name}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {[
                          account.Account_group,
                          account.Account_code ? `Code ${account.Account_code}` : "",
                          owner && owner.uuid !== mapTarget?.uuid ? `Linked to ${owner.name}` : "",
                        ].filter(Boolean).join(" · ")}
                      </Typography>
                    </Box>
                  </li>
                );
              }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Linked Ledger Account"
                  placeholder="Search account name"
                  helperText={
                    accounts.length
                      ? "Accounts already linked to another staff member are disabled."
                      : "No ledger accounts are available for this login."
                  }
                />
              )}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          {mapTarget?.accountId ? (
            <Button color="warning" onClick={() => setMapAccountId("")} disabled={mappingAccount}>
              Clear Mapping
            </Button>
          ) : null}
          <Button onClick={closeMapDialog} disabled={mappingAccount}>Cancel</Button>
          <Button
            variant="contained"
            onClick={saveAccountMapping}
            disabled={mappingAccount || (!mapAccountId && !mapTarget?.accountId)}
          >
            {mappingAccount ? "Saving…" : mapAccountId ? "Link Account" : "Clear Mapping"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
