import { forwardRef } from "react";
import ReactQRCode from "react-qr-code";

const fmt = (n) =>
  Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// A4 at 96 dpi. The preview is what Print and the public share link render, and
// it mirrors the downloaded PDF (src/utils/statementPdf.js) one to one.
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
const INK = "#111827";
const BODY = "#374151";
const MUTED = "#6b7280";
const LINE = "#e2e8f0";
const RULE = "#cbd5e1";
const TINT = "#f8fafc";
const DANGER = "#b91c1c";

const caption = {
  fontSize: 7.5,
  letterSpacing: 1.1,
  textTransform: "uppercase",
  color: MUTED,
  fontWeight: 600,
};

const th = {
  padding: "6px 7px",
  fontSize: 8.5,
  fontWeight: 700,
  color: "#fff",
  textAlign: "left",
  letterSpacing: 0.2,
};

const td = { padding: "6px 7px", fontSize: 10, color: BODY, verticalAlign: "top" };
const num = { ...td, textAlign: "right", whiteSpace: "nowrap" };

function SummaryCell({ label, value, first = false, strong = false, color = INK }) {
  return (
    <div style={{ flex: 1, padding: "11px 14px", borderLeft: first ? "none" : `1px solid ${LINE}` }}>
      <div style={caption}>{label}</div>
      <div style={{ fontSize: strong ? 17 : 16, fontWeight: 700, color, marginTop: 4, letterSpacing: -0.2 }}>
        {fmt(value)}
      </div>
    </div>
  );
}

function TableHead() {
  return (
    <thead>
      <tr style={{ background: INK }}>
        <th style={{ ...th, width: "7%" }}>Txn</th>
        <th style={{ ...th, width: "13.5%" }}>Voucher</th>
        <th style={{ ...th, width: "12%" }}>Date</th>
        <th style={{ ...th, width: "27.5%" }}>Particulars</th>
        <th style={{ ...th, width: "13%", textAlign: "right" }}>Debit</th>
        <th style={{ ...th, width: "13%", textAlign: "right" }}>Credit</th>
        <th style={{ ...th, width: "14%", textAlign: "right" }}>Balance</th>
      </tr>
    </thead>
  );
}

