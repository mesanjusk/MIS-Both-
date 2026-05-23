import React, { forwardRef } from "react";
import ReactQRCode from "react-qr-code";

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
  },
  ref
) {
  const itemsTotal = items.reduce((sum, i) => sum + (Number(i.Amount) || 0), 0);
  const extrasTotal = extraCharges.reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
  const grandTotal = itemsTotal + extrasTotal;

  const upiLink = upiId
    ? `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(upiName || store)}&cu=INR`
    : null;

  return (
    <div ref={ref} className="mx-auto w-[320px] border bg-white p-4 text-[12px] rounded shadow-md">
      {/* Header */}
      <div className="text-center border-b pb-2">
        <h2 className="text-lg font-bold">{store}</h2>
        {addressLines.map((line, idx) => (
          <p key={idx} className="text-[11px]">{line}</p>
        ))}
        {(phone || email) && (
          <p className="text-[10px] text-gray-500 mt-0.5">
            {phone && `📞 ${phone}`}{phone && email && "  |  "}{email && `✉ ${email}`}
          </p>
        )}
        {gst && <p className="text-[10px] text-gray-500">GST: {gst}</p>}
      </div>

      {/* Bill info */}
      <div className="mt-2 flex justify-between text-sm">
        <p><strong>Bill No:</strong> {orderNumber || "-"}</p>
        <p><strong>Date:</strong> {dateStr}</p>
      </div>
      <p className="mt-1 text-sm"><strong>Party:</strong> {partyName}</p>

      {/* Items table */}
      <table className="w-full text-left mt-2">
        <thead>
          <tr className="border-b">
            <th className="py-1">Item</th>
            <th className="py-1 text-right">Qty</th>
            <th className="py-1 text-right">Rate</th>
            <th className="py-1 text-right">Amt</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => (
            <tr key={idx}>
              <td className="py-1">
                {item.Item}
                {item.Remark ? (
                  <div className="text-[10px] text-gray-600 italic">({item.Remark})</div>
                ) : null}
              </td>
              <td className="py-1 text-right">{item.Quantity}</td>
              <td className="py-1 text-right">₹{item.Rate}</td>
              <td className="py-1 text-right">₹{item.Amount}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Subtotal */}
      <div className="flex justify-between mt-1 text-[11px] text-gray-600 border-t pt-1">
        <span>Subtotal</span>
        <span>₹{itemsTotal.toLocaleString("en-IN")}</span>
      </div>

      {/* Additional charges */}
      {extraCharges.filter((c) => Number(c.amount) > 0).map((c, idx) => (
        <div key={idx} className="flex justify-between text-[11px] text-gray-600">
          <span>{c.label || "Extra"}</span>
          <span>₹{Number(c.amount).toLocaleString("en-IN")}</span>
        </div>
      ))}

      <hr className="my-1" />

      {/* Grand total */}
      <div className="flex justify-between font-bold text-sm">
        <span>Total</span>
        <span>₹{grandTotal.toLocaleString("en-IN")}</span>
      </div>

      {/* QR / UPI */}
      <div className="mt-3 text-center">
        <p className="text-[11px] font-semibold mb-1">Scan to Pay via UPI</p>
        {upiLink ? (
          <div className="flex justify-center">
            <ReactQRCode value={upiLink} size={96} />
          </div>
        ) : (
          <p className="text-[10px] text-gray-400 italic">No UPI configured</p>
        )}
        {upiId && (
          <p className="text-[10px] text-gray-500 mt-1">{upiId}</p>
        )}
      </div>
    </div>
  );
});

export default InvoicePreview;
