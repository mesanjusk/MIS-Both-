import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  InputAdornment,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import axios from "../apiClient.js";
import { fetchVendorMasters } from "../services/vendorService";
import { collectVendorLinks } from "../utils/vendorMapping";

const money = (v) => `₹${Number(v || 0).toLocaleString("en-IN")}`;

const isoDate = (d) => {
  if (!d) return "";
  const date = new Date(d);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
};

/**
 * Map one delivered order to the vendor that did the work by raising a linked
 * purchase order. In-house work goes to the vendor account that stands for our
 * own workshop, so every order ends up with a cost side.
 */
export default function AssignVendorDialog({
  open,
  onClose,
  order,
  poIndex,
  defaultDate = "",
  onAssigned = () => {},
}) {
  const [vendors, setVendors] = useState([]);
  const [loadingVendors, setLoadingVendors] = useState(false);
  const [vendor, setVendor] = useState(null);
  const [cost, setCost] = useState("");
  const [workDone, setWorkDone] = useState("");
  const [poDate, setPoDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const existing = useMemo(
    () => (order ? collectVendorLinks(order, poIndex || new Map()) : { links: [], vendorCost: 0 }),
    [order, poIndex]
  );

  const saleValue = Number(order?.totalAmount || 0);
  const margin = saleValue - (existing.vendorCost + Number(cost || 0));

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingVendors(true);
    fetchVendorMasters()
      .then((rows) => { if (!cancelled) setVendors(Array.isArray(rows) ? rows.filter((v) => v.Active !== false) : []); })
      .catch(() => { if (!cancelled) setVendors([]); })
      .finally(() => { if (!cancelled) setLoadingVendors(false); });
    return () => { cancelled = true; };
  }, [open]);

  // Seed the form from the order every time the dialog opens
  useEffect(() => {
    if (!open || !order) return;
    const firstItem = Array.isArray(order.Items) && order.Items.length ? order.Items[0] : null;
    setVendor(null);
    setCost("");
    setWorkDone(String(firstItem?.Item || firstItem?.Remark || order.orderNote || "Job work").trim().slice(0, 80));
    setPoDate(isoDate(order.deliveredAt || defaultDate || order.createdAt) || isoDate(new Date()));
    setError("");
  }, [open, order, defaultDate]);

  const handleSave = async () => {
    if (!vendor?.Vendor_uuid) {
      setError("Pick the vendor that did this work.");
      return;
    }
    const amount = Number(cost);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Enter what this work cost.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const res = await axios.post("/api/purchaseorder/create", {
        Vendor_uuid: vendor.Vendor_uuid,
        Order_uuid: order.Order_uuid || "",
        // Delivered work is already received, so the cost hits the vendor
        // account with the order rather than sitting as a draft.
        status: "received",
        poDate,
        Items: [{ itemName: workDone || "Job work", qty: 1, unit: "Nos", rate: amount, amount }],
        notes: `Order #${order.Order_Number}${order.Customer_name ? ` — ${order.Customer_name}` : ""}`,
        createdBy: localStorage.getItem("User_name") || "System",
      });

      if (res.data?.success) {
        onAssigned(res.data.result);
        onClose();
      } else {
        setError(res.data?.message || "Could not save the vendor mapping.");
      }
    } catch (err) {
      console.error("Assign vendor error:", err);
      setError(err?.response?.data?.message || "Could not save the vendor mapping.");
    } finally {
      setSaving(false);
    }
  };

  if (!order) return null;

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ pb: 1 }}>
        <Typography variant="h6" fontWeight={800}>Assign vendor — Order #{order.Order_Number}</Typography>
        <Typography variant="caption" color="text.secondary">
          {order.Customer_name || "Customer"} · billed {money(saleValue)}
        </Typography>
      </DialogTitle>

      <DialogContent dividers>
        <Stack spacing={2}>
          {existing.links.length > 0 && (
            <Box>
              <Typography variant="caption" color="text.secondary">Already mapped</Typography>
              <Stack direction="row" spacing={0.5} flexWrap="wrap" sx={{ mt: 0.5, gap: 0.5 }}>
                {existing.links.map((link, i) => (
                  <Chip
                    key={i}
                    size="small"
                    label={`${link.vendorName} · ${money(link.amount)} (${link.ref})`}
                    variant="outlined"
                  />
                ))}
              </Stack>
              <Divider sx={{ mt: 1.5 }} />
            </Box>
          )}

          <Autocomplete
            options={vendors}
            loading={loadingVendors}
            value={vendor}
            onChange={(_, next) => setVendor(next)}
            getOptionLabel={(v) => v?.Vendor_name || ""}
            isOptionEqualToValue={(a, b) => a.Vendor_uuid === b.Vendor_uuid}
            renderOption={(props, v) => (
              <Box component="li" {...props} key={v.Vendor_uuid}>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ width: "100%" }}>
                  <Typography variant="body2" sx={{ flex: 1 }}>{v.Vendor_name}</Typography>
                  {v.In_house && <Chip size="small" color="info" label="In-house" sx={{ height: 18, fontSize: "0.65rem" }} />}
                  {v.Vendor_type && v.Vendor_type !== "mixed" && (
                    <Chip size="small" variant="outlined" label={v.Vendor_type} sx={{ height: 18, fontSize: "0.65rem" }} />
                  )}
                </Stack>
              </Box>
            )}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Vendor"
                required
                helperText="Own workshop work goes to your own in-house vendor account"
              />
            )}
          />

          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField
              label="Work cost"
              type="number"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              required
              fullWidth
              InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }}
            />
            <TextField
              label="Date"
              type="date"
              value={poDate}
              onChange={(e) => setPoDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
              fullWidth
            />
          </Stack>

          <TextField
            label="Work done"
            value={workDone}
            onChange={(e) => setWorkDone(e.target.value)}
            fullWidth
            helperText="Shown on the purchase order line"
          />

          <Stack direction="row" justifyContent="space-between" sx={{ bgcolor: "action.hover", borderRadius: 2, px: 2, py: 1 }}>
            <Typography variant="body2" color="text.secondary">Margin after this cost</Typography>
            <Typography variant="body2" fontWeight={800} color={margin >= 0 ? "success.dark" : "error.dark"}>
              {money(margin)}
            </Typography>
          </Stack>

          {error && <Alert severity="error" sx={{ borderRadius: 2 }}>{error}</Alert>}
        </Stack>
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={saving} sx={{ textTransform: "none" }}>Cancel</Button>
        <Button
          onClick={handleSave}
          disabled={saving}
          variant="contained"
          sx={{ textTransform: "none", fontWeight: 700 }}
        >
          {saving ? "Saving…" : "Map to vendor"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
