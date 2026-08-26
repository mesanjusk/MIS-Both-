const express = require('express');
const { randomUUID } = require('crypto');
const router = express.Router();

const User = require('../repositories/users');
const Responsibility = require('../repositories/responsibility');
const Usertasks = require('../repositories/usertask');
const OperationsAuditLog = require('../repositories/operationsAuditLog');
const { AppSetting } = require('../repositories/appSetting');
const { requireAuth } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/authorize');
const { getDateOnly } = require('../services/attendanceService');
const logger = require('../utils/logger');
const {
  STORE_SETTINGS_KEY,
  PRIORITY_LEVELS_KEY,
  DEPARTMENTS_KEY,
  STAGE_RESPONSIBILITIES_KEY,
  RESPONSIBILITY_CATEGORIES,
  OPERATIONAL_STATES,
  getStoreSettings,
  getPriorityLevels,
  getDepartments,
  getStageResponsibilities,
  buildAvailabilityMap,
  resolveResponsibilityOwner,
  resolveAllResponsibilities,
  validateConfiguration,
  findPriorityConflicts,
  recordAudit,
  auditFieldChanges,
} = require('../services/operationsService');
const {
  getTeamStatus,
  getMyTasks,
  getEscalations,
  generateDailyTasks,
  getDailyReport,
  loadResolutionContext,
  decorateTasks,
  resolveTaskOwnership,
} = require('../services/operationsTaskService');
const { seedAll } = require('../services/operationsSeedService');
const { ORDER_STAGES } = require('../constants/orderStages');

// Every route needs a logged-in user; writes additionally need requireAdmin,
// which resolves through the existing role hierarchy (admin/owner/manager).
router.use(requireAuth);

const USER_OPS_FIELDS = [
  'priority',
  'roleTitle',
  'department',
  'backupEligible',
  'active',
  'workingDays',
  'startTime',
  'endTime',
  'breakStart',
  'breakEnd',
];

// The JWT carries the Mongo _id, not User_uuid, so resolve the acting user's
// business key once per request that needs it.
const resolveActor = async (req) => {
  const query = req.user?.id ? { _id: req.user.id } : { User_name: req.user?.userName };
  const actor = await User.findOne(query).select('User_uuid User_name User_group operations').lean();
  return actor;
};

const auditBase = (actor, extra) => ({
  actorUuid: actor?.User_uuid || '',
  actorName: actor?.User_name || '',
  ...extra,
});

const fail = (res, status, message) => res.status(status).json({ success: false, message });

// ── Settings ───────────────────────────────────────────────────────────────

// GET /api/operations/settings — everything the config screens need to render.
router.get('/settings', async (req, res, next) => {
  try {
    const [store, priorityLevels, departments, stageResponsibilities] = await Promise.all([
      getStoreSettings(),
      getPriorityLevels(),
      getDepartments(),
      getStageResponsibilities(),
    ]);
    res.json({
      success: true,
      result: {
        store,
        priorityLevels,
        departments,
        stageResponsibilities,
        // Automation points that can be pointed at a responsibility. Order
        // stages come from the shared stage list so this never drifts from it.
        automationHooks: [
          { key: 'design_task', label: 'Order lifecycle — design task' },
          { key: 'post_design_task', label: 'Order lifecycle — post-print coordination' },
          ...ORDER_STAGES.map((stage) => ({ key: stage, label: `Order stage — ${stage}` })),
        ],
        categories: RESPONSIBILITY_CATEGORIES,
        operationalStates: OPERATIONAL_STATES,
      },
    });
  } catch (err) {
    next(err);
  }
});

const putSetting = (key, description, normalise) =>
  async (req, res, next) => {
    try {
      const actor = await resolveActor(req);
      const before = await AppSetting.getSetting(key, null);
      const value = normalise(req.body);
      if (value === null) return fail(res, 400, 'Invalid payload');

      await AppSetting.upsertSetting({ key, value, description });
      await recordAudit(
        auditBase(actor, {
          action: 'settings.update',
          entityType: key === STORE_SETTINGS_KEY ? 'store' : 'settings',
          entityId: key,
          entityName: description,
          field: key,
          oldValue: before,
          newValue: value,
          reason: req.body?.reason || '',
        })
      );
      res.json({ success: true, result: value });
    } catch (err) {
      next(err);
    }
  };

