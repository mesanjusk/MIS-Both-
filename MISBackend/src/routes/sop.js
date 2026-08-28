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

// GET /api/sop/daily/me — today's checklist resolved through the user-level
// responsibility chain rather than the caller's group.
router.get('/daily/me', requireAuth, async (req, res, next) => {
  try {
    const User = require('../repositories/users');
    const query = req.user?.id ? { _id: req.user.id } : { User_name: req.user?.userName };
    const actor = await User.findOne(query).select('User_uuid').lean();
    if (!actor) return res.status(404).json({ success: false, message: 'User not found' });
    const status = await getDailyStatusForUser(actor.User_uuid);
    res.json({ success: true, ...status });
  } catch (err) {
    next(err);
  }
});

// POST /api/sop/complete — mark a task done for today
router.post('/complete', requireAuth, async (req, res, next) => {
  try {
    const { sopUuid } = req.body;
    const userName = req.user?.userName || req.body.userName || '';
    const userGroup = req.user?.userGroup || req.body.userGroup || '';
    if (!sopUuid) return res.status(400).json({ success: false, message: 'sopUuid required' });
    const result = await markComplete({ sopUuid, userName, userGroup });
    res.json({ success: true, result });
  } catch (err) {
    next(err);
  }
});

// POST /api/sop/skip — skip a skippable task for today
router.post('/skip', requireAuth, async (req, res, next) => {
  try {
    const { sopUuid, skipReason } = req.body;
    const userName = req.user?.userName || req.body.userName || '';
    const userGroup = req.user?.userGroup || req.body.userGroup || '';
    if (!sopUuid) return res.status(400).json({ success: false, message: 'sopUuid required' });
    const result = await markSkipped({ sopUuid, userName, userGroup, skipReason });
    res.json({ success: true, result });
  } catch (err) {
    next(err);
  }
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
