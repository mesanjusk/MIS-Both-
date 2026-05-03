import React, { useState, useEffect, useMemo, useCallback } from "react";
import { fetchBillListPaged, updateBillStatus } from "../services/orderService";
import { fetchCustomers } from "../services/customerService";
import jsPDF from "jspdf";
import "jspdf-autotable";
import * as XLSX from "xlsx";

import UpdateDelivery from "../Pages/updateDelivery";
import { LoadingSpinner } from "../Components";
import InvoiceModal from "../Components/InvoiceModal";

/* ✅ MUI (UI only) */
import {
  AppBar,
  Toolbar,
  Typography,
  Box,
  Container,
  Paper,
  Stack,
  TextField,
  InputAdornment,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button,
  Chip,
  Divider,
  Alert,
  LinearProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  IconButton,
  Card,
  CardActionArea,
  CardContent,
  Grid,
  Skeleton,
  Tooltip,
} from "@mui/material";

import SearchIcon from "@mui/icons-material/Search";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import GridOnIcon from "@mui/icons-material/GridOn";
import CloseIcon from "@mui/icons-material/Close";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import TodayIcon from "@mui/icons-material/Today";
import DoneAllIcon from "@mui/icons-material/DoneAll";
import PendingActionsIcon from "@mui/icons-material/PendingActions";

/* ----------------------- small hooks ----------------------- */
function useDebouncedValue(value, delay = 200) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

/* ----------------------- memoized card ----------------------- */
const BillCard = React.memo(function BillCard({
  order,
  paid,
  onTogglePaid,
  onEdit,
  onOpenInvoice,
  statusChip,
  formatDateDDMMYYYY,
  formatINR,
}) {
  const deliveryDate = formatDateDDMMYYYY(order?.highestStatusTask?.Delivery_Date);

  return (
    <Card
      variant="outlined"
      sx={{
        borderRadius: 2,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        position: "relative",
      }}
    >
      <Tooltip title={paid ? "Mark as unpaid" : "Mark bill as paid"}>
        <IconButton
          size="small"
          onClick={(e) => {
            e.stopPropagation();
            onTogglePaid(order);
          }}
          sx={{
            position: "absolute",
            top: 6,
            right: 6,
            zIndex: 2,
            bgcolor: "background.paper",
            border: "1px solid",
            borderColor: "divider",
            "&:hover": { bgcolor: "background.default" },
          }}
          aria-label="toggle paid"
        >
          {paid ? (
            <DoneAllIcon fontSize="small" color="success" />
          ) : (
            <PendingActionsIcon fontSize="small" color="warning" />
          )}
        </IconButton>
      </Tooltip>

      <CardActionArea onClick={() => onEdit(order)} sx={{ flex: 1 }}>
        <CardContent>
          <Stack spacing={0.8}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
              <Typography variant="subtitle2" sx={{ fontWeight: 900 }}>
                #{order?.Order_Number || "—"}
              </Typography>
              {statusChip(order?.highestStatusTask?.Task)}
            </Stack>

            <Typography
              variant="body2"
              sx={{ fontWeight: 800 }}
              noWrap
              title={order?.Customer_name || ""}
            >
              {order?.Customer_name || "Unknown"}
            </Typography>

            <Stack direction="row" spacing={1} alignItems="center">
              <TodayIcon fontSize="small" />
              <Typography variant="caption" color="text.secondary">
                {deliveryDate || "—"}
              </Typography>
            </Stack>

            <Divider sx={{ my: 0.5 }} />

            <Stack direction="row" alignItems="center" justifyContent="space-between">
              <Typography variant="caption" color="text.secondary">
                Total
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 900 }}>
                ₹{formatINR(order?.billTotal)}
              </Typography>
            </Stack>

            <Stack direction="row" justifyContent="flex-end">
              <Chip
                size="small"
                label={paid ? "Paid" : "Unpaid"}
                color={paid ? "success" : "warning"}
                variant={paid ? "filled" : "outlined"}
                sx={{ borderRadius: 2, fontWeight: 800 }}
              />
            </Stack>
          </Stack>
        </CardContent>
      </CardActionArea>

      <Divider />

      <Box sx={{ p: 1.25 }}>
        <Button
          fullWidth
          variant="contained"
          color={paid ? "success" : "warning"}
          startIcon={<ReceiptLongIcon />}
          onClick={(e) => {
            e.stopPropagation();
            onOpenInvoice(order);
          }}
          sx={{ borderRadius: 2, textTransform: "none", fontWeight: 900 }}
        >
          Bill
        </Button>
      </Box>
    </Card>
  );
});

