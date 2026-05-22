import toast from 'react-hot-toast';
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { fetchDeliveredOrders } from "../services/orderService";
import { fetchCustomers } from "../services/customerService";
import axios from "../apiClient.js";
import jsPDF from "jspdf";
import "jspdf-autotable";
import * as XLSX from "xlsx";

import UpdateDelivery from "../Pages/updateDelivery";
import OrderUpdate from "../Pages/OrderUpdate";

import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  FormControlLabel,
  IconButton,
  InputAdornment,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Switch,
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

import SearchIcon from "@mui/icons-material/Search";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import GridOnIcon from "@mui/icons-material/GridOn";
import CloseIcon from "@mui/icons-material/Close";
import LocalShippingIcon from "@mui/icons-material/LocalShipping";
import StorefrontIcon from "@mui/icons-material/Storefront";
import EditIcon from "@mui/icons-material/Edit";
import ReceiptIcon from "@mui/icons-material/Receipt";
import EventIcon from "@mui/icons-material/Event";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";

const fmtDate = (d) => {
  if (!d) return "—";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};

const isoDate = (d) => {
  if (!d) return "";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
};

const money = (v) => `₹${Number(v || 0).toLocaleString("en-IN")}`;

const todayISO = new Date().toISOString().slice(0, 10);

