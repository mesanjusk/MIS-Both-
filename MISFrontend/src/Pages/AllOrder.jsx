import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import axios from "../apiClient";
import OrderUpdate from "./OrderUpdate";
import UpdateDelivery from "./updateDelivery";
import OrderBoard from "../components/orders/OrderBoard";
import {
  LABELS,
  ROLE_TYPES,
  TASK_TYPES,
  statusApi,
  useOrdersData,
} from "../hooks/useOrdersData";
import { useOrderGrouping } from "../hooks/useOrderGrouping";
import { useOrderDnD } from "../hooks/useOrderDnD";

/* ✅ MUI */
import {
  AppBar,
  Toolbar,
  Typography,
  Box,
  Container,
  Paper,
  Stack,
  Tabs,
  Tab,
  TextField,
  InputAdornment,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  LinearProgress,
  Alert,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Divider,
  Skeleton,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import RefreshIcon from "@mui/icons-material/Refresh";
import SwapHorizIcon from "@mui/icons-material/SwapHoriz";

const SORT_OPTIONS = [
  { value: "dateDesc", label: "Latest first" },
  { value: "dateAsc", label: "Oldest first" },
  { value: "orderNo", label: "Order No." },
  { value: "name", label: "Customer Name" },
];

const normLower = (v) => String(v || "").trim().toLowerCase();

const isEnquiryTask = (task) => {
  const t = normLower(task);
  return t === "enquiry" || t === "enquiries" || t === "inquiry" || t === "lead";
};

const getAssignmentGroupsForTask = (task) => {
  const t = normLower(task);

  if (["design", "approval", "hold", "ready to print"].includes(t)) {
    return ["Office User"];
  }

  if (["fitting", "bind-pack", "bind pack"].includes(t)) {
    return ["Other Office", "Vendor"];
  }

  if (["ready", "delivered"].includes(t)) {
    return ["Vendor"];
  }

  return [];
};

const getAssignmentLabelForTask = (task) => {
  const groups = getAssignmentGroupsForTask(task);
  if (!groups.length) return "";
  if (groups.length === 1) return groups[0];
  return groups.join(" / ");
};

export default function AllOrder() {
  const [viewTab, setViewTab] = useState("orders");
  const [searchTerm, setSearchTerm] = useState("");
  const [sortKey, setSortKey] = useState("dateDesc");
  const [selectedOrder, setSelectedOrder] = useState(null);

  const [showOrderModal, setShowOrderModal] = useState(false);
  const [showDeliveryModal, setShowDeliveryModal] = useState(false);

  const [mobileMoveOrder, setMobileMoveOrder] = useState(null);
  const [mobileMoveTarget, setMobileMoveTarget] = useState("");

  const [isAdmin, setIsAdmin] = useState(false);
  const [statusNotice, setStatusNotice] = useState("");

  const [allUsers, setAllUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);

  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [pendingMove, setPendingMove] = useState(null);
  const [selectedAssignee, setSelectedAssignee] = useState("");

  const {
    orderList,
    orderMap,
    tasksMeta,
    isOrdersLoading,
    isTasksLoading,
    loadError,
    replaceOrder,
    patchOrder,
  } = useOrdersData();

  const isEnquiry = useCallback((order) => {
    const currentTask = order?.highestStatusTask?.Task;
    if (String(currentTask || "").trim()) return isEnquiryTask(currentTask);
    return isEnquiryTask(order?.Type);
  }, []);

  const { ordersCount, enquiriesCount } = useMemo(() => {
    let enquiries = 0;
    for (const order of orderList) {
      if (isEnquiry(order)) enquiries += 1;
    }
    return {
      ordersCount: orderList.length - enquiries,
      enquiriesCount: enquiries,
    };
  }, [orderList, isEnquiry]);

  useEffect(() => {
    const role =
      localStorage.getItem("Role") ||
      localStorage.getItem("role") ||
      localStorage.getItem("User_role");

    setIsAdmin(normLower(role) === ROLE_TYPES.ADMIN);
  }, []);

  useEffect(() => {
    const loadUsers = async () => {
      setUsersLoading(true);
      try {
        const { data } = await axios.get("/api/users/GetUserList");
        const rows = Array.isArray(data?.result) ? data.result : [];
        setAllUsers(rows);
      } catch (error) {
        console.error("Failed to load users", error);
        toast.error("Failed to load users");
      } finally {
        setUsersLoading(false);
      }
    };

    loadUsers();
  }, []);

  const isTouchDevice = useMemo(() => {
    if (typeof window === "undefined") return false;
    return (
      "ontouchstart" in window ||
      navigator.maxTouchPoints > 0 ||
      navigator.msMaxTouchPoints > 0
    );
  }, []);

  const filteredOrderList = useMemo(() => {
    if (viewTab === "enquiries") return orderList.filter((o) => isEnquiry(o));
    return orderList.filter((o) => !isEnquiry(o));
  }, [orderList, viewTab, isEnquiry]);

  const { columnOrder, groupedOrders } = useOrderGrouping(
    filteredOrderList,
    tasksMeta,
    searchTerm,
    sortKey,
    isAdmin,
    viewTab === "enquiries"
      ? { singleColumn: true, singleColumnLabel: "Enquiry", includeCancelColumn: false }
      : { includeCancelColumn: false }
  );

  const performMove = useCallback(
    async (orderId, targetTask, setStatusMessage) => {
      const order = orderMap[orderId];
      if (!order) return;

      const normalizedTask = String(targetTask || TASK_TYPES.OTHER).trim();
      const lower = normalizedTask.toLowerCase();
      const currentTask = normLower(order?.highestStatusTask?.Task);

      if (currentTask === lower) return;

      if (lower === TASK_TYPES.CANCEL.toLowerCase()) {
        if (!isAdmin) {
          toast.error("Cancel is Admin only");
          return;
        }

        const first = window.confirm("Move this order to Cancel?");
        const second =
          first &&
          window.confirm(
            "This will mark the order as Cancel. Confirm again to continue."
          );

        if (!second) return;
      }

      const id = order.Order_uuid || order._id || order.Order_id;
      if (!id) return;

      const createdAt = new Date().toISOString();
      const optimisticHighest = {
        ...(order.highestStatusTask || {}),
        Task: normalizedTask,
        CreatedAt: createdAt,
      };
      const optimisticStatus = [
        ...(order.Status || []),
        { Task: normalizedTask, CreatedAt: createdAt },
      ];

      patchOrder(id, { highestStatusTask: optimisticHighest, Status: optimisticStatus });

      setStatusMessage?.(`Moving order to ${normalizedTask}`);
      setStatusNotice(`Moving order ${order.Order_Number || ""} to ${normalizedTask}`);

      try {
        const response = await statusApi.updateStatus(id, normalizedTask);
        const next = response?.data?.result;
        const isSuccess = Boolean(next) || response?.data?.success === true;

        if (isSuccess) {
          if (next) replaceOrder(next);

          toast.success(
            lower === TASK_TYPES.DELIVERED.toLowerCase()
              ? "Moved to Delivered"
              : lower === TASK_TYPES.CANCEL.toLowerCase()
              ? "Moved to Cancel"
              : `Moved to ${normalizedTask}`
          );

          setStatusMessage?.(`Order moved to ${normalizedTask}`);
          setStatusNotice(`Order moved to ${normalizedTask}`);
        } else {
          throw new Error("No response body");
        }
      } catch (err) {
        patchOrder(id, {
          highestStatusTask: order.highestStatusTask,
          Status: order.Status,
        });

        toast.error("Failed to update status");
        setStatusMessage?.("Failed to update status");
        setStatusNotice("Failed to update status");
      }
    },
    [orderMap, isAdmin, patchOrder, replaceOrder]
  );

  const handleMove = useCallback(
    async (orderId, targetTask, setStatusMessage) => {
      const requiredGroups = getAssignmentGroupsForTask(targetTask);

      if (!requiredGroups.length) {
        await performMove(orderId, targetTask, setStatusMessage);
        return;
      }

      const order = orderMap[orderId];
      if (!order) return;

      const matchingUsers = allUsers.filter((user) =>
        requiredGroups.includes(String(user?.User_group || "").trim())
      );

      if (!matchingUsers.length) {
        toast.error(`No ${getAssignmentLabelForTask(targetTask)} user found`);
        return;
      }

      setPendingMove({
        orderId,
        targetTask,
        setStatusMessage,
        requiredGroups,
      });
      setSelectedAssignee("");
      setShowAssignDialog(true);
    },
    [allUsers, orderMap, performMove]
  );

  const {
    dragHandlers,
    mobileSelection,
    startMobileMove,
    confirmMobileMove,
    resetMobileSelection,
    statusMessage,
  } = useOrderDnD({ onMove: handleMove });

  const allLoading = isOrdersLoading || isTasksLoading;

  const handleView = (order) => {
    setSelectedOrder(order);
    setShowOrderModal(true);
  };

  const handleEdit = (order) => {
    setSelectedOrder(order);
    setShowDeliveryModal(true);
  };

  const closeOrderModal = () => {
    setShowOrderModal(false);
    setSelectedOrder(null);
  };

  const closeDeliveryModal = () => {
    setShowDeliveryModal(false);
    setSelectedOrder(null);
  };

  const onMobileMoveRequest = (order) => {
    setMobileMoveOrder(order);
    startMobileMove(order.Order_uuid || order._id || order.Order_id);
    setMobileMoveTarget("");
  };

  const availableTargets = useMemo(() => columnOrder.filter(Boolean), [columnOrder]);

  const handleConfirmMobileMove = async () => {
    if (!mobileMoveTarget) return;
    await confirmMobileMove(mobileMoveTarget);
    setMobileMoveOrder(null);
  };

  const handleCancelMobileMove = () => {
    resetMobileSelection();
    setMobileMoveOrder(null);
    setMobileMoveTarget("");
  };

  const assignableUsersForDialog = useMemo(() => {
    const groups = pendingMove?.requiredGroups || [];
    if (!groups.length) return [];
    return allUsers.filter((user) =>
      groups.includes(String(user?.User_group || "").trim())
    );
  }, [allUsers, pendingMove]);

  const handleCloseAssignDialog = () => {
    setShowAssignDialog(false);
    setPendingMove(null);
    setSelectedAssignee("");
  };

  const handleConfirmAssignAndMove = async () => {
    if (!pendingMove?.orderId || !pendingMove?.targetTask || !selectedAssignee) return;

    try {
      await axios.patch(`/order/${pendingMove.orderId}/assign`, {
        assignedTo: selectedAssignee,
        assignedBy: localStorage.getItem("User_name") || "System",
      });

      toast.success("Assignee updated");
      setShowAssignDialog(false);

      await performMove(
        pendingMove.orderId,
        pendingMove.targetTask,
        pendingMove.setStatusMessage
      );

      setPendingMove(null);
      setSelectedAssignee("");
    } catch (error) {
      console.error("Assignment failed", error);
      toast.error(error?.response?.data?.message || "Failed to assign user");
    }
  };

  return (
    <>
      {isOrdersLoading && (
        <Box sx={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 2000 }}>
          <LinearProgress />
        </Box>
      )}

      <Box sx={{ minHeight: "100vh", bgcolor: "background.default" }}>
        <AppBar position="sticky" elevation={0}>
          <Toolbar>
            <Typography variant="h6" sx={{ flex: 1 }}>
              {viewTab === "enquiries" ? "All Enquiries" : "All Orders"}
            </Typography>
            <Typography variant="body2" sx={{ opacity: 0.9 }}>
              {viewTab === "enquiries" ? enquiriesCount : ordersCount}
            </Typography>
          </Toolbar>
        </AppBar>

        <Container maxWidth={false} sx={{ maxWidth: 2200, py: 2 }}>
          <Paper
            variant="outlined"
            sx={{
              borderRadius: 3,
              p: 1.5,
              mb: 2,
              overflow: "hidden",
            }}
          >
            <Tabs
              value={viewTab}
              onChange={(_, v) => setViewTab(v)}
              variant="fullWidth"
              sx={{
                mb: 1.5,
                "& .MuiTab-root": { textTransform: "none", fontWeight: 800 },
              }}
            >
              <Tab value="orders" label={`Orders (${ordersCount})`} />
              <Tab value="enquiries" label={`Enquiries (${enquiriesCount})`} />
            </Tabs>

            <Stack
              direction={{ xs: "column", sm: "row" }}
              spacing={1.5}
              alignItems={{ xs: "stretch", sm: "center" }}
            >
              <TextField
                fullWidth
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={LABELS.SEARCH_PLACEHOLDER}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon fontSize="small" />
                    </InputAdornment>
                  ),
                }}
              />

              <FormControl sx={{ minWidth: { xs: "100%", sm: 220 } }}>
                <InputLabel id="sort-label">Sort</InputLabel>
                <Select
                  labelId="sort-label"
                  value={sortKey}
                  label="Sort"
                  onChange={(e) => setSortKey(e.target.value)}
                >
                  {SORT_OPTIONS.map((option) => (
                    <MenuItem key={option.value} value={option.value}>
                      {option.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Stack>
          </Paper>

          {loadError && (
            <Alert
              severity="error"
              variant="outlined"
              sx={{ mb: 2, borderRadius: 3 }}
              action={
                <Button
                  color="error"
                  size="small"
                  startIcon={<RefreshIcon />}
                  onClick={() => window.location.reload()}
                >
                  Retry
                </Button>
              }
            >
              {loadError}
            </Alert>
          )}

          <Paper
            variant="outlined"
            sx={{
              borderRadius: 3,
              p: { xs: 1, sm: 1.5 },
              minHeight: 420,
            }}
          >
            {allLoading ? (
              <Box>
                <Stack spacing={1} sx={{ mb: 2 }}>
                  <Skeleton variant="rounded" height={36} />
                  <Skeleton variant="rounded" height={36} />
                </Stack>

                <Divider sx={{ mb: 2 }} />

                <Box
                  sx={{
                    display: "grid",
                    gridTemplateColumns: "repeat(12, 1fr)",
                    gap: 1,
                  }}
                >
                  {Array.from({ length: 12 }).map((_, i) => (
                    <Paper
                      key={i}
                      variant="outlined"
                      sx={{
                        gridColumn: { xs: "span 12", sm: "span 6", md: "span 3", lg: "span 2" },
                        borderRadius: 2,
                        p: 1.25,
                      }}
                    >
                      <Skeleton variant="text" width="60%" />
                      <Stack spacing={1} sx={{ mt: 1 }}>
                        {Array.from({ length: 5 }).map((__, j) => (
                          <Skeleton key={j} variant="rounded" height={44} />
                        ))}
                      </Stack>
                    </Paper>
                  ))}
                </Box>

                <Stack direction="row" justifyContent="center" sx={{ py: 2 }}>
                  <LinearProgress sx={{ width: 240, borderRadius: 99 }} />
                </Stack>
              </Box>
            ) : columnOrder.length === 0 ? (
              <Alert severity="info" variant="outlined" sx={{ borderRadius: 3 }}>
                {viewTab === "enquiries" ? "No enquiries found." : "No tasks found."}
              </Alert>
            ) : (
              <OrderBoard
                columnOrder={columnOrder}
                groupedOrders={groupedOrders}
                isAdmin={isAdmin}
                isTouchDevice={isTouchDevice}
                dragHandlers={dragHandlers}
                onView={handleView}
                onEdit={handleEdit}
                onMove={isTouchDevice ? onMobileMoveRequest : undefined}
                statusMessage={statusMessage || statusNotice}
              />
            )}
          </Paper>
        </Container>
      </Box>

      <Dialog open={showOrderModal} onClose={closeOrderModal} fullWidth maxWidth="md">
        <DialogTitle>Order Details</DialogTitle>
        <DialogContent dividers>
          <OrderUpdate
            order={selectedOrder}
            onClose={closeOrderModal}
            onOrderPatched={(orderId, patch) => patchOrder(orderId, patch)}
            onOrderReplaced={(order) => replaceOrder(order)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={closeOrderModal}>Close</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={showDeliveryModal} onClose={closeDeliveryModal} fullWidth maxWidth="md">
        <DialogTitle>Update Delivery</DialogTitle>
        <DialogContent dividers>
          <UpdateDelivery
            order={selectedOrder}
            onClose={closeDeliveryModal}
            onOrderPatched={(orderId, patch) => patchOrder(orderId, patch)}
            onOrderReplaced={(order) => replaceOrder(order)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDeliveryModal}>Close</Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={Boolean(mobileSelection && mobileMoveOrder)}
        onClose={handleCancelMobileMove}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <SwapHorizIcon fontSize="small" />
          {`Move Order #${mobileMoveOrder?.Order_Number || ""}`}
        </DialogTitle>

        <DialogContent dividers>
          <Stack spacing={2}>
            <Typography variant="body2" color="text.secondary">
              Select the target column
            </Typography>

            <FormControl fullWidth>
              <InputLabel id="mobile-move-target-label">Choose column</InputLabel>
              <Select
                labelId="mobile-move-target-label"
                value={mobileMoveTarget}
                label="Choose column"
                onChange={(e) => setMobileMoveTarget(e.target.value)}
              >
                {availableTargets
                  .filter((task) => {
                    const lower = String(task || "").toLowerCase();
                    if (lower === TASK_TYPES.CANCEL.toLowerCase() && !isAdmin) return false;
                    return task !== mobileMoveOrder?.highestStatusTask?.Task;
                  })
                  .map((task) => (
                    <MenuItem key={task} value={task}>
                      {task}
                    </MenuItem>
                  ))}
              </Select>
            </FormControl>

            {isAdmin && (
              <Alert severity="warning" variant="outlined">
                Selecting Cancel will require double confirmation.
              </Alert>
            )}
          </Stack>
        </DialogContent>

        <DialogActions>
          <Button onClick={handleCancelMobileMove}>Cancel.</Button>
          <Button
            variant="contained"
            onClick={handleConfirmMobileMove}
            disabled={!mobileMoveTarget}
          >
            Confirm
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={showAssignDialog}
        onClose={handleCloseAssignDialog}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>Assign before moving</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <Typography variant="body2" color="text.secondary">
              {pendingMove?.targetTask
                ? `Moving to "${pendingMove.targetTask}" requires assignee from: ${getAssignmentLabelForTask(
                    pendingMove.targetTask
                  )}`
                : "Select assignee"}
            </Typography>

            <FormControl fullWidth>
              <InputLabel id="assign-user-label">Assignee</InputLabel>
              <Select
                labelId="assign-user-label"
                value={selectedAssignee}
                label="Assignee"
                onChange={(e) => setSelectedAssignee(e.target.value)}
              >
                {assignableUsersForDialog.map((user) => (
                  <MenuItem key={user._id} value={user.User_name}>
                    {user.User_name} ({user.User_group})
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {usersLoading ? <LinearProgress /> : null}

            {!usersLoading && !assignableUsersForDialog.length ? (
              <Alert severity="warning" variant="outlined">
                No matching assignee found for this move.
              </Alert>
            ) : null}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseAssignDialog}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleConfirmAssignAndMove}
            disabled={!selectedAssignee}
          >
            Assign & Move
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}