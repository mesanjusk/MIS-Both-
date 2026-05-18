import React, { useEffect, useState } from "react";
import {
  fetchUserNames,
  fetchAttendanceList,
  processAttendanceDataRange,
} from "../utils/attendanceUtils";
import { useNavigate } from "react-router-dom";
import jsPDF from "jspdf";
import "jspdf-autotable";

const PAGE_SIZE = 50;

export default function AttendanceReport() {
  const navigate = useNavigate();

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reportData, setReportData] = useState([]);
  const [officeUsers, setOfficeUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState("");
  const [viewMode, setViewMode] = useState("table");
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);

  const loggedInUserName = localStorage.getItem("user_name") || localStorage.getItem("User_name") || "";
  const userGroup = localStorage.getItem("User_group") || "";
  const isAdmin = userGroup === "Admin User";

  useEffect(() => {
    const now = new Date();
    const s = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const e = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);

    setStartDate(s);
    setEndDate(e);

    if (!isAdmin && loggedInUserName) {
      setSelectedUser(loggedInUserName);
      fetchReportData(s, e, loggedInUserName);
    } else if (isAdmin) {
      fetchReportData(s, e, "");
    }
  }, []);

  const fetchReportData = async (
    s = startDate,
    e = endDate,
    forcedUser = isAdmin ? selectedUser : loggedInUserName
  ) => {
    setLoading(true);
    setPage(1);
    try {
      const [userLookup, records] = await Promise.all([
        fetchUserNames(),
        fetchAttendanceList(),
      ]);

      const usersFromAttendance = Array.from(
        new Set(
          records
            .map((r) => userLookup[(r.Employee_uuid || "").trim()]?.name)
            .filter(Boolean)
        )
      );

      setOfficeUsers(usersFromAttendance);

      const finalUser = isAdmin ? forcedUser || "" : loggedInUserName;
      if (!isAdmin) setSelectedUser(finalUser);

      const formatted = processAttendanceDataRange(
        records,
        userLookup,
        s,
        e,
        finalUser || null
      );

      setReportData(formatted);
    } finally {
      setLoading(false);
    }
  };

  // Stats
  const stats = React.useMemo(() => {
    const late = reportData.filter((r) => r.Late).length;
    const halfDay = reportData.filter((r) => r.HalfDay).length;
    const present = reportData.filter((r) => r.In !== "N/A").length;
    const totalHours = reportData.reduce((sum, r) => sum + parseFloat(r.TotalHours || 0), 0);
    return { present, late, halfDay, totalHours: totalHours.toFixed(1) };
  }, [reportData]);

  // Paginated table rows
  const totalPages = Math.ceil(reportData.length / PAGE_SIZE);
  const pagedData = reportData.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Calendar
  const calendarMap = {};
  reportData.forEach((r) => {
    if (!calendarMap[r.DateISO]) calendarMap[r.DateISO] = [];
    calendarMap[r.DateISO].push(r);
  });

  const daysInMonth = startDate
    ? new Date(
        new Date(startDate).getFullYear(),
        new Date(startDate).getMonth() + 1,
        0
      ).getDate()
    : 0;

  // Export to PDF
  const exportPDF = () => {
    const doc = new jsPDF();
    doc.text(`Attendance Report — ${selectedUser || "All Users"}`, 14, 16);
    doc.text(`${startDate} to ${endDate}`, 14, 22);
    doc.autoTable({
      startY: 28,
      head: [["Date", "Name", "In", "Lunch Out", "Lunch In", "Out", "Hours", "Late", "Half Day"]],
      body: reportData.map((r) => [
        r.Date,
        r.User_name,
        r.In,
        r.Break !== "N/A" ? r.Break : "-",
        r.Start !== "N/A" ? r.Start : "-",
        r.Out,
        r.TotalHours,
        r.Late ? "Yes" : "No",
        r.HalfDay ? "Yes" : "No",
      ]),
      styles: { fontSize: 8 },
    });
    doc.save(`attendance_${selectedUser || "all"}_${startDate}_${endDate}.pdf`);
  };

  // Export to CSV
  const exportCSV = () => {
    const headers = ["Date", "Name", "In", "Lunch Out", "Lunch In", "Out", "Total Hours", "Late", "Half Day", "Source"];
    const rows = reportData.map((r) => [
      r.Date, r.User_name, r.In,
      r.Break !== "N/A" ? r.Break : "",
      r.Start !== "N/A" ? r.Start : "",
      r.Out, r.TotalHours,
      r.Late ? "Yes" : "No",
      r.HalfDay ? "Yes" : "No",
      r.Source,
    ]);
    const csv = [headers, ...rows].map((row) => row.map((v) => `"${v}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `attendance_${selectedUser || "all"}_${startDate}_${endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-white p-4 mt-4 rounded-lg shadow max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <button onClick={() => navigate(-1)} className="px-3 py-2 bg-gray-200 rounded text-sm">
          ← Back
        </button>
        <h3 className="text-lg font-semibold">
          Attendance Report — {selectedUser || "All Users"}
        </h3>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-2 mb-4 items-end">
        <div>
          <label className="text-xs text-gray-500 block mb-0.5">From</label>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="border p-1 text-sm rounded" />
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-0.5">To</label>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="border p-1 text-sm rounded" />
        </div>

        <div>
          <label className="text-xs text-gray-500 block mb-0.5">Employee</label>
          <select
            value={selectedUser}
            disabled={!isAdmin}
            onChange={(e) => setSelectedUser(e.target.value)}
            className="border p-1 text-sm rounded min-w-[180px] disabled:bg-gray-100"
          >
            <option value="">{isAdmin ? "All employees" : loggedInUserName}</option>
            {officeUsers.map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
        </div>

        <button
          onClick={() => fetchReportData()}
          className="px-4 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
        >
          {loading ? "Loading…" : "View"}
        </button>

        <button
          onClick={() => setViewMode(viewMode === "table" ? "calendar" : "table")}
          className="px-4 py-1.5 bg-gray-700 text-white rounded text-sm hover:bg-gray-800"
        >
          {viewMode === "table" ? "Calendar" : "Table"}
        </button>

        {reportData.length > 0 && (
          <>
            <button
              onClick={exportCSV}
              className="px-4 py-1.5 bg-emerald-600 text-white rounded text-sm hover:bg-emerald-700"
            >
              Export CSV
            </button>
            <button
              onClick={exportPDF}
              className="px-4 py-1.5 bg-red-600 text-white rounded text-sm hover:bg-red-700"
            >
              Export PDF
            </button>
          </>
        )}
      </div>

      {/* Stats row */}
      {reportData.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          {[
            { label: "Present days", value: stats.present, color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
            { label: "Late arrivals", value: stats.late, color: "bg-amber-50 text-amber-700 border-amber-200" },
            { label: "Half days", value: stats.halfDay, color: "bg-orange-50 text-orange-700 border-orange-200" },
            { label: "Total hours", value: `${stats.totalHours}h`, color: "bg-blue-50 text-blue-700 border-blue-200" },
          ].map((s) => (
            <div key={s.label} className={`rounded-lg border p-3 ${s.color}`}>
              <div className="text-2xl font-bold">{s.value}</div>
              <div className="text-xs mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Calendar View */}
      {viewMode === "calendar" && (
        <div className="grid grid-cols-7 gap-1.5 text-xs">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div key={d} className="text-center font-semibold text-gray-500 py-1">{d}</div>
          ))}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const d = String(i + 1).padStart(2, "0");
            const key = `${startDate.slice(0, 7)}-${d}`;
            const recs = calendarMap[key] || [];
            const hasLate = recs.some((r) => r.Late);
            const hasHalf = recs.some((r) => r.HalfDay);

            return (
              <div
                key={i}
                className={[
                  "border rounded p-1.5 min-h-[72px]",
                  recs.length === 0 ? "bg-gray-50" : hasLate ? "bg-amber-50 border-amber-200" : "bg-emerald-50 border-emerald-200",
                ].join(" ")}
              >
                <div className="font-bold text-gray-700">{d}</div>
                {recs.length === 0 ? (
                  <div className="text-gray-400 text-[10px]">Absent</div>
                ) : (
                  recs.map((r, idx) => (
                    <div key={idx} className="mt-0.5">
                      {!selectedUser && <div className="font-medium text-[10px] truncate">{r.User_name}</div>}
                      <div className="text-[10px]">{r.TotalHours}h</div>
                      {hasLate && <span className="text-[9px] text-amber-600">Late</span>}
                      {hasHalf && <span className="text-[9px] text-orange-600 ml-1">½</span>}
                    </div>
                  ))
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Table View */}
      {viewMode === "table" && (
        <>
          <div className="overflow-auto rounded-xl border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 sticky top-0">
                <tr className="text-left text-slate-600 text-xs">
                  <th className="px-3 py-2 font-medium border-b">Date</th>
                  {!selectedUser && <th className="px-3 py-2 font-medium border-b">Name</th>}
                  <th className="px-3 py-2 font-medium border-b">In</th>
                  <th className="px-3 py-2 font-medium border-b">Lunch Out</th>
                  <th className="px-3 py-2 font-medium border-b">Lunch In</th>
                  <th className="px-3 py-2 font-medium border-b">Out</th>
                  <th className="px-3 py-2 font-medium border-b">Hours</th>
                  <th className="px-3 py-2 font-medium border-b">Flags</th>
                  <th className="px-3 py-2 font-medium border-b">Source</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="9" className="px-3 py-6 text-center text-slate-500">Loading…</td>
                  </tr>
                ) : pagedData.length === 0 ? (
                  <tr>
                    <td colSpan="9" className="px-3 py-6 text-center text-slate-500">No records found.</td>
                  </tr>
                ) : pagedData.map((r, i) => (
                  <tr key={i} className="border-t border-slate-100 hover:bg-slate-50 text-xs">
                    <td className="px-3 py-2 text-slate-700 whitespace-nowrap">{r.Date}</td>
                    {!selectedUser && <td className="px-3 py-2 font-medium text-slate-900">{r.User_name}</td>}
                    <td className="px-3 py-2">
                      <span className={`px-1.5 py-0.5 rounded text-xs ${r.In !== "N/A" ? "bg-emerald-100 text-emerald-700" : "text-slate-400"}`}>
                        {r.In}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-slate-600">{r.Break !== "N/A" ? r.Break : "—"}</td>
                    <td className="px-3 py-2 text-slate-600">{r.Start !== "N/A" ? r.Start : "—"}</td>
                    <td className="px-3 py-2">
                      <span className={`px-1.5 py-0.5 rounded text-xs ${r.Out !== "N/A" ? "bg-slate-100 text-slate-700" : "text-slate-400"}`}>
                        {r.Out}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-medium text-slate-900">{r.TotalHours}h</td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1 flex-wrap">
                        {r.Late && <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 text-[10px]">Late</span>}
                        {r.HalfDay && <span className="px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 text-[10px]">Half Day</span>}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-slate-500">{r.Source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-3 text-sm">
              <span className="text-slate-500 text-xs">
                Showing {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, reportData.length)} of {reportData.length} records
              </span>
              <div className="flex gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-2 py-1 border rounded text-xs disabled:opacity-40 hover:bg-gray-50"
                >
                  ‹ Prev
                </button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const p = Math.max(1, Math.min(page - 2 + i, totalPages - 4 + i));
                  return p;
                }).filter((v, i, a) => a.indexOf(v) === i && v >= 1 && v <= totalPages).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`px-2 py-1 border rounded text-xs ${p === page ? "bg-blue-600 text-white border-blue-600" : "hover:bg-gray-50"}`}
                  >
                    {p}
                  </button>
                ))}
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-2 py-1 border rounded text-xs disabled:opacity-40 hover:bg-gray-50"
                >
                  Next ›
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
