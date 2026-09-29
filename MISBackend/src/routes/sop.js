const express = require('express');
const { randomUUID } = require('crypto');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/authorize');
const {
  getDailyStatus,
  getDailyStatusForUser,
  markComplete,
  markSkipped,
  seedDefaultTasks,
  SOPTask,
  SOPCompletion,
} = require('../services/sopService');
const { OWNERSHIP_FIELDS } = require('../constants/ownership');
const User = require('../repositories/users');
const SOPHandover = require('../repositories/sopHandover');
const {
  getEmployeeDailyStatus, saveEmployeeCompletion, saveSopHandover,
} = require('../services/employeeSopDayService');

async function currentEmployee(req) {
  const query = req.user?.id ? { _id: req.user.id } : { User_name: req.user?.userName };
  return User.findOne(query).select('User_uuid User_name User_group').lean();
}
const respondSopError = (res, err) => res.status(err.status || 500).json({
  success: false, message: err.status ? err.message : 'Could not update employee SOP',
});

// GET /api/sop/tasks — admin: list all tasks
router.get('/tasks', requireAuth, async (req, res, next) => {
  try {
    const { group, frequency, active } = req.query;
    const filter = {};
    if (group) filter.primaryGroup = group;
    if (frequency) filter.frequency = frequency;
    if (active !== undefined) filter.isActive = active === 'true';
    const tasks = await SOPTask.find(filter).sort({ sortOrder: 1 }).lean();
    res.json({ success: true, result: tasks });
  } catch (err) {
    next(err);
  }
});

// POST /api/sop/tasks — admin: create task
router.post('/tasks', requireAuth, async (req, res, next) => {
  try {
    const {
      title, description, section, frequency, timeOfDay,
      primaryGroup, fallbackGroups, isSkippable, isActive, sortOrder, kpi,
      responsibility_uuid,
      scheduledTime, durationMinutes, weekDays, category,
    } = req.body;
    if (!title || !primaryGroup) {
      return res.status(400).json({ success: false, message: 'title and primaryGroup are required' });
    }
    const task = await SOPTask.create({
      sop_uuid: randomUUID(),
      title: title.trim(),
      description: description?.trim() || '',
      section: section?.trim() || '',
      frequency: frequency || 'daily',
      timeOfDay: timeOfDay || 'any',
      primaryGroup: primaryGroup.trim(),
      fallbackGroups: Array.isArray(fallbackGroups) ? fallbackGroups.filter(Boolean) : [],
      isSkippable: Boolean(isSkippable),
      isActive: isActive !== false,
      sortOrder: Number(sortOrder) || 0,
      kpi: kpi?.trim() || '',
      responsibility_uuid: responsibility_uuid?.trim() || '',
      ...Object.fromEntries(
        OWNERSHIP_FIELDS.map((field) => [field, req.body[field]?.trim() || ''])
      ),
      scheduledTime: scheduledTime?.trim() || '',
      durationMinutes: Number(durationMinutes) || 0,
      weekDays: Array.isArray(weekDays) ? weekDays.map(Number).filter((d) => d >= 0 && d <= 6) : [],
      category: category?.trim() || 'general',
    });
    res.status(201).json({ success: true, result: task });
  } catch (err) {
    next(err);
  }
});

// PUT /api/sop/tasks/:id — admin: update task
router.put('/tasks/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const allowed = ['title', 'description', 'section', 'frequency', 'timeOfDay',
      'primaryGroup', 'fallbackGroups', 'isSkippable', 'isActive', 'sortOrder', 'kpi',
      'responsibility_uuid', ...OWNERSHIP_FIELDS,
      'scheduledTime', 'durationMinutes', 'weekDays', 'category'];
    const update = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) update[key] = req.body[key];
    }
    if (update.fallbackGroups && !Array.isArray(update.fallbackGroups)) {
      update.fallbackGroups = [];
    }
    const task = await SOPTask.findByIdAndUpdate(id, update, { new: true }).lean();
    if (!task) return res.status(404).json({ success: false, message: 'Task not found' });
    res.json({ success: true, result: task });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/sop/tasks/:id — admin: delete task
router.delete('/tasks/:id', requireAuth, async (req, res, next) => {
  try {
    const task = await SOPTask.findByIdAndDelete(req.params.id).lean();
    if (!task) return res.status(404).json({ success: false, message: 'Task not found' });
    res.json({ success: true, message: 'Task deleted' });
  } catch (err) {
    next(err);
  }
});

// GET /api/sop/daily — get today's tasks + completion status for user's group
router.get('/daily', requireAuth, async (req, res, next) => {
  try {
    const userGroup = req.user?.userGroup || req.query.userGroup || '';
    if (!userGroup) return res.status(400).json({ success: false, message: 'userGroup required' });
    const status = await getDailyStatus(userGroup);
    res.json({ success: true, ...status });
  } catch (err) {
    next(err);
  }
});

