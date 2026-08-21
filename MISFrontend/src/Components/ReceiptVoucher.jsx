import { forwardRef } from "react";
import { amountInWords } from "../utils/amountInWords";

const fmt = (n) => Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Printable money-received / money-paid voucher — the counterpart of InvoicePreview
// for ledger entries that are not backed by a sale invoice.
const ReceiptVoucher = forwardRef(function ReceiptVoucher(
  {
    store = "S.K. Digital",
    addressLines = [],
    phone = "",
    email = "",
    gst = "",
    voucherType = "receipt",   // 'receipt' (money in) | 'payment' (money out) | 'journal'
    voucherNo,
    dateStr,
    partyName,
    amount = 0,
    paymentMode = "",
    narration = "",
    orderNumber = "",
  },
  ref
) {
  const isPayment = voucherType === "payment";
  const isJournal = voucherType === "journal";
  const accent = isJournal ? "#1d4ed8" : isPayment ? "#c2410c" : "#15803d";
  const tint = isJournal ? "#eff6ff" : isPayment ? "#fff7ed" : "#f0fdf4";
  const title = isJournal ? "TRANSACTION VOUCHER" : isPayment ? "PAYMENT VOUCHER" : "RECEIPT VOUCHER";
  const partyLabel = isJournal ? "Party" : isPayment ? "Paid To" : "Received From";
  const amountLabel = isJournal ? "Amount" : isPayment ? "Amount Paid" : "Amount Received";
  const icon = isJournal ? "📘" : isPayment ? "💸" : "✅";

  const fullAddress = addressLines.filter(Boolean).join(", ");

  const rows = [
    { label: "Voucher No", value: voucherNo || "—" },
    { label: "Date", value: dateStr || "—" },
    { label: isJournal ? "Account" : "Payment Mode", value: paymentMode || "—" },
    orderNumber ? { label: "Against Order", value: `#${orderNumber}` } : null,
  ].filter(Boolean);

  return (
    <div
      ref={ref}
      style={{ fontFamily: "'Segoe UI', Arial, sans-serif", fontSize: 12, background: "#fff", width: 340, margin: "0 auto", borderRadius: 10, overflow: "hidden", boxShadow: "0 2px 16px rgba(0,0,0,0.10)", border: "1px solid #e5e7eb" }}
    >
      {/* ── Top banner ── */}
      <div style={{ background: accent, padding: "14px 18px 10px", textAlign: "center" }}>
        <div style={{ color: "#fff", fontSize: 18, fontWeight: 900, letterSpacing: 3 }}>{title}</div>
      </div>

      {/* ── Business header ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "14px 18px 10px", borderBottom: "1px solid #f3f4f6" }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: 14, color: "#111" }}>{store}</div>
          {fullAddress && <div style={{ color: "#555", fontSize: 11, marginTop: 2 }}>{fullAddress}</div>}
          {phone && <div style={{ color: "#555", fontSize: 11 }}>📞 {phone}</div>}
          {email && <div style={{ color: "#555", fontSize: 11 }}>✉ {email}</div>}
          {gst && <div style={{ color: "#555", fontSize: 11 }}>GST: {gst}</div>}
        </div>
        <div style={{ width: 44, height: 44, background: accent, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginLeft: 10 }}>
          <span style={{ fontSize: 22 }}>{icon}</span>
        </div>
      </div>

      {/* ── Party ── */}
      <div style={{ padding: "10px 18px", borderBottom: "1px solid #f3f4f6", background: "#fafafa" }}>
        <div style={{ color: "#888", fontSize: 10, textTransform: "uppercase", letterSpacing: 1 }}>{partyLabel}</div>
        <div style={{ fontWeight: 700, fontSize: 13, color: "#111", marginTop: 2 }}>{partyName || "—"}</div>
      </div>

      {/* ── Voucher details ── */}
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={row.label} style={{ borderBottom: "1px solid #f3f4f6", background: idx % 2 === 0 ? "#fff" : "#fafafa" }}>
              <td style={{ padding: "7px 4px 7px 18px", color: "#666", width: "45%" }}>{row.label}</td>
              <td style={{ padding: "7px 18px 7px 4px", textAlign: "right", fontWeight: 600, color: "#111" }}>{row.value}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* ── Amount box ── */}
      <div style={{ margin: "10px 18px 6px", background: accent, borderRadius: 8, padding: "10px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ color: "#fff", fontWeight: 700, fontSize: 13 }}>{amountLabel}</span>
        <span style={{ color: "#fff", fontWeight: 900, fontSize: 16 }}>₹{fmt(amount)}</span>
      </div>

      <div style={{ margin: "0 18px 10px", background: tint, borderRadius: 8, padding: "8px 12px", fontSize: 10.5, color: "#374151", fontStyle: "italic" }}>
        {amountInWords(amount)}
      </div>

      {/* ── Narration ── */}
      {narration && (
        <div style={{ padding: "0 18px 10px" }}>
          <div style={{ color: "#888", fontSize: 10, textTransform: "uppercase", letterSpacing: 1 }}>Narration</div>
          <div style={{ color: "#111", fontSize: 11, marginTop: 2 }}>{narration}</div>
        </div>
      )}

      {/* ── Footer ── */}
      <div style={{ borderTop: "1px solid #f3f4f6", padding: "10px 18px 14px", display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <span style={{ fontSize: 10, color: "#888" }}>
          {isJournal ? "Ledger entry" : isPayment ? "Payment made with thanks" : "Received with thanks"}
        </span>
        <span style={{ fontSize: 10, color: "#888", borderTop: "1px dashed #cbd5e1", paddingTop: 4 }}>
          Authorised Signatory
        </span>
      </div>
    </div>
  );
});

export default ReceiptVoucher;
