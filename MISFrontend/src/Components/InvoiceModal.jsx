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

/**
 * InvoiceModal
 * Props:
 * - open, onClose
 * - orderNumber, partyName, items, extraCharges
 * - onWhatsApp: (invoiceUrl: string) => void
 * - onReady: (invoiceUrl: string) => void
 */
export default function InvoiceModal({
  open,
  onClose,
  orderNumber,
  partyName,
  items = [],
  extraCharges = [],
  onWhatsApp,
  onReady,
}) {
  const previewRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [invoiceUrl, setInvoiceUrl] = useState("");
  const [profile, setProfile] = useState(DEFAULT_PROFILE);

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
      if (v === null || v === undefined) return 0;
      if (typeof v === "number") return Number.isFinite(v) ? v : 0;
      const s = String(v).replace(/[₹,\s]/g, "").trim();
      const n = Number(s);
      return Number.isFinite(n) ? n : 0;
    };

    return (Array.isArray(items) ? items : []).map((it) => {
      const name = String(it?.Item ?? it?.name ?? it?.Item_name ?? "Item");
      const qty = toNum(it?.Qty ?? it?.qty ?? it?.Quantity ?? 0);
      const rate = toNum(it?.Rate ?? it?.rate ?? 0);
      const amt = toNum(it?.Amt ?? it?.amt ?? it?.Amount ?? it?.amount ?? 0) || qty * rate;
      return { ...it, Item: name, Qty: qty, Rate: rate, Amt: amt, Amount: amt, Quantity: qty };
    });
  }, [items]);

  const itemsSignature = useMemo(() => {
    try {
      return JSON.stringify(normalizedItems.map((x) => [x.Item, x.Qty, x.Rate, x.Amt]).slice(0, 50));
    } catch {
      return String(normalizedItems?.length || 0);
    }
  }, [normalizedItems]);

  useEffect(() => {
    let cancelled = false;

    async function uploadInvoice() {
      if (!open) return;
      await new Promise((r) => setTimeout(r, 200));
      if (cancelled || !previewRef.current) return;

      try {
        setUploading(true);
        const canvas = await html2canvas(previewRef.current, { scale: 2, useCORS: true });
        const imgData = canvas.toDataURL("image/jpeg", 0.9);
        const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: [74, 120] });
        pdf.addImage(imgData, "JPEG", 0, 0, 74, 120);
        const pdfBlob = pdf.output("blob");
        const cloudForm = new FormData();
        cloudForm.append("file", pdfBlob, `${orderNumber || "invoice"}.pdf`);
        cloudForm.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
        const res = await axios.post(CLOUDINARY_UPLOAD_URL, cloudForm);
        const url = res.data?.secure_url;
        if (cancelled) return;
        setInvoiceUrl(url || "");
        onReady?.(url || "");
        if (url) toast.success("Invoice uploaded");
        else toast.error("Upload returned no URL");
      } catch (err) {
        console.error("Invoice upload error:", err);
        toast.error("Upload failed");
      } finally {
        if (!cancelled) setUploading(false);
      }
    }

    if (open) uploadInvoice();
    else setInvoiceUrl("");

    return () => { cancelled = true; };
  }, [open, orderNumber, itemsSignature, onReady]);

  if (!open) return null;

  const addressLines = [
    profile.addressLine1,
    profile.addressLine2,
    profile.city,
  ].filter(Boolean);

  const handlePrint = () => {
    const html = previewRef.current?.innerHTML || "";
    const win = window.open("", "", "height=700,width=500");
    win.document.write(`<html><head><title>Invoice #${orderNumber}</title><style>body{margin:0;font-family:sans-serif}</style></head><body>`);
    win.document.write(html);
    win.document.write("</body></html>");
    win.document.close();
    win.print();
  };

  const handleDownloadPDF = async () => {
    const element = previewRef.current;
    if (!element) return;
    const canvas = await html2canvas(element, { scale: 2, useCORS: true });
    const imgData = canvas.toDataURL("image/jpeg", 0.9);
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: [74, 120] });
    pdf.addImage(imgData, "JPEG", 0, 0, 74, 120);
    pdf.save(`${orderNumber || "invoice"}.pdf`);
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50"
      style={{ zIndex: 2500 }}
    >
      <div className="bg-white w-full max-w-md p-6 rounded-lg shadow-xl relative overflow-y-auto max-h-screen">
        <button className="absolute top-2 right-3 text-xl font-bold text-gray-500 hover:text-red-600" onClick={onClose}>
          ✕
        </button>

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

        <div className="mt-6 flex justify-end gap-3 flex-wrap">
          <button
            onClick={() => {
              if (!invoiceUrl) {
                toast.error(uploading ? "Invoice is generating…" : "Invoice not ready yet");
                return;
              }
              onWhatsApp?.(invoiceUrl);
            }}
            disabled={uploading}
            className={`px-4 py-2 rounded text-white text-sm ${
              uploading ? "bg-gray-400 cursor-not-allowed" : "bg-green-600 hover:bg-green-700"
            }`}
          >
            {uploading ? "Preparing…" : "📤 WhatsApp"}
          </button>

          <button
            onClick={handlePrint}
            className="bg-gray-600 text-white px-4 py-2 rounded hover:bg-gray-700 text-sm"
          >
            🖨 Print
          </button>

          <button
            onClick={handleDownloadPDF}
            className="bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700 text-sm"
          >
            ⬇ Download
          </button>
        </div>
      </div>
    </div>
  );
}
