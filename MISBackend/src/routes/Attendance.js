const express = require("express");
const router = express.Router();
const { z } = require('zod');
const Attendance = require("../repositories/attendance");
const User = require("../repositories/users");
const Usertasks = require("../repositories/usertask");
const { markAttendance } = require("../services/attendanceService");
const { getPendingOrdersForUser } = require("../services/orderTaskService");
const { formatIST } = require("../utils/dateTime");
const { sendWhatsAppText } = require('../services/unifiedWhatsAppService');
const normalizeWhatsAppNumber = require("../utils/normalizeNumber");
const logger = require('../utils/logger');
const { requireAuth, requireInternalKey } = require('../middleware/auth');

const addAttendanceSchema = z.object({
  User_name: z.string().min(1, 'User_name is required'),
  Type: z.enum(['In', 'Out', 'Lunch Out', 'Lunch In', 'Break', 'Start'], { required_error: 'Type is required' }),
  Status: z.string().min(1, 'Status is required'),
  Time: z.string().min(1, 'Time is required'),
});

const toLower = (value = "") => String(value || "").trim().toLowerCase();

const normalizeTaskStatus = (task) =>
  toLower(task?.TaskStatus || task?.Status || task?.status || task?.Task_Status || "pending");

const isPendingUsertask = (task) => !["completed", "done"].includes(normalizeTaskStatus(task));

const matchUsertaskToUser = (task, user) => {
  const taskUser = String(task?.User || task?.AssignedTo || task?.Assigned || "").trim();
  const userName = String(user?.User_name || "").trim();
  const mobile = String(user?.Mobile_number || "").replace(/\D/g, "");

  if (!taskUser) return false;
  if (taskUser === userName) return true;
  if (taskUser.replace(/\D/g, "") && taskUser.replace(/\D/g, "") === mobile) return true;
  return false;
};

const buildCombinedAssignments = async (user) => {
  const orderSnapshot = await getPendingOrdersForUser(user.User_name).catch(() => ({ orders: [] }));
  const orderAssignments = Array.isArray(orderSnapshot?.orders) ? orderSnapshot.orders : [];

  const mobileDigits = String(user?.Mobile_number || '').replace(/\D/g, '');
  const userFilter = mobileDigits
    ? { $or: [{ User: user.User_name }, { User: mobileDigits }] }
    : { User: user.User_name };
  const allUsertasks = await Usertasks.find({
    ...userFilter,
    Status: { $nin: ['Completed', 'Done', 'completed', 'done'] },
  }).lean();
  const usertaskAssignments = allUsertasks.filter((task) => matchUsertaskToUser(task, user));

  return {
    orders: orderAssignments,
    usertasks: usertaskAssignments,
    combined: [
      ...orderAssignments.map((item) => ({
        id: String(item?._id || item?.Order_uuid || item?.Order_Number || ""),
        source: "order",
        title: `Order #${item?.Order_Number || "-"}`,
        taskName: item?.latestStatusTask?.Task || item?.stage || "Design",
        dueDate: item?.dueDate || null,
        raw: item,
      })),
      ...usertaskAssignments.map((item) => ({
        id: String(item?._id || item?.Usertask_uuid || item?.Usertask_Number || ""),
        source: "usertask",
        title: item?.Usertask_name || "Task",
        taskName: item?.Usertask_name || "Task",
        dueDate: item?.Deadline || null,
        raw: item,
      })),
    ],
  };
};

const buildPendingTaskMessage = ({ user, assignments }) => {
  const orderLines = (assignments?.orders || []).map((item, index) => {
    return `${index + 1}. Order #${item?.Order_Number || "-"} - ${item?.latestStatusTask?.Task || item?.stage || "Design"}`;
  });

  const offset = orderLines.length;
  const usertaskLines = (assignments?.usertasks || []).map((item, index) => {
    const deadline = item?.Deadline ? ` | Deadline: ${new Date(item.Deadline).toLocaleDateString("en-IN")}` : "";
    return `${offset + index + 1}. ${item?.Usertask_name || "Task"}${deadline}`;
  });

  const allLines = [...orderLines, ...usertaskLines];

  if (!allLines.length) {
    return `Hello ${user?.User_name || "Team"}, you do not have any pending assigned tasks right now.`;
  }

  return `Hello ${user?.User_name || "Team"}, here are your pending assigned tasks:\n${allLines.join("\n")}`;
};

