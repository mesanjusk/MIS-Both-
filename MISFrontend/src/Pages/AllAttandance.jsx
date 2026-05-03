import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { FaWhatsapp } from "react-icons/fa";
import {
  fetchUserNames,
  fetchAttendanceList,
  processAttendanceDataForDate,
} from "../utils/attendanceUtils";

export default function AllAttandance() {
  const [loggedInUser, setLoggedInUser] = useState(null);
  const [userName, setUserName] = useState("");
  const [attendance, setAttendance] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const userNameFromState = location.state?.id;
    const user = userNameFromState || localStorage.getItem("User_name");
    setLoggedInUser(user);
    if (user) {
      setUserName(user);
      loadToday();
    } else {
      navigate("/");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  useEffect(() => {
    if (!loggedInUser) return undefined;
    const intervalId = setInterval(() => {
      loadToday();
    }, 30000);
    return () => clearInterval(intervalId);
  }, [loggedInUser]);

  const loadToday = async () => {
    try {
      setLoading(true);
      const [userLookup, records] = await Promise.all([
        fetchUserNames(),
        fetchAttendanceList(),
      ]);
      const todayISO = new Date().toISOString().split("T")[0];
      const formatted = processAttendanceDataForDate(records, userLookup, todayISO);
      setAttendance(formatted);
    } catch (e) {
      console.error("Error loading attendance:", e);
      setAttendance([]);
    } finally {
      setLoading(false);
    }
  };

  const todayLabel = useMemo(() => {
    const d = new Date();
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return attendance;
    return attendance.filter((r) => String(r.User_name || "").toLowerCase().includes(q));
  }, [attendance, search]);

  const Badge = ({ value }) => {
    const has = value && value !== "—";
    return (
      <span
        className={[
          "inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium",
          has ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-slate-50 text-slate-500 border border-slate-200",
        ].join(" ")}
        title={has ? "Marked" : "Not marked"}
      >
        {has ? value : "—"}
      </span>
    );
  };

  const SourceBadge = ({ source }) => {
    const isWhatsApp = source === "WhatsApp";
    return (
      <span
        className={[
          "inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium border",
          isWhatsApp
            ? "bg-green-50 text-green-700 border-green-200"
            : "bg-slate-50 text-slate-700 border-slate-200",
        ].join(" ")}
        title={isWhatsApp ? "Marked via WhatsApp message" : "Marked from dashboard"}
      >
        {isWhatsApp ? <FaWhatsapp className="h-3 w-3" /> : null}
        {isWhatsApp ? "WhatsApp" : "Dashboard"}
      </span>
    );
  };

  return (
    <div className="w-full">
      {/* Card */}
      <div className="bg-white rounded-2xl shadow-sm ring-1 ring-slate-100">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-4 py-3 border-b border-slate-100">
          <div>
            
            <div className="mt-1 flex items-center gap-2">
              
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-50 text-slate-700 border border-slate-200">
                {todayLabel}
              </span>
              {!!filtered.length && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                  {filtered.length} Members
                </span>
              )}
            </div>
          </div>

         
        </div>

        {/* Content */}
        <div className="px-4 py-4">
          {/* Mobile cards */}
          <div className="grid gap-3 sm:hidden">
            {loading ? (
              <div className="text-center text-slate-500 py-6">Loading…</div>
            ) : filtered.length === 0 ? (
              <div className="text-center text-slate-500 py-6">No attendance records found for today.</div>
            ) : (
              filtered.map((r, i) => (
                <div
                  key={i}
                  className="rounded-xl border border-slate-200 p-3 bg-white"
                >
                  <div className="flex items-center justify-between">
                    <div className="font-medium text-slate-900">{r.User_name}</div>
                  </div>
                  <div className="mt-3 grid grid-cols-4 gap-2">
                    <div className="text-[11px] text-slate-500">In</div>
                    <div className="text-[11px] text-slate-500">Break</div>
                    <div className="text-[11px] text-slate-500">Start</div>
                    <div className="text-[11px] text-slate-500">Out</div>
                    <Badge value={r.In} />
                    <Badge value={r.Break} />
                    <Badge value={r.Start} />
                    <Badge value={r.Out} />
                  </div>
                  <div className="mt-3">
                    <div className="text-[11px] text-slate-500 mb-1">Source</div>
                    <SourceBadge source={r.Source} />
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Desktop table */}
          <div className="hidden sm:block">
            <div className="overflow-auto rounded-xl border border-slate-200">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 sticky top-0">
                  <tr className="text-left text-slate-600">
                    <th className="px-3 py-2 font-medium border-b border-slate-200">Name</th>
                    <th className="px-3 py-2 font-medium border-b border-slate-200">In</th>
                    <th className="px-3 py-2 font-medium border-b border-slate-200">Break</th>
                    <th className="px-3 py-2 font-medium border-b border-slate-200">Start</th>
                    <th className="px-3 py-2 font-medium border-b border-slate-200">Out</th>
                    <th className="px-3 py-2 font-medium border-b border-slate-200">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan="6" className="px-3 py-6 text-center text-slate-500">
                        Loading…
                      </td>
                    </tr>
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="px-3 py-6 text-center text-slate-500">
                        No attendance records found for today.
                      </td>
                    </tr>
                  ) : (
                    filtered.map((r, i) => (
                      <tr
                        key={i}
                        className="border-t border-slate-100 hover:bg-slate-50"
                      >
                        <td className="px-3 py-2 text-slate-900">{r.User_name}</td>
                        <td className="px-3 py-2"><Badge value={r.In} /></td>
                        <td className="px-3 py-2"><Badge value={r.Break} /></td>
                        <td className="px-3 py-2"><Badge value={r.Start} /></td>
                        <td className="px-3 py-2"><Badge value={r.Out} /></td>
                        <td className="px-3 py-2"><SourceBadge source={r.Source} /></td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