export default function AllDelivery() {
  const [orders, setOrders] = useState([]);
  const [customers, setCustomers] = useState({});
  const [loading, setLoading] = useState(true);
  const [searchOrder, setSearchOrder] = useState("");
  const [filter, setFilter] = useState("");
  const [selectedDate, setSelectedDate] = useState(todayISO);

  const [editOpen, setEditOpen] = useState(false);
  const [orderUpdateOpen, setOrderUpdateOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);

  // Bulk selection state
  const [selectedOrders, setSelectedOrders] = useState(new Set());
  const [bulkDate, setBulkDate] = useState(todayISO);
  const [bulkUpdating, setBulkUpdating] = useState(false);

  // Sidebar date picker
  const [sidebarDateInput, setSidebarDateInput] = useState("");

  // Toggle to show only orders with empty/no-value Items
  const [showEmptyItems, setShowEmptyItems] = useState(false);

  // Vendor bulk selection
  const [selectedVendorKeys, setSelectedVendorKeys] = useState(new Set());
  const [vendorBulkDate, setVendorBulkDate] = useState(todayISO);
  const [vendorBulkUpdating, setVendorBulkUpdating] = useState(false);

  // Vendor PO edit dialog
  const [vendorEditOpen, setVendorEditOpen] = useState(false);
  const [selectedVendorRow, setSelectedVendorRow] = useState(null);
  const [vendorExtraCharges, setVendorExtraCharges] = useState([]);
  const [vendorSaving, setVendorSaving] = useState(false);

  const hasBillableAmount = useCallback(
    (items) => Array.isArray(items) && items.some((it) => Number(it?.Amount) > 0),
    []
  );

  useEffect(() => {
    let isMounted = true;
    (async () => {
      setLoading(true);
      try {
        const [ordersResult, customersResult] = await Promise.allSettled([
          fetchDeliveredOrders(),
          fetchCustomers(),
        ]);
        if (!isMounted) return;

        const ordersRes = ordersResult.status === "fulfilled" ? ordersResult.value : null;
        const customersRes = customersResult.status === "fulfilled" ? customersResult.value : null;

        const orderRows = ordersRes?.data?.success ? (ordersRes.data.result ?? []) : [];
        const custRows = customersRes?.data?.success ? (customersRes.data.result ?? []) : [];

        const customerMap = Array.isArray(custRows)
          ? custRows.reduce((acc, c) => {
              if (c.Customer_uuid && c.Customer_name) acc[c.Customer_uuid] = c.Customer_name;
              return acc;
            }, {})
          : {};

        setCustomers(customerMap);
        setOrders(Array.isArray(orderRows) ? orderRows : []);
      } catch (err) {
        console.error("Error fetching data:", err?.message || err);
        setCustomers({});
        setOrders([]);
      } finally {
        if (isMounted) setLoading(false);
      }
    })();
    return () => { isMounted = false; };
  }, []);

  const getHighestStatus = (statusArr) => {
    const list = Array.isArray(statusArr) ? statusArr : [];
    if (!list.length) return {};
    return list.reduce((prev, curr) =>
      Number(curr?.Status_number || 0) > Number(prev?.Status_number || 0) ? curr : prev
    , list[0]);
  };

  const upsertOrderPatch = useCallback((orderId, patch) => {
    if (!orderId || !patch) return;
    if (patch.Items && hasBillableAmount(patch.Items)) {
      setOrders((prev) => prev.filter((o) => (o.Order_uuid || o._id) !== orderId));
      if (selectedOrder && (selectedOrder.Order_uuid || selectedOrder._id) === orderId) {
        setEditOpen(false);
        setOrderUpdateOpen(false);
      }
      return;
    }
    setOrders((prev) =>
      prev.map((o) => (o.Order_uuid || o._id) === orderId ? { ...o, ...patch } : o)
    );
    if (selectedOrder && (selectedOrder.Order_uuid || selectedOrder._id) === orderId) {
      setSelectedOrder((s) => (s ? { ...s, ...patch } : s));
    }
  }, [hasBillableAmount, selectedOrder]);

  const upsertOrderReplace = useCallback((nextOrder) => {
    if (!nextOrder) return;
    const key = nextOrder.Order_uuid || nextOrder._id;
    if (hasBillableAmount(nextOrder.Items)) {
      setOrders((prev) => prev.filter((o) => (o.Order_uuid || o._id) !== key));
      if (selectedOrder && (selectedOrder.Order_uuid || selectedOrder._id) === key) {
        setEditOpen(false);
        setOrderUpdateOpen(false);
      }
      return;
    }
    setOrders((prev) => {
      const idx = prev.findIndex((o) => (o.Order_uuid || o._id) === key);
      if (idx === -1) return [nextOrder, ...prev];
      const copy = prev.slice();
      copy[idx] = { ...prev[idx], ...nextOrder };
      return copy;
    });
    if (selectedOrder && (selectedOrder.Order_uuid || selectedOrder._id) === key) {
      setSelectedOrder((s) => (s ? { ...s, ...nextOrder } : s));
    }
  }, [hasBillableAmount, selectedOrder]);

  // Enrich orders with computed fields
  const enriched = useMemo(() =>
    orders.map((o) => ({
      ...o,
      highestStatusTask: getHighestStatus(o.Status),
      Customer_name: customers[o.Customer_uuid] || "Unknown",
      orderDate: isoDate(o.createdAt),
      totalAmount: Array.isArray(o.Items)
        ? o.Items.reduce((s, it) => s + Number(it?.Amount || 0), 0)
        : 0,
    })),
  [orders, customers]);

  // All unique dates from orders, newest first
  const availableDates = useMemo(() => {
    const set = new Set(enriched.map((o) => o.orderDate).filter(Boolean));
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [enriched]);

  // Search + status filter
  const filteredOrders = useMemo(() => {
    const q = searchOrder.toLowerCase();
    const f = filter.toLowerCase().trim();
    return enriched.filter((o) => {
      const matchName = (o.Customer_name || "").toLowerCase().includes(q);
      const matchFilter = f ? (o.highestStatusTask?.Task || "").toLowerCase().trim() === f : true;
      return matchName && matchFilter;
    });
  }, [enriched, searchOrder, filter]);

  // Date-filtered orders (for main content)
  const dateOrders = useMemo(() => {
    if (!selectedDate) return filteredOrders;
    return filteredOrders.filter((o) => o.orderDate === selectedDate);
  }, [filteredOrders, selectedDate]);

  // Orders shown in the Deliveries to Customers table (respects showEmptyItems toggle)
  const deliveryTableOrders = useMemo(() => {
    if (!showEmptyItems) return dateOrders;
    return dateOrders.filter((o) => !hasBillableAmount(o.Items));
  }, [dateOrders, showEmptyItems, hasBillableAmount]);

  // Vendor purchases: extract Steps with costAmount from date-filtered orders
  const vendorRows = useMemo(() => {
    const rows = [];
    dateOrders.forEach((o) => {
      if (!Array.isArray(o.Steps)) return;
      o.Steps.forEach((step, stepIdx) => {
        const cost = Number(step.costAmount || 0);
        if (cost > 0) {
          const orderId = o._id || o.Order_uuid;
          rows.push({
            key: `${orderId}_${stepIdx}`,
            orderId,
            orderRef: o,
            stepIdx,
            orderNumber: o.Order_Number,
            customer: o.Customer_name,
            stepLabel: step.label || "—",
            vendorName: step.vendorName || "—",
            costAmount: cost,
            extraCharges: Array.isArray(step.extraCharges) ? step.extraCharges : [],
            isPosted: step.posting?.isPosted,
          });
        }
      });
    });
    return rows;
  }, [dateOrders]);

  // Summary stats
  const stats = useMemo(() => {
    const deliveryValue = dateOrders.reduce((s, o) => s + o.totalAmount, 0);
    const vendorCost = vendorRows.reduce((s, r) => s + r.costAmount, 0);
    return {
      orderCount: dateOrders.length,
      deliveryValue,
      vendorCost,
      net: deliveryValue - vendorCost,
    };
  }, [dateOrders, vendorRows]);

  // Counts per date for sidebar
  const dateCountMap = useMemo(() => {
    const map = {};
    filteredOrders.forEach((o) => {
      if (o.orderDate) map[o.orderDate] = (map[o.orderDate] || 0) + 1;
    });
    return map;
  }, [filteredOrders]);

  const getFirstRemark = (o) =>
    Array.isArray(o?.Items) && o.Items.length ? String(o.Items[0]?.Remark || "") : (o?.orderNote || "");

  // Bulk selection handlers — operate on the currently visible (filtered) rows
  const allCurrentIds = useMemo(() => deliveryTableOrders.map((o) => o._id || o.Order_uuid), [deliveryTableOrders]);
  const allSelected = allCurrentIds.length > 0 && allCurrentIds.every((id) => selectedOrders.has(id));
  const someSelected = selectedOrders.size > 0;

  const handleSelectAll = useCallback((e) => {
    if (e.target.checked) {
      setSelectedOrders(new Set(allCurrentIds));
    } else {
      setSelectedOrders(new Set());
    }
  }, [allCurrentIds]);

  const handleSelectOrder = useCallback((id) => {
    setSelectedOrders((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleBulkDateUpdate = useCallback(async () => {
    if (!bulkDate || selectedOrders.size === 0) return;
    setBulkUpdating(true);
    let successCount = 0;
    let failCount = 0;
    const selectedList = deliveryTableOrders.filter((o) => selectedOrders.has(o._id || o.Order_uuid));
    const updatedIds = new Set();
    await Promise.all(
      selectedList.map(async (o) => {
        const id = o._id || o.Order_uuid;
        try {
          await axios.put(`/order/updateOrder/${id}`, { createdAt: bulkDate });
          updatedIds.add(id);
          successCount++;
        } catch {
          failCount++;
        }
      })
    );
    // Patch local state so the date grouping updates immediately
    if (updatedIds.size > 0) {
      setOrders((prev) =>
        prev.map((o) => {
          const id = o._id || o.Order_uuid;
          if (!updatedIds.has(id)) return o;
          return { ...o, createdAt: new Date(bulkDate).toISOString() };
        })
      );
    }
    setBulkUpdating(false);
    setSelectedOrders(new Set());
    if (successCount) toast.success(`Updated ${successCount} order(s)`);
    if (failCount) toast.error(`Failed for ${failCount} order(s)`);
  }, [bulkDate, selectedOrders, deliveryTableOrders]);

  // Vendor bulk selection helpers
  const allVendorKeys = useMemo(() => vendorRows.map((r) => r.key), [vendorRows]);
  const allVendorSelected = allVendorKeys.length > 0 && allVendorKeys.every((k) => selectedVendorKeys.has(k));
  const someVendorSelected = selectedVendorKeys.size > 0;

  const handleVendorSelectAll = useCallback((e) => {
    if (e.target.checked) setSelectedVendorKeys(new Set(allVendorKeys));
    else setSelectedVendorKeys(new Set());
  }, [allVendorKeys]);

  const handleVendorSelect = useCallback((key) => {
    setSelectedVendorKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const handleVendorBulkDateUpdate = useCallback(async () => {
    if (!vendorBulkDate || selectedVendorKeys.size === 0) return;
    setVendorBulkUpdating(true);
    const orderIds = new Set(
      vendorRows.filter((r) => selectedVendorKeys.has(r.key)).map((r) => r.orderId)
    );
    let successCount = 0;
    let failCount = 0;
    const updatedIds = new Set();
    await Promise.all(
      Array.from(orderIds).map(async (id) => {
        try {
          await axios.put(`/order/updateOrder/${id}`, { createdAt: vendorBulkDate });
          updatedIds.add(id);
          successCount++;
        } catch {
          failCount++;
        }
      })
    );
    if (updatedIds.size > 0) {
      setOrders((prev) =>
        prev.map((o) => {
          const id = o._id || o.Order_uuid;
          if (!updatedIds.has(id)) return o;
          return { ...o, createdAt: new Date(vendorBulkDate).toISOString() };
        })
      );
    }
    setVendorBulkUpdating(false);
    setSelectedVendorKeys(new Set());
    if (successCount) toast.success(`Updated ${successCount} order(s)`);
    if (failCount) toast.error(`Failed for ${failCount} order(s)`);
  }, [vendorBulkDate, selectedVendorKeys, vendorRows]);

  // Vendor PO edit handlers
  const handleVendorEditClick = (row) => {
    setSelectedVendorRow(row);
    setVendorExtraCharges(row.extraCharges.length ? [...row.extraCharges] : []);
    setVendorEditOpen(true);
  };

  const handleVendorEditSave = useCallback(async () => {
    if (!selectedVendorRow) return;
    setVendorSaving(true);
    const { orderId, orderRef, stepIdx } = selectedVendorRow;
    const validCharges = vendorExtraCharges.filter((c) => c.label?.trim() && Number(c.amount) > 0);
    const updatedSteps = (orderRef.Steps || []).map((step, i) =>
      i !== stepIdx ? step : { ...step, extraCharges: validCharges }
    );
    try {
      await axios.put(`/order/updateOrder/${orderId}`, { Steps: updatedSteps });
      setOrders((prev) =>
        prev.map((o) => {
          const id = o._id || o.Order_uuid;
          return id !== orderId ? o : { ...o, Steps: updatedSteps };
        })
      );
      toast.success("PO updated successfully");
      setVendorEditOpen(false);
      setSelectedVendorRow(null);
    } catch {
      toast.error("Failed to save PO");
    } finally {
      setVendorSaving(false);
    }
  }, [selectedVendorRow, vendorExtraCharges]);

  const addExtraCharge = () =>
    setVendorExtraCharges((prev) => [...prev, { label: "", amount: "" }]);

  const removeExtraCharge = (idx) =>
    setVendorExtraCharges((prev) => prev.filter((_, i) => i !== idx));

  const updateExtraCharge = (idx, field, value) =>
    setVendorExtraCharges((prev) =>
      prev.map((c, i) => (i === idx ? { ...c, [field]: value } : c))
    );

  // Sidebar: jump to a typed date
  const handleSidebarDateGo = () => {
    if (sidebarDateInput) setSelectedDate(sidebarDateInput);
  };

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(14);
    doc.text("Delivery Report", 14, 15);
    doc.setFontSize(10);
    doc.text(`Date: ${selectedDate ? fmtDate(selectedDate) : "All Dates"}`, 14, 22);
    doc.autoTable({
      head: [["#", "Customer", "Remark", "Amount", "Date"]],
      body: dateOrders.map((o) => [
        o.Order_Number || "",
        o.Customer_name || "",
        getFirstRemark(o) || "",
        money(o.totalAmount),
        fmtDate(o.createdAt),
      ]),
      startY: 27,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [34, 139, 34] },
    });
    if (vendorRows.length) {
      doc.addPage();
      doc.setFontSize(14);
      doc.text("Vendor Purchases", 14, 15);
      doc.autoTable({
        head: [["Order #", "Customer", "Vendor", "Step / Job", "Cost"]],
        body: vendorRows.map((r) => [
          r.orderNumber,
          r.customer || "",
          r.vendorName,
          r.stepLabel,
          money(r.costAmount),
        ]),
        startY: 20,
        styles: { fontSize: 9 },
        headStyles: { fillColor: [200, 50, 50] },
      });
    }
    const datePart = selectedDate || "all";
    doc.save(`delivery_report_${datePart}.pdf`);
  };

  const exportExcel = () => {
    const wb = XLSX.utils.book_new();
    const ws1 = XLSX.utils.json_to_sheet(dateOrders.map((o) => ({
      "Order #": o.Order_Number || "",
      Customer: o.Customer_name || "",
      Remark: getFirstRemark(o) || "",
      Amount: o.totalAmount,
      "Item Count": Array.isArray(o.Items) ? o.Items.length : 0,
      Date: fmtDate(o.createdAt),
      "Delivery Date": o.highestStatusTask?.Delivery_Date ? fmtDate(o.highestStatusTask.Delivery_Date) : "",
      Status: o.highestStatusTask?.Task || "",
    })));
    XLSX.utils.book_append_sheet(wb, ws1, "Deliveries");
    if (vendorRows.length) {
      const ws2 = XLSX.utils.json_to_sheet(vendorRows.map((r) => ({
        "Order #": r.orderNumber,
        Customer: r.customer || "",
        Vendor: r.vendorName,
        "Step / Job": r.stepLabel,
        Cost: r.costAmount,
        "Posting Status": r.isPosted ? "Posted" : "Pending",
      })));
      XLSX.utils.book_append_sheet(wb, ws2, "Vendor Purchases");
    }
    const datePart = selectedDate || "all";
    XLSX.writeFile(wb, `delivery_report_${datePart}.xlsx`);
  };

  const handleEditClick = (order) => {
    const id = order._id || order.Order_id || null;
    if (!id) return toast.error("Invalid order ID.");
    setSelectedOrder({ ...order, _id: id });
    setEditOpen(true);
  };

  const handleOrderUpdateClick = (order) => {
    const id = order._id || order.Order_id || null;
    if (!id) return toast.error("Invalid order ID.");
    setSelectedOrder({ ...order, _id: id });
    setOrderUpdateOpen(true);
  };

  const closeEditModal = () => {
    setEditOpen(false);
    if (!orderUpdateOpen) setSelectedOrder(null);
  };
  const closeOrderUpdateModal = () => setOrderUpdateOpen(false);

  const selectedLabel = selectedDate ? fmtDate(selectedDate) : "All Dates";

  return (
    <>
      <Box sx={{ display: "flex", minHeight: "80vh", gap: 2, p: { xs: 1, md: 2 } }}>

        {/* ── Left sidebar: date list ── */}
        <Paper
          variant="outlined"
          sx={{ width: 210, flexShrink: 0, borderRadius: 3, display: { xs: "none", md: "flex" }, flexDirection: "column", overflow: "hidden" }}
        >
          <Box sx={{ p: 1.5, pb: 1 }}>
            <Typography variant="subtitle2" fontWeight={700}>Deliveries</Typography>
            {/* Date picker to jump to a specific date */}
            <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mt: 1 }}>
              <TextField
                type="date"
                size="small"
                value={sidebarDateInput}
                onChange={(e) => setSidebarDateInput(e.target.value)}
                sx={{ flex: 1, "& input": { fontSize: 12, py: 0.6 } }}
                InputLabelProps={{ shrink: true }}
              />
              <Tooltip title="Go to date">
                <IconButton size="small" onClick={handleSidebarDateGo} color="primary">
                  <EventIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Stack>
          </Box>
          <Divider />
          <Box sx={{ overflowY: "auto", flex: 1 }}>
            <Box
              onClick={() => setSelectedDate(null)}
              sx={{
                px: 2, py: 1.25, cursor: "pointer",
                bgcolor: selectedDate === null ? "primary.main" : "transparent",
                color: selectedDate === null ? "primary.contrastText" : "text.primary",
                "&:hover": { bgcolor: selectedDate === null ? "primary.dark" : "action.hover" },
              }}
            >
              <Typography variant="body2" fontWeight={700}>All Dates</Typography>
              <Typography variant="caption" sx={{ opacity: 0.75 }}>
                {filteredOrders.length} orders
              </Typography>
            </Box>
            <Divider />
            {loading ? (
              <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
                <CircularProgress size={20} />
              </Box>
            ) : availableDates.length === 0 ? (
              <Typography variant="caption" color="text.secondary" sx={{ p: 2, display: "block" }}>
                No dates
              </Typography>
            ) : (
              availableDates.map((date) => (
                <Box key={date}>
                  <Box
                    onClick={() => setSelectedDate(date)}
                    sx={{
                      px: 2, py: 1.25, cursor: "pointer",
                      bgcolor: selectedDate === date ? "primary.main" : "transparent",
                      color: selectedDate === date ? "primary.contrastText" : "text.primary",
                      "&:hover": { bgcolor: selectedDate === date ? "primary.dark" : "action.hover" },
                    }}
                  >
                    <Typography variant="body2" fontWeight={600}>{fmtDate(date)}</Typography>
                    <Typography variant="caption" sx={{ opacity: 0.75 }}>
                      {dateCountMap[date] || 0} orders
                    </Typography>
                  </Box>
                  <Divider />
                </Box>
              ))
            )}
          </Box>
        </Paper>

        {/* ── Right panel ── */}
        <Box sx={{ flex: 1, minWidth: 0 }}>

          {/* Header toolbar */}
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={1}
            alignItems={{ xs: "stretch", sm: "center" }}
            sx={{ mb: 1.5 }}
          >
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="h5" fontWeight={900} noWrap>
                Delivered Orders
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {selectedLabel} · {stats.orderCount} orders
              </Typography>
            </Box>

            {/* Search */}
            <TextField
              size="small"
              placeholder="Search customer"
              value={searchOrder}
              onChange={(e) => setSearchOrder(e.target.value)}
              sx={{ width: { xs: "100%", sm: 180 } }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" />
                  </InputAdornment>
                ),
              }}
            />

            {/* Status filter */}
            <FormControl size="small" sx={{ width: { xs: "100%", sm: 130 } }}>
              <InputLabel>Status</InputLabel>
              <Select value={filter} label="Status" onChange={(e) => setFilter(e.target.value)}>
                <MenuItem value="">All</MenuItem>
                <MenuItem value="delivered">Delivered</MenuItem>
                <MenuItem value="design">Design</MenuItem>
                <MenuItem value="print">Print</MenuItem>
              </Select>
            </FormControl>

            {/* Export buttons */}
            <Stack direction="row" spacing={1}>
              <Tooltip title="Export as PDF">
                <Button
                  variant="contained" color="error" size="small"
                  startIcon={<PictureAsPdfIcon />}
                  onClick={exportPDF}
                  sx={{ borderRadius: 2, textTransform: "none", fontWeight: 800 }}
                >
                  PDF
                </Button>
              </Tooltip>
              <Tooltip title="Export as Excel">
                <Button
                  variant="contained" size="small"
                  startIcon={<GridOnIcon />}
                  onClick={exportExcel}
                  sx={{ borderRadius: 2, textTransform: "none", fontWeight: 800 }}
                >
                  Excel
                </Button>
              </Tooltip>
            </Stack>
          </Stack>

          {/* Bulk action bar — shown when orders are selected */}
          {someSelected && (
            <Paper
              variant="outlined"
              sx={{
                mb: 1.5, px: 2, py: 1, borderRadius: 2, borderColor: "primary.main",
                bgcolor: "primary.50",
                display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap",
              }}
            >
              <Typography variant="body2" fontWeight={700} color="primary.main">
                {selectedOrders.size} order{selectedOrders.size > 1 ? "s" : ""} selected
              </Typography>
              <TextField
                type="date"
                size="small"
                label="Set Delivery Date"
                value={bulkDate}
                onChange={(e) => setBulkDate(e.target.value)}
                InputLabelProps={{ shrink: true }}
                sx={{ width: 180 }}
              />
              <Button
                variant="contained"
                size="small"
                onClick={handleBulkDateUpdate}
                disabled={bulkUpdating || !bulkDate}
                sx={{ borderRadius: 2, textTransform: "none", fontWeight: 700 }}
              >
                {bulkUpdating ? "Updating…" : "Update Date"}
              </Button>
              <Button
                variant="outlined"
                size="small"
                onClick={() => setSelectedOrders(new Set())}
                sx={{ borderRadius: 2, textTransform: "none" }}
              >
                Clear
              </Button>
            </Paper>
          )}

          {/* Summary cards */}
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ mb: 2 }}>
            {[
              { label: "Total Orders",    value: stats.orderCount,   color: "text.primary",  fmt: (v) => v },
              { label: "Delivery Value",  value: stats.deliveryValue, color: "success.dark",  fmt: money },
              { label: "Vendor Cost",     value: stats.vendorCost,   color: "error.dark",    fmt: money },
              { label: "Net",             value: stats.net,          color: stats.net >= 0 ? "success.dark" : "error.dark", fmt: money },
            ].map(({ label, value, color, fmt }) => (
              <Card key={label} variant="outlined" sx={{ flex: 1, borderRadius: 3 }}>
                <CardContent sx={{ p: 1.25, "&:last-child": { pb: 1.25 } }}>
                  <Typography variant="caption" color="text.secondary">{label}</Typography>
                  <Typography variant="h6" fontWeight={900} color={color}>{fmt(value)}</Typography>
                </CardContent>
              </Card>
            ))}
          </Stack>

          {loading ? (
            <Box sx={{ textAlign: "center", py: 6 }}>
              <CircularProgress />
            </Box>
          ) : dateOrders.length === 0 ? (
            <Alert severity="info" variant="outlined" sx={{ borderRadius: 3 }}>
              No delivered orders found{selectedDate ? ` for ${fmtDate(selectedDate)}` : ""}.
            </Alert>
          ) : (
            <Stack direction={{ xs: "column", lg: "row" }} spacing={2} alignItems="flex-start">
              {/* ── Section 1: Deliveries (IN) ── */}
              <Paper variant="outlined" sx={{ borderRadius: 3, flex: 1, minWidth: 0 }}>
                <Stack
                  direction="row" justifyContent="space-between" alignItems="center"
                  sx={{ px: 2, py: 1.25, borderBottom: "1px solid", borderColor: "divider" }}
                >
                  <Stack direction="row" spacing={1} alignItems="center">
                    <LocalShippingIcon fontSize="small" color="success" />
                    <Typography variant="subtitle2" fontWeight={700} color="success.dark"
                      sx={{ textTransform: "uppercase", letterSpacing: 1 }}>
                      Deliveries to Customers (IN)
                    </Typography>
                    <Tooltip title={showEmptyItems ? "Showing orders with no items — click to show all" : "Show only orders with no items"}>
                      <FormControlLabel
                        control={
                          <Switch
                            size="small"
                            checked={showEmptyItems}
                            onChange={(e) => setShowEmptyItems(e.target.checked)}
                            color="warning"
                          />
                        }
                        label={
                          <Typography variant="caption" color={showEmptyItems ? "warning.dark" : "text.secondary"} fontWeight={600}>
                            Empty Items
                          </Typography>
                        }
                        sx={{ ml: 0.5, mr: 0 }}
                      />
                    </Tooltip>
                  </Stack>
                  <Typography variant="subtitle2" fontWeight={700} color="success.dark">
                    {money(stats.deliveryValue)}
                  </Typography>
                </Stack>

                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        {/* Bulk select checkbox */}
                        <TableCell padding="checkbox">
                          <Checkbox
                            size="small"
                            checked={allSelected}
                            indeterminate={someSelected && !allSelected}
                            onChange={handleSelectAll}
                          />
                        </TableCell>
                        <TableCell sx={{ fontWeight: 700, width: 60 }}>#</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Customer</TableCell>
                        <TableCell sx={{ fontWeight: 700 }}>Remark</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700, width: 100 }}>Amount</TableCell>
                        <TableCell align="center" sx={{ fontWeight: 700, width: 70 }}>Action</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {deliveryTableOrders.map((o) => {
                        const key = o._id || o.Order_uuid || `o-${o.Order_Number}`;
                        const rowId = o._id || o.Order_uuid;
                        const hasItems = hasBillableAmount(o.Items);
                        return (
                          <TableRow key={key} hover selected={selectedOrders.has(rowId)}>
                            <TableCell padding="checkbox">
                              <Checkbox
                                size="small"
                                checked={selectedOrders.has(rowId)}
                                onChange={() => handleSelectOrder(rowId)}
                              />
                            </TableCell>
                            <TableCell>
                              <Typography variant="body2" fontWeight={700}>#{o.Order_Number}</Typography>
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="text" size="small"
                                onClick={() => handleOrderUpdateClick(o)}
                                sx={{ p: 0, fontWeight: 700, textTransform: "none", minWidth: 0 }}
                              >
                                {o.Customer_name}
                              </Button>
                            </TableCell>
                            <TableCell>
                              <Typography variant="body2" noWrap sx={{ maxWidth: 200 }}>
                                {getFirstRemark(o) || "—"}
                              </Typography>
                            </TableCell>
                            <TableCell align="right">
                              <Typography variant="body2" fontWeight={700}>
                                {o.totalAmount > 0 ? money(o.totalAmount) : "—"}
                              </Typography>
                            </TableCell>
                            <TableCell align="center">
                              <Tooltip title={hasItems ? "Edit Invoice" : "Create Invoice"}>
                                <IconButton
                                  size="small"
                                  color={hasItems ? "primary" : "success"}
                                  onClick={() => handleEditClick(o)}
                                >
                                  {hasItems ? <EditIcon fontSize="small" /> : <ReceiptIcon fontSize="small" />}
                                </IconButton>
                              </Tooltip>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Paper>

              {/* ── Section 2: Vendor Purchases (OUT) ── */}
              <Paper variant="outlined" sx={{ borderRadius: 3, borderColor: "error.light", flex: 1, minWidth: 0 }}>
                <Stack
                  direction="row" justifyContent="space-between" alignItems="center"
                  sx={{ px: 2, py: 1.25, borderBottom: "1px solid", borderColor: "divider" }}
                >
                  <Stack direction="row" spacing={1} alignItems="center">
                    <StorefrontIcon fontSize="small" color="error" />
                    <Typography variant="subtitle2" fontWeight={700} color="error.dark"
                      sx={{ textTransform: "uppercase", letterSpacing: 1 }}>
                      Purchases from Vendors (OUT)
                    </Typography>
                  </Stack>
                  <Typography variant="subtitle2" fontWeight={700} color="error.dark">
                    {money(stats.vendorCost)}
                  </Typography>
                </Stack>

                {/* Vendor bulk action bar */}
                {someVendorSelected && (
                  <Box sx={{ px: 2, py: 1, borderBottom: "1px solid", borderColor: "divider",
                    bgcolor: "error.50", display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap" }}>
                    <Typography variant="body2" fontWeight={700} color="error.dark">
                      {selectedVendorKeys.size} row{selectedVendorKeys.size > 1 ? "s" : ""} selected
                    </Typography>
                    <TextField
                      type="date"
                      size="small"
                      label="Set Date"
                      value={vendorBulkDate}
                      onChange={(e) => setVendorBulkDate(e.target.value)}
                      InputLabelProps={{ shrink: true }}
                      sx={{ width: 170 }}
                    />
                    <Button
                      variant="contained" color="error" size="small"
                      onClick={handleVendorBulkDateUpdate}
                      disabled={vendorBulkUpdating || !vendorBulkDate}
                      sx={{ borderRadius: 2, textTransform: "none", fontWeight: 700 }}
                    >
                      {vendorBulkUpdating ? "Updating…" : "Update Date"}
                    </Button>
                    <Button
                      variant="outlined" color="error" size="small"
                      onClick={() => setSelectedVendorKeys(new Set())}
                      sx={{ borderRadius: 2, textTransform: "none" }}
                    >
                      Clear
                    </Button>
                  </Box>
                )}

                {vendorRows.length === 0 ? (
                  <Box sx={{ p: 2 }}>
                    <Alert severity="info" sx={{ borderRadius: 2 }}>
                      No vendor costs recorded for these orders.
                    </Alert>
                  </Box>
                ) : (
                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell padding="checkbox">
                            <Checkbox
                              size="small"
                              checked={allVendorSelected}
                              indeterminate={someVendorSelected && !allVendorSelected}
                              onChange={handleVendorSelectAll}
                            />
                          </TableCell>
                          <TableCell sx={{ fontWeight: 700, width: 70 }}>Order #</TableCell>
                          <TableCell sx={{ fontWeight: 700 }}>Vendor</TableCell>
                          <TableCell sx={{ fontWeight: 700 }}>Step / Job</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 700, width: 100 }}>Cost</TableCell>
                          <TableCell sx={{ fontWeight: 700, width: 90 }}>Status</TableCell>
                          <TableCell align="center" sx={{ fontWeight: 700, width: 60 }}>Edit</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {vendorRows.map((r) => {
                          const extraTotal = r.extraCharges.reduce((s, c) => s + Number(c.amount || 0), 0);
                          return (
                            <TableRow key={r.key} hover selected={selectedVendorKeys.has(r.key)}>
                              <TableCell padding="checkbox">
                                <Checkbox
                                  size="small"
                                  checked={selectedVendorKeys.has(r.key)}
                                  onChange={() => handleVendorSelect(r.key)}
                                />
                              </TableCell>
                              <TableCell>
                                <Typography variant="body2" fontWeight={700}>#{r.orderNumber}</Typography>
                              </TableCell>
                              <TableCell>
                                <Typography variant="body2">{r.vendorName}</Typography>
                              </TableCell>
                              <TableCell>
                                <Typography variant="body2" noWrap sx={{ maxWidth: 160 }}>
                                  {r.stepLabel}
                                </Typography>
                              </TableCell>
                              <TableCell align="right">
                                <Typography variant="body2" fontWeight={700} color="error.dark">
                                  {money(r.costAmount + extraTotal)}
                                </Typography>
                                {extraTotal > 0 && (
                                  <Typography variant="caption" color="text.secondary" display="block">
                                    +{money(extraTotal)} extras
                                  </Typography>
                                )}
                              </TableCell>
                              <TableCell>
                                <Chip
                                  size="small"
                                  label={r.isPosted ? "Posted" : "Pending"}
                                  color={r.isPosted ? "success" : "warning"}
                                  variant="outlined"
                                />
                              </TableCell>
                              <TableCell align="center">
                                <Tooltip title="Edit PO">
                                  <IconButton size="small" color="error" onClick={() => handleVendorEditClick(r)}>
                                    <EditIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}
              </Paper>
            </Stack>
          )}
        </Box>
      </Box>

      {/* UpdateDelivery — renders its own fixed overlay */}
      {editOpen && (
        <UpdateDelivery
          mode="edit"
          order={selectedOrder || {}}
          onClose={closeEditModal}
          onOrderPatched={(id, patch) => upsertOrderPatch(id, patch)}
          onOrderReplaced={(full) => upsertOrderReplace(full)}
        />
      )}

      {/* Vendor PO Edit dialog */}
      <Dialog
        open={vendorEditOpen}
        onClose={() => { setVendorEditOpen(false); setSelectedVendorRow(null); }}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          Edit PO — #{selectedVendorRow?.orderNumber}
          <Box sx={{ flex: 1 }} />
          <IconButton onClick={() => { setVendorEditOpen(false); setSelectedVendorRow(null); }}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {selectedVendorRow && (() => {
            const extraTotal = vendorExtraCharges.reduce((s, c) => s + Number(c.amount || 0), 0);
            const grandTotal = selectedVendorRow.costAmount + extraTotal;
            return (
              <Stack spacing={2}>
                {/* PO summary */}
                <Stack direction="row" spacing={2} sx={{ p: 1.5, bgcolor: "grey.50", borderRadius: 2 }}>
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="caption" color="text.secondary">Vendor</Typography>
                    <Typography variant="body2" fontWeight={700}>{selectedVendorRow.vendorName}</Typography>
                  </Box>
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="caption" color="text.secondary">Step / Job</Typography>
                    <Typography variant="body2" fontWeight={700}>{selectedVendorRow.stepLabel}</Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary">Base Cost</Typography>
                    <Typography variant="body2" fontWeight={700} color="error.dark">
                      {money(selectedVendorRow.costAmount)}
                    </Typography>
                  </Box>
                </Stack>

                {/* Extra charges */}
                <Box>
                  <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                    <Typography variant="subtitle2" fontWeight={700}>Additional Charges</Typography>
                    <Button size="small" startIcon={<AddIcon />} onClick={addExtraCharge}
                      sx={{ textTransform: "none" }}>
                      Add
                    </Button>
                  </Stack>

                  {vendorExtraCharges.length === 0 ? (
                    <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
                      No additional charges. Click "Add" to add freight, packing, etc.
                    </Typography>
                  ) : (
                    <Stack spacing={1}>
                      {vendorExtraCharges.map((charge, idx) => (
                        <Stack key={idx} direction="row" spacing={1} alignItems="center">
                          <TextField
                            size="small"
                            label="Label (e.g. Freight)"
                            value={charge.label}
                            onChange={(e) => updateExtraCharge(idx, "label", e.target.value)}
                            sx={{ flex: 2 }}
                          />
                          <TextField
                            size="small"
                            label="Amount"
                            type="number"
                            value={charge.amount}
                            onChange={(e) => updateExtraCharge(idx, "amount", e.target.value)}
                            sx={{ flex: 1 }}
                            inputProps={{ min: 0 }}
                          />
                          <IconButton size="small" color="error" onClick={() => removeExtraCharge(idx)}>
                            <DeleteOutlineIcon fontSize="small" />
                          </IconButton>
                        </Stack>
                      ))}
                    </Stack>
                  )}
                </Box>

                <Divider />

                {/* Grand total */}
                <Stack direction="row" justifyContent="space-between" alignItems="center"
                  sx={{ px: 1.5, py: 1, bgcolor: "error.50", borderRadius: 2 }}>
                  <Typography variant="subtitle2" fontWeight={700}>Grand Total</Typography>
                  <Typography variant="h6" fontWeight={900} color="error.dark">
                    {money(grandTotal)}
                  </Typography>
                </Stack>
              </Stack>
            );
          })()}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => { setVendorEditOpen(false); setSelectedVendorRow(null); }}
            sx={{ textTransform: "none" }}>
            Cancel
          </Button>
          <Button
            variant="contained" color="error"
            onClick={handleVendorEditSave}
            disabled={vendorSaving}
            sx={{ borderRadius: 2, textTransform: "none", fontWeight: 700 }}
          >
            {vendorSaving ? "Saving…" : "Save PO"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* OrderUpdate modal */}
      <Dialog
        open={orderUpdateOpen}
        onClose={closeOrderUpdateModal}
        fullWidth
        maxWidth="xl"
        TransitionProps={{
          onExited: () => { if (!editOpen) setSelectedOrder(null); },
        }}
      >
        <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          Order Details
          <Box sx={{ flex: 1 }} />
          <IconButton onClick={closeOrderUpdateModal}><CloseIcon /></IconButton>
        </DialogTitle>
        <DialogContent dividers>
          <OrderUpdate
            order={selectedOrder || {}}
            onClose={closeOrderUpdateModal}
            onOrderPatched={(id, patch) => upsertOrderPatch(id, patch)}
            onOrderReplaced={(full) => upsertOrderReplace(full)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