router.put(
  '/settings/store',
  requireAdmin,
  putSetting(STORE_SETTINGS_KEY, 'Store reporting/opening/closing times and working days', (body) => {
    const { reportingTime, openingTime, closingTime, workingDays, lateGraceMinutes, escalationUserUuids } = body || {};
    return {
      reportingTime: String(reportingTime || '').trim(),
      openingTime: String(openingTime || '').trim(),
      closingTime: String(closingTime || '').trim(),
      workingDays: Array.isArray(workingDays) ? workingDays.map(Number).filter((day) => day >= 0 && day <= 6) : [],
      lateGraceMinutes: Number(lateGraceMinutes) || 0,
      escalationUserUuids: Array.isArray(escalationUserUuids) ? escalationUserUuids.filter(Boolean) : [],
    };
  })
);

router.put(
  '/settings/priority-levels',
  requireAdmin,
  putSetting(PRIORITY_LEVELS_KEY, 'Operational priority codes available for assignment to users', (body) => {
    const levels = body?.levels;
    if (!Array.isArray(levels)) return null;
    return levels
      .filter((level) => level && String(level.code || '').trim())
      .map((level) => ({
        code: String(level.code).trim(),
        label: String(level.label || level.code).trim(),
        description: String(level.description || '').trim(),
        defaultRoleTitle: String(level.defaultRoleTitle || '').trim(),
      }));
  })
);

router.put(
  '/settings/stage-responsibilities',
  requireAdmin,
  putSetting(
    STAGE_RESPONSIBILITIES_KEY,
    'Maps order stages and lifecycle hooks to the responsibility that owns the task they create',
    (body) => {
      const mapping = body?.mapping;
      if (!mapping || typeof mapping !== 'object') return null;
      // Drop empty selections so an unmapped hook falls back to the existing
      // automation rather than resolving to an empty responsibility.
      return Object.fromEntries(
        Object.entries(mapping)
          .map(([key, value]) => [String(key), String(value || '').trim()])
          .filter(([, value]) => value)
      );
    }
  )
);

router.put(
  '/settings/departments',
  requireAdmin,
  putSetting(DEPARTMENTS_KEY, 'Departments available for assignment to users', (body) => {
    const departments = body?.departments;
    if (!Array.isArray(departments)) return null;
    return departments.map((item) => String(item || '').trim()).filter(Boolean);
  })
);

// ── Users ──────────────────────────────────────────────────────────────────

