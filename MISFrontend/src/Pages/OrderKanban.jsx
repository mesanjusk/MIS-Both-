import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box, Button, CircularProgress, MenuItem, Paper,
  Stack, TextField, Typography,
} from "@mui/material";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import axios from "../apiClient";
import { toast } from "../Components";
import { useOrdersData } from "../hooks/useOrdersData";

import OrderBoard from "../Components/orders/OrderBoard";

const STAGES = ["Enquiry", "Quoted", "Approved", "Design", "Printing", "Post Printing", "Finishing", "Ready", "Delivered", "Paid"];

const normalize  = (value = "") => String(value).trim().toLowerCase();
const toDateInput = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
};

export default function OrderKanban() {
  const navigate = useNavigate();
  const { orderList, isOrdersLoading, loadError, refresh, patchOrder } = useOrdersData();
  const [statusFilter, setStatusFilter] = useState("all");
  const [fromDate, setFromDate]         = useState("");
  const [toDate, setToDate]             = useState("");

  const moveOrderToStage = useCallback(
    async (orderId, nextStage, setStatusMessage) => {
      if (!orderId || !nextStage) return;

      const currentOrder = orderList.find(
        (order) => (order?.Order_uuid || order?._id || order?.Order_id) === orderId
      );

      if (normalize(currentOrder?.highestStatusTask?.Task) === normalize(nextStage)) return;

      const patch = (stage) =>
        patchOrder(orderId, {
          highestStatusTask: {
            ...(currentOrder?.highestStatusTask || {}),
            Task: stage,
            CreatedAt: new Date().toISOString(),
          },
        });

      try {
        await axios.patch(`/orders/${orderId}/stage`, { stage: nextStage });
        patch(nextStage);
        setStatusMessage?.(`Order moved to ${nextStage}`);
        toast.success(`Moved to ${nextStage}`);
      } catch {
        try {
          await axios.post("/order/updateStatus", { Order_id: orderId, Task: nextStage });
          patch(nextStage);
          setStatusMessage?.(`Order moved to ${nextStage}`);
          toast.success(`Moved to ${nextStage}`);
        } catch (fallbackError) {
          console.error("Failed to update stage", fallbackError);
          toast.error("Could not update order stage.");
        }
      }
    },
    [orderList, patchOrder]
  );

  

  const filteredOrders = useMemo(() => {
    return (orderList || []).filter((order) => {
      const stage       = order?.highestStatusTask?.Task;
      const createdDate = toDateInput(order?.highestStatusTask?.CreatedAt);
      const matchesStage = statusFilter === "all" ? true : normalize(stage) === normalize(statusFilter);
      const matchesFrom  = fromDate ? createdDate >= fromDate : true;
      const matchesTo    = toDate   ? createdDate <= toDate   : true;
      return matchesStage && matchesFrom && matchesTo;
    });
  }, [orderList, statusFilter, fromDate, toDate]);

  const groupedOrders = useMemo(() => {
    const base = STAGES.reduce((acc, stage) => { acc[stage] = []; return acc; }, {});
    filteredOrders.forEach((order) => {
      const currentStage = STAGES.find(
        (stage) => normalize(stage) === normalize(order?.highestStatusTask?.Task)
      );
      (base[currentStage || "Enquiry"] ??= []).push(order);
    });
    return base;
  }, [filteredOrders]);

  return (
    <Box sx={{ p: { xs: 1, md: 2 } }}>
      {/* Header */}
      <Paper variant="outlined" sx={{ p: 2, mb: 2, borderRadius: 3 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} alignItems={{ md: 'center' }} justifyContent="space-between" spacing={2}>
          <Box>
            <Typography variant="h5" fontWeight={900}>Order Kanban Board</Typography>
            <Typography variant="caption" color="text.secondary">
              Track workflow from enquiry to delivery. Drag cards to move stages.
            </Typography>
          </Box>
          <Button
            variant="outlined"
            startIcon={isOrdersLoading ? <CircularProgress size={14} /> : <RefreshRoundedIcon />}
            onClick={refresh}
            disabled={isOrdersLoading}
            size="small"
          >
            Refresh
          </Button>
        </Stack>

        {/* Filters */}
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mt: 2 }} flexWrap="wrap" useFlexGap>
          <TextField
            select
            size="small"
            label="Stage"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            sx={{ minWidth: 160 }}
          >
            <MenuItem value="all">All Stages</MenuItem>
            {STAGES.map((stage) => (
              <MenuItem key={stage} value={stage}>{stage}</MenuItem>
            ))}
          </TextField>

          <TextField
            size="small"
            type="date"
            label="From"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />

          <TextField
            size="small"
            type="date"
            label="To"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />

          <Button
            variant="outlined"
            size="small"
            onClick={() => { setStatusFilter("all"); setFromDate(""); setToDate(""); }}
          >
            Reset
          </Button>
        </Stack>
      </Paper>

      {/* Error */}
      {loadError && (
        <Paper variant="outlined" sx={{ p: 2, mb: 2, borderRadius: 2, borderColor: 'error.main', bgcolor: 'error.light' }}>
          <Typography color="error.dark" variant="body2">{loadError}</Typography>
        </Paper>
      )}

      {/* Board */}
      {isOrdersLoading && !orderList?.length ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}>
          <CircularProgress />
        </Box>
      ) : (
        <OrderBoard
          columnOrder={STAGES}
          groupedOrders={groupedOrders}
          isAdmin
          
          
          onView={(order) => {
            const oid = order?.Order_uuid || order?._id || order?.Order_id;
            if (oid) navigate(`/orderUpdate/${oid}`);
          }}
          onMove={(order, nextStage) => {
            const oid = order?.Order_uuid || order?._id || order?.Order_id;
            moveOrderToStage(oid, nextStage, null);
          }}
        />
      )}
    </Box>
  );
}
