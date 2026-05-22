import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Box, Button, Chip, CircularProgress, FormControl, InputLabel,
  MenuItem, Paper, Select, Stack, Table, TableBody, TableCell,
  TableHead, TableRow, TextField, Typography,
} from "@mui/material";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import DownloadRoundedIcon from "@mui/icons-material/DownloadRounded";
import axios from "../apiClient";
import toast from "react-hot-toast";
import OrderUpdate from "./OrderUpdate";

const STAGES = ["All", "Enquiry", "Quoted", "Approved", "Design", "Printing", "Post Printing", "Finishing", "Ready", "Delivered", "Paid"];

const STAGE_COLORS = {
  enquiry: "default", quoted: "default", approved: "info", design: "info",
  printing: "warning", "post printing": "warning", finishing: "success",
  ready: "success", delivered: "primary", paid: "success",
};

const normStage = (s = "") => String(s || "").trim().toLowerCase();
const fmtDate = (v) => { if (!v) return "—"; const d = new Date(v); return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-IN"); };
const getStage = (o) => o?.stage || o?.highestStatusTask?.Task || "—";
const getAmount = (o) => (o?.Items || []).reduce((s, i) => s + (Number(i.Amount) || Number(i.Rate) * Number(i.Qty) || 0), 0);
const getDue = (o) => o?.highestStatusTask?.Delivery_Date || o?.dueDate || null;
const getItemSummary = (o) => {
  const names = (o?.Items || []).map((i) => i.Item || i.item).filter(Boolean);
  if (!names.length) return "—";
  const joined = names.join(", ");
  return joined.length > 40 ? joined.slice(0, 37) + "…" : joined;
};

const PAGE_SIZE = 50;

export default function AllOrder() {
  const [orders, setOrders]       = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [search, setSearch]       = useState("");
  const [stage, setStage]         = useState("All");
  const [fromDate, setFromDate]   = useState("");
  const [toDate, setToDate]       = useState("");
  const [page, setPage]           = useState(0);
  const [selected, setSelected]   = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await axios.get("/api/orders/GetOrderList");
      setOrders(res.data?.result || res.data?.data || []);
    } catch {
      setError("Failed to load orders");
      toast.error("Failed to load orders");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(0); }, [search, stage, fromDate, toDate]);

  const filtered = useMemo(() => {
    return orders.filter((o) => {
      const s = normStage(getStage(o));
      const matchStage = stage === "All" || s === normStage(stage);
      const matchSearch = !search || (o.Customer_name || "").toLowerCase().includes(search.toLowerCase())
        || String(o.Order_Number || "").includes(search);
      const created = o.createdAt || o.highestStatusTask?.CreatedAt;
      const createdKey = created ? new Date(created).toISOString().slice(0, 10) : "";
      const matchFrom = fromDate ? createdKey >= fromDate : true;
      const matchTo   = toDate   ? createdKey <= toDate   : true;
      return matchStage && matchSearch && matchFrom && matchTo;
    });
  }, [orders, search, stage, fromDate, toDate]);

  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  const exportExcel = async () => {
    try {
      const XLSX = await import("xlsx");
      const rows = filtered.map((o) => ({
        "Order#": o.Order_Number,
        Customer: o.Customer_name,
        Items: getItemSummary(o),
        Amount: getAmount(o),
        Stage: getStage(o),
        "Due Date": fmtDate(getDue(o)),
        Created: fmtDate(o.createdAt),
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Orders");
      XLSX.writeFile(wb, `orders_${new Date().toISOString().slice(0,10)}.xlsx`);
    } catch { toast.error("Export failed"); }
  };

  return (
    <Box sx={{ p: { xs: 1, md: 2 } }}>
      <Paper variant="outlined" sx={{ p: 2, mb: 2, borderRadius: 3 }}>
        <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} alignItems={{ md: "center" }} justifyContent="space-between">
          <Typography variant="h6" fontWeight={800}>Orders Report</Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap">
            <TextField size="small" placeholder="Search customer / order#" value={search}
              onChange={(e) => setSearch(e.target.value)} sx={{ width: 200 }} />
            <FormControl size="small" sx={{ minWidth: 140 }}>
              <InputLabel>Stage</InputLabel>
              <Select value={stage} label="Stage" onChange={(e) => setStage(e.target.value)}>
                {STAGES.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
              </Select>
            </FormControl>
            <TextField size="small" type="date" label="From" InputLabelProps={{ shrink: true }}
              value={fromDate} onChange={(e) => setFromDate(e.target.value)} sx={{ width: 140 }} />
            <TextField size="small" type="date" label="To" InputLabelProps={{ shrink: true }}
              value={toDate} onChange={(e) => setToDate(e.target.value)} sx={{ width: 140 }} />
            <Button size="small" startIcon={<RefreshRoundedIcon />} onClick={load} variant="outlined">Refresh</Button>
            <Button size="small" startIcon={<DownloadRoundedIcon />} onClick={exportExcel} variant="outlined">Excel</Button>
          </Stack>
        </Stack>
      </Paper>

      {loading && <Stack alignItems="center" py={6}><CircularProgress /></Stack>}
      {error && !loading && (
        <Stack alignItems="center" py={4} spacing={1}>
          <Typography color="error">{error}</Typography>
          <Button onClick={load}>Retry</Button>
        </Stack>
      )}
      {!loading && !error && (
        <>
          <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: "block" }}>
            Showing {filtered.length} order{filtered.length !== 1 ? "s" : ""}
          </Typography>
          <Paper variant="outlined" sx={{ borderRadius: 2, overflow: "auto" }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  {["Order#", "Customer", "Items", "Amount", "Stage", "Due Date", ""].map((h) => (
                    <TableCell key={h} sx={{ fontWeight: 800, fontSize: "0.78rem" }}>{h}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {paginated.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} align="center" sx={{ py: 4, color: "text.secondary" }}>No orders found</TableCell>
                  </TableRow>
                ) : paginated.map((o, i) => {
                  const s = normStage(getStage(o));
                  return (
                    <TableRow key={o._id || i} hover sx={{ cursor: "pointer" }} onClick={() => setSelected(o)}>
                      <TableCell sx={{ fontWeight: 700 }}>#{o.Order_Number}</TableCell>
                      <TableCell>{o.Customer_name || "—"}</TableCell>
                      <TableCell sx={{ maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {getItemSummary(o)}
                      </TableCell>
                      <TableCell>₹{getAmount(o).toLocaleString("en-IN")}</TableCell>
                      <TableCell>
                        <Chip label={getStage(o)} size="small" color={STAGE_COLORS[s] || "default"}
                          sx={{ fontSize: "0.7rem", height: 20 }} />
                      </TableCell>
                      <TableCell>{fmtDate(getDue(o))}</TableCell>
                      <TableCell>
                        <Button size="small" variant="outlined" sx={{ fontSize: "0.7rem" }}
                          onClick={(e) => { e.stopPropagation(); setSelected(o); }}>
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Paper>

          {totalPages > 1 && (
            <Stack direction="row" spacing={1} justifyContent="center" mt={2}>
              <Button size="small" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>← Prev</Button>
              <Typography variant="body2" sx={{ lineHeight: "30px" }}>Page {page + 1} / {totalPages}</Typography>
              <Button size="small" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>Next →</Button>
            </Stack>
          )}
        </>
      )}

      {selected && (
        <OrderUpdate order={selected} onClose={() => setSelected(null)}
          onOrderPatched={(id, patch) => {
            setOrders((prev) => prev.map((o) =>
              (o._id === id || o.Order_uuid === id) ? { ...o, ...patch } : o
            ));
            setSelected(null);
          }}
          onOrderReplaced={(updated) => {
            setOrders((prev) => prev.map((o) => o._id === updated._id ? updated : o));
            setSelected(null);
          }}
        />
      )}
    </Box>
  );
}