// GET /api/operations/users — the team roster with live availability.
router.get('/users', async (req, res, next) => {
  try {
    const users = await User.find({}).select('-Password').lean();
    const availabilityMap = await buildAvailabilityMap(users);
    res.json({
      success: true,
      result: users.map((user) => ({
        _id: user._id,
        User_uuid: user.User_uuid,
        User_name: user.User_name,
        name: user.name || user.User_name,
        User_group: user.User_group,
        operations: user.operations || {},
        availability: availabilityMap.get(user.User_uuid) || null,
      })),
      priorityConflicts: findPriorityConflicts(users),
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/operations/users/:userUuid — one user's full operational profile.
router.get('/users/:userUuid', async (req, res, next) => {
  try {
    const { userUuid } = req.params;
    const user = await User.findOne({ User_uuid: userUuid }).select('-Password').lean();
    if (!user) return fail(res, 404, 'User not found');

    const [allUsers, responsibilities, storeSettings] = await Promise.all([
      User.find({}).select('-Password').lean(),
      Responsibility.find({ isActive: true }).sort({ sortOrder: 1 }).lean(),
      getStoreSettings(),
    ]);
    const availabilityMap = await buildAvailabilityMap(allUsers, { storeSettings });
    const views = responsibilities.map((item) => resolveResponsibilityOwner(item, availabilityMap));

    res.json({
      success: true,
      result: {
        User_uuid: user.User_uuid,
        User_name: user.User_name,
        name: user.name || user.User_name,
        Mobile_number: user.Mobile_number,
        User_group: user.User_group,
        operations: user.operations || {},
        availability: availabilityMap.get(user.User_uuid) || null,
        primaryResponsibilities: responsibilities.filter((item) => item.primaryUserUuid === userUuid),
        backupResponsibilities: responsibilities.filter(
          (item) => item.backup1UserUuid === userUuid || item.backup2UserUuid === userUuid
        ),
        activeNow: views.filter((view) => view.currentOwner?.userUuid === userUuid),
        effectiveWorkingDays: user.operations?.workingDays?.length
          ? user.operations.workingDays
          : storeSettings.workingDays,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/operations/users/:userUuid/operations — the screen behind §1.
 *
 * Priority is written as data. Passing `swapPriority` moves the code off
 * whoever currently holds it and gives them this user's old code, which is the
 * "management swapped P1 and P2 today" case, done without a deploy.
 */
router.put('/users/:userUuid/operations', requireAdmin, async (req, res, next) => {
  try {
    const { userUuid } = req.params;
    const actor = await resolveActor(req);
    const user = await User.findOne({ User_uuid: userUuid });
    if (!user) return fail(res, 404, 'User not found');

    const before = { ...(user.operations ? JSON.parse(JSON.stringify(user.operations)) : {}) };
    const payload = req.body?.operations || req.body || {};
    const next$ = { ...before };

    if (payload.priority !== undefined) {
      const levels = await getPriorityLevels();
      const code = String(payload.priority || '').trim();
      if (code && !levels.some((level) => level.code === code)) {
        return fail(res, 400, `Unknown priority "${code}". Add it under Settings → Operations first.`);
      }
      next$.priority = code;
    }
    if (payload.roleTitle !== undefined) next$.roleTitle = String(payload.roleTitle || '').trim();
    if (payload.department !== undefined) next$.department = String(payload.department || '').trim();
    if (payload.backupEligible !== undefined) next$.backupEligible = !!payload.backupEligible;
    if (payload.active !== undefined) next$.active = !!payload.active;
    if (payload.workingDays !== undefined) {
      next$.workingDays = Array.isArray(payload.workingDays)
        ? payload.workingDays.map(Number).filter((day) => day >= 0 && day <= 6)
        : [];
    }
    for (const field of ['startTime', 'endTime', 'breakStart', 'breakEnd']) {
      if (payload[field] !== undefined) next$[field] = String(payload[field] || '').trim();
    }

    let swapped = null;
    if (payload.priority !== undefined && next$.priority && req.body?.swapPriority) {
      const holder = await User.findOne({
        'operations.priority': next$.priority,
        User_uuid: { $ne: userUuid },
      });
      if (holder) {
        const holderBefore = holder.operations?.priority || '';
        holder.operations.priority = before.priority || '';
        await holder.save();
        swapped = {
          User_uuid: holder.User_uuid,
          User_name: holder.User_name,
          from: holderBefore,
          to: holder.operations.priority,
        };
        await recordAudit(
          auditBase(actor, {
            action: 'user.operations.update',
            entityType: 'user',
            entityId: holder.User_uuid,
            entityName: holder.User_name,
            field: 'priority',
            oldValue: holderBefore,
            newValue: holder.operations.priority,
            reason: req.body?.reason || 'Priority swap',
          })
        );
      }
    }

    user.operations = { ...next$, state: user.operations?.state || { status: 'Available' } };
    await user.save();

    await auditFieldChanges({
      before,
      after: next$,
      fields: USER_OPS_FIELDS,
      base: auditBase(actor, {
        action: 'user.operations.update',
        entityType: 'user',
        entityId: user.User_uuid,
        entityName: user.User_name,
        reason: req.body?.reason || '',
      }),
    });

    const allUsers = await User.find({}).select('User_uuid User_name operations').lean();
    res.json({
      success: true,
      result: user.operations,
      swapped,
      priorityConflicts: findPriorityConflicts(allUsers),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/operations/users/:userUuid/state — Available / Busy / Outside.
 *
 * Self-service for your own state; managers may set anyone's. This is the
 * operational layer on top of attendance, not a second attendance record —
 * nothing here writes to the Attendance collection.
 */
router.put('/users/:userUuid/state', async (req, res, next) => {
  try {
    const { userUuid } = req.params;
    const actor = await resolveActor(req);
    const isSelf = actor?.User_uuid === userUuid;
    const { tierFor } = require('../utils/roleHierarchy');
    if (!isSelf && tierFor(req.user?.userGroup) < 3) {
      return fail(res, 403, 'Only a manager or above can change another user\'s operational state');
    }

    const status = String(req.body?.status || '').trim();
    if (!OPERATIONAL_STATES.includes(status)) {
      return fail(res, 400, `status must be one of: ${OPERATIONAL_STATES.join(', ')}`);
    }

    const user = await User.findOne({ User_uuid: userUuid });
    if (!user) return fail(res, 404, 'User not found');

    const previous = user.operations?.state?.status || 'Available';
    user.operations = user.operations || {};
    user.operations.state = {
      status,
      currentTask: String(req.body?.currentTask || '').trim(),
      since: new Date(),
      updatedBy: actor?.User_name || req.user?.userName || '',
    };
    await user.save();

    await recordAudit(
      auditBase(actor, {
        action: 'user.state.update',
        entityType: 'user',
        entityId: user.User_uuid,
        entityName: user.User_name,
        field: 'state.status',
        oldValue: previous,
        newValue: status,
        detail: user.operations.state.currentTask,
      })
    );

    res.json({ success: true, result: user.operations.state });
  } catch (err) {
    next(err);
  }
});

// GET /api/operations/me — the logged-in user's own operational role card (§4).
router.get('/me', async (req, res, next) => {
  try {
    const actor = await resolveActor(req);
    if (!actor) return fail(res, 404, 'User not found');

    const [users, responsibilities, priorityLevels] = await Promise.all([
      User.find({}).select('-Password').lean(),
      Responsibility.find({ isActive: true }).sort({ sortOrder: 1 }).lean(),
      getPriorityLevels(),
    ]);
    const availabilityMap = await buildAvailabilityMap(users);
    const views = responsibilities.map((item) => resolveResponsibilityOwner(item, availabilityMap));
    const level = priorityLevels.find((item) => item.code === actor.operations?.priority) || null;

    res.json({
      success: true,
      result: {
        User_uuid: actor.User_uuid,
        User_name: actor.User_name,
        operations: actor.operations || {},
        priorityLabel: level?.label || actor.operations?.priority || '',
        availability: availabilityMap.get(actor.User_uuid) || null,
        primaryResponsibilities: responsibilities
          .filter((item) => item.primaryUserUuid === actor.User_uuid)
          .map((item) => item.name),
        backupResponsibilities: responsibilities
          .filter(
            (item) =>
              item.backup1UserUuid === actor.User_uuid || item.backup2UserUuid === actor.User_uuid
          )
          .map((item) => item.name),
        activeNow: views
          .filter((view) => view.currentOwner?.userUuid === actor.User_uuid)
          .map((view) => ({ name: view.name, role: view.currentOwner.role })),
      },
    });
  } catch (err) {
    next(err);
  }
});

// ── Responsibilities ───────────────────────────────────────────────────────

// GET /api/operations/responsibilities — configuration + who owns each now.
router.get('/responsibilities', async (req, res, next) => {
  try {
    const date = req.query.date ? new Date(req.query.date) : new Date();
    const { resolved, escalationTargets } = await resolveAllResponsibilities({ date });
    const all = await Responsibility.find({}).sort({ sortOrder: 1, name: 1 }).lean();
    const resolvedByUuid = new Map(resolved.map((view) => [view.responsibility_uuid, view]));

    res.json({
      success: true,
      result: all.map((item) => ({
        ...item,
        resolution: resolvedByUuid.get(item.responsibility_uuid) || null,
      })),
      escalationTargets,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/responsibilities', requireAdmin, async (req, res, next) => {
  try {
    const actor = await resolveActor(req);
    const name = String(req.body?.name || '').trim();
    if (!name) return fail(res, 400, 'name is required');
    const category = RESPONSIBILITY_CATEGORIES.includes(req.body?.category)
      ? req.body.category
      : 'general';

    const created = await Responsibility.create({
      responsibility_uuid: randomUUID(),
      name,
      description: String(req.body?.description || '').trim(),
      category,
      primaryUserUuid: String(req.body?.primaryUserUuid || '').trim(),
      backup1UserUuid: String(req.body?.backup1UserUuid || '').trim(),
      backup2UserUuid: String(req.body?.backup2UserUuid || '').trim(),
      isCritical: !!req.body?.isCritical,
      isActive: req.body?.isActive !== false,
      sortOrder: Number(req.body?.sortOrder) || 0,
    });

    await recordAudit(
      auditBase(actor, {
        action: 'responsibility.create',
        entityType: 'responsibility',
        entityId: created.responsibility_uuid,
        entityName: created.name,
        newValue: { primaryUserUuid: created.primaryUserUuid, backup1UserUuid: created.backup1UserUuid, backup2UserUuid: created.backup2UserUuid },
        reason: req.body?.reason || '',
      })
    );

    res.status(201).json({ success: true, result: created });
  } catch (err) {
    next(err);
  }
});

router.put('/responsibilities/:responsibilityUuid', requireAdmin, async (req, res, next) => {
  try {
    const actor = await resolveActor(req);
    const existing = await Responsibility.findOne({
      responsibility_uuid: req.params.responsibilityUuid,
    });
    if (!existing) return fail(res, 404, 'Responsibility not found');

    const before = existing.toObject();
    const editable = [
      'name',
      'description',
      'category',
      'primaryUserUuid',
      'backup1UserUuid',
      'backup2UserUuid',
      'isCritical',
      'isActive',
      'sortOrder',
    ];
    for (const field of editable) {
      if (req.body[field] === undefined) continue;
      if (field === 'category' && !RESPONSIBILITY_CATEGORIES.includes(req.body.category)) continue;
      if (field === 'isCritical' || field === 'isActive') existing[field] = !!req.body[field];
      else if (field === 'sortOrder') existing[field] = Number(req.body[field]) || 0;
      else existing[field] = String(req.body[field] ?? '').trim();
    }
    await existing.save();

    await auditFieldChanges({
      before,
      after: existing.toObject(),
      fields: editable,
      base: auditBase(actor, {
        action: 'responsibility.update',
        entityType: 'responsibility',
        entityId: existing.responsibility_uuid,
        entityName: existing.name,
        reason: req.body?.reason || '',
      }),
    });

    res.json({ success: true, result: existing });
  } catch (err) {
    next(err);
  }
});

router.delete('/responsibilities/:responsibilityUuid', requireAdmin, async (req, res, next) => {
  try {
    const actor = await resolveActor(req);
    const removed = await Responsibility.findOneAndDelete({
      responsibility_uuid: req.params.responsibilityUuid,
    }).lean();
    if (!removed) return fail(res, 404, 'Responsibility not found');

    await recordAudit(
      auditBase(actor, {
        action: 'responsibility.delete',
        entityType: 'responsibility',
        entityId: removed.responsibility_uuid,
        entityName: removed.name,
        oldValue: removed,
        reason: req.body?.reason || '',
      })
    );
    res.json({ success: true, message: 'Responsibility deleted' });
  } catch (err) {
    next(err);
  }
});

// ── Dashboards ─────────────────────────────────────────────────────────────

router.get('/team-status', async (req, res, next) => {
  try {
    const date = req.query.date ? new Date(req.query.date) : new Date();
    res.json({ success: true, result: await getTeamStatus({ date }) });
  } catch (err) {
    next(err);
  }
});

router.get('/my-tasks', async (req, res, next) => {
  try {
    const actor = await resolveActor(req);
    if (!actor) return fail(res, 404, 'User not found');
    const date = req.query.date ? new Date(req.query.date) : new Date();
    res.json({ success: true, result: await getMyTasks({ userUuid: actor.User_uuid, date }) });
  } catch (err) {
    next(err);
  }
});

router.get('/escalations', async (req, res, next) => {
  try {
    const date = req.query.date ? new Date(req.query.date) : new Date();
    res.json({ success: true, result: await getEscalations({ date }) });
  } catch (err) {
    next(err);
  }
});

router.get('/daily-report', async (req, res, next) => {
  try {
    const date = req.query.date ? new Date(req.query.date) : new Date();
    res.json({ success: true, result: await getDailyReport({ date }) });
  } catch (err) {
    next(err);
  }
});

router.get('/validate', async (req, res, next) => {
  try {
    const { resolved, availabilityMap, users } = await resolveAllResponsibilities({});
    const responsibilities = await Responsibility.find({ isActive: true }).lean();
    const warnings = validateConfiguration({ responsibilities, availabilityMap, users });

    for (const view of resolved.filter((item) => item.escalated)) {
      warnings.push({
        level: 'error',
        responsibility: view.name,
        responsibility_uuid: view.responsibility_uuid,
        message: 'NO AVAILABLE OWNER — primary and both backups are unavailable',
      });
    }
    for (const conflict of findPriorityConflicts(users)) {
      warnings.push({
        level: 'warning',
        responsibility: '',
        message: `${conflict.priority} is assigned to ${conflict.holders.length} active users: ${conflict.holders
          .map((holder) => holder.User_name)
          .join(', ')}`,
      });
    }

    res.json({ success: true, result: warnings });
  } catch (err) {
    next(err);
  }
});

// ── Tasks ──────────────────────────────────────────────────────────────────

// POST /api/operations/tasks — create a task against a responsibility chain.
router.post('/tasks', requireAdmin, async (req, res, next) => {
  try {
    const actor = await resolveActor(req);
    const name = String(req.body?.Usertask_name || req.body?.name || '').trim();
    if (!name) return fail(res, 400, 'Usertask_name is required');

    const context = await loadResolutionContext({});
    const responsibility = req.body?.responsibility_uuid
      ? context.responsibilityByUuid.get(req.body.responsibility_uuid)
      : null;

    const chainSource = {
      responsibility_uuid: req.body?.responsibility_uuid || '',
      category: req.body?.category || responsibility?.category || 'general',
      primaryUserUuid: String(req.body?.primaryUserUuid || responsibility?.primaryUserUuid || ''),
      backup1UserUuid: String(req.body?.backup1UserUuid || responsibility?.backup1UserUuid || ''),
      backup2UserUuid: String(req.body?.backup2UserUuid || responsibility?.backup2UserUuid || ''),
    };
    if (!chainSource.primaryUserUuid) {
      return fail(res, 400, 'A primary user (or a responsibility that has one) is required');
    }

    const ownership = resolveTaskOwnership(chainSource, context.availabilityMap, context.responsibilityByUuid);
    const lastNumber =
      (await Usertasks.findOne().sort({ Usertask_Number: -1 }).select('Usertask_Number').lean())
        ?.Usertask_Number || 0;

    const date = req.body?.Date ? getDateOnly(new Date(req.body.Date)) : getDateOnly(new Date());
    const deadline = req.body?.Deadline ? new Date(req.body.Deadline) : date;

    const created = await Usertasks.create({
      Usertask_uuid: randomUUID(),
      Usertask_Number: lastNumber + 1,
      User: ownership.currentOwner?.userName
        || context.availabilityMap.get(chainSource.primaryUserUuid)?.userName
        || '',
      AssignedBy: actor?.User_name || '',
      Usertask_name: name,
      Date: date,
      Time: String(req.body?.scheduledTime || req.body?.Time || ''),
      Deadline: deadline,
      Remark: String(req.body?.Remark || req.body?.description || name),
      Status: String(req.body?.Status || 'Pending'),
      ...chainSource,
      currentOwnerUuid: ownership.currentOwner?.userUuid || '',
      ownerRole: ownership.currentOwner ? ownership.ownerRole : 'escalated',
      escalated: ownership.escalated,
      scheduledTime: String(req.body?.scheduledTime || ''),
      durationMinutes: Number(req.body?.durationMinutes) || 0,
      isRequired: !!req.body?.isRequired,
      Priority: String(req.body?.Priority || ''),
    });

    await recordAudit(
      auditBase(actor, {
        action: 'task.create',
        entityType: 'task',
        entityId: created.Usertask_uuid,
        entityName: created.Usertask_name,
        newValue: chainSource,
        reason: req.body?.reason || '',
      })
    );

    res.status(201).json({ success: true, result: created, ownership });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/operations/tasks/:taskUuid/status — available to the current
 * owner (that is the whole point of backup activation) and to management.
 */
router.patch('/tasks/:taskUuid/status', async (req, res, next) => {
  try {
    const actor = await resolveActor(req);
    const task = await Usertasks.findOne({ Usertask_uuid: req.params.taskUuid });
    if (!task) return fail(res, 404, 'Task not found');

    const { tierFor } = require('../utils/roleHierarchy');
    const context = await loadResolutionContext({});
    const ownership = resolveTaskOwnership(task.toObject(), context.availabilityMap, context.responsibilityByUuid);
    const isOwner = ownership.currentOwner?.userUuid === actor?.User_uuid;
    if (!isOwner && tierFor(req.user?.userGroup) < 3) {
      return fail(res, 403, 'Only the current owner or a manager can update this task');
    }

    const status = String(req.body?.status || '').trim();
    if (!status) return fail(res, 400, 'status is required');
    const previous = task.Status;
    task.Status = status;
    await task.save();

    await recordAudit(
      auditBase(actor, {
        action: 'task.status.update',
        entityType: 'task',
        entityId: task.Usertask_uuid,
        entityName: task.Usertask_name,
        field: 'Status',
        oldValue: previous,
        newValue: status,
      })
    );

    res.json({ success: true, result: task });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/operations/tasks/:taskUuid/handover — a normal employee may ask
 * for a task to move; management decides. The configured chain is untouched.
 */
router.post('/tasks/:taskUuid/handover', async (req, res, next) => {
  try {
    const actor = await resolveActor(req);
    const task = await Usertasks.findOne({ Usertask_uuid: req.params.taskUuid });
    if (!task) return fail(res, 404, 'Task not found');

    const reason = String(req.body?.reason || '').trim();
    task.Status = 'Handover Requested';
    await task.save();

    await recordAudit(
      auditBase(actor, {
        action: 'task.handover.request',
        entityType: 'task',
        entityId: task.Usertask_uuid,
        entityName: task.Usertask_name,
        reason,
        detail: `Requested by ${actor?.User_name || ''}`,
      })
    );

    const { escalationTargets } = await getEscalations({});
    res.json({ success: true, result: task, notified: escalationTargets.map((user) => user.User_name) });
  } catch (err) {
    next(err);
  }
});

// GET /api/operations/tasks — all open tasks with live ownership (management).
router.get('/tasks', async (req, res, next) => {
  try {
    const context = await loadResolutionContext({});
    const filter = {};
    if (req.query.date) filter.Date = getDateOnly(new Date(req.query.date));
    if (req.query.responsibility_uuid) filter.responsibility_uuid = req.query.responsibility_uuid;
    const tasks = await Usertasks.find(filter).sort({ Deadline: 1 }).limit(500).lean();
    res.json({ success: true, result: decorateTasks(tasks, context) });
  } catch (err) {
    next(err);
  }
});

router.post('/daily-tasks/generate', requireAdmin, async (req, res, next) => {
  try {
    const actor = await resolveActor(req);
    const date = req.body?.date ? new Date(req.body.date) : new Date();
    const result = await generateDailyTasks({ date, actorName: actor?.User_name || 'system' });
    res.json({ success: true, result });
  } catch (err) {
    next(err);
  }
});

// ── Audit ──────────────────────────────────────────────────────────────────

router.get('/audit', requireAdmin, async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.entityType) filter.entityType = req.query.entityType;
    if (req.query.entityId) filter.entityId = req.query.entityId;
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const rows = await OperationsAuditLog.find(filter).sort({ createdAt: -1 }).limit(limit).lean();
    res.json({ success: true, result: rows });
  } catch (err) {
    next(err);
  }
});

// POST /api/operations/seed — initial configuration; additive and idempotent.
router.post('/seed', requireAdmin, async (req, res, next) => {
  try {
    const actor = await resolveActor(req);
    const result = await seedAll();
    await recordAudit(
      auditBase(actor, {
        action: 'operations.seed',
        entityType: 'settings',
        entityId: 'seed',
        newValue: result,
      })
    );
    logger.info({ actor: actor?.User_name, result }, 'Operations defaults seeded');
    res.json({ success: true, result });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
