import React, { useEffect, useMemo, useRef, useState } from "react";
import axios from "../apiClient.js";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import { toast } from "./Toast";
import InvoicePreview from "./InvoicePreview";

const CLOUDINARY_UPLOAD_URL = "https://api.cloudinary.com/v1_1/dadcprflr/raw/upload";
const CLOUDINARY_UPLOAD_PRESET = "missk_invoice";

const DEFAULT_PROFILE = {
  name: "S.K. Digital",
  addressLine1: "Infront of Santoshi Mata Mandir",
  addressLine2: "Krishnapura Ward, Gondia",
  phone: "",
  email: "",
  gst: "",
  upiId: "",
  upiName: "",
};

function buildWhatsAppText({ store, addressLines, phone, orderNumber, dateStr, partyName, items, extraCharges, grandTotal, shareUrl, upiId }) {
  const itemsTotal = items.reduce((s, i) => s + (Number(i.Amount) || 0), 0);
  const extrasTotal = extraCharges.reduce((s, c) => s + (Number(c.amount) || 0), 0);
  const fmt = (n) => Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 });

  const lines = [
    `🧾 *INVOICE #${orderNumber || "—"}*`,
    `📅 Date: ${dateStr}`,
    `━━━━━━━━━━━━━━━━━━━━━━`,
    `🏪 *${store}*`,
    addressLines.filter(Boolean).length ? `📍 ${addressLines.filter(Boolean).join(", ")}` : "",
    phone ? `📞 ${phone}` : "",
    `━━━━━━━━━━━━━━━━━━━━━━`,
    `👤 *Bill To:* ${partyName}`,
    `━━━━━━━━━━━━━━━━━━━━━━`,
    `📦 *Items:*`,
    ...items.map((i) => `  • ${i.Item}${i.Remark ? ` (${i.Remark})` : ""} × ${i.Quantity} @ ₹${fmt(i.Rate)} = *₹${fmt(i.Amount)}*`),
    `━━━━━━━━━━━━━━━━━━━━━━`,
    items.length > 1 ? `  Subtotal: ₹${fmt(itemsTotal)}` : "",
    ...extraCharges.filter((c) => Number(c.amount) > 0).map((c) => `  ${c.label || "Extra"}: ₹${fmt(c.amount)}`),
    `💰 *Grand Total: ₹${fmt(grandTotal)}*`,
  ];

  if (upiId) lines.push(`━━━━━━━━━━━━━━━━━━━━━━`, `💳 *Pay via UPI:* ${upiId}`);
  if (shareUrl) lines.push(`🔗 *View Invoice:* ${shareUrl}`);
  lines.push(``, `_Thank you for your business!_ 🙏`);

  return lines.filter((l) => l !== "").join("\n");
}

