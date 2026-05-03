import { fetchAttendanceList as fetchAttendanceListApi } from "../services/attendanceService.js";
import { fetchUsers } from "../services/userService.js";

/* ==================================================
   API HELPERS
================================================== */

export const fetchUserNames = async () => {
  try {
    const { data } = await fetchUsers();
    if (!data?.success) return {};

    const map = {};
    data.result.forEach((u) => {
      map[(u.User_uuid || "").trim()] = {
        name: (u.User_name || "").trim(),
        group: (u.User_group || "").trim(),
      };
    });

    return map;
  } catch {
    return {};
  }
};

export const fetchAttendanceList = async () => {
  const { data } = await fetchAttendanceListApi();
  return data?.result || [];
};

/* ==================================================
   TIME HELPERS
================================================== */

const parseTime = (t) => {
  if (!t || t === "N/A") return null;
  const [time, period] = t.split(" ");
  const [hh, mm] = time.split(":").map(Number);

  let h = hh;
  if (period === "PM" && hh !== 12) h += 12;
  if (period === "AM" && hh === 12) h = 0;

  const d = new Date();
  d.setHours(h, mm, 0, 0);
  return d;
};

const formatDateDMY = (iso) => {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}-${String(
    d.getMonth() + 1
  ).padStart(2, "0")}-${d.getFullYear()}`;
};

export const calculateWorkingHours = (inTime, outTime, breakTime, startTime) => {
  if (!inTime || !outTime || inTime === "N/A" || outTime === "N/A") return 0;

  const inD = parseTime(inTime);
  const outD = parseTime(outTime);
  const breakD = parseTime(breakTime);
  const startD = parseTime(startTime);

  if (!inD || !outD) return 0;

  let secs = (outD - inD) / 1000;
  if (breakD && startD) secs -= (startD - breakD) / 1000;

  return Math.max(0, secs / 3600);
};

/* ==================================================
   PROCESS DATE RANGE (MAIN)
================================================== */

export const processAttendanceDataRange = (
  records,
  userLookup,
  startISO,
  endISO,
  forcedUserName = null // 🔒 hard lock for non-admin
) => {
  const grouped = new Map();
  const start = startISO ? new Date(startISO) : null;
  const end = endISO ? new Date(endISO) : null;

  records.forEach(({ Date: recDate, User, Employee_uuid, Source: recordSource }) => {
    if (!recDate) return;

    const d = new Date(recDate);
    if (start && d < start) return;
    if (end && d > end) return;

    const dateISO = d.toISOString().split("T")[0];
    const user = userLookup[(Employee_uuid || "").trim()] || {};
    const name = user.name || "Unknown";

    if (forcedUserName && name !== forcedUserName) return;

    const key = `${name}-${dateISO}`;

    if (!grouped.has(key)) {
      grouped.set(key, {
        DateISO: dateISO,
        Date: formatDateDMY(dateISO),
        User_name: name,
        In: "N/A",
        Break: "N/A",
        Start: "N/A",
        Out: "N/A",
        TotalHours: "0.00",
        Late: false,
        HalfDay: false,
        Source: (recordSource || "").trim() || "",
      });
    }

    const ref = grouped.get(key);
    const normalizeSource = (value) => {
      const sourceValue = (value || "").toLowerCase();
      if (sourceValue.includes("whatsapp") || sourceValue.includes("wa")) return "WhatsApp";
      if (sourceValue.includes("dashboard")) return "Dashboard";
      return "";
    };

    const entryWithSource = (User || []).find((u) => normalizeSource(u?.Source || u?.source));
    const resolvedSource = normalizeSource(
      entryWithSource?.Source ||
      entryWithSource?.source ||
      recordSource ||
      ref.Source
    );
    if (resolvedSource) ref.Source = resolvedSource;

    (User || []).forEach((u) => {
      if (u.Type === "In") ref.In = u.Time?.trim() || "N/A";
      if (u.Type === "Break") ref.Break = u.Time?.trim() || "N/A";
      if (u.Type === "Start") ref.Start = u.Time?.trim() || "N/A";
      if (u.Type === "Out") ref.Out = u.Time?.trim() || "N/A";
    });
  });

  return Array.from(grouped.values()).map((r) => {
    const hours = calculateWorkingHours(r.In, r.Out, r.Break, r.Start);

    const inTime = parseTime(r.In);
    const lateLimit = new Date();
    lateLimit.setHours(10, 15, 0, 0);

    return {
      ...r,
      TotalHours: hours.toFixed(2),
      Late: inTime ? inTime > lateLimit : false,
      HalfDay: hours > 0 && hours < 4.5,
      Source: r.Source || "Dashboard",
    };
  });
};

/* ==================================================
   COMPAT EXPORT (fixes earlier error)
================================================== */

export const processAttendanceDataForDate = (
  records,
  userLookup,
  dateISO
) => {
  return processAttendanceDataRange(records, userLookup, dateISO, dateISO);
};