// Add attendance — accepts both JWT (dashboard) and internal key (device/kiosk)
router.post('/addAttendance', async (req, res, next) => {
  // Allow either a valid JWT or an internal API key (for hardware clock-in devices)
  const hasAuth = req.headers.authorization?.startsWith('Bearer ');
  const hasInternalKey = !!req.headers['x-internal-key'];

  if (!hasAuth && !hasInternalKey) {
    const { requireAuth } = require('../middleware/auth');
    return requireAuth(req, res, next);
  }
  next();
}, async (req, res) => {
  const parsed = addAttendanceSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: parsed.error.errors[0]?.message || 'Invalid input' });
  }
  const { User_name, Type, Status, Time } = parsed.data;

  const currentDate = new Date().toISOString().split('T')[0];

  try {
    const user = await User.findOne({ User_name });

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    let todayAttendance = await Attendance.findOne({
      Employee_uuid: user.User_uuid,
      Date: currentDate
    });

    if (todayAttendance) {
      // Prevent duplicate entry of the same Type (e.g. two "In" records)
      const alreadyHasType = todayAttendance.User.some((e) => e.Type === Type);
      if (alreadyHasType) {
        const assignmentSnapshot = Type === 'In'
          ? await buildCombinedAssignments(user)
          : { orders: [], usertasks: [], combined: [] };
        return res.status(409).json({
          success: false,
          message: `${Type} is already marked for today.`,
          pendingAssignments: assignmentSnapshot.combined || [],
        });
      }
      todayAttendance.User.push({ Type, Time, CreatedAt: new Date().toISOString() });
      if (Type === 'Out') todayAttendance.Status = 'Completed';
      await todayAttendance.save();

      const assignmentSnapshot = await buildCombinedAssignments(user);

      if (user?.Mobile_number) {
        try {
          if (Type === 'In') {
            await sendWhatsAppText({
              to: normalizeWhatsAppNumber(user.Mobile_number),
              body: buildPendingTaskMessage({ user, assignments: assignmentSnapshot }),
              source: 'ATTENDANCE',
              contactName: user.User_name || '',
            });
          } else if (Type === 'Out') {
            const pendingCount = assignmentSnapshot.combined.length;
            const inEntry = todayAttendance.User.find((e) => e.Type === 'In');
            const outMsg = pendingCount > 0
              ? `Bye ${user.User_name}! Day ended at ${Time} (started ${inEntry?.Time || ''}). ${pendingCount} task(s) still pending — rolling over to tomorrow.`
              : `Bye ${user.User_name}! Great work today. Day ended at ${Time} (started ${inEntry?.Time || ''}). All tasks cleared!`;
            await sendWhatsAppText({
              to: normalizeWhatsAppNumber(user.Mobile_number),
              body: outMsg,
              source: 'ATTENDANCE',
              contactName: user.User_name || '',
            });
          }
        } catch (err) {
          logger.error("Failed to send attendance WhatsApp:", err.message);
        }
      }

      return res.json({
        success: true,
        message: "New entry added to today's attendance.",
        pendingAssignments: assignmentSnapshot.combined || [],
      });
    }

    await markAttendance({
      employeeUuid: user.User_uuid,
      type: Type,
      status: Status,
      time: Time,
      source: 'dashboard',
      createdAt: new Date(),
    });

    const assignmentSnapshot = await buildCombinedAssignments(user);

    if (Type === 'In' && user?.Mobile_number) {
      try {
        await sendWhatsAppText({
          to: normalizeWhatsAppNumber(user.Mobile_number),
          body: buildPendingTaskMessage({ user, assignments: assignmentSnapshot }),
          source: 'ATTENDANCE',
          contactName: user.User_name || '',
        });
      } catch (err) {
        logger.error("Failed to send pending task WhatsApp after attendance:", err.message);
      }
    }

    res.json({
      success: true,
      message: "New attendance recorded successfully.",
      pendingAssignments: assignmentSnapshot.combined || [],
    });

  } catch (error) {
    logger.error("Error saving attendance:", error);
    res.status(500).json({ success: false, message: "Error saving attendance: " + error.message });
  }
});

