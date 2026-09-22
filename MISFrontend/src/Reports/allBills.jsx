import toast from 'react-hot-toast';
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { fetchBillListPaged, updateBillStatus } from "../services/orderService";
import { fetchCustomers } from "../services/customerService";
import axios from "../apiClient";
import jsPDF from "jspdf";
import "jspdf-autotable";
import * as XLSX from "xlsx";

import UpdateDelivery from "../Pages/updateDelivery";
import { LoadingSpinner } from "../Components";
import InvoiceModal from "../Components/InvoiceModal";
import {
  copyPathToClipboard,
  getBillLocalPaths,
  launchMisFileUrl,
  normalizeWindowsPath,
} from "../utils/localFileLauncher";

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
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import InsertDriveFileIcon from "@mui/icons-material/InsertDriveFile";
import EventIcon from "@mui/icons-material/Event";
import ComputerRoundedIcon from "@mui/icons-material/ComputerRounded";
import ExportGuard from "../Components/ExportGuard";

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
  onOpenLocalPath,
  localShareRoot,
  statusChip,
  formatDateDDMMYYYY,
  formatINR,
}) {
  const deliveryDate = formatDateDDMMYYYY(order?.highestStatusTask?.Delivery_Date);
  const orderDate = formatDateDDMMYYYY(order?.createdAt);
  const hasLocalFile = Boolean(String(order?.driveFile?.name || "").trim());

  return (
    <Card
      variant="outlined"
      sx={{
        borderRadius: 2,
        height: "100%",
        minWidth: 0,
        display: "flex",
        flexDirection: "column",
        position: "relative",
        boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
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
            top: 4,
            right: 4,
            zIndex: 2,
            width: 28,
            height: 28,
            bgcolor: "background.paper",
            border: "1px solid",
            borderColor: "divider",
          }}
          aria-label="toggle paid"
        >
          {paid ? (
            <DoneAllIcon sx={{ fontSize: 16 }} color="success" />
          ) : (
            <PendingActionsIcon sx={{ fontSize: 16 }} color="warning" />
          )}
        </IconButton>
      </Tooltip>

      <CardActionArea onClick={() => onEdit(order)} sx={{ flex: 1, minWidth: 0 }}>
        <CardContent sx={{ p: 1, pr: 4, "&:last-child": { pb: 1 } }}>
          <Stack spacing={0.55}>
            <Stack direction="row" alignItems="center" spacing={0.5}>
              <Typography variant="subtitle2" sx={{ fontWeight: 900, lineHeight: 1.1 }}>
                #{order?.Order_Number || "—"}
              </Typography>
              {statusChip(order?._displayTask || order?.highestStatusTask?.Task)}
            </Stack>

            <Typography
              variant="body2"
              sx={{ fontWeight: 800, lineHeight: 1.2 }}
              noWrap
              title={order?.Customer_name || ""}
            >
              {order?.Customer_name || "Unknown"}
            </Typography>

            <Typography variant="caption" color="text.secondary" noWrap>
              {orderDate || deliveryDate || "—"}
            </Typography>

            <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={0.5}>
              <Typography variant="body2" sx={{ fontWeight: 900 }}>
                ₹{formatINR(order?.billTotal)}
              </Typography>
              <Chip
                size="small"
                label={paid ? "Paid" : "Unpaid"}
                color={paid ? "success" : "warning"}
                variant={paid ? "filled" : "outlined"}
                sx={{ height: 20, fontSize: "0.67rem", fontWeight: 800 }}
              />
            </Stack>
          </Stack>
        </CardContent>
      </CardActionArea>

      <Divider />
      <Box sx={{ p: 0.65, display: "flex", gap: 0.4, alignItems: "center" }}>
        <Button
          size="small"
          variant="contained"
          color={paid ? "success" : "warning"}
          startIcon={<ReceiptLongIcon sx={{ fontSize: 15 }} />}
          onClick={(e) => {
            e.stopPropagation();
            onOpenInvoice(order);
          }}
          sx={{
            minWidth: 0,
            flex: 1,
            px: 0.8,
            py: 0.35,
            borderRadius: 1.5,
            textTransform: "none",
            fontSize: "0.72rem",
            fontWeight: 900,
          }}
        >
          Bill
        </Button>

        {hasLocalFile && (
          <Tooltip
            title={
              localShareRoot
                ? `Open ${order.driveFile.name} from local/network folder`
                : "Set the local/network folder first"
            }
          >
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                onOpenLocalPath(order, false);
              }}
              sx={{ width: 30, height: 30, border: "1px solid", borderColor: "divider" }}
              aria-label="open local network file"
            >
              <InsertDriveFileIcon sx={{ fontSize: 17 }} />
            </IconButton>
          </Tooltip>
        )}

        {hasLocalFile && (
          <Tooltip title={localShareRoot ? "Open shared local/network folder" : "Set the local/network folder first"}>
            <IconButton
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                onOpenLocalPath(order, true);
              }}
              sx={{ width: 30, height: 30, border: "1px solid", borderColor: "divider" }}
              aria-label="open local network folder"
            >
              <FolderOpenIcon sx={{ fontSize: 17 }} />
            </IconButton>
          </Tooltip>
        )}
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
  const [searchBillNumber, setSearchBillNumber] = useState("");
  const debouncedBillNumber = useDebouncedValue(searchBillNumber, 200);

  const [taskFilter, setTaskFilter] = useState("");
  const [paidFilter, setPaidFilter] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [dateSummary, setDateSummary] = useState([]);
  const [localShareRoot, setLocalShareRoot] = useState("");

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

  const toIndiaISODate = (dateString) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return "";
    try {
      return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Kolkata",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(date);
    } catch {
      return date.toISOString().slice(0, 10);
    }
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

  // Mirrors the backend Bills definition: an order is delivered when its stage
  // is "delivered"/"paid" OR any Status task contains "delivered" (the
  // stage-based workflow writes labels like "delivered - Delivered").
  const isDelivered = (order) => {
    const stage = String(order?.stage || "").toLowerCase().trim();
    if (stage === "delivered" || stage === "paid") return true;
    const list = Array.isArray(order?.Status) ? order.Status : [];
    return list.some((s) => String(s?.Task || "").toLowerCase().includes("delivered"));
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

        toast.error("Failed to update bill status. Please try again.");
      }
    },
    [getOrderKey, isPaid, upsertOrderPatch]
  );

  const loadNetworkFileSettings = useCallback(async () => {
    const res = await axios.get("/api/network-files/settings");
    const root = normalizeWindowsPath(res?.data?.result?.networkShareRoot || "");
    setLocalShareRoot(root);
    return root;
  }, []);

  useEffect(() => {
    let alive = true;
    loadNetworkFileSettings().catch(() => {
      if (alive) setLocalShareRoot("");
    });

    const handleSettingsUpdate = (event) => {
      if (!alive) return;
      setLocalShareRoot(normalizeWindowsPath(event?.detail?.networkShareRoot || ""));
    };
    window.addEventListener("network-file-settings-updated", handleSettingsUpdate);

    return () => {
      alive = false;
      window.removeEventListener("network-file-settings-updated", handleSettingsUpdate);
    };
  }, [loadNetworkFileSettings]);

  const openBillLocalPath = useCallback(
    async (order, folderOnly = false) => {
      let shareRoot = localShareRoot;
      let resolvedRelativePath = "";

      // Resolve the Drive file's parent hierarchy against the Admin-configured
      // anchor folder (for example "1 Month"), so files in dated/sub folders
      // open at the matching location on the LAN share.
      const fileId = String(order?.driveFile?.fileId || "").trim();
      if (fileId) {
        try {
          const resolved = await axios.get("/api/network-files/resolve", {
            params: { fileId },
          });
          shareRoot = normalizeWindowsPath(
            resolved?.data?.result?.networkShareRoot || shareRoot
          );
          resolvedRelativePath = String(
            resolved?.data?.result?.relativePath || ""
          ).trim();
          setLocalShareRoot(shareRoot);
        } catch {
          // Fall through to the saved settings + stored Drive file name.
        }
      }

      if (!shareRoot) {
        try {
          shareRoot = await loadNetworkFileSettings();
        } catch {
          // The error message below is clearer for the user than the API error.
        }
      }

      if (!shareRoot) {
        toast.error("Network folder is not configured. Ask Admin to set Admin → Network Files.");
        return;
      }

      const orderForPath = resolvedRelativePath
        ? {
            ...order,
            driveFile: {
              ...(order?.driveFile || {}),
              localRelativePath: resolvedRelativePath,
            },
          }
        : order;

      const { folderPath, filePath } = getBillLocalPaths(orderForPath, shareRoot);
      let target = filePath || folderPath;

      if (folderOnly) {
        if (filePath && filePath.includes("\\")) {
          target = filePath.slice(0, filePath.lastIndexOf("\\"));
        } else {
          target = folderPath;
        }
      }

      if (!target) {
        toast.error("No local/network file path is available for this bill.");
        return;
      }

      await copyPathToClipboard(target);
      toast.success(folderOnly ? "Opening shared folder…" : "Opening local file…");
      launchMisFileUrl(target, { select: !folderOnly && Boolean(filePath) });
    },
    [localShareRoot, loadNetworkFileSettings]
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
          billNumber: debouncedBillNumber,
          task: taskFilter,
          paid: paidFilter,
          date: selectedDate,
        });

        const rows = res?.data?.success ? res.data.result ?? [] : [];
        const t = Number(res?.data?.total ?? 0);
        const dates = Array.isArray(res?.data?.dates) ? res.data.dates : [];

        setTotal(t);
        setDateSummary(dates);
        setPage(nextPage);

        setOrders((prev) => {
          const merged = reset ? rows : [...prev, ...rows];
          // Dedupe by order key so an overlapping page never shows the same
          // bill twice on "Load more".
          const seen = new Set();
          const next = [];
          for (const o of merged) {
            const key = getOrderKey(o) || `n-${o?.Order_Number ?? ""}`;
            if (seen.has(key)) continue;
            seen.add(key);
            next.push(o);
          }
          return next;
        });

        // Derive from the response, not from the deduped array length: a short
        // page (or reaching the reported total) means the end. Deriving it from
        // the merged length left "Load more" enabled forever whenever dedupe
        // dropped an overlapping row, so clicking appeared to do nothing.
        setHasMore(rows.length >= PAGE_SIZE && (t <= 0 || nextPage * PAGE_SIZE < t));
      } catch (e) {
        console.error("Error fetching bills:", e?.message || e);
        if (reset) {
          setOrders([]);
          setTotal(0);
          setHasMore(false);
        } else {
          // Keep total/hasMore intact so a transient failure (the free-tier
          // backend returns 503 while waking from sleep) stays retryable
          // instead of permanently disabling "Load more".
          toast.error("Couldn't load more bills. Tap Load more to retry.");
        }
      } finally {
        setLoading(false);
      }
    },
    [PAGE_SIZE, debouncedSearch, debouncedBillNumber, taskFilter, paidFilter, selectedDate, getOrderKey]
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
  }, [debouncedSearch, debouncedBillNumber, taskFilter, paidFilter, selectedDate]);

  /* ----------------------- derived lists ----------------------- */
  const normalizedOrders = useMemo(() => {
    const list = Array.isArray(orders) ? orders : [];
    return list.map((order) => {
      const highestStatusTask = getHighestStatus(order?.Status);
      const items = Array.isArray(order?.Items) ? order.Items : [];
      const billTotal = items.reduce((sum, it) => sum + resolveAmount(it), 0);

      const customerName = customers?.[order?.Customer_uuid] || "Unknown";

      // These are all billed/delivered orders, so show a "Delivered" chip even
      // when a later status (e.g. a rework "Design") has a higher Status_number.
      const delivered = isDelivered(order);
      const displayTask = delivered ? "Delivered" : String(highestStatusTask?.Task || "");
      const taskLower = displayTask.toLowerCase().trim();

      const billable = hasBillableAmount(items);
      const paid = isPaid(order);

      return {
        ...order,
        highestStatusTask,
        Customer_name: customerName,
        billTotal,
        _billable: billable,
        _customerLower: String(customerName).toLowerCase(),
        _billNumberLower: String(order?.Order_Number ?? "").toLowerCase(),
        _displayTask: displayTask,
        _taskLower: taskLower,
        _paid: paid,
        _orderDate: toIndiaISODate(order?.createdAt),
      };
    });
  }, [orders, customers, hasBillableAmount, isPaid]);

  // since backend already filters, this is mostly safety
  const filteredOrders = useMemo(() => {
    const s = String(debouncedSearch || "").toLowerCase().trim();
    const billNeedle = String(debouncedBillNumber || "").replace(/^#\s*/, "").toLowerCase().trim();
    const fTask = String(taskFilter || "").toLowerCase().trim();
    const fPaid = String(paidFilter || "").toLowerCase().trim();

    return normalizedOrders.filter((o) => {
      if (!o._billable) return false;
      if (s) {
        const customerMatch = o._customerLower.includes(s);
        const legacyBillMatch = o._billNumberLower.includes(s.replace(/^#\s*/, ""));
        if (!customerMatch && !legacyBillMatch) return false;
      }
      if (billNeedle && !o._billNumberLower.includes(billNeedle)) return false;
      // Match by substring: the stage-based workflow writes task labels like
      // "delivered - Delivered", so an exact equality check would hide them.
      if (fTask && !o._taskLower.includes(fTask)) return false;

      if (fPaid === "paid" && !o._paid) return false;
      if (fPaid === "unpaid" && o._paid) return false;
      if (selectedDate && o._orderDate !== selectedDate) return false;

      return true;
    });
  }, [normalizedOrders, debouncedSearch, debouncedBillNumber, taskFilter, paidFilter, selectedDate]);

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
        order._displayTask || order.highestStatusTask?.Task || "",
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
      "Highest Status Task": order._displayTask || order.highestStatusTask?.Task || "",
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
      toast.error("Invalid order ID. Cannot open edit modal.");
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
      <Box sx={{ display: "flex", minHeight: "80vh", gap: 1.5, p: { xs: 0.5, md: 1 } }}>
        {/* Delivery-style date sidebar */}
        <Paper
          variant="outlined"
          sx={{
            width: 188,
            flexShrink: 0,
            borderRadius: 2.5,
            display: { xs: "none", md: "flex" },
            flexDirection: "column",
            overflow: "hidden",
            height: "calc(100vh - 94px)",
            position: "sticky",
            top: 8,
          }}
        >
          <Box sx={{ p: 1.25, pb: 1 }}>
            <Typography variant="subtitle2" fontWeight={800}>Bills</Typography>
            <TextField
              type="date"
              size="small"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              sx={{ mt: 1, width: "100%", "& input": { fontSize: 12, py: 0.65 } }}
              InputLabelProps={{ shrink: true }}
            />
          </Box>
          <Divider />
          <Box sx={{ overflowY: "auto", flex: 1 }}>
            <Box
              onClick={() => setSelectedDate("")}
              sx={{
                px: 1.5,
                py: 1,
                cursor: "pointer",
                bgcolor: !selectedDate ? "primary.main" : "transparent",
                color: !selectedDate ? "primary.contrastText" : "text.primary",
                "&:hover": { bgcolor: !selectedDate ? "primary.dark" : "action.hover" },
              }}
            >
              <Typography variant="body2" fontWeight={800}>All Dates</Typography>
              <Typography variant="caption" sx={{ opacity: 0.78 }}>
                {dateSummary.reduce((sum, row) => sum + Number(row?.count || 0), 0)} bills
              </Typography>
            </Box>
            <Divider />
            {dateSummary.map((row) => (
              <Box key={row.date}>
                <Box
                  onClick={() => setSelectedDate(row.date)}
                  sx={{
                    px: 1.5,
                    py: 0.9,
                    cursor: "pointer",
                    bgcolor: selectedDate === row.date ? "primary.main" : "transparent",
                    color: selectedDate === row.date ? "primary.contrastText" : "text.primary",
                    "&:hover": { bgcolor: selectedDate === row.date ? "primary.dark" : "action.hover" },
                  }}
                >
                  <Typography variant="body2" fontWeight={700}>
                    {formatDateDDMMYYYY(`${row.date}T00:00:00`)}
                  </Typography>
                  <Typography variant="caption" sx={{ opacity: 0.78 }}>
                    {row.count} bill{Number(row.count) === 1 ? "" : "s"}
                  </Typography>
                </Box>
                <Divider />
              </Box>
            ))}
          </Box>
        </Paper>

        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack
            direction={{ xs: "column", lg: "row" }}
            spacing={0.8}
            alignItems={{ xs: "stretch", lg: "center" }}
            sx={{ mb: 1 }}
          >
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="h5" fontWeight={900} noWrap>
                Bills
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {selectedDate ? formatDateDDMMYYYY(`${selectedDate}T00:00:00`) : "All Dates"}
                {" · "}
                {total || filteredOrders.length} bill{(total || filteredOrders.length) === 1 ? "" : "s"}
              </Typography>
            </Box>

            <TextField
              size="small"
              value={searchOrder}
              onChange={(e) => setSearchOrder(e.target.value)}
              placeholder="Search customer"
              inputProps={{ "aria-label": "Search bills by customer name" }}
              sx={{ width: { xs: "100%", lg: 175 } }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" />
                  </InputAdornment>
                ),
              }}
            />

            <TextField
              size="small"
              value={searchBillNumber}
              onChange={(e) => setSearchBillNumber(e.target.value)}
              placeholder="Bill No."
              inputProps={{ "aria-label": "Find bill by bill number" }}
              sx={{ width: { xs: "100%", lg: 120 } }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <ReceiptLongIcon sx={{ fontSize: 17 }} />
                  </InputAdornment>
                ),
              }}
            />

            <TextField
              type="date"
              size="small"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <EventIcon sx={{ fontSize: 17 }} />
                  </InputAdornment>
                ),
              }}
              sx={{ display: { xs: "block", md: "none" }, width: "100%" }}
            />

            <FormControl size="small" sx={{ width: { xs: "100%", lg: 125 } }}>
              <InputLabel id="task-filter-label">Status</InputLabel>
              <Select
                labelId="task-filter-label"
                value={taskFilter}
                label="Status"
                onChange={(e) => setTaskFilter(e.target.value)}
              >
                <MenuItem value="">All</MenuItem>
                <MenuItem value="delivered">Delivered</MenuItem>
                <MenuItem value="design">Design</MenuItem>
                <MenuItem value="print">Print</MenuItem>
              </Select>
            </FormControl>

            <FormControl size="small" sx={{ width: { xs: "100%", lg: 120 } }}>
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

            <Tooltip title={localShareRoot ? `Local folder: ${localShareRoot}` : "Set local/network folder"}>
              <IconButton
                size="small"
                onClick={() => openBillLocalPath({}, true)}
                sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1.5 }}
                aria-label="configure local network folder"
              >
                <ComputerRoundedIcon fontSize="small" />
              </IconButton>
            </Tooltip>

            <ExportGuard>
              <Stack direction="row" spacing={0.6}>
                <Tooltip title="Export loaded bills as PDF">
                  <Button
                    size="small"
                    variant="contained"
                    color="error"
                    startIcon={<PictureAsPdfIcon />}
                    onClick={exportPDF}
                    sx={{ borderRadius: 1.5, textTransform: "none", fontWeight: 800 }}
                  >
                    PDF
                  </Button>
                </Tooltip>
                <Tooltip title="Export loaded bills as Excel">
                  <Button
                    size="small"
                    variant="contained"
                    startIcon={<GridOnIcon />}
                    onClick={exportExcel}
                    sx={{ borderRadius: 1.5, textTransform: "none", fontWeight: 800 }}
                  >
                    Excel
                  </Button>
                </Tooltip>
              </Stack>
            </ExportGuard>
          </Stack>

          {loading && <LinearProgress sx={{ mb: 1, borderRadius: 1 }} />}

          <Stack direction="row" spacing={0.75} sx={{ mb: 1, overflowX: "auto", pb: 0.25 }}>
            {[
              { label: "Showing", value: total > 0 ? `${Math.min(orders.length, total)}/${total}` : filteredOrders.length },
              { label: "Loaded Value", value: `₹${formatINR(totals.sum)}` },
              { label: "Paid", value: filteredOrders.filter((o) => o._paid).length },
              { label: "Unpaid", value: filteredOrders.filter((o) => !o._paid).length },
            ].map((item) => (
              <Card key={item.label} variant="outlined" sx={{ minWidth: 118, borderRadius: 2 }}>
                <CardContent sx={{ px: 1.1, py: 0.7, "&:last-child": { pb: 0.7 } }}>
                  <Typography variant="caption" color="text.secondary">{item.label}</Typography>
                  <Typography variant="subtitle1" fontWeight={900} lineHeight={1.15}>{item.value}</Typography>
                </CardContent>
              </Card>
            ))}
          </Stack>

          <Paper variant="outlined" sx={{ borderRadius: 2.5, p: 0.9 }}>
            {loading && orders.length === 0 ? (
              <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
                <LoadingSpinner size={40} />
              </Box>
            ) : filteredOrders.length === 0 ? (
              <Typography color="text.secondary" sx={{ py: 5, textAlign: "center" }}>
                No billed orders found for this filter.
              </Typography>
            ) : (
              <>
                <Box
                  sx={{
                    display: "grid",
                    gridTemplateColumns: {
                      xs: "1fr",
                      sm: "repeat(auto-fill, minmax(175px, 1fr))",
                    },
                    gap: 0.8,
                  }}
                >
                  {filteredOrders.map((order) => {
                    const key = getOrderKey(order) || `o-${order?.Order_Number || "unknown"}`;
                    return (
                      <BillCard
                        key={key}
                        order={order}
                        paid={Boolean(order?._paid)}
                        onTogglePaid={togglePaid}
                        onEdit={handleEditClick}
                        onOpenInvoice={openInvoice}
                        onOpenLocalPath={openBillLocalPath}
                        localShareRoot={localShareRoot}
                        statusChip={statusChip}
                        formatDateDDMMYYYY={formatDateDDMMYYYY}
                        formatINR={formatINR}
                      />
                    );
                  })}
                </Box>

                <Box sx={{ display: "flex", justifyContent: "center", mt: 1.25 }}>
                  <Button
                    size="small"
                    variant="outlined"
                    disabled={!hasMore || loading}
                    onClick={() => loadBillsPage(page + 1, false)}
                    sx={{ borderRadius: 1.5, textTransform: "none", fontWeight: 900 }}
                  >
                    {hasMore ? `Load more (+${PAGE_SIZE})` : "No more bills"}
                  </Button>
                </Box>
              </>
            )}
          </Paper>
        </Box>
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
