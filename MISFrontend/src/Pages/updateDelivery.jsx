/* eslint-disable react/prop-types */
// src/Pages/updateDelivery.jsx — strictly matches your backend
// ✅ ONLY calls PUT /order/updateDelivery/:id (no POST fallback)
// ✅ react-hot-toast
// ✅ keeps your caching + invoice flow

import { useEffect, useState, useCallback, lazy, Suspense, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import axios from "../apiClient.js";
import Select from "react-select";
import toast from "react-hot-toast";
import normalizeWhatsAppNumber from "../utils/normalizeNumber";
import { LoadingSpinner } from "../Components";

const InvoiceModal = lazy(() => import("../Components/InvoiceModal"));

const PURCHASE_ACCOUNT_ID = "6c91bf35-e9c4-4732-a428-0310f56bd0a7";
const MIN_SAVE_MS = 600;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const ciCompare = (a = "", b = "") =>
  String(a || "").localeCompare(String(b || ""), undefined, { sensitivity: "base" });

const n2 = (v) => (Number.isFinite(+v) ? +v : 0);

const memoryCache = { customers: null, items: null, ts: 0 };

function readSessionCache() {
  try {
    const raw = sessionStorage.getItem("UpdateDelivery.cache.v1");
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeSessionCache(data) {
  try {
    sessionStorage.setItem("UpdateDelivery.cache.v1", JSON.stringify(data));
  } catch {}
}

async function getCustomersAndItems() {
  const now = Date.now();
  if (memoryCache.customers && memoryCache.items && now - memoryCache.ts < CACHE_TTL_MS) {
    return { customers: memoryCache.customers, items: memoryCache.items };
  }
  const sess = readSessionCache();
  if (sess && now - sess.ts < CACHE_TTL_MS) {
    memoryCache.customers = sess.customers;
    memoryCache.items = sess.items;
    memoryCache.ts = sess.ts;
    return { customers: sess.customers, items: sess.items };
  }

  const [custRes, itemRes] = await Promise.all([
    axios.get(`/api/customers/GetCustomersList?page=1&limit=1000`),
    axios.get(`/item/GetItemList?page=1&limit=1000`),
  ]);

  const customers = (custRes?.data?.result || [])
    .slice()
    .sort((a, b) => ciCompare(a?.Customer_name, b?.Customer_name));
  const items = (itemRes?.data?.result || [])
    .slice()
    .sort((a, b) => ciCompare(a?.Item_name, b?.Item_name));

  memoryCache.customers = customers;
  memoryCache.items = items;
  memoryCache.ts = now;
  writeSessionCache({ customers, items, ts: now });

  return { customers, items };
}

export default function UpdateDelivery({
  onClose,
  order = {},
  mode = "edit",
  onOrderPatched = () => {},
  onOrderReplaced = () => {},
}) {
  const navigate = useNavigate();
  const location = useLocation();

  const [orderId, setOrderId] = useState("");
  const [Customer_uuid, setCustomer_uuid] = useState("");
  const [items, setItems] = useState([
    { Item: "", Quantity: 0, Rate: 0, Amount: 0, Priority: "Normal", Remark: "" },
  ]);
  const [Customer_name, setCustomer_name] = useState("");
  const [customers, setCustomers] = useState([]);
  const [itemOptions, setItemOptions] = useState([]);
  const [loggedInUser, setLoggedInUser] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [customerMap, setCustomerMap] = useState({});
  const [customerMobile, setCustomerMobile] = useState("");
  const [loadingLists, setLoadingLists] = useState(false);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);

  /* ---------------------- auth ---------------------- */
  useEffect(() => {
    const userNameFromState = location.state?.id;
    const logInUser = userNameFromState || localStorage.getItem("User_name");
    if (logInUser) setLoggedInUser(logInUser);
    else navigate("/login");
  }, [location.state, navigate]);

  /* -------------------- seed form -------------------- */
  useEffect(() => {
    if (mode === "edit" && (order?._id || order?.Order_id || order?.Order_uuid)) {
      const mongoId = order?._id || order?.Order_id || order?.Order_uuid || "";
      setOrderId(mongoId);

      setCustomer_uuid(order.Customer_uuid || "");
      const seeded =
        Array.isArray(order.Items) && order.Items.length
          ? order.Items.map((it) => ({
              Item: it.Item || "",
              Quantity: n2(it.Quantity),
              Rate: n2(it.Rate),
              Amount: n2(it.Amount) || +(n2(it.Quantity) * n2(it.Rate)).toFixed(2),
              Priority: it.Priority || "Normal",
              Remark: it.Remark || "",
            }))
          : [{ Item: "", Quantity: 0, Rate: 0, Amount: 0, Priority: "Normal", Remark: "" }];
      setItems(seeded);
      setCustomer_name(order.Customer_name || "");
    }
  }, [order, mode]);

  /* --------------- load customers/items (cached + sorted) --------------- */
  useEffect(() => {
    let mounted = true;
    setLoadingLists(true);
    getCustomersAndItems()
      .then(({ customers, items }) => {
        if (!mounted) return;
        const sortedCustomers = customers.slice().sort((a, b) => ciCompare(a?.Customer_name, b?.Customer_name));
        const sortedItemNames = items.map((it) => it.Item_name).sort(ciCompare);

        setCustomers(sortedCustomers);
        const map = {};
        for (const c of sortedCustomers) map[c.Customer_uuid] = c.Customer_name;
        setCustomerMap(map);
        const found = sortedCustomers.find((c) => c.Customer_uuid === Customer_uuid);
        if (found) {
          setCustomer_name(found.Customer_name);
          setCustomerMobile(found.Mobile_number);
        }
        setItemOptions(sortedItemNames);
      })
      .catch((e) => {
        console.error(e);
        toast.error("Error loading lists");
      })
      .finally(() => mounted && setLoadingLists(false));
    return () => {
      mounted = false;
    };
  }, [Customer_uuid]);

  /* --------------------- helpers --------------------- */
  const extractServerMessage = (err) => {
    const d = err?.response?.data;
    return (
      (d && (d.error || d.message || d.msg)) ||
      (typeof d === "string" ? d : "") ||
      err?.message ||
      "Unknown error"
    );
  };

  const handleItemChange = (index, key, value) => {
    setItems((prev) => {
      const updated = [...prev];
      if (key === "Quantity" || key === "Rate") updated[index][key] = n2(value);
      else updated[index][key] = value;
      updated[index].Amount = +(n2(updated[index].Quantity) * n2(updated[index].Rate)).toFixed(2);
      return updated;
    });
  };

  const addNewItem = () => {
    if (items.some((i) => !i.Item || !i.Quantity || !i.Rate)) {
      toast.error("Please complete existing item rows first");
      return;
    }
    setItems((prev) => [
      ...prev,
      { Item: "", Quantity: 0, Rate: 0, Amount: 0, Priority: "Normal", Remark: "" },
    ]);
  };

  const sortLinesAZ = () => {
    setItems((prev) => [...prev].sort((a, b) => ciCompare(a?.Item, b?.Item)));
  };

  const validateForm = () => {
    if (!Customer_uuid) {
      toast.error("Please select a customer");
      return false;
    }
    for (const item of items) {
      if (!item.Item || item.Quantity <= 0 || item.Rate <= 0) {
        toast.error("Each item must have a name, quantity > 0 and rate > 0");
        return false;
      }
    }
    return true;
  };

  const smoothSave = useCallback(async (fn) => {
    setIsSubmitting(true);
    const start = Date.now();
    try {
      await fn();
    } finally {
      const elapsed = Date.now() - start;
      if (elapsed < MIN_SAVE_MS) {
        await new Promise((r) => setTimeout(r, MIN_SAVE_MS - elapsed));
      }
      setIsSubmitting(false);
    }
  }, []);

  /* ---------------------- submit ---------------------- */
  const submit = async () => {
    if (!validateForm() || isSubmitting) return;

    await smoothSave(async () => {
      try {
        const idForApi = orderId;
        if (!idForApi) {
          toast.error("No id found for this order.");
          return;
        }

        const itemLines = items.map((i) => ({
          Item: i.Item,
          Quantity: n2(i.Quantity),
          Rate: n2(i.Rate),
          Amount: +(n2(i.Amount) || (n2(i.Quantity) * n2(i.Rate))).toFixed(2),
          Priority: i.Priority || "Normal",
          Remark: i.Remark || "",
        }));

        const payload = { Customer_uuid, Items: itemLines };

        // Only the working endpoint on your backend:
        const response = await axios.put(`/order/updateDelivery/${idForApi}`, payload);

        if (!response?.data?.success) {
          console.error("updateDelivery response without success=true:", response?.data);
          toast.error(response?.data?.message || "Order save failed");
          return;
        }

        // Optional accounting (kept as-is; remove if not needed on your backend)
        try {
          const totalAmount = +itemLines.reduce((s, i) => s + (Number(i.Amount) || 0), 0).toFixed(2);
          const journal = [
            { Account_id: PURCHASE_ACCOUNT_ID, Type: "Debit", Amount: totalAmount },
            { Account_id: Customer_uuid, Type: "Credit", Amount: totalAmount },
          ];
          const transaction = await axios.post(`/transaction/addTransaction`, {
            Description: "Delivered",
            Order_number: order.Order_Number,
            Transaction_date: new Date().toISOString(),
            Total_Credit: totalAmount,
            Total_Debit: totalAmount,
            Payment_mode: "Purchase",
            Journal_entry: journal,
            Created_by: loggedInUser,
          });
          if (!transaction?.data?.success) {
            console.warn("Transaction failed:", transaction?.data);
            toast.error(transaction?.data?.message || "Transaction failed");
          }
        } catch (txErr) {
          const status = txErr?.response?.status;
          const msg = extractServerMessage(txErr);
          console.error("Transaction error:", status, msg);
          toast.error(`Transaction error: ${msg}`);
        }

        const patchId = order.Order_uuid || order._id || orderId;
        onOrderPatched(patchId, {
          Items: itemLines,
          Customer_uuid,
          Customer_name: customerMap[Customer_uuid] || Customer_name,
        });

        toast.success("Order saved");
        setShowInvoiceModal(true);
      } catch (err) {
        const status = err?.response?.status;
        const msg = extractServerMessage(err);
        console.error("Submit error:", status, msg, err?.response?.data);
        toast.error(`Save failed${status ? ` (${status})` : ""}: ${msg}`);
      }
    });
  };

  /* ------------------- WhatsApp share ------------------- */
  const handleWhatsApp = async (pdfUrl = "") => {
    const totalAmount = items.reduce((sum, i) => sum + (Number(i.Amount) || 0), 0);
    const mobile =
      customerMobile || customers.find((c) => c.Customer_uuid === Customer_uuid)?.Mobile_number;

    if (!mobile) {
      toast.error("Customer mobile number not found");
      return;
    }

    const number = normalizeWhatsAppNumber(mobile);
    const message = `Hi ${customerMap[Customer_uuid] || Customer_name}, your order has been delivered. Amount: ₹${totalAmount}`;
    const payload = { number, message, ...(pdfUrl ? { mediaUrl: pdfUrl } : {}) };

    try {
      const res = await axios.post(`/whatsapp/send-test`, payload);
      if (res.data?.success || res.status === 200) toast.success("✅ WhatsApp message sent");
      else {
        console.error("⚠️ WhatsApp API error response:", res.data);
        toast.error("❌ WhatsApp sending failed");
      }
    } catch (err) {
      const status = err?.response?.status;
      const msg = extractServerMessage(err);
      console.error("❌ WhatsApp error:", status, msg);
      toast.error(`WhatsApp error (${status || "ERR"}): ${msg}`);
    }
  };

  const selectOptions = useMemo(
    () => itemOptions.map((i) => ({ label: i, value: i })),
    [itemOptions]
  );

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
        <div className="bg-white p-6 rounded shadow-md w-full max-w-3xl relative">
          <div className="relative mb-4 pr-12">
  <h2 className="text-xl font-bold">
    {mode === "edit" ? "Edit Order • Items/Invoice" : "New Delivery"}
  </h2>

  {loadingLists && (
    <div className="mt-1 flex items-center text-sm text-gray-500">
      <LoadingSpinner size={20} className="mr-2" /> Loading lists…
    </div>
  )}

  {/* ✅ Top-right close button */}
  <button
    type="button"
    aria-label="Close"
    onClick={() => {
      setShowInvoiceModal(false);
      onClose?.();
    }}
    className="absolute top-0 right-0 inline-flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 text-gray-600 hover:text-red-600 hover:bg-red-50"
  >
    <span className="text-lg leading-none">×</span>
  </button>
</div>


          <form
            className="grid grid-cols-1 gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <div>
              <label className="block font-semibold">
                Customer <span className="text-red-500">*</span>
              </label>
              <select
                value={Customer_uuid}
                onChange={(e) => setCustomer_uuid(e.target.value)}
                className="w-full border p-2 rounded disabled:opacity-60"
                disabled={loadingLists}
              >
                <option value="">Select customer</option>
                {customers.map((c) => (
                  <option key={c.Customer_uuid} value={c.Customer_uuid}>
                    {c.Customer_name}
                  </option>
                ))}
              </select>
            </div>

            {items.map((item, index) => (
              <div key={index} className="grid grid-cols-1 md:grid-cols-6 gap-2 items-center">
                <Select
                  className="md:col-span-2"
                  options={selectOptions}
                  value={item.Item ? { label: item.Item, value: item.Item } : null}
                  onChange={(opt) => handleItemChange(index, "Item", opt?.value || "")}
                  placeholder={loadingLists ? "Loading…" : "Select item"}
                  isDisabled={loadingLists}
                />

                <input
                  type="number"
                  placeholder="Qty"
                  value={item.Quantity}
                  onChange={(e) => handleItemChange(index, "Quantity", e.target.value)}
                  className="border p-2 rounded"
                />

                <input
                  type="number"
                  placeholder="Rate"
                  value={item.Rate}
                  onChange={(e) => handleItemChange(index, "Rate", e.target.value)}
                  className="border p-2 rounded"
                />

                <input
                  type="text"
                  value={item.Amount}
                  readOnly
                  className="border p-2 bg-gray-100 rounded"
                />

                <input
                  type="text"
                  placeholder="Remark (this line)"
                  value={item.Remark || ""}
                  onChange={(e) => handleItemChange(index, "Remark", e.target.value)}
                  className="md:col-span-6 border p-2 rounded"
                />
              </div>
            ))}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={addNewItem}
                className="bg-blue-500 text-white px-3 py-1 rounded"
                disabled={loadingLists}
              >
                + Add Item
              </button>

              <button
                type="button"
                onClick={sortLinesAZ}
                className="bg-gray-100 border px-3 py-1 rounded hover:bg-gray-200"
                disabled={items.length < 2}
              >
                Sort A→Z
              </button>
            </div>

            <button
              type="submit"
              disabled={isSubmitting || loadingLists}
              className={`py-2 rounded text-white ${
                isSubmitting || loadingLists
                  ? "bg-gray-400 cursor-not-allowed"
                  : "bg-blue-600 hover:bg-blue-700"
              }`}
            >
              {isSubmitting ? "Saving…" : "Submit"}
            </button>
          </form>
        </div>
      </div>

      <Suspense fallback={null}>
        <InvoiceModal
          open={showInvoiceModal}
          onClose={() => setShowInvoiceModal(false)}
          orderNumber={order.Order_Number}
          partyName={customerMap[Customer_uuid] || Customer_name}
          items={items}
          onWhatsApp={handleWhatsApp}
          onReady={() => {}}
        />
      </Suspense>
    </>
  );
}
