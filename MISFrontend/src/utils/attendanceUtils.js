import { fetchAttendanceList as fetchAttendanceListApi } from "../services/attendanceService.js";
import { fetchUsers } from "../services/userService.js";

export const fetchUserNames = async () => {
  try {
    const { data } = await fetchUsers();
    if (!data?.success) return {};
    const map = {};
    data.result.forEach((u) => {
      map[(u.User_uuid || "").trim()] = { uuid: (u.User_uuid || "").trim(), name: (u.User_name || "").trim(), group: (u.User_group || "").trim(), amount: Number(u.Amount || 0), accountId: String(u.AccountID || "").trim() };
    });
    return map;
  } catch { return {}; }
};

export const fetchAttendanceList = async () => { const { data } = await fetchAttendanceListApi(); return data?.result || []; };

const parseTime = (t) => {
  if (!t || t === "N/A") return null;
  const [time, period] = t.split(" "); const [hh, mm] = time.split(":").map(Number); let h = hh;
  if (period === "PM" && hh !== 12) h += 12; if (period === "AM" && hh === 12) h = 0;
  const d = new Date(); d.setHours(h, mm, 0, 0); return d;
};
const indiaDateISO = (value) => { const d = new Date(value); if (Number.isNaN(d.getTime())) return ""; return d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }); };
const formatDateDMY = (iso) => { const [year, month, day] = String(iso || "").split("-"); return year && month && day ? `${day}-${month}-${year}` : ""; };
const timeValue = (value) => { const parsed = parseTime(value); return parsed ? parsed.getTime() : null; };

export const calculateWorkingHours = (inTime, outTime, breakTime, startTime) => {
  if (!inTime || !outTime || inTime === "N/A" || outTime === "N/A") return 0;
  const inD = parseTime(inTime), outD = parseTime(outTime), breakD = parseTime(breakTime), startD = parseTime(startTime); if (!inD || !outD) return 0;
  let secs = (outD - inD) / 1000; if (breakD && startD) secs -= (startD - breakD) / 1000; return Math.max(0, secs / 3600);
};

export const processAttendanceDataRange = (records, userLookup, startISO, endISO, forcedUserName = null) => {
  const grouped = new Map();
  records.forEach(({ Date: recDate, User, Employee_uuid, Source: recordSource }) => {
    if (!recDate) return; const dateISO = indiaDateISO(recDate); if (!dateISO || (startISO && dateISO < startISO) || (endISO && dateISO > endISO)) return;
    const employeeUuid = (Employee_uuid || "").trim(); const user = userLookup[employeeUuid] || {}; const name = user.name || "Unknown"; if (forcedUserName && name !== forcedUserName) return;
    const identity = user.uuid || employeeUuid || name; const key = `${identity}-${dateISO}`;
    if (!grouped.has(key)) grouped.set(key, { DateISO: dateISO, Date: formatDateDMY(dateISO), User_uuid: user.uuid || employeeUuid, User_name: name, User_group: user.group || "", Amount: Number(user.amount || 0), AccountID: user.accountId || "", In: "N/A", Break: "N/A", Start: "N/A", Out: "N/A", TotalHours: "0.00", Late: false, HalfDay: false, Source: (recordSource || "").trim() || "" });
    const ref = grouped.get(key);
    const normalizeSource = (value) => { const s = (value || "").toLowerCase(); if (s.includes("whatsapp") || s.includes("wa")) return "WhatsApp"; if (s.includes("dashboard")) return "Dashboard"; return ""; };
    const entryWithSource = (User || []).find((u) => normalizeSource(u?.Source || u?.source)); const resolvedSource = normalizeSource(entryWithSource?.Source || entryWithSource?.source || recordSource || ref.Source); if (resolvedSource) ref.Source = resolvedSource;
    (User || []).forEach((u) => {
      const value = u.Time?.trim() || "N/A";
      if (u.Type === "In") { const current = timeValue(ref.In), candidate = timeValue(value); if (current === null || (candidate !== null && candidate < current)) ref.In = value; }
      if (u.Type === "Break" && ref.Break === "N/A") ref.Break = value;
      if (u.Type === "Start") ref.Start = value;
      if (u.Type === "Out") { const current = timeValue(ref.Out), candidate = timeValue(value); if (current === null || (candidate !== null && candidate > current)) ref.Out = value; }
    });
  });
  return Array.from(grouped.values()).map((r) => { const hours = calculateWorkingHours(r.In, r.Out, r.Break, r.Start); const inTime = parseTime(r.In); const lateLimit = new Date(); lateLimit.setHours(10, 15, 0, 0); return { ...r, TotalHours: hours.toFixed(2), Late: inTime ? inTime > lateLimit : false, HalfDay: hours > 0 && hours < 4.5, Source: r.Source || "Dashboard" }; });
};

export const processAttendanceDataForDate = (records, userLookup, dateISO) => processAttendanceDataRange(records, userLookup, dateISO, dateISO);
