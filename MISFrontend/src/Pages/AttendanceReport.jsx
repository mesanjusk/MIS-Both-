import React, { useEffect, useState } from "react";
import {
  fetchUserNames,
  fetchAttendanceList,
  processAttendanceDataRange,
} from "../utils/attendanceUtils";
import { useNavigate } from "react-router-dom";
import jsPDF from "jspdf";
import "jspdf-autotable";

export default function AttendanceReport() {
  const navigate = useNavigate();

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reportData, setReportData] = useState([]);
  const [officeUsers, setOfficeUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState("");
  const [viewMode, setViewMode] = useState("table");
  const [loading, setLoading] = useState(false);

  const loggedInUserName = localStorage.getItem("user_name") || "";
  const userGroup = localStorage.getItem("User_group") || "";
  const isAdmin = userGroup === "Admin User";

  /* ==================================================
     AUTO LOAD CURRENT MONTH
  ================================================== */
  useEffect(() => {
    const now = new Date();
    const s = new Date(now.getFullYear(), now.getMonth(), 1)
      .toISOString()
      .slice(0, 10);
    const e = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      .toISOString()
      .slice(0, 10);

    setStartDate(s);
    setEndDate(e);

    if (!isAdmin && loggedInUserName) {
      setSelectedUser(loggedInUserName);
      fetchReportData(s, e, loggedInUserName);
    }

    if (isAdmin) {
      fetchReportData(s, e, "");
    }
  }, []);

  /* ==================================================
     FETCH DATA
  ================================================== */
  const fetchReportData = async (
    s = startDate,
    e = endDate,
    forcedUser = isAdmin ? selectedUser : loggedInUserName
  ) => {
    setLoading(true);
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

  /* ==================================================
     CALENDAR MAP (MULTI USER)
  ================================================== */
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

  /* ==================================================
     UI
  ================================================== */
  return (
    <div className="bg-white p-4 mt-4 rounded-lg shadow max-w-7xl mx-auto">
      <div className="flex items-center gap-2 mb-3">
        <button onClick={() => navigate(-1)} className="px-3 py-2 bg-gray-200 rounded">
          ← Back
        </button>
        <h3 className="text-lg font-semibold">
          Attendance Report — {selectedUser || "All Users"}
        </h3>
      </div>

      <div className="flex flex-wrap gap-2 mb-3 items-end">
        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="border p-1" />
        <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="border p-1" />

        <select
          value={selectedUser}
          disabled={!isAdmin}
          onChange={(e) => setSelectedUser(e.target.value)}
          className="border p-1 min-w-[220px] disabled:bg-gray-100"
        >
          <option value="">{isAdmin ? "Select User" : loggedInUserName}</option>
          {officeUsers.map((u) => (
            <option key={u} value={u}>{u}</option>
          ))}
        </select>

        <button onClick={() => fetchReportData()} className="px-4 py-1 bg-blue-500 text-white rounded">
          View
        </button>

        <button
          onClick={() => setViewMode(viewMode === "table" ? "calendar" : "table")}
          className="px-4 py-1 bg-gray-800 text-white rounded"
        >
          {viewMode === "table" ? "Calendar View" : "Table View"}
        </button>
      </div>

      {viewMode === "calendar" && (
        <div className="grid grid-cols-7 gap-2 text-xs">
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const d = String(i + 1).padStart(2, "0");
            const key = `${startDate.slice(0, 7)}-${d}`;
            const recs = calendarMap[key] || [];

            return (
              <div key={i} className="border rounded p-2 h-28">
                <div className="font-bold">{d}</div>
                {recs.length === 0 ? (
                  <div className="text-gray-400">Absent</div>
                ) : (
                  recs.map((r, idx) => (
                    <div key={idx} className="mt-1">
                      <div className="font-semibold">{r.User_name}</div>
                      <div>{r.TotalHours} hrs</div>
                    </div>
                  ))
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