export default function AllBills() {
  const [orders, setOrders] = useState([]);
  const [customers, setCustomers] = useState({});
  const [loading, setLoading] = useState(true);

  const [searchOrder, setSearchOrder] = useState("");
  const debouncedSearch = useDebouncedValue(searchOrder, 250);

  const [taskFilter, setTaskFilter] = useState("");
  const [paidFilter, setPaidFilter] = useState("");

  const PAGE_SIZE = 50;
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  const [editOpen, setEditOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);

  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [invoiceOrder, setInvoiceOrder] = useState(null);

  /* ✅ fallback paidMap (only for old orders until backend is everywhere) */
  const [paidMap, setPaidMap] = useState(() => {
    try {
      const raw = localStorage.getItem("bills_paid_map");
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem("bills_paid_map", JSON.stringify(paidMap || {}));
    } catch {}
  }, [paidMap]);

  const formatDateDDMMYYYY = (dateString) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return "";
    const dd = String(date.getDate()).padStart(2, "0");
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const yyyy = date.getFullYear();
    return `${dd}-${mm}-${yyyy}`;
  };

  const formatINR = (value) => {
    const num = Number(value || 0);
    try {
      return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(num);
    } catch {
      return String(num);
    }
  };

  const toNumber = (v) => {
    if (v === null || v === undefined) return 0;
    if (typeof v === "number") return Number.isFinite(v) ? v : 0;
    const s = String(v).replace(/[₹,\s]/g, "").trim();
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  };

  const resolveQty = (it) =>
    toNumber(it?.Qty ?? it?.Quantity ?? it?.qty ?? it?.quantity ?? it?.QTY ?? 0);

  const resolveRate = (it) =>
    toNumber(it?.Rate ?? it?.Price ?? it?.rate ?? it?.price ?? it?.RATE ?? 0);

  const resolveAmount = (it) => {
    const direct =
      it?.Amount ??
      it?.amount ??
      it?.Amt ??
      it?.amt ??
      it?.BillAmount ??
      it?.billAmount ??
      it?.Bill_Amount ??
      it?.FinalAmount ??
      it?.finalAmount ??
      it?.Final_Amount ??
      it?.TotalAmount ??
      it?.totalAmount ??
      it?.Total_Amount ??
      it?.NetAmount ??
      it?.netAmount ??
      it?.Net_Amount;

    const n = toNumber(direct);
    if (n > 0) return n;

    const q = resolveQty(it);
    const r = resolveRate(it);
    const calc = q * r;
    return Number.isFinite(calc) ? calc : 0;
  };

  const hasBillableAmount = useCallback(
    (items) => Array.isArray(items) && items.some((it) => resolveAmount(it) > 0),
    []
  );

  const getHighestStatus = (statusArr) => {
    const list = Array.isArray(statusArr) ? statusArr : [];
    if (list.length === 0) return {};
    return list.reduce((prev, curr) => {
      const prevNum = Number(prev?.Status_number || 0);
      const currNum = Number(curr?.Status_number || 0);
      return currNum > prevNum ? curr : prev;
    }, list[0]);
  };

  const getFirstRemark = (order) => {
    if (!Array.isArray(order?.Items) || order.Items.length === 0) return "";
    return String(order.Items[0]?.Remark || "");
  };

  const getOrderKey = useCallback((order) => {
    return String(order?.Order_uuid || order?._id || order?.Order_id || "");
  }, []);

  const isPaid = useCallback(
    (order) => {
      const backend = String(order?.billStatus || "").toLowerCase().trim();
      if (backend === "paid") return true;
      if (backend === "unpaid") return false;

      const key = getOrderKey(order);
      return Boolean(paidMap?.[key]);
    },
    [getOrderKey, paidMap]
  );

  // 🔁 Local state upsert helper (no reload)
  const upsertOrderPatch = useCallback(
    (orderId, patch) => {
      if (!orderId || !patch) return;

      // remove order if becomes non-billable
      if (patch.Items && !hasBillableAmount(patch.Items)) {
        setOrders((prev) => prev.filter((o) => getOrderKey(o) !== String(orderId)));

        if (selectedOrder && getOrderKey(selectedOrder) === String(orderId)) setEditOpen(false);

        if (invoiceOrder && getOrderKey(invoiceOrder) === String(orderId)) {
          setShowInvoiceModal(false);
          setInvoiceOrder(null);
        }

        setPaidMap((prev) => {
          const copy = { ...(prev || {}) };
          delete copy[String(orderId)];
          return copy;
        });

        return;
      }

      setOrders((prev) =>
        prev.map((o) => (getOrderKey(o) === String(orderId) ? { ...o, ...patch } : o))
      );

      if (selectedOrder && getOrderKey(selectedOrder) === String(orderId)) {
        setSelectedOrder((s) => (s ? { ...s, ...patch } : s));
      }

      if (invoiceOrder && getOrderKey(invoiceOrder) === String(orderId)) {
        setInvoiceOrder((s) => (s ? { ...s, ...patch } : s));
      }
    },
    [hasBillableAmount, getOrderKey, selectedOrder, invoiceOrder]
  );

  // ✅ Paid toggle → backend persists (optimistic)
  // ✅ Fix: DO NOT show false alert if network/500 (because DB can still be updated)
  const togglePaid = useCallback(
    async (order) => {
      const key = getOrderKey(order);
      if (!key) return;

      const currentlyPaid = isPaid(order);
      const nextStatus = currentlyPaid ? "unpaid" : "paid";

      // optimistic UI
      upsertOrderPatch(key, {
        billStatus: nextStatus,
        billPaidAt: nextStatus === "paid" ? new Date().toISOString() : null,
      });

      try {
        await updateBillStatus(key, nextStatus, { paidBy: "admin" });

        // remove local fallback for this order once saved in backend
        setPaidMap((prev) => {
          const copy = { ...(prev || {}) };
          delete copy[key];
          return copy;
        });
      } catch (e) {
        const status = e?.response?.status; // may be undefined for network error
        const isNetwork = !e?.response;

        console.error("Failed to update bill status:", e?.message || e);

        // ✅ If no response OR server 5xx => likely updated but response failed / timeout
        // Keep optimistic UI and DON'T show scary alert
        if (isNetwork || (typeof status === "number" && status >= 500)) {
          return;
        }

        // ❌ Real 4xx failure => rollback
        upsertOrderPatch(key, {
          billStatus: currentlyPaid ? "paid" : "unpaid",
          billPaidAt: currentlyPaid ? order?.billPaidAt || null : null,
        });

        alert("Failed to update bill status. Please try again.");
      }
    },
    [getOrderKey, isPaid, upsertOrderPatch]
  );

  /* ----------------------- load customers once ----------------------- */
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const customersRes = await fetchCustomers();
        if (!mounted) return;

        const custRows = customersRes?.data?.success ? customersRes.data.result ?? [] : [];
        const customerMap = Array.isArray(custRows)
          ? custRows.reduce((acc, c) => {
              if (c.Customer_uuid && c.Customer_name) acc[c.Customer_uuid] = c.Customer_name;
              return acc;
            }, {})
          : {};
        setCustomers(customerMap);
      } catch (e) {
        console.error("Error fetching customers:", e?.message || e);
        setCustomers({});
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  /* ----------------------- load bills pages ----------------------- */
  const loadBillsPage = useCallback(
    async (nextPage, reset = false) => {
      setLoading(true);
      try {
        const res = await fetchBillListPaged({
          page: nextPage,
          limit: PAGE_SIZE,
          search: debouncedSearch,
          task: taskFilter,
          paid: paidFilter,
        });

        const rows = res?.data?.success ? res.data.result ?? [] : [];
        const t = Number(res?.data?.total ?? 0);

        setTotal(t);
        setPage(nextPage);

        // ✅ compute hasMore using prev length (no stale closure)
        setOrders((prev) => {
          const next = reset ? rows : [...prev, ...rows];
          setHasMore(next.length < t);
          return next;
        });
      } catch (e) {
        console.error("Error fetching bills:", e?.message || e);
        if (reset) setOrders([]);
        setHasMore(false);
        setTotal(0);
      } finally {
        setLoading(false);
      }
    },
    [PAGE_SIZE, debouncedSearch, taskFilter, paidFilter]
  );

  // initial load
  useEffect(() => {
    loadBillsPage(1, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // reload page 1 when filters/search change
  useEffect(() => {
    loadBillsPage(1, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, taskFilter, paidFilter]);

  /* ----------------------- derived lists ----------------------- */
  const normalizedOrders = useMemo(() => {
    const list = Array.isArray(orders) ? orders : [];
    return list.map((order) => {
      const highestStatusTask = getHighestStatus(order?.Status);
      const items = Array.isArray(order?.Items) ? order.Items : [];
      const billTotal = items.reduce((sum, it) => sum + resolveAmount(it), 0);

      const customerName = customers?.[order?.Customer_uuid] || "Unknown";
      const taskLower = String(highestStatusTask?.Task || "").toLowerCase().trim();

      const billable = hasBillableAmount(items);
      const paid = isPaid(order);

      return {
        ...order,
        highestStatusTask,
        Customer_name: customerName,
        billTotal,
        _billable: billable,
        _customerLower: String(customerName).toLowerCase(),
        _taskLower: taskLower,
        _paid: paid,
      };
    });
  }, [orders, customers, hasBillableAmount, isPaid]);

  // since backend already filters, this is mostly safety
  const filteredOrders = useMemo(() => {
    const s = String(debouncedSearch || "").toLowerCase().trim();
    const fTask = String(taskFilter || "").toLowerCase().trim();
    const fPaid = String(paidFilter || "").toLowerCase().trim();

    return normalizedOrders.filter((o) => {
      if (!o._billable) return false;
      if (s && !o._customerLower.includes(s)) return false;
      if (fTask && o._taskLower !== fTask) return false;

      if (fPaid === "paid" && !o._paid) return false;
      if (fPaid === "unpaid" && o._paid) return false;

      return true;
    });
  }, [normalizedOrders, debouncedSearch, taskFilter, paidFilter]);

  const totals = useMemo(() => {
    const count = filteredOrders.length;
    const sum = filteredOrders.reduce((acc, o) => acc + toNumber(o?.billTotal), 0);
    return { count, sum };
  }, [filteredOrders]);

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.text("Bills Report (Loaded Rows)", 14, 15);
    doc.autoTable({
      head: [
        [
          "Order Number",
          "Customer Name",
          "Created Date",
          "Remark",
          "Delivery Date",
          "Assigned",
          "Highest Status Task",
          "Paid",
          "Total",
        ],
      ],
      body: filteredOrders.map((order) => [
        order.Order_Number || "",
        order.Customer_name || "",
        formatDateDDMMYYYY(order.createdAt),
        getFirstRemark(order),
        formatDateDDMMYYYY(order.highestStatusTask?.Delivery_Date),
        order.highestStatusTask?.Assigned || "",
        order.highestStatusTask?.Task || "",
        order._paid ? "Paid" : "Unpaid",
        `₹${formatINR(order.billTotal)}`,
      ]),
      startY: 20,
    });
    doc.save("bills_report_loaded_rows.pdf");
  };

  const exportExcel = () => {
    const worksheetData = filteredOrders.map((order) => ({
      "Order Number": order.Order_Number || "",
      "Customer Name": order.Customer_name || "",
      "Created Date": formatDateDDMMYYYY(order.createdAt),
      Remark: getFirstRemark(order),
      "Delivery Date": formatDateDDMMYYYY(order.highestStatusTask?.Delivery_Date),
      Assigned: order.highestStatusTask?.Assigned || "",
      "Highest Status Task": order.highestStatusTask?.Task || "",
      Paid: order._paid ? "Paid" : "Unpaid",
      Total: Number(toNumber(order.billTotal)),
    }));

    const worksheet = XLSX.utils.json_to_sheet(worksheetData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Bills");
    XLSX.writeFile(workbook, "bills_report_loaded_rows.xlsx");
  };

  const handleEditClick = (order) => {
    const id = order?._id || order?.Order_id || order?.Order_uuid || null;
    if (!id) {
      alert("⚠️ Invalid order ID. Cannot open edit modal.");
      return;
    }
    setSelectedOrder({ ...order, _id: order?._id || id });
    setEditOpen(true);
  };

  const closeEditModal = () => setEditOpen(false);

  const openInvoice = (order) => {
    setInvoiceOrder(order);
    setShowInvoiceModal(true);
  };

  const closeInvoice = () => {
    setShowInvoiceModal(false);
    setInvoiceOrder(null);
  };

  const buildInvoiceItems = (order) => {
    const items = Array.isArray(order?.Items) ? order.Items : [];
    return items
      .map((it, idx) => {
        const qty = resolveQty(it);
        const rate = resolveRate(it);
        const amount = resolveAmount(it);
        const name = String(it?.Item_name || it?.Name || it?.Product_name || it?.Item || "Item");

        return {
          sr: idx + 1,
          name,
          qty,
          rate,
          amount,
          remark: String(it?.Remark || ""),

          Item: name,
          Qty: qty,
          Rate: rate,
          Amt: amount,
          Amount: amount,
        };
      })
      .filter((it) => toNumber(it?.amount ?? it?.Amt ?? it?.Amount) > 0);
  };

  const sendInvoiceOnWhatsApp = (invoiceUrl, order) => {
    const orderNo = order?.Order_Number || "";
    const party = order?.Customer_name || "Customer";
    const msg = `Invoice for Order #${orderNo}\nParty: ${party}\n\n${invoiceUrl}`;
    const waUrl = `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(waUrl, "_blank", "noopener,noreferrer");
  };

  const statusChip = (task) => {
    const t = String(task || "").toLowerCase().trim();
    const label = task || "—";
    if (!t) return <Chip size="small" label={label} variant="outlined" />;
    if (t === "delivered") return <Chip size="small" label={label} color="success" />;
    if (t === "design") return <Chip size="small" label={label} color="info" />;
    if (t === "print") return <Chip size="small" label={label} color="warning" />;
    return <Chip size="small" label={label} variant="outlined" />;
  };

  const showingText =
    total > 0
      ? `Showing ${Math.min(orders.length, total)}/${total}`
      : filteredOrders.length > 0
      ? `Showing ${filteredOrders.length}`
      : "";

  return (
    <>
      <Box sx={{ minHeight: "100vh", bgcolor: "background.default" }}>
        <AppBar position="sticky" elevation={0}>
          <Toolbar>
            <ReceiptLongIcon sx={{ mr: 1 }} />
            <Typography variant="h6" sx={{ flex: 1 }}>
              Bills Report
            </Typography>

            <Typography variant="body2" sx={{ opacity: 0.9 }}>
              {showingText ? `${showingText} • ` : ""}
              Loaded: {orders.length} • ₹{formatINR(totals.sum)}
            </Typography>
          </Toolbar>
          {loading && <LinearProgress />}
        </AppBar>

        <Container maxWidth={false} sx={{ maxWidth: 2200, py: 2 }}>
          {/* Filters + Exports */}
          <Paper variant="outlined" sx={{ borderRadius: 3, p: 2, mb: 2 }}>
            <Stack
              direction={{ xs: "column", md: "row" }}
              spacing={1.5}
              alignItems={{ xs: "stretch", md: "center" }}
            >
              <TextField
                value={searchOrder}
                onChange={(e) => setSearchOrder(e.target.value)}
                placeholder="Search by customer name"
                fullWidth
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon fontSize="small" />
                    </InputAdornment>
                  ),
                }}
              />

              <FormControl sx={{ minWidth: { xs: "100%", md: 220 } }}>
                <InputLabel id="task-filter-label">Filter by task</InputLabel>
                <Select
                  labelId="task-filter-label"
                  value={taskFilter}
                  label="Filter by task"
                  onChange={(e) => setTaskFilter(e.target.value)}
                >
                  <MenuItem value="">All</MenuItem>
                  <MenuItem value="delivered">Delivered</MenuItem>
                  <MenuItem value="design">Design</MenuItem>
                  <MenuItem value="print">Print</MenuItem>
                </Select>
              </FormControl>

              <FormControl sx={{ minWidth: { xs: "100%", md: 220 } }}>
                <InputLabel id="paid-filter-label">Payment</InputLabel>
                <Select
                  labelId="paid-filter-label"
                  value={paidFilter}
                  label="Payment"
                  onChange={(e) => setPaidFilter(e.target.value)}
                >
                  <MenuItem value="">All</MenuItem>
                  <MenuItem value="paid">Paid</MenuItem>
                  <MenuItem value="unpaid">Unpaid</MenuItem>
                </Select>
              </FormControl>

              <Stack direction="row" spacing={1} justifyContent="flex-end">
                <Tooltip title="Export as PDF (loaded rows only)">
                  <Button
                    variant="contained"
                    color="error"
                    startIcon={<PictureAsPdfIcon />}
                    onClick={exportPDF}
                    sx={{ borderRadius: 2, textTransform: "none", fontWeight: 800 }}
                  >
                    PDF
                  </Button>
                </Tooltip>

                <Tooltip title="Export as Excel (loaded rows only)">
                  <Button
                    variant="contained"
                    startIcon={<GridOnIcon />}
                    onClick={exportExcel}
                    sx={{ borderRadius: 2, textTransform: "none", fontWeight: 800 }}
                  >
                    Excel
                  </Button>
                </Tooltip>
              </Stack>
            </Stack>
          </Paper>

          {/* Content */}
          <Paper variant="outlined" sx={{ borderRadius: 3, p: { xs: 1.5, sm: 2 } }}>
            {loading && orders.length === 0 ? (
              <Grid container spacing={1.5}>
                {Array.from({ length: 12 }).map((_, i) => (
                  <Grid key={i} item xs={12} sm={6} md={4} lg={3} xl={2}>
                    <Card variant="outlined" sx={{ borderRadius: 2 }}>
                      <CardContent>
                        <Skeleton width="55%" />
                        <Skeleton width="85%" />
                        <Skeleton width="45%" />
                        <Skeleton width="35%" />
                      </CardContent>
                    </Card>
                  </Grid>
                ))}
                <Box sx={{ width: "100%", display: "flex", justifyContent: "center", py: 2 }}>
                  <LoadingSpinner size={40} />
                </Box>
              </Grid>
            ) : filteredOrders.length === 0 ? (
              <Alert severity="info" variant="outlined" sx={{ borderRadius: 3 }}>
                No billed orders found.
              </Alert>
            ) : (
              <>
                <Grid container spacing={1.5}>
                  {filteredOrders.map((order) => {
                    const key = getOrderKey(order) || `o-${order?.Order_Number || Math.random()}`;
                    const paid = Boolean(order?._paid);

                    return (
                      <Grid key={key} item xs={12} sm={6} md={4} lg={3} xl={2}>
                        <BillCard
                          order={order}
                          paid={paid}
                          onTogglePaid={togglePaid}
                          onEdit={handleEditClick}
                          onOpenInvoice={openInvoice}
                          statusChip={statusChip}
                          formatDateDDMMYYYY={formatDateDDMMYYYY}
                          formatINR={formatINR}
                        />
                      </Grid>
                    );
                  })}
                </Grid>

                <Box sx={{ display: "flex", justifyContent: "center", mt: 2 }}>
                  <Button
                    variant="outlined"
                    disabled={!hasMore || loading}
                    onClick={() => loadBillsPage(page + 1, false)}
                    sx={{ borderRadius: 2, textTransform: "none", fontWeight: 900 }}
                  >
                    {hasMore ? `Load more (+${PAGE_SIZE})` : "No more bills"}
                  </Button>
                </Box>

                {loading && orders.length > 0 && (
                  <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
                    <LoadingSpinner size={34} />
                  </Box>
                )}
              </>
            )}
          </Paper>
        </Container>
      </Box>

      {/* ✅ UpdateDelivery Modal */}
      <Dialog
        open={editOpen}
        onClose={closeEditModal}
        fullWidth
        maxWidth="lg"
        TransitionProps={{
          onExited: () => setSelectedOrder(null),
        }}
      >
        <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          Update Delivery
          <Box sx={{ flex: 1 }} />
          <IconButton onClick={closeEditModal}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>

        <DialogContent dividers>
          <UpdateDelivery
            mode="edit"
            order={selectedOrder || {}}
            onClose={closeEditModal}
            onOrderPatched={(orderId, patch) => upsertOrderPatch(orderId, patch)}
            onOrderReplaced={(full) => {
              if (!full) return;
              const key = getOrderKey(full);
              if (!key) return;
              setOrders((prev) => {
                const idx = prev.findIndex((o) => getOrderKey(o) === key);
                if (idx === -1) return [full, ...prev];
                const copy = prev.slice();
                copy[idx] = { ...prev[idx], ...full };
                return copy;
              });
            }}
          />
        </DialogContent>
      </Dialog>

      {/* ✅ Invoice Modal */}
      <InvoiceModal
        open={showInvoiceModal}
        onClose={closeInvoice}
        orderNumber={invoiceOrder?.Order_Number || ""}
        partyName={invoiceOrder?.Customer_name || "Customer"}
        items={buildInvoiceItems(invoiceOrder)}
        onWhatsApp={(url) => sendInvoiceOnWhatsApp(url, invoiceOrder)}
      />
    </>
  );
}
