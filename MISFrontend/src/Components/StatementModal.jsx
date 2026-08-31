import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import axios from "../apiClient.js";
import { toast } from "./Toast";
import AccountStatement from "./AccountStatement";

const fmt = (n) => Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 });

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

// A4 in millimetres, the unit the PDF is built in.
const PAGE_W_MM = 210;
const PAGE_H_MM = 297;

/**
 * Preview, share and download the full account statement for one party.
 * Mirrors the invoice flow: the statement is saved server-side so it gets a
 * public link that can be sent on WhatsApp, and the same document is what the
 * PDF renders.
 */
export default function StatementModal({ open, onClose, statement, partyMobile = "" }) {
  const previewRef = useRef(null);
  const [profile, setProfile] = useState(DEFAULT_PROFILE);
  const [doc, setDoc] = useState(null);
  const [saving, setSaving] = useState(false);
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const addressLines = useMemo(
    () => [profile.addressLine1, profile.addressLine2, profile.city].filter(Boolean),
    [profile]
  );

  const shareUrl = doc?.shareToken ? `${window.location.origin}/invoice/${doc.shareToken}` : "";

  // Business letterhead for the preview (the saved copy keeps its own snapshot).
  useEffect(() => {
    if (!open) return;
    axios
      .get("/api/business-profile")
      .then((res) => {
        if (res.data?.success && res.data.result && Object.keys(res.data.result).length) {
          setProfile({ ...DEFAULT_PROFILE, ...res.data.result });
        }
      })
      .catch(() => {});
  }, [open]);

  // Save the statement so it has a shareable link, the same way an invoice does.
  useEffect(() => {
    if (!open || !statement) return;
    let cancelled = false;

    setSaving(true);
    setError("");
    setDoc(null);
    axios
      .post("/api/public-invoices/statement", statement)
      .then((res) => {
        if (cancelled) return;
        if (res.data?.success && res.data.result) setDoc(res.data.result);
        else setError(res.data?.message || "Could not save the statement link.");
      })
      .catch((err) => {
        console.error("Statement save error:", err);
        if (!cancelled) setError(err?.response?.data?.message || "Could not save the statement link.");
      })
      .finally(() => !cancelled && setSaving(false));

    return () => { cancelled = true; };
  }, [open, statement]);

  const buildPdf = useCallback(async () => {
    const pageNodes = previewRef.current?.querySelectorAll("[data-statement-page]") || [];
    if (!pageNodes.length) return null;

    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    for (let i = 0; i < pageNodes.length; i += 1) {
      const canvas = await html2canvas(pageNodes[i], { scale: 2, useCORS: true, backgroundColor: "#ffffff" });
      const imgData = canvas.toDataURL("image/jpeg", 0.92);
      const ratio = canvas.height / canvas.width;
      // Fit the sheet by width, unless the page ran long — then fit by height so
      // nothing is cut off.
      let w = PAGE_W_MM;
      let h = w * ratio;
      if (h > PAGE_H_MM) {
        h = PAGE_H_MM;
        w = h / ratio;
      }
      if (i) pdf.addPage();
      pdf.addImage(imgData, "JPEG", (PAGE_W_MM - w) / 2, 0, w, h);
    }
    return pdf;
  }, []);

  const handleDownloadPDF = useCallback(async () => {
    setBuilding(true);
    try {
      const pdf = await buildPdf();
      if (!pdf) return;
      const safeName = String(statement?.partyName || "statement").replace(/[^\w-]+/g, "-").toLowerCase();
      pdf.save(`statement-${safeName}.pdf`);
    } catch (err) {
      console.error("Statement PDF error:", err);
      toast.error("Could not build the PDF");
    } finally {
      setBuilding(false);
    }
  }, [buildPdf, statement?.partyName]);

  const handlePrint = useCallback(() => {
    if (!previewRef.current) return;
    const win = window.open("", "", "height=900,width=800");
    if (!win) return;
    win.document.write(
      "<html><head><title>Account Statement</title>" +
        "<style>body{margin:0;background:#fff}" +
        "@page{size:A4;margin:0}" +
        "[data-statement-page]{page-break-after:always;border:none !important}" +
        "</style></head><body>"
    );
    win.document.write(previewRef.current.innerHTML);
    win.document.write("</body></html>");
    win.document.close();
    win.focus();
    win.print();
  }, []);

  const handleCopyLink = useCallback(() => {
    if (!shareUrl) return;
    navigator.clipboard
      .writeText(shareUrl)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        toast.success("Link copied!");
      })
      .catch(() => toast.error("Copy failed"));
  }, [shareUrl]);

  const handleWhatsApp = useCallback(() => {
    if (!statement) return;
    const period =
      statement.periodFrom || statement.periodTo
        ? `${statement.periodFrom || "Beginning"} to ${statement.periodTo || "Till date"}`
        : "All dates";
    const closing = Number(statement.closingBalance) || 0;
    const text = [
      "📄 *ACCOUNT STATEMENT*",
      `👤 ${statement.partyName || ""}`,
      `📅 ${period}`,
      "",
      `Opening Balance: ₹${fmt(statement.openingBalance)}`,
      `Total Debit: ₹${fmt(statement.totalDebit)}`,
      `Total Credit: ₹${fmt(statement.totalCredit)}`,
      `*${closing >= 0 ? "Closing Balance (Receivable)" : "Closing Balance (Advance)"}: ₹${fmt(Math.abs(closing))}*`,
      "",
      shareUrl ? `🔗 View full statement: ${shareUrl}` : "",
      "",
      "_Thank you for your business!_ 🙏",
    ]
      .filter((l) => l !== "")
      .join("\n");
    const phone = String(partyMobile || "").replace(/\D/g, "");
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, "_blank");
  }, [statement, shareUrl, partyMobile]);

  if (!open || !statement) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-50 p-2" style={{ zIndex: 2500 }}>
      <div className="bg-white w-full max-w-5xl rounded-xl shadow-2xl relative flex flex-col" style={{ maxHeight: "95vh" }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b rounded-t-xl bg-blue-700">
          <div>
            <span className="text-white font-bold text-base">Account Statement — {statement.partyName}</span>
            <div className="text-blue-100 text-xs">
              {statement.periodFrom || "Beginning"} to {statement.periodTo || "Till date"} · {statement.rows?.length || 0} entries
            </div>
          </div>
          <button onClick={onClose} className="text-white hover:opacity-70 text-xl font-bold leading-none" aria-label="Close">✕</button>
        </div>

        {/* A4 preview */}
        <div className="p-4 bg-gray-100 overflow-auto flex-1">
          <AccountStatement
            ref={previewRef}
            store={profile.name}
            addressLines={addressLines}
            phone={profile.phone}
            email={profile.email}
            gst={profile.gst}
            upiId={profile.upiId}
            upiName={profile.upiName}
            partyMobile={partyMobile}
            {...statement}
          />
        </div>

        {/* Share link */}
        <div className="mx-4 mt-2 flex items-center gap-2 bg-gray-100 rounded-lg px-3 py-2 min-h-[38px]">
          {saving && <span className="text-xs text-gray-500">⏳ Preparing the share link…</span>}
          {!saving && error && <span className="text-xs text-red-600 flex-1">{error}</span>}
          {!saving && !error && shareUrl && (
            <>
              <span className="text-xs text-gray-500 truncate flex-1">{shareUrl}</span>
              <button onClick={handleCopyLink} className="text-xs font-semibold text-blue-600 hover:text-blue-800 whitespace-nowrap">
                {copied ? "✓ Copied" : "Copy"}
              </button>
            </>
          )}
        </div>

        {/* Actions */}
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
            disabled={building}
            className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-sm font-semibold bg-gray-100 hover:bg-gray-200 text-gray-700 disabled:opacity-60"
          >
            {building ? "⏳ Building PDF…" : "⬇ Download A4 PDF"}
          </button>
        </div>
      </div>
    </div>
  );
}
