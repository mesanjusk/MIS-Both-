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

  // Purchase Orders state
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [loadingPOs, setLoadingPOs] = useState(false);
  const [showAutoOnly, setShowAutoOnly] = useState(false);
  const [editPO, setEditPO] = useState(null);
  const [editPOOpen, setEditPOOpen] = useState(false);

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

  // Fetch all Purchase Orders once on mount
  useEffect(() => {
    let isMounted = true;
    (async () => {
      setLoadingPOs(true);
      try {
        const res = await axios.get("/api/purchaseorder/list");
        if (isMounted) setPurchaseOrders(res.data?.result ?? []);
      } catch (err) {
        console.error("PO fetch error:", err?.message || err);
        if (isMounted) setPurchaseOrders([]);
      } finally {
        if (isMounted) setLoadingPOs(false);
      }
    })();
    return () => { isMounted = false; };
  }, []);

  // POs filtered by toggle: ON = only auto-created (all items have rate === 1)
  const filteredPOs = useMemo(() => {
    if (!showAutoOnly) return purchaseOrders;
    return purchaseOrders.filter(
      (po) => Array.isArray(po.Items) && po.Items.length > 0 &&
              po.Items.every((it) => Number(it.rate ?? it.Rate ?? 0) === 1)
    );
  }, [purchaseOrders, showAutoOnly]);

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
      o.Steps.forEach((step) => {
        const cost = Number(step.costAmount || 0);
        if (cost > 0) {
          rows.push({
            orderNumber: o.Order_Number,
            customer: o.Customer_name,
            stepLabel: step.label || "—",
            vendorName: step.vendorName || "—",
            costAmount: cost,
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
    if (filteredPOs.length) {
      const ws3 = XLSX.utils.json_to_sheet(
        filteredPOs.flatMap((po) =>
          Array.isArray(po.Items) && po.Items.length
            ? po.Items.map((it) => ({
                "PO #": po.PO_Number,
                Vendor: po.Vendor_name || "",
                Item: it.itemName || it.Item || "",
                Qty: it.qty ?? it.Quantity ?? 0,
                Rate: it.rate ?? it.Rate ?? 0,
                Amount: it.amount ?? it.Amount ?? 0,
                Status: po.status || "draft",
                Date: fmtDate(po.createdAt),
                Notes: po.notes || "",
              }))
            : [{
                "PO #": po.PO_Number,
                Vendor: po.Vendor_name || "",
                Item: "", Qty: 0, Rate: 0, Amount: 0,
                Status: po.status || "draft",
                Date: fmtDate(po.createdAt),
                Notes: po.notes || "",
              }]
        )
      );
      XLSX.utils.book_append_sheet(wb, ws3, "Purchase Orders");
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

  const handleEditPOClick = (po) => { setEditPO({ ...po }); setEditPOOpen(true); };

  const handleSavePO = useCallback(async () => {
    if (!editPO) return;
    try {
      const id = editPO.PO_uuid || editPO._id;
      const res = await axios.put(`/api/purchaseorder/${id}`, {
        Items: editPO.Items,
        notes: editPO.notes,
        status: editPO.status,
      });
      if (res.data?.success) {
        setPurchaseOrders((prev) =>
          prev.map((p) => (p.PO_uuid === editPO.PO_uuid || p._id === editPO._id) ? res.data.result : p)
        );
        setEditPOOpen(false);
        toast.success(`PO #${editPO.PO_Number} updated`);
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || "PO update failed");
    }
  }, [editPO]);

  const selectedLabel = selectedDate ? fmtDate(selectedDate) : "All Dates";

  return (
    <>
      <Box sx={{ display: "flex", minHeight: "80vh", gap: 2, p: { xs: 1, md: 2 } }}>

        {/* ── Left sidebar: date list ── */}
        <Paper
          variant="outlined"
          sx={{ width: 210, flexShrink: 0, borderRadius: 3, display: { xs: "none", md: "flex" }, flexDirection: "column", overflow: "hidden", height: "calc(100vh - 80px)", position: "sticky", top: 16 }}
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

              {/* ── Section 2: Purchases from Vendors (OUT) — Purchase Orders ── */}
              <Paper variant="outlined" sx={{ borderRadius: 3, borderColor: "error.light", flex: 1, minWidth: 0 }}>
                {/* Header */}
                <Stack
                  direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap"
                  sx={{ px: 2, py: 1.25, borderBottom: "1px solid", borderColor: "divider", gap: 1 }}
                >
                  <Stack direction="row" spacing={1} alignItems="center">
                    <StorefrontIcon fontSize="small" color="error" />
                    <Typography variant="subtitle2" fontWeight={700} color="error.dark"
                      sx={{ textTransform: "uppercase", letterSpacing: 1 }}>
                      Purchases from Vendors (OUT)
                    </Typography>
                  </Stack>
                  <Stack direction="row" spacing={1.5} alignItems="center">
                    {/* Toggle: show only auto-created POs (rate = 1) */}
                    <FormControlLabel
                      control={
                        <Switch
                          size="small"
                          checked={showAutoOnly}
                          onChange={(e) => setShowAutoOnly(e.target.checked)}
                          color="error"
                        />
                      }
                      label={
                        <Typography variant="caption" color="text.secondary">
                          Auto PO only
                        </Typography>
                      }
                      sx={{ m: 0 }}
                    />
                    <Typography variant="subtitle2" fontWeight={700} color="error.dark">
                      {money(filteredPOs.reduce((s, po) => s + Number(po.totalAmount || 0), 0))}
                    </Typography>
                  </Stack>
                </Stack>

                {/* PO table */}
                {loadingPOs ? (
                  <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
                    <CircularProgress size={22} />
                  </Box>
                ) : filteredPOs.length === 0 ? (
                  <Box sx={{ p: 2 }}>
                    <Alert severity="info" sx={{ borderRadius: 2 }}>
                      {showAutoOnly
                        ? "No auto-created POs found for this date."
                        : "No purchase orders found for this date."}
                    </Alert>
                  </Box>
                ) : (
                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell sx={{ fontWeight: 700, width: 60 }}>PO #</TableCell>
                          <TableCell sx={{ fontWeight: 700 }}>Vendor</TableCell>
                          <TableCell sx={{ fontWeight: 700 }}>Items</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 700, width: 90 }}>Total</TableCell>
                          <TableCell align="center" sx={{ fontWeight: 700, width: 70 }}>Edit</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {filteredPOs.map((po) => {
                          const statusColor = {
                            draft: "default", sent: "info",
                            received: "success", cancelled: "error",
                          }[po.status] || "default";
                          const itemSummary = Array.isArray(po.Items) && po.Items.length
                            ? po.Items.map((it) =>
                                `${it.itemName || it.Item || "—"}${Number(it.qty || it.Quantity || 0) !== 1 ? ` ×${it.qty || it.Quantity}` : ""}`
                              ).join(", ")
                            : "—";
                          return (
                            <TableRow key={po.PO_uuid || po._id} hover>
                              <TableCell>
                                <Typography variant="body2" fontWeight={700}>#{po.PO_Number}</Typography>
                              </TableCell>
                              <TableCell>
                                <Typography variant="body2" fontWeight={600}>{po.Vendor_name || "—"}</Typography>
                              </TableCell>
                              <TableCell>
                                <Tooltip title={itemSummary}>
                                  <Typography variant="body2" noWrap sx={{ maxWidth: 220 }}>
                                    {itemSummary}
                                  </Typography>
                                </Tooltip>
                              </TableCell>
                              <TableCell align="right">
                                <Typography variant="body2" fontWeight={700} color="error.dark">
                                  {po.totalAmount > 0 ? money(po.totalAmount) : "—"}
                                </Typography>
                              </TableCell>
                              <TableCell align="center">
                                <Tooltip title="Edit PO">
                                  <IconButton size="small" color="primary" onClick={() => handleEditPOClick(po)}>
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

      {/* PO Edit Dialog */}
      <Dialog open={editPOOpen} onClose={() => setEditPOOpen(false)} fullWidth maxWidth="md">
        <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          PO #{editPO?.PO_Number} — {editPO?.Vendor_name || ""}
          <Box sx={{ flex: 1 }} />
          <IconButton onClick={() => setEditPOOpen(false)}><CloseIcon /></IconButton>
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {/* Items table */}
            {Array.isArray(editPO?.Items) && editPO.Items.length > 0 && (
              <Box>
                <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>Items</Typography>
                <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 700 }}>Item Name</TableCell>
                        <TableCell align="center" sx={{ fontWeight: 700, width: 80 }}>Qty</TableCell>
                        <TableCell align="center" sx={{ fontWeight: 700, width: 80 }}>Rate</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700, width: 90 }}>Amount</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {editPO.Items.map((item, idx) => (
                        <TableRow key={idx}>
                          <TableCell>
                            <TextField
                              size="small" fullWidth variant="standard"
                              value={item.itemName || item.Item || ""}
                              onChange={(e) => {
                                const items = editPO.Items.map((it, i) =>
                                  i === idx ? { ...it, itemName: e.target.value } : it
                                );
                                setEditPO((p) => ({ ...p, Items: items }));
                              }}
                            />
                          </TableCell>
                          <TableCell align="center">
                            <TextField
                              size="small" type="number" variant="standard"
                              inputProps={{ min: 0, style: { textAlign: "center" } }}
                              value={item.qty ?? item.Quantity ?? 0}
                              onChange={(e) => {
                                const qty = Number(e.target.value);
                                const items = editPO.Items.map((it, i) =>
                                  i === idx ? { ...it, qty, amount: qty * Number(it.rate ?? it.Rate ?? 0) } : it
                                );
                                setEditPO((p) => ({ ...p, Items: items }));
                              }}
                              sx={{ width: 64 }}
                            />
                          </TableCell>
                          <TableCell align="center">
                            <TextField
                              size="small" type="number" variant="standard"
                              inputProps={{ min: 0, style: { textAlign: "center" } }}
                              value={item.rate ?? item.Rate ?? 0}
                              onChange={(e) => {
                                const rate = Number(e.target.value);
                                const items = editPO.Items.map((it, i) =>
                                  i === idx ? { ...it, rate, amount: rate * Number(it.qty ?? it.Quantity ?? 0) } : it
                                );
                                setEditPO((p) => ({ ...p, Items: items }));
                              }}
                              sx={{ width: 64 }}
                            />
                          </TableCell>
                          <TableCell align="right">
                            <Typography variant="body2" fontWeight={700} color="error.dark">
                              {money((item.amount ?? item.Amount ?? 0))}
                            </Typography>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>
            )}

            {/* Status */}
            <FormControl size="small" sx={{ maxWidth: 200 }}>
              <InputLabel>Status</InputLabel>
              <Select
                value={editPO?.status || "draft"}
                label="Status"
                onChange={(e) => setEditPO((p) => ({ ...p, status: e.target.value }))}
              >
                <MenuItem value="draft">Draft</MenuItem>
                <MenuItem value="sent">Sent</MenuItem>
                <MenuItem value="received">Received</MenuItem>
                <MenuItem value="cancelled">Cancelled</MenuItem>
              </Select>
            </FormControl>

            {/* Notes */}
            <TextField
              label="Notes"
              size="small"
              fullWidth
              multiline
              rows={2}
              value={editPO?.notes || ""}
              onChange={(e) => setEditPO((p) => ({ ...p, notes: e.target.value }))}
            />

            {/* Save */}
            <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1 }}>
              <Button variant="outlined" onClick={() => setEditPOOpen(false)}>Cancel</Button>
              <Button variant="contained" onClick={handleSavePO}>Save</Button>
            </Box>
          </Stack>
        </DialogContent>
      </Dialog>
    </>
  );
}
