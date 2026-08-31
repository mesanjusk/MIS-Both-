import { useCallback, useEffect, useMemo, useState } from "react";
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
  IconButton,
  InputAdornment,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import axios from "../apiClient.js";
import { fetchPayableParties } from "../services/vendorService";
import { collectVendorLinks } from "../utils/vendorMapping";

const money = (v) => `₹${Number(v || 0).toLocaleString("en-IN")}`;

const isoDate = (d) => {
  if (!d) return "";
  const date = new Date(d);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
};

const emptyRow = (work = "", date = "") => ({ vendor: null, cost: "", work, date });

/**
 * Map one delivered order to the vendors that did the work. An order is often
 * split across several of them — print here, lamination there — so each row
 * raises its own purchase order against that vendor's account, and rows can be
 * added to an order that already has vendors on it.
 *
 * Vendors come from the "Account Payable" party group, which is the list the
 * business maintains for money it owes; in-house capacity registered there
 * maps exactly like an outside vendor.
 */
export default function AssignVendorDialog({
  open,
  onClose,
  order,
  poIndex,
  defaultDate = "",
  onAssigned = () => {},
}) {
  const [parties, setParties] = useState([]);
  const [loadingParties, setLoadingParties] = useState(false);
  const [rows, setRows] = useState([emptyRow()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const existing = useMemo(
    () => (order ? collectVendorLinks(order, poIndex || new Map()) : { links: [], vendorCost: 0 }),
    [order, poIndex]
  );

  const saleValue = Number(order?.totalAmount || 0);
  const newCost = rows.reduce((s, r) => s + (Number(r.cost) || 0), 0);
  const margin = saleValue - existing.vendorCost - newCost;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingParties(true);
    fetchPayableParties()
      .then((list) => { if (!cancelled) setParties(Array.isArray(list) ? list : []); })
      .catch(() => { if (!cancelled) setParties([]); })
      .finally(() => { if (!cancelled) setLoadingParties(false); });
    return () => { cancelled = true; };
  }, [open]);

  // Seed one blank row from the order every time the dialog opens
  useEffect(() => {
    if (!open || !order) return;
    const firstItem = Array.isArray(order.Items) && order.Items.length ? order.Items[0] : null;
    const work = String(firstItem?.Item || firstItem?.Remark || order.orderNote || "Job work").trim().slice(0, 80);
    const date = isoDate(defaultDate || order.createdAt) || isoDate(new Date());
    setRows([emptyRow(work, date)]);
    setError("");
  }, [open, order, defaultDate]);

  const patchRow = useCallback((index, patch) => {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }, []);

  const addRow = useCallback(() => {
    setRows((prev) => [...prev, emptyRow(prev[0]?.work || "", prev[0]?.date || "")]);
  }, []);

  const handleSave = async () => {
    const filled = rows.filter((r) => r.vendor || r.cost);
    if (!filled.length) {
      setError("Add at least one vendor.");
      return;
    }
    for (const row of filled) {
      if (!row.vendor?.Vendor_uuid) {
        setError("Every row needs a vendor.");
        return;
      }
      if (!(Number(row.cost) > 0)) {
        setError(`Enter what ${row.vendor.Vendor_name} charged.`);
        return;
      }
    }

    setSaving(true);
    setError("");
    try {
      const created = [];
      for (const row of filled) {
        const amount = Number(row.cost);
        const res = await axios.post("/api/purchaseorder/create", {
          Vendor_uuid: row.vendor.Vendor_uuid,
          Order_uuid: order.Order_uuid || "",
          // Delivered work is already received, so the cost hits the vendor's
          // ledger with the order rather than sitting as a draft.
          status: "received",
          poDate: row.date,
          Items: [{ itemName: row.work || "Job work", qty: 1, unit: "Nos", rate: amount, amount }],
          notes: `Order #${order.Order_Number}${order.Customer_name ? ` — ${order.Customer_name}` : ""}`,
          createdBy: localStorage.getItem("User_name") || "System",
        });
        if (!res.data?.success) throw new Error(res.data?.message || "Could not save the vendor mapping.");
        created.push(res.data.result);
      }
      onAssigned(created);
      onClose();
    } catch (err) {
      console.error("Assign vendor error:", err);
      setError(err?.response?.data?.message || err.message || "Could not save the vendor mapping.");
    } finally {
      setSaving(false);
    }
  };

  if (!order) return null;

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} fullWidth maxWidth="md">
      <DialogTitle sx={{ pb: 1 }}>
        <Typography variant="h6" fontWeight={800}>Assign vendors — Order #{order.Order_Number}</Typography>
        <Typography variant="caption" color="text.secondary">
          {order.Customer_name || "Customer"} · billed {money(saleValue)}
        </Typography>
      </DialogTitle>

      <DialogContent dividers>
        <Stack spacing={2}>
          {existing.links.length > 0 && (
            <Box>
              <Typography variant="caption" color="text.secondary">
                Already mapped · {money(existing.vendorCost)}
              </Typography>
              <Stack direction="row" flexWrap="wrap" sx={{ mt: 0.5, gap: 0.5 }}>
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

          {rows.map((row, index) => (
            <Stack key={index} direction={{ xs: "column", md: "row" }} spacing={1.5} alignItems="flex-start">
              <Autocomplete
                sx={{ flex: 2, minWidth: 200 }}
                options={parties}
                loading={loadingParties}
                value={row.vendor}
                onChange={(_, next) => patchRow(index, { vendor: next })}
                getOptionLabel={(v) => v?.Vendor_name || ""}
                isOptionEqualToValue={(a, b) => a.Vendor_uuid === b.Vendor_uuid}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label={index === 0 ? "Vendor" : `Vendor ${index + 1}`}
                    required
                    size="small"
                    helperText={index === 0 ? "From the Account Payable group" : " "}
                  />
                )}
              />
              <TextField
                label="Cost"
                type="number"
                size="small"
                value={row.cost}
                onChange={(e) => patchRow(index, { cost: e.target.value })}
                sx={{ width: 130 }}
                InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }}
              />
              <TextField
                label="Work done"
                size="small"
                value={row.work}
                onChange={(e) => patchRow(index, { work: e.target.value })}
                sx={{ flex: 2, minWidth: 160 }}
              />
              <TextField
                label="Date"
                type="date"
                size="small"
                value={row.date}
                onChange={(e) => patchRow(index, { date: e.target.value })}
                InputLabelProps={{ shrink: true }}
                sx={{ width: 160 }}
              />
              <IconButton
                size="small"
                color="error"
                disabled={rows.length === 1}
                onClick={() => setRows((prev) => prev.filter((_, i) => i !== index))}
                sx={{ mt: 0.5 }}
                title="Remove this vendor"
              >
                <DeleteOutlineIcon fontSize="small" />
              </IconButton>
            </Stack>
          ))}

          <Box>
            <Button size="small" startIcon={<AddIcon />} onClick={addRow} sx={{ textTransform: "none", fontWeight: 700 }}>
              Add another vendor
            </Button>
          </Box>

          <Stack direction="row" justifyContent="space-between" sx={{ bgcolor: "action.hover", borderRadius: 2, px: 2, py: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Margin after {rows.filter((r) => Number(r.cost) > 0).length || 0} new cost
              {rows.filter((r) => Number(r.cost) > 0).length === 1 ? "" : "s"}
            </Typography>
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
          {saving ? "Saving…" : rows.length > 1 ? `Map ${rows.length} vendors` : "Map to vendor"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
