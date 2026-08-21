import { forwardRef } from "react";
import ReactQRCode from "react-qr-code";

const fmt = (n) =>
  Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// A4 at 96 dpi. The PDF builder captures each page node at this size, so the
// printed sheet matches the preview one to one.
export const A4_WIDTH_PX = 794;
export const A4_HEIGHT_PX = 1123;

// The first page carries the letterhead, party block and summary strip, so it
// fits fewer rows than the ones that follow.
export const ROWS_FIRST_PAGE = 16;
export const ROWS_NEXT_PAGE = 26;

/** Split ledger rows into per-page chunks. Always returns at least one page so
 *  an empty period still prints a statement saying so. */
export function paginateStatementRows(rows = [], { first = ROWS_FIRST_PAGE, rest = ROWS_NEXT_PAGE } = {}) {
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) return [[]];
  const pages = [list.slice(0, first)];
  for (let i = first; i < list.length; i += rest) pages.push(list.slice(i, i + rest));
  return pages;
}

const ACCENT = "#1d4ed8";
const TINT = "#eff6ff";

const th = { padding: "7px 8px", fontSize: 10, fontWeight: 700, color: "#fff", textAlign: "left", letterSpacing: 0.3 };
const td = { padding: "6px 8px", fontSize: 10.5, color: "#111", verticalAlign: "top" };
const num = { ...td, textAlign: "right", whiteSpace: "nowrap" };

function SummaryCell({ label, value, strong = false, color = "#111" }) {
  return (
    <div style={{ flex: 1, padding: "8px 10px" }}>
      <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: 1, color: "#6b7280" }}>{label}</div>
      <div style={{ fontSize: strong ? 15 : 13, fontWeight: strong ? 900 : 700, color, marginTop: 2 }}>₹{fmt(value)}</div>
    </div>
  );
}

function TableHead() {
  return (
    <thead>
      <tr style={{ background: ACCENT }}>
        <th style={{ ...th, width: "9%" }}>Txn No</th>
        <th style={{ ...th, width: "13%" }}>Voucher No</th>
        <th style={{ ...th, width: "12%" }}>Date</th>
        <th style={{ ...th, width: "32%" }}>Particulars</th>
        <th style={{ ...th, width: "11%", textAlign: "right" }}>Debit</th>
        <th style={{ ...th, width: "11%", textAlign: "right" }}>Credit</th>
        <th style={{ ...th, width: "12%", textAlign: "right" }}>Balance</th>
      </tr>
    </thead>
  );
}

/**
 * Printable running account statement for one party over a date range.
 * Renders one node per A4 page, each tagged with data-statement-page so the
 * PDF builder can capture them individually instead of slicing one tall image.
 */
