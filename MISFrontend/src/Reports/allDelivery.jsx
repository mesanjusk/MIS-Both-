import React, { useState, useEffect, useMemo, useCallback } from "react";
import { fetchDeliveredOrders } from "../services/orderService";
import { fetchCustomers } from "../services/customerService";
import jsPDF from "jspdf";
import "jspdf-autotable";
import * as XLSX from "xlsx";

import UpdateDelivery from "../Pages/updateDelivery";
import OrderUpdate from "../Pages/OrderUpdate";
import { LoadingSpinner } from "../Components";

/* ✅ MUI */
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
import LocalShippingIcon from "@mui/icons-material/LocalShipping";
import TodayIcon from "@mui/icons-material/Today";
import PersonIcon from "@mui/icons-material/Person";
import AssignmentTurnedInIcon from "@mui/icons-material/AssignmentTurnedIn";

export default function AllDelivery() {
  // 🔧 Central API base (env -> vite -> CRA -> localhost)
  const API_BASE = useMemo(() => {
    const raw =
      import.meta.env.VITE_API_BASE || "http://localhost:5000";
    // Strip /api suffix to prevent /api/api/... double prefix
    return String(raw).replace(/\/api\/?$/, "").replace(/\/$/, "");
  }, []);

  const [orders, setOrders] = useState([]);
  const [searchOrder, setSearchOrder] = useState("");
  const [filter, setFilter] = useState(""); // "", "delivered", "design", "print" etc.
  const [customers, setCustomers] = useState({});
  const [loading, setLoading] = useState(true);

  // ✅ MUI Modals (FIXED close crash pattern)
  const [editOpen, setEditOpen] = useState(false); // UpdateDelivery
  const [orderUpdateOpen, setOrderUpdateOpen] = useState(false); // OrderUpdate
  const [selectedOrder, setSelectedOrder] = useState(null);

  const formatDateDDMMYYYY = (dateString) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return "";
    const dd = String(date.getDate()).padStart(2, "0");
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const yyyy = date.getFullYear();
    return `${dd}-${mm}-${yyyy}`;
  };

  // delivered list = Delivered but **no billable amount**
  const hasBillableAmount = useCallback(
    (items) => Array.isArray(items) && items.some((it) => Number(it?.Amount) > 0),
    []
  );

  useEffect(() => {
    let isMounted = true;
    (async () => {
      setLoading(true);
      try {
        const [ordersRes, customersRes] = await Promise.all([
          fetchDeliveredOrders(),
          fetchCustomers(),
        ]);

        if (!isMounted) return;

        const orderRows = ordersRes?.data?.success ? ordersRes.data.result ?? [] : [];
        const custRows = customersRes?.data?.success ? customersRes.data.result ?? [] : [];

        const customerMap = Array.isArray(custRows)
          ? custRows.reduce((acc, c) => {
              if (c.Customer_uuid && c.Customer_name) {
                acc[c.Customer_uuid] = c.Customer_name;
              }
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

    return () => {
      isMounted = false;
    };
  }, [API_BASE]);

  // Safely compute highest status
  const getHighestStatus = (statusArr) => {
    const list = Array.isArray(statusArr) ? statusArr : [];
    if (list.length === 0) return {};
    return list.reduce((prev, curr) => {
      const prevNum = Number(prev?.Status_number || 0);
      const currNum = Number(curr?.Status_number || 0);
      return currNum > prevNum ? curr : prev;
    }, list[0]);
  };

  // 🔁 Patch/replace helpers (no reload)
  const upsertOrderPatch = useCallback(
    (orderId, patch) => {
      if (!orderId || !patch) return;

      // If Items gain billable amounts, remove from this list
      if (patch.Items && hasBillableAmount(patch.Items)) {
        setOrders((prev) => prev.filter((o) => (o.Order_uuid || o._id) !== orderId));
        if (selectedOrder && (selectedOrder.Order_uuid || selectedOrder._id) === orderId) {
          setEditOpen(false);
          setOrderUpdateOpen(false);
        }
        return;
      }

      setOrders((prev) =>
        prev.map((o) =>
          (o.Order_uuid || o._id) === orderId ? { ...o, ...patch } : o
        )
      );

      if (selectedOrder && (selectedOrder.Order_uuid || selectedOrder._id) === orderId) {
        setSelectedOrder((s) => (s ? { ...s, ...patch } : s));
      }
    },
    [hasBillableAmount, selectedOrder]
  );

  const upsertOrderReplace = useCallback(
    (nextOrder) => {
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
    },
    [hasBillableAmount, selectedOrder]
  );

  // 🔎 Derived list
  const filteredOrders = useMemo(() => {
    return orders
      .map((order) => {
        const highestStatusTask = getHighestStatus(order.Status);
        return {
          ...order,
          highestStatusTask,
          Customer_name: customers[order.Customer_uuid] || "Unknown",
        };
      })
      .filter((order) => {
        const name = (order.Customer_name || "").toLowerCase();
        const matchesSearch = name.includes(searchOrder.toLowerCase());

        const task = (order.highestStatusTask?.Task || "").toLowerCase().trim();
        const filterValue = (filter || "").toLowerCase().trim();
        const matchesFilter = filterValue ? task === filterValue : true;

        return matchesSearch && matchesFilter;
      });
  }, [orders, customers, searchOrder, filter]);

  const totals = useMemo(() => {
    const count = filteredOrders.length;
    return { count };
  }, [filteredOrders]);

  // Export helpers
  const getFirstRemark = (order) => {
    if (!Array.isArray(order?.Items) || order.Items.length === 0) return "";
    return String(order.Items[0]?.Remark || "");
  };

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.text("Delivered Orders Report", 14, 15);
    doc.autoTable({
      head: [["Order Number", "Customer", "Created", "Remark", "Delivery Date", "Assigned", "Task"]],
      body: filteredOrders.map((o) => [
        o.Order_Number || "",
        o.Customer_name || "",
        formatDateDDMMYYYY(o.createdAt),
        getFirstRemark(o),
        formatDateDDMMYYYY(o.highestStatusTask?.Delivery_Date),
        o.highestStatusTask?.Assigned || "",
        o.highestStatusTask?.Task || "",
      ]),
      startY: 20,
    });
    doc.save("delivered_orders.pdf");
  };

  const exportExcel = () => {
    const worksheetData = filteredOrders.map((o) => ({
      "Order Number": o.Order_Number || "",
      Customer: o.Customer_name || "",
      Created: formatDateDDMMYYYY(o.createdAt),
      Remark: getFirstRemark(o),
      "Delivery Date": formatDateDDMMYYYY(o.highestStatusTask?.Delivery_Date),
      Assigned: o.highestStatusTask?.Assigned || "",
      Task: o.highestStatusTask?.Task || "",
    }));

    const worksheet = XLSX.utils.json_to_sheet(worksheetData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Delivered");
    XLSX.writeFile(workbook, "delivered_orders.xlsx");
  };

  // ----- Click handlers -----

  // Card click -> UpdateDelivery (existing behavior)
  const handleEditClick = (order) => {
    const id = order._id || order.Order_id || null;
    if (!id) return alert("⚠️ Invalid order ID.");
    setSelectedOrder({ ...order, _id: id });
    setEditOpen(true);
  };

  // Customer click -> OrderUpdate (existing behavior)
  const handleOrderUpdateClick = (order) => {
    const id = order._id || order.Order_id || null;
    if (!id) return alert("⚠️ Invalid order ID.");
    setSelectedOrder({ ...order, _id: id });
    setOrderUpdateOpen(true);
  };

  // ✅ IMPORTANT: do NOT set selectedOrder null immediately (prevents crash during close animation)
  const closeEditModal = () => setEditOpen(false);
  const closeOrderUpdateModal = () => setOrderUpdateOpen(false);

  const statusChip = (task) => {
    const t = String(task || "").toLowerCase().trim();
    const label = task || "—";
    if (!t) return <Chip size="small" label={label} variant="outlined" />;
    if (t === "delivered") return <Chip size="small" label={label} color="success" />;
    if (t === "design") return <Chip size="small" label={label} color="info" />;
    if (t === "print") return <Chip size="small" label={label} color="warning" />;
    return <Chip size="small" label={label} variant="outlined" />;
  };

  return (
    <>
      <Box sx={{ minHeight: "100vh", bgcolor: "background.default" }}>
        <AppBar position="sticky" elevation={0}>
          <Toolbar>
            <LocalShippingIcon sx={{ mr: 1 }} />
            <Typography variant="h6" sx={{ flex: 1 }}>
              Delivered Orders
            </Typography>

            <Chip
              label={`${totals.count} orders`}
              variant="outlined"
              sx={{ color: "common.white", borderColor: "rgba(255,255,255,0.6)" }}
            />
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
                <InputLabel id="filter-label">Filter by task</InputLabel>
                <Select
                  labelId="filter-label"
                  value={filter}
                  label="Filter by task"
                  onChange={(e) => setFilter(e.target.value)}
                >
                  <MenuItem value="">All</MenuItem>
                  <MenuItem value="delivered">Delivered</MenuItem>
                  <MenuItem value="design">Design</MenuItem>
                  <MenuItem value="print">Print</MenuItem>
                </Select>
              </FormControl>

              <Stack direction="row" spacing={1} justifyContent="flex-end">
                <Tooltip title="Export as PDF">
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

                <Tooltip title="Export as Excel">
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

          {/* List */}
          <Paper variant="outlined" sx={{ borderRadius: 3, p: { xs: 1.5, sm: 2 } }}>
            {loading ? (
              <Grid container spacing={1.5}>
                {Array.from({ length: 12 }).map((_, i) => (
                  <Grid key={i} item xs={12} sm={6} md={4} lg={3} xl={2}>
                    <Card variant="outlined" sx={{ borderRadius: 2 }}>
                      <CardContent>
                        <Skeleton width="55%" />
                        <Skeleton width="80%" />
                        <Skeleton width="65%" />
                        <Skeleton width="45%" />
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
                No delivered orders found.
              </Alert>
            ) : (
              <Grid container spacing={1.5}>
                {filteredOrders.map((o) => {
                  const key = o._id || o.Order_uuid || o.Order_id || `o-${o.Order_Number}`;
                  const deliveryDate = formatDateDDMMYYYY(o.highestStatusTask?.Delivery_Date);

                  return (
                    <Grid key={key} item xs={12} sm={6} md={4} lg={3} xl={2}>
                      <Card
                        variant="outlined"
                        sx={{
                          borderRadius: 2,
                          height: "100%",
                          display: "flex",
                          flexDirection: "column",
                        }}
                      >
                        {/* Card click -> UpdateDelivery */}
                        <CardActionArea onClick={() => handleEditClick(o)} sx={{ flex: 1 }}>
                          <CardContent>
                            <Stack spacing={0.9}>
                              <Stack direction="row" justifyContent="space-between" spacing={1}>
                                <Typography variant="subtitle2" sx={{ fontWeight: 900 }}>
                                  #{o.Order_Number}
                                </Typography>
                                {statusChip(o.highestStatusTask?.Task)}
                              </Stack>

                              {/* Customer click -> OrderUpdate */}
                              <Button
                                variant="text"
                                size="small"
                                startIcon={<PersonIcon fontSize="small" />}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleOrderUpdateClick(o);
                                }}
                                sx={{
                                  p: 0,
                                  minHeight: "auto",
                                  justifyContent: "flex-start",
                                  textTransform: "none",
                                  fontWeight: 900,
                                }}
                                title="Open OrderUpdate"
                              >
                                <Typography variant="body2" noWrap title={o.Customer_name}>
                                  {o.Customer_name}
                                </Typography>
                              </Button>

                              <Stack direction="row" spacing={1} alignItems="center">
                                <TodayIcon fontSize="small" />
                                <Typography variant="caption" color="text.secondary">
                                  {deliveryDate || "—"}
                                </Typography>
                              </Stack>

                              <Divider sx={{ my: 0.4 }} />

                              <Stack direction="row" spacing={1} alignItems="center">
                                <AssignmentTurnedInIcon fontSize="small" />
                                <Typography variant="caption" color="text.secondary" noWrap>
                                  Assigned: {o.highestStatusTask?.Assigned || "—"}
                                </Typography>
                              </Stack>
                            </Stack>
                          </CardContent>
                        </CardActionArea>

                        <Divider />

                        <Box sx={{ p: 1.25 }}>
                          <Button
                            fullWidth
                            variant="outlined"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEditClick(o);
                            }}
                            sx={{ borderRadius: 2, textTransform: "none", fontWeight: 900 }}
                          >
                            Update Delivery
                          </Button>
                        </Box>
                      </Card>
                    </Grid>
                  );
                })}
              </Grid>
            )}
          </Paper>
        </Container>
      </Box>

      {/* ✅ UpdateDelivery Modal (MUI Dialog) */}
      <Dialog
        open={editOpen}
        onClose={closeEditModal}
        fullWidth
        maxWidth="lg"
        TransitionProps={{
          onExited: () => {
            // clear only after close animation finishes (prevents blank-screen crash)
            if (!orderUpdateOpen) setSelectedOrder(null);
          },
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
            onOrderPatched={(id, patch) => upsertOrderPatch(id, patch)}
            onOrderReplaced={(full) => upsertOrderReplace(full)}
          />
        </DialogContent>
      </Dialog>

      {/* ✅ OrderUpdate Modal (MUI Dialog) */}
      <Dialog
        open={orderUpdateOpen}
        onClose={closeOrderUpdateModal}
        fullWidth
        maxWidth="xl"
        TransitionProps={{
          onExited: () => {
            // clear only after close animation finishes (prevents crash)
            if (!editOpen) setSelectedOrder(null);
          },
        }}
      >
        <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          Order Details
          <Box sx={{ flex: 1 }} />
          <IconButton onClick={closeOrderUpdateModal}>
            <CloseIcon />
          </IconButton>
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