// GET /api/sop/daily/me — personal responsibilities + applicable group SOP.
// Attendance is independent evidence; no need to manually tick Punch In again.
router.get('/daily/me', requireAuth, async (req, res, next) => {
  try {
    const actor = await currentEmployee(req);
    if (!actor?.User_uuid) return res.status(404).json({ success: false, message: 'Employee not found' });
    const status = await getEmployeeDailyStatus(actor);
    return res.json({ success: true, ...status });
  } catch (error) { return next(error); }
});

// Completion belongs to the authenticated employee (not userName/userGroup
// supplied in a request body). Existing admin task configuration is preserved.
router.post('/complete', requireAuth, async (req, res) => {
  try {
    const actor = await currentEmployee(req);
    if (!actor?.User_uuid) return res.status(404).json({ success: false, message: 'Employee not found' });
    if (!req.body?.sopUuid) return res.status(400).json({ success: false, message: 'sopUuid required' });
    const result = await saveEmployeeCompletion(actor, req.body.sopUuid);
    return res.json({ success: true, result });
  } catch (error) { return respondSopError(res, error); }
});

// Optional work can be marked N/A with a reason, but mandatory work requires
// actual completion or a recorded handover; skip cannot defeat the close gate.
router.post('/skip', requireAuth, async (req, res) => {
  try {
    const actor = await currentEmployee(req);
    if (!actor?.User_uuid) return res.status(404).json({ success: false, message: 'Employee not found' });
    if (!req.body?.sopUuid) return res.status(400).json({ success: false, message: 'sopUuid required' });
    const result = await saveEmployeeCompletion(actor, req.body.sopUuid, {
      skip: true, reason: String(req.body.skipReason || ''),
    });
    return res.json({ success: true, result });
  } catch (error) { return respondSopError(res, error); }
});

router.post('/handover', requireAuth, async (req, res) => {
  try {
    const actor = await currentEmployee(req);
    if (!actor?.User_uuid) return res.status(404).json({ success: false, message: 'Employee not found' });
    if (!req.body?.sopUuid) return res.status(400).json({ success: false, message: 'sopUuid required' });
    const result = await saveSopHandover(actor, req.body.sopUuid, {
      kind: 'handover', reason: req.body.reason, assignedTo: req.body.assignedTo,
    });
    return res.json({ success: true, result });
  } catch (error) { return respondSopError(res, error); }
});

// Pending SOP exceptions are visible to managers rather than disappearing
// when an employee is allowed to leave. Read and review require an admin role.
router.get('/handovers', requireAuth, requireAdmin, async (_req, res, next) => {
  try {
    const records = await SOPHandover.find({ reviewStatus: 'pending' })
      .sort({ createdAt: -1 }).limit(100).lean();
    const [tasks, people] = await Promise.all([
      SOPTask.find({ sop_uuid: { $in: records.map((item) => item.sop_uuid) } })
        .select('sop_uuid title').lean(),
      User.find({ User_uuid: { $in: records.map((item) => item.employee_uuid) } })
        .select('User_uuid User_name').lean(),
    ]);
    const titles = new Map(tasks.map((item) => [item.sop_uuid, item.title]));
    const names = new Map(people.map((item) => [item.User_uuid, item.User_name]));
    return res.json({ success: true, result: records.map((record) => ({
      ...record, taskTitle: titles.get(record.sop_uuid) || record.sop_uuid,
      employeeName: names.get(record.employee_uuid) || record.createdBy || 'Employee',
    })) });
  } catch (error) { return next(error); }
});

router.patch('/handovers/:id/review', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const record = await SOPHandover.findOneAndUpdate({
      _id: req.params.id, reviewStatus: 'pending',
    }, { $set: {
      reviewStatus: 'reviewed', reviewedAt: new Date(),
      reviewedBy: req.user?.userName || req.user?.User_name || 'Manager',
    } }, { new: true, runValidators: true });
    if (!record) return res.status(404).json({ success: false, message: 'Pending handover not found' });
    return res.json({ success: true, result: record });
  } catch (error) { return next(error); }
});

// POST /api/sop/seed — seed default tasks (admin, only when collection is empty)
router.post('/seed', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const result = await seedDefaultTasks();
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/sop/completions — clear today's completions for a group (admin utility)
router.delete('/completions', requireAuth, async (req, res, next) => {
  try {
    const { date } = req.query;
    const queryDate = date ? new Date(date) : new Date(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }));
    const result = await SOPCompletion.deleteMany({ date: queryDate });
    res.json({ success: true, deleted: result.deletedCount });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