const AccountStatement = forwardRef(function AccountStatement(
  {
    store = "S.K. Digital",
    addressLines = [],
    phone = "",
    email = "",
    gst = "",
    upiId = "",
    upiName = "",
    partyName = "",
    partyMobile = "",
    periodFrom = "",
    periodTo = "",
    generatedOn = "",
    openingBalance = 0,
    totalDebit = 0,
    totalCredit = 0,
    closingBalance = 0,
    rows = [],
  },
  ref
) {
  const pages = paginateStatementRows(rows);
  const fullAddress = addressLines.filter(Boolean).join(", ");
  const period = periodFrom || periodTo ? `${periodFrom || "Beginning"} to ${periodTo || "Till date"}` : "All dates";
  const dueFromParty = Number(closingBalance) > 0;
  const upiLink = upiId && dueFromParty
    ? `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(upiName || store)}&am=${Number(closingBalance).toFixed(2)}&cu=INR&tn=${encodeURIComponent(`Statement ${partyName}`)}`
    : null;

  return (
    <div ref={ref} style={{ fontFamily: "'Segoe UI', Arial, sans-serif", background: "#fff" }}>
      {pages.map((pageRows, pageIndex) => {
        const isFirst = pageIndex === 0;
        const isLast = pageIndex === pages.length - 1;
        const openingForPage = isFirst
          ? Number(openingBalance)
          : Number(pages[pageIndex - 1]?.[pages[pageIndex - 1].length - 1]?.balance ?? openingBalance);

        return (
          <div
            key={pageIndex}
            data-statement-page={pageIndex}
            style={{
              width: A4_WIDTH_PX,
              minHeight: A4_HEIGHT_PX,
              margin: "0 auto 16px",
              background: "#fff",
              border: "1px solid #e5e7eb",
              boxSizing: "border-box",
              padding: 28,
              display: "flex",
              flexDirection: "column",
            }}
          >
            {/* ── Title banner ── */}
            <div style={{ background: ACCENT, borderRadius: 6, padding: "10px 16px", textAlign: "center" }}>
              <div style={{ color: "#fff", fontSize: 18, fontWeight: 900, letterSpacing: 4 }}>ACCOUNT STATEMENT</div>
            </div>

            {isFirst ? (
              <>
                {/* ── Letterhead ── */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "14px 2px 12px", borderBottom: "1px solid #e5e7eb" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 800, fontSize: 16, color: "#111" }}>{store}</div>
                    {fullAddress && <div style={{ color: "#555", fontSize: 11, marginTop: 3 }}>{fullAddress}</div>}
                    <div style={{ color: "#555", fontSize: 11, marginTop: 2 }}>
                      {phone && <span>📞 {phone}</span>}
                      {phone && email ? <span>&nbsp;&nbsp;·&nbsp;&nbsp;</span> : null}
                      {email && <span>✉ {email}</span>}
                    </div>
                    {gst && <div style={{ color: "#555", fontSize: 11, marginTop: 2 }}>GSTIN: {gst}</div>}
                  </div>
                  <div style={{ width: 48, height: 48, background: ACCENT, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginLeft: 12 }}>
                    <span style={{ fontSize: 24 }}>📄</span>
                  </div>
                </div>

                {/* ── Party + period ── */}
                <div style={{ display: "flex", justifyContent: "space-between", gap: 16, background: TINT, borderRadius: 6, padding: "10px 14px", marginTop: 12 }}>
                  <div>
                    <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: 1, color: "#6b7280" }}>Statement of Account</div>
                    <div style={{ fontWeight: 800, fontSize: 14, color: "#111", marginTop: 2 }}>{partyName || "—"}</div>
                    {partyMobile && <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>📞 {partyMobile}</div>}
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: 1, color: "#6b7280" }}>Period</div>
                    <div style={{ fontWeight: 700, fontSize: 12, color: "#111", marginTop: 2 }}>{period}</div>
                    {generatedOn && <div style={{ fontSize: 10, color: "#6b7280", marginTop: 4 }}>Generated on {generatedOn}</div>}
                  </div>
                </div>

                {/* ── Summary strip ── */}
                <div style={{ display: "flex", border: "1px solid #e5e7eb", borderRadius: 6, marginTop: 12, overflow: "hidden" }}>
                  <SummaryCell label="Opening Balance" value={openingBalance} />
                  <div style={{ width: 1, background: "#e5e7eb" }} />
                  <SummaryCell label="Total Debit" value={totalDebit} />
                  <div style={{ width: 1, background: "#e5e7eb" }} />
                  <SummaryCell label="Total Credit" value={totalCredit} />
                  <div style={{ width: 1, background: "#e5e7eb" }} />
                  <SummaryCell label="Closing Balance" value={closingBalance} strong color={Number(closingBalance) >= 0 ? ACCENT : "#b91c1c"} />
                </div>
              </>
            ) : (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "10px 2px", borderBottom: "1px solid #e5e7eb" }}>
                <div style={{ fontWeight: 700, fontSize: 12, color: "#111" }}>{partyName || "—"}</div>
                <div style={{ fontSize: 10, color: "#6b7280" }}>{period} · continued</div>
              </div>
            )}

            {/* ── Ledger table ── */}
            <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 12, tableLayout: "fixed" }}>
              <TableHead />
              <tbody>
                <tr style={{ background: "#fef9c3", borderBottom: "1px solid #e5e7eb" }}>
                  <td style={td} colSpan={4}>
                    <span style={{ fontWeight: 700 }}>{isFirst ? "Opening Balance" : "Balance brought forward"}</span>
                  </td>
                  <td style={num} />
                  <td style={num} />
                  <td style={{ ...num, fontWeight: 700 }}>{fmt(openingForPage)}</td>
                </tr>

                {pageRows.map((row, idx) => (
                  <tr key={`${row.txnNo}-${row.voucherNo}-${idx}`} style={{ borderBottom: "1px solid #f3f4f6", background: idx % 2 ? "#fafafa" : "#fff" }}>
                    <td style={td}>{row.txnNo ?? ""}</td>
                    <td style={{ ...td, fontWeight: 600, color: ACCENT }}>{row.voucherNo || "—"}</td>
                    <td style={{ ...td, whiteSpace: "nowrap" }}>{row.dateStr}</td>
                    <td style={td}>
                      <div style={{ fontWeight: 600 }}>{row.particulars || "—"}</div>
                      {row.description && row.description !== row.particulars && (
                        <div style={{ color: "#6b7280", fontSize: 9.5, marginTop: 1 }}>{row.description}</div>
                      )}
                    </td>
                    <td style={num}>{row.debit ? fmt(row.debit) : ""}</td>
                    <td style={num}>{row.credit ? fmt(row.credit) : ""}</td>
                    <td style={{ ...num, fontWeight: 600, color: Number(row.balance) >= 0 ? "#111" : "#b91c1c" }}>{fmt(row.balance)}</td>
                  </tr>
                ))}

                {!rows.length && (
                  <tr>
                    <td style={{ ...td, textAlign: "center", padding: "18px 8px", color: "#6b7280" }} colSpan={7}>
                      No transactions in this period.
                    </td>
                  </tr>
                )}

                {isLast && (
                  <tr style={{ background: TINT, borderTop: `2px solid ${ACCENT}` }}>
                    <td style={{ ...td, fontWeight: 800 }} colSpan={4}>Total for the period</td>
                    <td style={{ ...num, fontWeight: 800 }}>{fmt(totalDebit)}</td>
                    <td style={{ ...num, fontWeight: 800 }}>{fmt(totalCredit)}</td>
                    <td style={{ ...num, fontWeight: 800 }}>{fmt(closingBalance)}</td>
                  </tr>
                )}
              </tbody>
            </table>

            {isLast && (
              <>
                <div style={{ marginTop: 12, background: ACCENT, borderRadius: 6, padding: "10px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ color: "#fff", fontWeight: 700, fontSize: 13 }}>
                    Closing Balance {Number(closingBalance) >= 0 ? "(Receivable)" : "(Advance / Payable)"}
                  </span>
                  <span style={{ color: "#fff", fontWeight: 900, fontSize: 18 }}>₹{fmt(Math.abs(closingBalance))}</span>
                </div>

                {upiLink && (
                  <div style={{ marginTop: 12, border: "1px solid #e5e7eb", borderRadius: 6, padding: "12px 16px", display: "flex", alignItems: "center", gap: 16 }}>
                    <ReactQRCode value={upiLink} size={92} />
                    <div>
                      <div style={{ fontWeight: 700, fontSize: 12, color: "#111" }}>📲 Scan to pay ₹{fmt(closingBalance)}</div>
                      <div style={{ fontSize: 11, color: "#6b7280", marginTop: 3 }}>{upiId}</div>
                      <div style={{ fontSize: 10, color: "#6b7280", marginTop: 3 }}>Any UPI app · {upiName || store}</div>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* ── Footer ── */}
            <div style={{ marginTop: "auto", paddingTop: 14, borderTop: "1px solid #e5e7eb", display: "flex", justifyContent: "space-between", fontSize: 9.5, color: "#6b7280" }}>
              <span>Computer generated statement — please report any discrepancy within 7 days.</span>
              <span>Page {pageIndex + 1} of {pages.length}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
});

export default AccountStatement;