export default function InvoiceModal({
  open,
  onClose,
  orderNumber,
  partyName,
  items = [],
  extraCharges = [],
  customerMobile = "",
  onWhatsApp,
  onReady,
}) {
  const previewRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [pdfUrl, setPdfUrl] = useState("");
  const [shareToken, setShareToken] = useState("");
  const [shareUrl, setShareUrl] = useState("");
  const [profile, setProfile] = useState(DEFAULT_PROFILE);
  const [copied, setCopied] = useState(false);

  const dateStr = useMemo(() => new Date().toLocaleDateString("en-GB"), [open, orderNumber]);

  // Fetch business profile once per open
  useEffect(() => {
    if (!open) return;
    axios.get("/api/business-profile")
      .then((res) => {
        if (res.data?.success && res.data.result && Object.keys(res.data.result).length) {
          setProfile({ ...DEFAULT_PROFILE, ...res.data.result });
        }
      })
      .catch(() => {});
  }, [open]);

  const normalizedItems = useMemo(() => {
    const toNum = (v) => {
      if (v == null) return 0;
      if (typeof v === "number") return Number.isFinite(v) ? v : 0;
      const n = Number(String(v).replace(/[₹,\s]/g, "").trim());
      return Number.isFinite(n) ? n : 0;
    };
    return (Array.isArray(items) ? items : []).map((it) => ({
      ...it,
      Item: String(it?.Item ?? it?.name ?? "Item"),
      Quantity: toNum(it?.Quantity ?? it?.qty ?? it?.Qty),
      Rate: toNum(it?.Rate ?? it?.rate),
      Amount: toNum(it?.Amount ?? it?.amount ?? it?.Amt) || toNum(it?.Quantity ?? it?.qty ?? 0) * toNum(it?.Rate ?? it?.rate ?? 0),
      Remark: it?.Remark || "",
    }));
  }, [items]);

  const grandTotal = useMemo(() => {
    const items = normalizedItems.reduce((s, i) => s + (Number(i.Amount) || 0), 0);
    const extras = extraCharges.reduce((s, c) => s + (Number(c.amount) || 0), 0);
    return items + extras;
  }, [normalizedItems, extraCharges]);

  const addressLines = [profile.addressLine1, profile.addressLine2, profile.city].filter(Boolean);

  const itemsSignature = useMemo(() => {
    try { return JSON.stringify(normalizedItems.map((x) => [x.Item, x.Quantity, x.Rate, x.Amount])); }
    catch { return String(normalizedItems.length); }
  }, [normalizedItems]);

  // Save to public-invoices + upload PDF
  useEffect(() => {
    let cancelled = false;
    if (!open) { setPdfUrl(""); setShareToken(""); setShareUrl(""); return; }

    async function run() {
      await new Promise((r) => setTimeout(r, 220));
      if (cancelled || !previewRef.current) return;

      try {
        setUploading(true);

        // 1. Save invoice to get shareToken first
        let token = "";
        try {
          const saveRes = await axios.post("/api/public-invoices", {
            orderNumber,
            partyName,
            dateStr,
            storeName: profile.name,
            addressLines,
            phone: profile.phone,
            email: profile.email,
            gst: profile.gst,
            upiId: profile.upiId,
            upiName: profile.upiName,
            items: normalizedItems,
            extraCharges,
            grandTotal,
          });
          if (saveRes.data?.success) {
            token = saveRes.data.result.shareToken;
            const url = `${window.location.origin}/invoice/${token}`;
            if (!cancelled) { setShareToken(token); setShareUrl(url); }
          }
        } catch (e) {
          console.warn("Public invoice save failed:", e);
        }

        // 2. Generate PDF and upload to Cloudinary
        const canvas = await html2canvas(previewRef.current, { scale: 2, useCORS: true });
        const imgData = canvas.toDataURL("image/jpeg", 0.92);
        const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a5" });
        const w = 148, h = Math.round((canvas.height / canvas.width) * w);
        pdf.addImage(imgData, "JPEG", 0, 0, w, Math.min(h, 210));
        const pdfBlob = pdf.output("blob");
        const form = new FormData();
        form.append("file", pdfBlob, `invoice-${orderNumber || "inv"}.pdf`);
        form.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
        const res = await axios.post(CLOUDINARY_UPLOAD_URL, form);
        const url = res.data?.secure_url || "";
        if (cancelled) return;
        setPdfUrl(url);
        onReady?.(url);

        // 3. Patch cloudinaryUrl back
        if (token && url) {
          axios.patch(`/api/public-invoices/${token}/pdf`, { cloudinaryUrl: url }).catch(() => {});
        }

        if (url) toast.success("Invoice ready");
      } catch (err) {
        console.error("Invoice error:", err);
        toast.error("Invoice generation failed");
      } finally {
        if (!cancelled) setUploading(false);
      }
    }

    run();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, orderNumber, itemsSignature]);

  if (!open) return null;

  const handlePrint = () => {
    const win = window.open("", "", "height=800,width=600");
    win.document.write(`<html><head><title>Invoice #${orderNumber}</title><style>body{margin:0;padding:16px;font-family:sans-serif;background:#f5f5f5}</style></head><body>`);
    win.document.write(previewRef.current?.outerHTML || "");
    win.document.write("</body></html>");
    win.document.close();
    win.print();
  };

  const handleDownloadPDF = async () => {
    if (!previewRef.current) return;
    const canvas = await html2canvas(previewRef.current, { scale: 2, useCORS: true });
    const imgData = canvas.toDataURL("image/jpeg", 0.92);
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a5" });
    const w = 148, h = Math.round((canvas.height / canvas.width) * w);
    pdf.addImage(imgData, "JPEG", 0, 0, w, Math.min(h, 210));
    pdf.save(`invoice-${orderNumber || "inv"}.pdf`);
  };

  const handleCopyLink = () => {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success("Link copied!");
    });
  };

  const handleWhatsAppPDF = () => {
    if (!pdfUrl) { toast.error(uploading ? "Preparing…" : "PDF not ready"); return; }
    onWhatsApp?.(pdfUrl);
  };

  const handleSendBaileysText = async () => {
    const mobile = customerMobile;
    if (!mobile) { toast.error("No customer mobile number"); return; }
    const text = buildWhatsAppText({
      store: profile.name,
      addressLines,
      phone: profile.phone,
      orderNumber,
      dateStr,
      partyName,
      items: normalizedItems,
      extraCharges,
      grandTotal,
      shareUrl,
      upiId: profile.upiId,
    });
    try {
      await axios.post("/api/baileys/send-text", { to: mobile, text, contactName: partyName });
      toast.success("Message sent via Baileys!");
    } catch (err) {
      toast.error(err?.response?.data?.message || "Baileys send failed");
    }
  };

  const handleShareLink = () => {
    if (!shareUrl) return;
    const whatsappUrl = `https://wa.me/${customerMobile?.replace(/\D/g, "")}?text=${encodeURIComponent(`🧾 Invoice #${orderNumber} — ${partyName}\n${shareUrl}`)}`;
    window.open(whatsappUrl, "_blank");
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-50" style={{ zIndex: 2500 }}>
      <div className="bg-white w-full max-w-md rounded-xl shadow-2xl relative overflow-y-auto" style={{ maxHeight: "95vh" }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b bg-red-700 rounded-t-xl">
          <span className="text-white font-bold text-base">Invoice #{orderNumber}</span>
          <button onClick={onClose} className="text-white hover:text-red-200 text-xl font-bold leading-none">✕</button>
        </div>

        {/* Preview */}
        <div className="p-4 bg-gray-50">
          <InvoicePreview
            ref={previewRef}
            store={profile.name}
            addressLines={addressLines}
            phone={profile.phone}
            email={profile.email}
            gst={profile.gst}
            upiId={profile.upiId}
            upiName={profile.upiName}
            orderNumber={orderNumber}
            dateStr={dateStr}
            partyName={partyName}
            items={normalizedItems}
            extraCharges={extraCharges}
          />
        </div>

        {/* Share link row */}
        {shareUrl && (
          <div className="mx-4 mb-1 flex items-center gap-2 bg-gray-100 rounded-lg px-3 py-2">
            <span className="text-xs text-gray-500 truncate flex-1">{shareUrl}</span>
            <button onClick={handleCopyLink} className="text-xs font-semibold text-blue-600 hover:text-blue-800 whitespace-nowrap">
              {copied ? "✓ Copied" : "Copy"}
            </button>
          </div>
        )}

        {uploading && (
          <p className="text-center text-xs text-gray-400 py-1">⏳ Preparing invoice…</p>
        )}

        {/* Action buttons */}
        <div className="px-4 pb-4 pt-2 grid grid-cols-2 gap-2">
          {/* Row 1 */}
          <button
            onClick={handleWhatsAppPDF}
            disabled={uploading}
            className={`flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-sm font-semibold text-white ${uploading ? "bg-gray-400" : "bg-green-600 hover:bg-green-700"}`}
          >
            📎 WhatsApp PDF
          </button>

          <button
            onClick={handleShareLink}
            disabled={!shareUrl}
            className={`flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-sm font-semibold text-white ${!shareUrl ? "bg-gray-400" : "bg-emerald-600 hover:bg-emerald-700"}`}
          >
            🔗 Share Link
          </button>

          {/* Row 2 */}
          <button
            onClick={handleSendBaileysText}
            className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-sm font-semibold text-white bg-teal-600 hover:bg-teal-700"
          >
            💬 Baileys Text
          </button>

          <button
            onClick={handleCopyLink}
            disabled={!shareUrl}
            className={`flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-sm font-semibold text-white ${!shareUrl ? "bg-gray-400" : "bg-indigo-600 hover:bg-indigo-700"}`}
          >
            {copied ? "✓ Copied!" : "📋 Copy Link"}
          </button>

          {/* Row 3 */}
          <button
            onClick={handlePrint}
            className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-sm font-semibold bg-gray-100 hover:bg-gray-200 text-gray-700"
          >
            🖨 Print
          </button>

          <button
            onClick={handleDownloadPDF}
            className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-sm font-semibold bg-gray-100 hover:bg-gray-200 text-gray-700"
          >
            ⬇ Download
          </button>
        </div>
      </div>
    </div>
  );
}
