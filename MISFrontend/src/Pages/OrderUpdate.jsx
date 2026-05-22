/* eslint-disable react/prop-types */
import { useState, useEffect, useRef } from "react";
import axios from "../apiClient.js";
import toast from "react-hot-toast";
import OrderHeader from "../Components/OrderHeader";
import StatusTable from "../Components/StatusTable";
import InvoiceModal from "../Components/InvoiceModal";
import InvoicePreview from "../Components/InvoicePreview";
import UpdateDelivery from "./updateDelivery";

const toYmd = (v) => {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
};

const norm = (s) => String(s || "").trim().toLowerCase();

export default function OrderUpdate({ order = {}, onClose = () => {}, onOrderPatched = () => {}, onOrderReplaced = () => {} }) {
  const [values] = useState({
    id:            order?._id || "",
    Customer_name: order?.Customer_name || order?.customerName || "",
    Order_uuid:    order?.Order_uuid || "",
    Order_Number:  order?.Order_Number || "",
    Customer_uuid: order?.Customer_uuid || "",
    Items:         Array.isArray(order?.Items) ? order.Items : [],
    Status:        Array.isArray(order?.Status) ? order.Status : [],
    stage:         order?.stage || order?.highestStatusTask?.Task || "",
  });

  const [notes, setNotes]               = useState([]);
  const [note, setNote]                 = useState("");
  const [savingNote, setSavingNote]     = useState(false);
  const [dueDate, setDueDate]           = useState(toYmd(order?.highestStatusTask?.Delivery_Date) || "");
  const [savingDate, setSavingDate]     = useState(false);
  const [markingPaid, setMarkingPaid]   = useState(false);
  const [showInvoice, setShowInvoice]   = useState(false);
  const [showDelivery, setShowDelivery] = useState(false);

  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onCloseRef.current?.(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    if (!values.Order_uuid) return;
    let ok = true;
    axios.get(`/note/${values.Order_uuid}`).then((r) => { if (ok) setNotes(r.data?.success ? r.data.result : []); }).catch(() => {});
    return () => { ok = false; };
  }, [values.Order_uuid]);

  const saveNote = async () => {
    if (!note.trim() || !values.Order_uuid) return;
    setSavingNote(true);
    try {
      await axios.post(`/note/${values.Order_uuid}`, { content: note });
      setNotes((prev) => [...prev, { content: note, createdAt: new Date().toISOString() }]);
      setNote("");
      toast.success("Note saved");
    } catch { toast.error("Failed to save note"); }
    finally { setSavingNote(false); }
  };

  const saveDueDate = async () => {
    if (!dueDate || !values.id) return;
    setSavingDate(true);
    try {
      await axios.patch(`/orders/${values.id}`, { Delivery_Date: dueDate });
      toast.success("Due date updated");
      onOrderPatched(values.Order_uuid || values.id, { highestStatusTask: { ...order?.highestStatusTask, Delivery_Date: dueDate } });
    } catch { toast.error("Failed to update due date"); }
    finally { setSavingDate(false); }
  };

  const markPaid = async () => {
    if (!values.id) return;
    setMarkingPaid(true);
    try {
      await axios.patch(`/orders/${values.id}/stage`, { stage: "paid" });
      toast.success("Order marked as paid");
      onOrderPatched(values.Order_uuid || values.id, { stage: "paid" });
      onClose();
    } catch { toast.error("Failed to mark paid"); }
    finally { setMarkingPaid(false); }
  };

  const isDelivered = norm(values.stage) === "delivered";

  const itemTotal = values.Items.reduce((s, i) => s + (Number(i.Amount) || Number(i.Rate) * Number(i.Qty) || 0), 0);

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center overflow-auto">
      <div className="bg-white w-full max-w-2xl rounded-xl shadow-xl relative max-h-[90vh] overflow-hidden">
        <button type="button" onClick={onClose} aria-label="Close"
          className="absolute top-3 right-3 z-20 inline-flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 hover:text-red-600 hover:bg-red-50 shadow-sm">
          <span className="text-lg leading-none">×</span>
        </button>

        <div className="sticky top-0 z-10 bg-white rounded-t-xl pt-6 px-6 pb-3 border-b">
          <OrderHeader values={values} notes={notes} />
        </div>

        <div className="overflow-y-auto px-6 pb-6 pt-4 max-h-[calc(90vh-120px)] space-y-4">

          {/* Stage timeline */}
          <StatusTable status={values.Status} />

          {/* Items (read-only) */}
          {values.Items.length > 0 && (
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-1">Items</p>
              <table className="w-full text-xs border rounded-lg overflow-hidden">
                <thead className="bg-gray-50">
                  <tr>
                    {["Item","Qty","Rate","Amount"].map((h) => (
                      <th key={h} className="px-2 py-1.5 text-left font-semibold text-gray-600">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {values.Items.map((item, i) => (
                    <tr key={i} className="border-t">
                      <td className="px-2 py-1.5">{item.Item || item.item || "—"}</td>
                      <td className="px-2 py-1.5">{item.Qty || item.qty || "—"}</td>
                      <td className="px-2 py-1.5">₹{item.Rate || item.rate || 0}</td>
                      <td className="px-2 py-1.5 font-medium">₹{Number(item.Amount) || (Number(item.Rate) * Number(item.Qty)) || 0}</td>
                    </tr>
                  ))}
                  <tr className="border-t bg-gray-50 font-semibold">
                    <td colSpan={3} className="px-2 py-1.5 text-right">Total</td>
                    <td className="px-2 py-1.5">₹{itemTotal.toLocaleString("en-IN")}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* Due date */}
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <button type="button" onClick={saveDueDate} disabled={savingDate}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
              {savingDate ? "Saving…" : "Save Date"}
            </button>
          </div>

          {/* Note */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Add Note</label>
            <div className="flex gap-2">
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2}
                placeholder="Add a note…"
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none" />
              <button type="button" onClick={saveNote} disabled={savingNote || !note.trim()}
                className="px-3 py-2 rounded-lg bg-gray-700 text-white text-sm font-medium hover:bg-gray-900 disabled:opacity-50 self-start">
                {savingNote ? "…" : "Save"}
              </button>
            </div>
            {notes.length > 0 && (
              <ul className="mt-2 space-y-1 text-xs text-gray-600 max-h-24 overflow-y-auto">
                {[...notes].reverse().map((n, i) => (
                  <li key={i} className="border-l-2 border-indigo-200 pl-2">{n.content || n.note}</li>
                ))}
              </ul>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            {isDelivered && (
              <button type="button" onClick={markPaid} disabled={markingPaid}
                className="flex-1 bg-green-600 text-white font-medium py-2 rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm">
                {markingPaid ? "Marking…" : "✓ Mark Paid"}
              </button>
            )}
            <button type="button" onClick={() => setShowDelivery(true)}
              className="flex-1 border border-blue-300 text-blue-700 hover:bg-blue-50 font-medium py-2 rounded-lg text-sm">
              Update Billing
            </button>
            <button type="button" onClick={() => setShowInvoice(true)}
              className="flex-1 border border-gray-300 text-gray-700 hover:border-gray-500 font-medium py-2 rounded-lg text-sm">
              Print Invoice
            </button>
          </div>
        </div>

        <InvoiceModal open={showInvoice} onClose={() => setShowInvoice(false)}>
          <InvoicePreview order={{ ...order, Status: values.Status, Items: values.Items,
            Customer_name: values.Customer_name, Order_Number: values.Order_Number,
            Order_uuid: values.Order_uuid, Customer_uuid: values.Customer_uuid }}
            onClose={() => setShowInvoice(false)} />
        </InvoiceModal>

        {showDelivery && (
          <UpdateDelivery order={order} onClose={() => setShowDelivery(false)}
            onOrderPatched={onOrderPatched} onOrderReplaced={onOrderReplaced} />
        )}
      </div>
    </div>
  );
}