/**
 * Printable running account statement for one party over a date range.
 * Renders one node per A4 page, each tagged with data-statement-page so the
 * print window can break cleanly between sheets.
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
  const closing = Number(closingBalance) || 0;
  const receivable = closing >= 0;
  const upiLink = upiId && receivable && closing > 0
    ? `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(upiName || store)}&am=${closing.toFixed(2)}&cu=INR&tn=${encodeURIComponent(`Statement ${partyName}`)}`
    : null;

  return (
    <div ref={ref} style={{ fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", background: "#fff" }}>
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
              border: `1px solid ${LINE}`,
              boxSizing: "border-box",
              padding: "60px 60px 48px",
              display: "flex",
              flexDirection: "column",
              color: BODY,
            }}
          >
            {isFirst ? (
              <>
                {/* ── Letterhead ── */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 24 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 21, fontWeight: 700, color: INK, letterSpacing: -0.3 }}>{store}</div>
                    <div style={{ fontSize: 10.5, color: MUTED, marginTop: 6, lineHeight: 1.55 }}>
                      {fullAddress && <div>{fullAddress}</div>}
                      {(phone || email) && (
                        <div>
                          {phone && <span>Tel {phone}</span>}
                          {phone && email ? <span>&nbsp;&nbsp;·&nbsp;&nbsp;</span> : null}
                          {email && <span>{email}</span>}
                        </div>
                      )}
                      {gst && <div>GSTIN: {gst}</div>}
                    </div>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: INK, letterSpacing: 3.4, whiteSpace: "nowrap", paddingTop: 4 }}>
                    ACCOUNT STATEMENT
                  </div>
                </div>

                {/* Rule with the accent tab at the left edge */}
                <div style={{ position: "relative", height: 1, background: RULE, marginTop: 18 }}>
                  <div style={{ position: "absolute", left: 0, top: -1, width: 96, height: 3, background: ACCENT }} />
                </div>

                {/* ── Party and period ── */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 24, marginTop: 22 }}>
                  <div style={{ flex: 1 }}>
                    <div style={caption}>Statement for</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: INK, marginTop: 5, letterSpacing: -0.2 }}>
                      {partyName || "—"}
                    </div>
                    {partyMobile && <div style={{ fontSize: 10.5, color: MUTED, marginTop: 4 }}>{partyMobile}</div>}
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={caption}>Period</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: INK, marginTop: 5 }}>{period}</div>
                    {generatedOn && <div style={{ fontSize: 10, color: MUTED, marginTop: 4 }}>Generated on {generatedOn}</div>}
                  </div>
                </div>

                {/* ── Summary ── */}
                <div
                  style={{
                    display: "flex",
                    background: TINT,
                    borderTop: `1px solid ${LINE}`,
                    borderBottom: `1px solid ${LINE}`,
                    marginTop: 20,
                  }}
                >
                  <SummaryCell first label="Opening Balance" value={openingBalance} />
                  <SummaryCell label="Total Debit" value={totalDebit} />
                  <SummaryCell label="Total Credit" value={totalCredit} />
                  <SummaryCell
                    label={receivable ? "Closing (Receivable)" : "Closing (Advance)"}
                    value={Math.abs(closing)}
                    strong
                    color={receivable ? ACCENT : DANGER}
                  />
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 22 }}>
                  <span style={caption}>Ledger entries</span>
                  <span style={{ fontSize: 9.5, color: MUTED }}>Amounts in INR</span>
                </div>
              </>
            ) : (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: INK }}>{partyName || "—"}</div>
                  <div style={{ fontSize: 10, color: MUTED }}>{period} · continued</div>
                </div>
                <div style={{ fontSize: 9.5, color: MUTED, marginTop: 4, display: "flex", gap: 10 }}>
                  <span>Balance brought forward</span>
                  <span style={{ fontWeight: 700, color: INK }}>{fmt(openingForPage)}</span>
                </div>
                <div style={{ height: 1, background: RULE, marginTop: 10 }} />
              </>
            )}

            {/* ── Ledger table ── */}
            <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 8, tableLayout: "fixed" }}>
              <TableHead />
              <tbody>
                {isFirst && (
                  <tr style={{ background: TINT, borderBottom: `1px solid ${LINE}` }}>
                    <td style={{ ...td, fontWeight: 700, color: INK }} colSpan={4}>
                      Opening Balance
                    </td>
                    <td style={num} />
                    <td style={num} />
                    <td style={{ ...num, fontWeight: 700, color: INK }}>{fmt(openingForPage)}</td>
                  </tr>
                )}

                {pageRows.map((row, idx) => (
                  <tr key={`${row.txnNo}-${row.voucherNo}-${idx}`} style={{ borderBottom: `1px solid ${LINE}` }}>
                    <td style={td}>{row.txnNo ?? ""}</td>
                    <td style={{ ...td, fontWeight: 700, color: ACCENT }}>{row.voucherNo || "—"}</td>
                    <td style={{ ...td, whiteSpace: "nowrap" }}>{row.dateStr}</td>
                    <td style={td}>
                      <div style={{ fontWeight: 700, color: INK }}>{row.particulars || "—"}</div>
                      {row.description && row.description !== row.particulars && (
                        <div style={{ color: MUTED, fontSize: 8.5, marginTop: 2 }}>{row.description}</div>
                      )}
                    </td>
                    <td style={num}>{row.debit ? fmt(row.debit) : ""}</td>
                    <td style={num}>{row.credit ? fmt(row.credit) : ""}</td>
                    <td style={{ ...num, fontWeight: 700, color: Number(row.balance) >= 0 ? INK : DANGER }}>
                      {fmt(row.balance)}
                    </td>
                  </tr>
                ))}

                {!rows.length && (
                  <tr>
                    <td style={{ ...td, textAlign: "center", padding: "22px 8px", color: MUTED }} colSpan={7}>
                      No transactions in this period.
                    </td>
                  </tr>
                )}

                {isLast && rows.length > 0 && (
                  <tr style={{ background: TINT, borderTop: `2px solid ${INK}` }}>
                    <td style={{ ...td, fontWeight: 700, color: INK }} colSpan={4}>Total for the period</td>
                    <td style={{ ...num, fontWeight: 700, color: INK }}>{fmt(totalDebit)}</td>
                    <td style={{ ...num, fontWeight: 700, color: INK }}>{fmt(totalCredit)}</td>
                    <td style={{ ...num, fontWeight: 700, color: INK }}>{fmt(closingBalance)}</td>
                  </tr>
                )}
              </tbody>
            </table>

            {isLast && (
              <div style={{ display: "flex", alignItems: "stretch", gap: 20, marginTop: 26 }}>
                {upiLink && (
                  <div style={{ flexShrink: 0 }}>
                    <ReactQRCode value={upiLink} size={98} />
                    <div style={{ ...caption, marginTop: 8 }}>Scan to pay</div>
                    <div style={{ fontSize: 9.5, color: MUTED, marginTop: 3, maxWidth: 110, wordBreak: "break-all" }}>{upiId}</div>
                  </div>
                )}
                <div
                  style={{
                    flex: 1,
                    background: TINT,
                    borderLeft: `4px solid ${receivable ? ACCENT : DANGER}`,
                    padding: "16px 20px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 16,
                    height: 68,
                    boxSizing: "border-box",
                  }}
                >
                  <span style={caption}>
                    {receivable ? "Closing Balance (Receivable)" : "Closing Balance (Advance / Payable)"}
                  </span>
                  <span style={{ fontSize: 24, fontWeight: 700, color: receivable ? ACCENT : DANGER, letterSpacing: -0.4 }}>
                    {fmt(Math.abs(closing))}
                  </span>
                </div>
              </div>
            )}

            {/* ── Footer ── */}
            <div
              style={{
                marginTop: "auto",
                paddingTop: 12,
                borderTop: `1px solid ${LINE}`,
                display: "flex",
                justifyContent: "space-between",
                fontSize: 9,
                color: MUTED,
              }}
            >
              <span>Computer generated statement — no signature required. Please report any discrepancy within 7 days.</span>
              <span>Page {pageIndex + 1} of {pages.length}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
});

export default AccountStatement;