// All remaining attendance routes require JWT
router.use(requireAuth);

router.get("/GetAttendanceList", async (req, res) => {
  try {
    const filter = {};
    if (req.query.from || req.query.to) {
      filter.Date = {};
      if (req.query.from) filter.Date.$gte = new Date(req.query.from);
      if (req.query.to) filter.Date.$lte = new Date(req.query.to);
    } else {
      const since = new Date();
      since.setDate(since.getDate() - 90);
      filter.Date = { $gte: since };
    }
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit) || 200));
    const skip = (page - 1) * limit;

    const [total, data] = await Promise.all([
      Attendance.countDocuments(filter),
      Attendance.find(filter).sort({ Date: -1 }).skip(skip).limit(limit),
    ]);

    const result = data.map((record) => {
      const recordObj = record.toObject ? record.toObject() : record;
      return {
        ...recordObj,
        User: Array.isArray(recordObj.User)
          ? recordObj.User.map((entry) => ({
              ...entry,
              ist: formatIST(entry?.CreatedAt),
            }))
          : [],
        createdAtIST: formatIST(recordObj.createdAt),
        updatedAtIST: formatIST(recordObj.updatedAt),
      };
    });

    res.json({
      success: true,
      result,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    logger.error("Error fetching attendance:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/getLastIn/:userName', async (req, res) => {
  try {
    const { userName } = req.params;
    const user = await User.findOne({ User_name: userName });

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    const lastInRecord = await Attendance.findOne({
      Employee_uuid: user.User_uuid,
      "User.Type": "In"
    })
      .sort({ "User.Time": -1 })
      .select("User");

    if (!lastInRecord || lastInRecord.User.length === 0) {
      return res.status(404).json({ success: false, message: "No 'In' record found" });
    }

    const lastIn = lastInRecord.User.filter(entry => entry.Type === "In").pop();

    res.json({
      success: true,
      lastIn: {
        ...lastIn,
        ist: formatIST(lastIn?.CreatedAt),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/getTodayAttendance/:userName', async (req, res) => {
  try {
    const { userName } = req.params;
    const user = await User.findOne({ User_name: userName });

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    const currentDate = new Date().toISOString().split("T")[0];

    const todayAttendance = await Attendance.findOne({
      Employee_uuid: user.User_uuid,
      Date: currentDate
    });

    const assignmentSnapshot = await buildCombinedAssignments(user);

    if (!todayAttendance || !Array.isArray(todayAttendance.User)) {
      return res.json({ success: true, flow: [], pendingAssignments: assignmentSnapshot.combined || [] });
    }

    const sortedEntries = todayAttendance.User.sort((a, b) => new Date(a.CreatedAt) - new Date(b.CreatedAt));
    const flow = sortedEntries.map(entry => entry.Type);

    res.json({
      success: true,
      flow,
      pendingAssignments: assignmentSnapshot.combined || [],
    });

  } catch (error) {
    logger.error("Error fetching today's attendance:", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
});

router.post('/setAttendanceState', async (req, res) => {
  const { User_name, State } = req.body;

  if (!User_name || !State) {
    return res.status(400).json({ success: false, message: 'All fields are required' });
  }

  try {
    const user = await User.findOne({ User_name });

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    const currentDate = new Date().toISOString().split('T')[0];
    let todayAttendance = await Attendance.findOne({
      Employee_uuid: user.User_uuid,
      Date: currentDate
    });

    if (!todayAttendance) {
      const attendanceResult = await markAttendance({
        employeeUuid: user.User_uuid,
        status: "Active",
        source: 'dashboard',
        createdAt: new Date(),
        addInitialEntry: false,
      });
      todayAttendance = attendanceResult.attendance;
    }

    todayAttendance.Status = State;
    await todayAttendance.save();

    res.json({ success: true, message: `Attendance marked as ${State}` });

  } catch (error) {
    logger.error("Error setting attendance state:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
