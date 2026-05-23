import React, { forwardRef } from "react";
import ReactQRCode from "react-qr-code";

const fmt = (n) => Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const InvoicePreview = forwardRef(function InvoicePreview(
  {
    store = "S.K. Digital",
    addressLines = [],
    phone = "",
    email = "",
    gst = "",
    upiId = "",
    upiName = "",
    orderNumber,
    dateStr,
    partyName,
    items = [],
    extraCharges = [],
    hidePayButton = false,
  },
  ref
) {
  const itemsTotal = items.reduce((s, i) => s + (Number(i.Amount) || 0), 0);
  const extrasTotal = extraCharges.reduce((s, c) => s + (Number(c.amount) || 0), 0);
  const grandTotal = itemsTotal + extrasTotal;

  const upiLink = upiId
    ? `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(upiName || store)}&am=${grandTotal}&cu=INR&tn=Invoice%20${orderNumber || ""}`
    : null;

  const fullAddress = [...addressLines].filter(Boolean).join(", ");

  return (
    <div
      ref={ref}
      style={{ fontFamily: "'Segoe UI', Arial, sans-serif", fontSize: 12, background: "#fff", width: 340, margin: "0 auto", borderRadius: 10, overflow: "hidden", boxShadow: "0 2px 16px rgba(0,0,0,0.10)", border: "1px solid #e5e7eb" }}
    >
      {/* ── Red top banner ── */}
      <div style={{ background: "#d32f2f", padding: "14px 18px 10px", textAlign: "center" }}>
        <div style={{ color: "#fff", fontSize: 22, fontWeight: 900, letterSpacing: 4 }}>INVOICE</div>
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
        <div style={{ width: 44, height: 44, background: "#d32f2f", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginLeft: 10 }}>
          <span style={{ fontSize: 22 }}>🧾</span>
        </div>
      </div>

      {/* ── Bill To + Invoice No ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "10px 18px", borderBottom: "1px solid #f3f4f6", background: "#fafafa" }}>
        <div>
          <div style={{ color: "#888", fontSize: 10, textTransform: "uppercase", letterSpacing: 1 }}>Bill To</div>
          <div style={{ fontWeight: 700, fontSize: 13, color: "#111", marginTop: 2 }}>{partyName || "—"}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ color: "#888", fontSize: 10, textTransform: "uppercase", letterSpacing: 1 }}>Invoice No</div>
          <div style={{ fontWeight: 700, color: "#d32f2f", fontSize: 13 }}>{orderNumber || "—"}</div>
          <div style={{ color: "#888", fontSize: 10, marginTop: 4 }}>Date: <span style={{ color: "#111", fontWeight: 600 }}>{dateStr}</span></div>
        </div>
      </div>

      {/* ── Item Details header ── */}
      <div style={{ background: "#d32f2f", padding: "5px 18px" }}>
        <span style={{ color: "#fff", fontSize: 11, fontWeight: 700, letterSpacing: 1 }}># Item Details</span>
      </div>

      {/* ── Items table ── */}
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
        <thead>
          <tr style={{ background: "#fff3f3", borderBottom: "2px solid #d32f2f" }}>
            <th style={{ padding: "6px 18px 6px 18px", textAlign: "left", fontWeight: 700, color: "#444", width: "44%" }}>Item Name</th>
            <th style={{ padding: "6px 4px", textAlign: "center", fontWeight: 700, color: "#444", width: "12%" }}>Qty</th>
            <th style={{ padding: "6px 4px", textAlign: "right", fontWeight: 700, color: "#444", width: "18%" }}>Rate</th>
            <th style={{ padding: "6px 18px 6px 4px", textAlign: "right", fontWeight: 700, color: "#444", width: "26%" }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => (
            <tr key={idx} style={{ borderBottom: "1px solid #f3f4f6", background: idx % 2 === 0 ? "#fff" : "#fafafa" }}>
              <td style={{ padding: "7px 18px 7px 18px" }}>
                <div style={{ fontWeight: 600, color: "#111" }}>{item.Item}</div>
                {item.Remark && (
                  <div style={{ color: "#888", fontSize: 10, marginTop: 2, fontStyle: "italic" }}>{item.Remark}</div>
                )}
              </td>
              <td style={{ padding: "7px 4px", textAlign: "center", color: "#444" }}>{item.Quantity}</td>
              <td style={{ padding: "7px 4px", textAlign: "right", color: "#444" }}>₹{fmt(item.Rate)}</td>
              <td style={{ padding: "7px 18px 7px 4px", textAlign: "right", fontWeight: 600, color: "#111" }}>₹{fmt(item.Amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* ── Totals ── */}
      <div style={{ padding: "10px 18px 0", borderTop: "1px solid #e5e7eb" }}>
        <div style={{ display: "flex", justifyContent: "space-between", color: "#555", fontSize: 11, marginBottom: 4 }}>
          <span>Subtotal</span>
          <span>₹{fmt(itemsTotal)}</span>
        </div>
        {extraCharges.filter((c) => Number(c.amount) > 0).map((c, idx) => (
          <div key={idx} style={{ display: "flex", justifyContent: "space-between", color: "#555", fontSize: 11, marginBottom: 4 }}>
            <span>{c.label || "Extra"}</span>
            <span>₹{fmt(c.amount)}</span>
          </div>
        ))}
      </div>

      {/* Grand Total box */}
      <div style={{ margin: "10px 18px", background: "#d32f2f", borderRadius: 8, padding: "10px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ color: "#fff", fontWeight: 700, fontSize: 13 }}>Total</span>
        <span style={{ color: "#fff", fontWeight: 900, fontSize: 16 }}>₹{fmt(grandTotal)}</span>
      </div>

      <div style={{ padding: "2px 18px 8px", display: "flex", justifyContent: "space-between", fontSize: 11, color: "#888" }}>
        <span>Balance Due</span>
        <span style={{ fontWeight: 600, color: "#111" }}>₹{fmt(grandTotal)}</span>
      </div>

      {/* ── QR + Pay ── */}
      {upiId && (
        <div style={{ borderTop: "1px solid #f3f4f6", padding: "12px 18px", textAlign: "center" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#555", marginBottom: 8 }}>📲 Scan to Pay via UPI</div>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 8 }}>
            <ReactQRCode value={upiLink} size={100} />
          </div>
          <div style={{ fontSize: 10, color: "#888", marginBottom: 6 }}>{upiId}</div>
          {!hidePayButton && upiLink && (
            <a
              href={upiLink}
              style={{
                display: "inline-block",
                background: "#d32f2f",
                color: "#fff",
                borderRadius: 20,
                padding: "8px 28px",
                fontWeight: 700,
                fontSize: 13,
                textDecoration: "none",
                letterSpacing: 0.5,
              }}
            >
              💳 Pay Now
            </a>
          )}
        </div>
      )}
    </div>
  );
});

export default InvoicePreview;
