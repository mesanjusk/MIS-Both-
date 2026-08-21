import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import axios from "../apiClient.js";
import { toast } from "./Toast";
import InvoicePreview from "./InvoicePreview";
import ReceiptVoucher from "./ReceiptVoucher";

const fmt = (n) => Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 });

const VOUCHER_LABEL = { receipt: "Receipt", payment: "Payment", journal: "Transaction" };

// Shows the document that was shared with the customer for one ledger row:
// the sale invoice when the transaction came from an order, otherwise the
// receipt / payment voucher for the entry itself.
export default function TransactionDocumentModal({
  open,
  onClose,
  transaction,
  entry,
  partyName,
  customerMobile = "",
  counterAccountName = "",
  // true when the other leg of the entry is a cash / bank account, which is what
  // makes a debit an actual payment out rather than a charge raised on the party
  counterIsCashOrBank = false,
}) {
  const previewRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [doc, setDoc] = useState(null);
  const [copied, setCopied] = useState(false);

  // Credit on a party ledger → money received. Debit against cash/bank → money paid out.
  // Anything else (a charge raised on the party) stays a neutral ledger voucher.
  const voucherType = String(entry?.Type || "").toLowerCase() === "credit"
    ? "receipt"
    : counterIsCashOrBank ? "payment" : "journal";
  const orderNumber = transaction?.Order_number ?? null;
  const transactionUuid = transaction?.Transaction_uuid || "";

  const shareUrl = doc?.shareToken ? `${window.location.origin}/invoice/${doc.shareToken}` : "";

  const dateStr = useMemo(
    () => (transaction?.Transaction_date ? new Date(transaction.Transaction_date).toLocaleDateString("en-GB") : ""),
    [transaction?.Transaction_date]
  );

  useEffect(() => {
    if (!open || !transaction) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");
      setDoc(null);
      try {
        // 1. Order-backed row → the invoice that was shared for that order.
        if (orderNumber) {
          try {
            const res = await axios.get(`/api/public-invoices/by-order/${encodeURIComponent(orderNumber)}`);
            if (res.data?.success && res.data.result) {
              if (!cancelled) setDoc(res.data.result);
              return;
            }
          } catch (err) {
            // 404 → no invoice was generated for this order; fall through to the voucher.
            if (err?.response?.status !== 404) throw err;
          }
        }

        // 2. Otherwise (or as a fallback) the receipt / payment voucher for this entry.
        if (!transactionUuid) {
          if (!cancelled) setError("This transaction has no reference id, so no voucher can be shown.");
          return;
        }

        const res = await axios.post("/api/public-invoices/receipt", {
          transactionUuid,
          transactionId: transaction.Transaction_id,
          orderNumber: orderNumber || "",
          partyName,
          dateStr,
          amount: Number(entry?.Amount) || 0,
          paymentMode: counterAccountName,
          narration: transaction.Description || "",
          voucherType,
        });
        if (res.data?.success && res.data.result) {
          if (!cancelled) setDoc(res.data.result);
        } else if (!cancelled) {
          setError(res.data?.message || "Could not load the voucher.");
        }
      } catch (err) {
        console.error("Transaction document error:", err);
        if (!cancelled) setError(err?.response?.data?.message || "Could not load the document.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, transactionUuid, orderNumber, entry?.Amount]);

  const handleCopyLink = useCallback(() => {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        toast.success("Link copied!");
      })
      .catch(() => toast.error("Copy failed"));
  }, [shareUrl]);

  const handleWhatsApp = useCallback(() => {
    if (!shareUrl) return;
    const isInvoice = doc?.docType !== "receipt";
    const heading = isInvoice
      ? `🧾 *Invoice #${doc?.orderNumber || orderNumber || ""}*`
      : `🧾 *${VOUCHER_LABEL[doc?.voucherType] || VOUCHER_LABEL[voucherType]} Voucher #${doc?.transactionId || transaction?.Transaction_id || ""}*`;
    const text = [
      heading,
      `👤 ${partyName || ""}`,
      `📅 ${doc?.dateStr || dateStr}`,
      `💰 ₹${fmt(doc?.grandTotal ?? entry?.Amount)}`,
      "",
      shareUrl,
    ].join("\n");
    const phone = String(customerMobile || "").replace(/\D/g, "");
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, "_blank");
  }, [shareUrl, doc, orderNumber, voucherType, partyName, dateStr, entry?.Amount, customerMobile, transaction?.Transaction_id]);

  const handlePrint = useCallback(() => {
    if (!previewRef.current) return;
    const win = window.open("", "", "height=800,width=600");
    if (!win) return;
    win.document.write(
      `<html><head><title>${doc?.docType === "receipt" ? "Voucher" : "Invoice"}</title>` +
      `<style>body{margin:0;padding:16px;font-family:sans-serif;background:#f5f5f5}</style></head><body>`
    );
    win.document.write(previewRef.current.outerHTML);
    win.document.write("</body></html>");
    win.document.close();
    win.print();
  }, [doc?.docType]);

  const handleDownloadPDF = useCallback(async () => {
    if (!previewRef.current) return;
    try {
      const canvas = await html2canvas(previewRef.current, { scale: 2, useCORS: true });
      const imgData = canvas.toDataURL("image/jpeg", 0.92);
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a5" });
      const w = 148;
      const h = Math.round((canvas.height / canvas.width) * w);
      pdf.addImage(imgData, "JPEG", 0, 0, w, Math.min(h, 210));
      const name = doc?.docType === "receipt"
        ? `voucher-${doc?.transactionId || "txn"}.pdf`
        : `invoice-${doc?.orderNumber || "inv"}.pdf`;
      pdf.save(name);
    } catch (err) {
      console.error("PDF error:", err);
      toast.error("Could not build the PDF");
    }
  }, [doc]);

  if (!open) return null;

  const isReceipt = doc?.docType === "receipt";
  const headerLabel = doc
    ? (isReceipt
        ? `${VOUCHER_LABEL[doc.voucherType] || VOUCHER_LABEL[voucherType]} Voucher #${doc.transactionId || transaction?.Transaction_id || ""}`
        : `Invoice #${doc.orderNumber || ""}`)
    : `Transaction #${transaction?.Transaction_id ?? ""}`;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-50 p-2" style={{ zIndex: 2500 }}>
      <div className="bg-white w-full max-w-md rounded-xl shadow-2xl relative overflow-y-auto" style={{ maxHeight: "95vh" }}>
        {/* Header */}
        <div className={`flex items-center justify-between px-5 py-3 border-b rounded-t-xl ${isReceipt ? "bg-green-700" : "bg-red-700"}`}>
          <span className="text-white font-bold text-base">{headerLabel}</span>
          <button onClick={onClose} className="text-white hover:opacity-70 text-xl font-bold leading-none" aria-label="Close">✕</button>
        </div>

        {/* Body */}
        <div className="p-4 bg-gray-50 min-h-[120px]">
          {loading && <p className="text-center text-sm text-gray-500 py-8">⏳ Loading document…</p>}

          {!loading && error && (
            <p className="text-center text-sm text-red-600 py-8">{error}</p>
          )}

          {!loading && !error && doc && (
            isReceipt ? (
              <ReceiptVoucher
                ref={previewRef}
                store={doc.storeName}
                addressLines={doc.addressLines || []}
                phone={doc.phone}
                email={doc.email}
                gst={doc.gst}
                voucherType={doc.voucherType || voucherType}
                voucherNo={doc.transactionId || transaction?.Transaction_id}
                dateStr={doc.dateStr}
                partyName={doc.partyName}
                amount={doc.amount ?? doc.grandTotal}
                paymentMode={doc.paymentMode}
                narration={doc.narration}
                orderNumber={doc.orderNumber}
              />
            ) : (
              <InvoicePreview
                ref={previewRef}
                store={doc.storeName}
                addressLines={doc.addressLines || []}
                phone={doc.phone}
                email={doc.email}
                gst={doc.gst}
                upiId={doc.upiId}
                upiName={doc.upiName}
                orderNumber={doc.orderNumber}
                dateStr={doc.dateStr}
                partyName={doc.partyName}
                items={doc.items || []}
                extraCharges={doc.extraCharges || []}
                hidePayButton
              />
            )
          )}
        </div>

        {/* Share link */}
        {shareUrl && (
          <div className="mx-4 mb-1 flex items-center gap-2 bg-gray-100 rounded-lg px-3 py-2">
            <span className="text-xs text-gray-500 truncate flex-1">{shareUrl}</span>
            <button onClick={handleCopyLink} className="text-xs font-semibold text-blue-600 hover:text-blue-800 whitespace-nowrap">
              {copied ? "✓ Copied" : "Copy"}
            </button>
          </div>
        )}

        {/* Actions */}
        {doc && (
          <div className="px-4 pb-4 pt-2 grid grid-cols-2 gap-2">
            <button
              onClick={handleWhatsApp}
              disabled={!shareUrl}
              className={`flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-sm font-semibold text-white ${!shareUrl ? "bg-gray-400" : "bg-green-600 hover:bg-green-700"}`}
            >
              🔗 Share on WhatsApp
            </button>
            <button
              onClick={handleCopyLink}
              disabled={!shareUrl}
              className={`flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-sm font-semibold text-white ${!shareUrl ? "bg-gray-400" : "bg-indigo-600 hover:bg-indigo-700"}`}
            >
              {copied ? "✓ Copied!" : "📋 Copy Link"}
            </button>
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
            {doc.cloudinaryUrl && (
              <a
                href={doc.cloudinaryUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="col-span-2 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-sm font-semibold bg-red-50 hover:bg-red-100 text-red-700"
              >
                📎 Open shared PDF
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
