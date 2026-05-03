import React, { forwardRef } from "react";

/**
 * InvoicePreview
 * - forwardRef so parent can access the rendered node (for html2canvas / print)
 * - purely presentational (no biz logic)
 */
const InvoicePreview = forwardRef(function InvoicePreview(
  { store = "S.K. Digital", addressLines = [], orderNumber, dateStr, partyName, items = [], qrSrc = "/qr.png" },
  ref
) {
  const total = items.reduce((sum, i) => sum + (Number(i.Amount) || 0), 0);

  return (
    <div ref={ref} className="mx-auto w-[320px] border bg-white p-4 text-[12px] rounded shadow-md">
      <div className="text-center border-b pb-2">
        <h2 className="text-lg font-bold">{store}</h2>
        {addressLines?.map((line, idx) => (
          <p key={idx}>{line}</p>
        ))}
      </div>

      <div className="mt-2 flex justify-between text-sm">
        <p><strong>Bill No:</strong> {orderNumber || "-"}</p>
        <p><strong>Date:</strong> {dateStr}</p>
      </div>
      <p className="mt-1 text-sm"><strong>Party:</strong> {partyName}</p>

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
                {item.Remark ? <div className="text-[10px] text-gray-600 italic">({item.Remark})</div> : null}
              </td>
              <td className="py-1 text-right">{item.Quantity}</td>
              <td className="py-1 text-right">₹{item.Rate}</td>
              <td className="py-1 text-right">₹{item.Amount}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <hr className="my-1" />

      <div className="flex justify-between font-bold">
        <span>Total</span>
        <span>₹{total}</span>
      </div>

      <div className="mt-3 text-center">
        <p className="text-sm font-semibold">Scan to Pay via UPI</p>
        <img src={qrSrc} alt="UPI QR" className="mx-auto h-24" />
      </div>
    </div>
  );
});

export default InvoicePreview;
