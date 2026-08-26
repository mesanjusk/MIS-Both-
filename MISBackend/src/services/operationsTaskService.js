// Team Operations — task ownership, team status and the daily plan.
//
// Runtime ownership is recomputed on read (see §18: configuration is never
// overwritten by an absence). The `currentOwnerUuid` column on Usertasks is a
// cache of the last computed value for querying and notification, not the
// source of truth — `resolveTaskOwnership` recomputes it every time.
const { randomUUID } = require('crypto');
const Usertasks = require('../repositories/usertask');
const Responsibility = require('../repositories/responsibility');
const SOPTask = require('../repositories/sopTask');
const SOPCompletion = require('../repositories/sopCompletion');
const User = require('../repositories/users');
const { getDateOnly } = require('./attendanceService');
const {
  getStoreSettings,
  buildAvailabilityMap,
  resolveResponsibilityOwner,
  isAvailableFor,
  resolveEscalationTargets,
  getStageResponsibilities,
} = require('./operationsService');

const DONE_STATUSES = new Set(['completed', 'done', 'closed', 'cancelled']);

const isDone = (status) => DONE_STATUSES.has(String(status || '').trim().toLowerCase());

/**
 * Work out who owns one task right now.
 *
 * Prefers the task's own chain; falls back to the linked responsibility's
 * chain when the task doesn't carry one. Same strict order everywhere:
 * primary → backup 1 → backup 2 → escalated.
 */
const resolveTaskOwnership = (task, availabilityMap, responsibilityByUuid) => {
  const responsibility = task.responsibility_uuid
    ? responsibilityByUuid.get(task.responsibility_uuid)
    : null;

  const category = task.category || responsibility?.category || 'general';
  const slots = [
    {
      role: 'primary',
      userUuid: task.primaryUserUuid || responsibility?.primaryUserUuid || '',
    },
    {
      role: 'backup1',
      userUuid: task.backup1UserUuid || responsibility?.backup1UserUuid || '',
    },
    {
      role: 'backup2',
      userUuid: task.backup2UserUuid || responsibility?.backup2UserUuid || '',
    },
  ];

  const chain = [];
  let owner = null;
  for (const slot of slots) {
    if (!slot.userUuid) {
      chain.push({ ...slot, configured: false, available: false, reason: 'Not configured' });
      continue;
    }
    const availability = availabilityMap.get(slot.userUuid);
    if (!availability) {
      chain.push({ ...slot, configured: true, available: false, reason: 'Invalid user reference' });
      continue;
    }
    if (slot.role !== 'primary' && !availability.backupEligible) {
      chain.push({
        ...slot,
        configured: true,
        userName: availability.userName,
        available: false,
        reason: 'Not backup eligible',
      });
      continue;
    }
    const verdict = isAvailableFor(availability, category);
    chain.push({
      ...slot,
      configured: true,
      userName: availability.userName,
      attendanceStatus: availability.attendanceStatus,
      operationalState: availability.operationalState,
      available: verdict.available,
      reason: verdict.reason,
    });
    if (verdict.available && !owner) {
      owner = { userUuid: slot.userUuid, userName: availability.userName, role: slot.role };
    }
  }

  return {
    category,
    chain,
    currentOwner: owner,
    ownerRole: owner ? owner.role : 'escalated',
    escalated: !owner,
    // A task inherited by a backup — what the covering user needs to see.
    transferred: !!owner && owner.role !== 'primary',
  };
};

const taskIsOverdue = (task, now = new Date()) => {
  if (isDone(task.Status)) return false;
  if (!task.Deadline) return false;
  return new Date(task.Deadline).getTime() < now.getTime();
};

/** Load everything the ownership resolver needs, once. */
const loadResolutionContext = async ({ date = new Date() } = {}) => {
  const [storeSettings, users, responsibilities] = await Promise.all([
    getStoreSettings(),
    User.find({}).select('-Password').lean(),
    Responsibility.find({}).lean(),
  ]);
  const availabilityMap = await buildAvailabilityMap(users, { date, storeSettings });
  const responsibilityByUuid = new Map(
    responsibilities.map((item) => [item.responsibility_uuid, item])
  );
  return { storeSettings, users, responsibilities, availabilityMap, responsibilityByUuid };
};

/** Decorate a set of tasks with their live ownership. */
const decorateTasks = (tasks, context, now = new Date()) =>
  tasks.map((task) => {
    const ownership = resolveTaskOwnership(task, context.availabilityMap, context.responsibilityByUuid);
    return {
      ...task,
      ...ownership,
      overdue: taskIsOverdue(task, now),
      responsibilityName: task.responsibility_uuid
        ? context.responsibilityByUuid.get(task.responsibility_uuid)?.name || ''
        : '',
    };
  });

/**
 * Persist the computed runtime owner back onto open tasks.
 *
 * Only the runtime columns are written — primary/backup fields are never
 * touched, so the configured chain is intact when the primary returns.
 */
const syncRuntimeOwners = async (decorated) => {
  const operations = decorated
    .filter((task) => {
      const ownerUuid = task.currentOwner?.userUuid || '';
      const ownerRole = task.currentOwner ? task.ownerRole : 'escalated';
      return task.currentOwnerUuid !== ownerUuid
        || task.ownerRole !== ownerRole
        || task.escalated !== !task.currentOwner;
    })
    .map((task) => ({
      updateOne: {
        filter: { _id: task._id },
        update: {
          $set: {
            currentOwnerUuid: task.currentOwner?.userUuid || '',
            ownerRole: task.currentOwner ? task.ownerRole : 'escalated',
            escalated: !task.currentOwner,
          },
        },
      },
    }));

  if (!operations.length) return 0;
  const result = await Usertasks.bulkWrite(operations, { ordered: false });
  return result?.modifiedCount || 0;
};

/** Open (not-done) operations tasks, ownership resolved. */
const getOpenTasks = async (context, { date = new Date() } = {}) => {
  const tasks = await Usertasks.find({
    Status: { $nin: ['Completed', 'Done', 'completed', 'done', 'Closed', 'closed'] },
  }).lean();
  const decorated = decorateTasks(tasks, context, date);
  await syncRuntimeOwners(decorated);
  return decorated;
};

/**
 * §15 — TEAM STATUS: one row per user, everything read from the database.
 */
const getTeamStatus = async ({ date = new Date() } = {}) => {
  const context = await loadResolutionContext({ date });
  const openTasks = await getOpenTasks(context, { date });
  const responsibilityViews = context.responsibilities
    .filter((item) => item.isActive !== false)
    .map((item) => resolveResponsibilityOwner(item, context.availabilityMap));

  const rows = context.users
    .filter((user) => user.operations?.active !== false)
    .map((user) => {
      const availability = context.availabilityMap.get(user.User_uuid) || {};
      const mine = openTasks.filter((task) => task.currentOwner?.userUuid === user.User_uuid);
      const owned = responsibilityViews.filter(
        (view) => view.currentOwner?.userUuid === user.User_uuid
      );
      return {
        User_uuid: user.User_uuid,
        User_name: user.User_name,
        name: user.name || user.User_name,
        User_group: user.User_group,
        priority: availability.priority || '',
        roleTitle: availability.roleTitle || '',
        department: availability.department || '',
        attendanceStatus: availability.attendanceStatus || 'Absent',
        attendanceDetail: availability.attendanceDetail || '',
        inTime: availability.inTime || '',
        outTime: availability.outTime || '',
        operationalState: availability.operationalState || 'Available',
        currentTask: availability.currentTask || '',
        pending: mine.length,
        overdue: mine.filter((task) => task.overdue).length,
        transferredIn: mine.filter((task) => task.transferred).length,
        responsibilitiesNow: owned.map((view) => view.name),
      };
    })
    // Priority order first (P1, P2, …), unprioritised users last — the sort is
    // by the code's own ordering, not by any fixed name list.
    .sort((a, b) => {
      if (a.priority && b.priority) return a.priority.localeCompare(b.priority, undefined, { numeric: true });
      if (a.priority) return -1;
      if (b.priority) return 1;
      return String(a.User_name).localeCompare(String(b.User_name));
    });

  return {
    rows,
    responsibilities: responsibilityViews,
    escalated: responsibilityViews.filter((view) => view.escalated),
    unownedTasks: openTasks.filter((task) => task.escalated),
  };
};

/**
 * §16/§17 — MY TASKS, split into the four buckets the spec asks for.
 */
const getMyTasks = async ({ userUuid, date = new Date() } = {}) => {
  const context = await loadResolutionContext({ date });
  const openTasks = await getOpenTasks(context, { date });
  const now = new Date(date);

  const isPrimary = (task) => {
    const responsibility = task.responsibility_uuid
      ? context.responsibilityByUuid.get(task.responsibility_uuid)
      : null;
    return (task.primaryUserUuid || responsibility?.primaryUserUuid || '') === userUuid;
  };
  const isBackup = (task) => {
    const responsibility = task.responsibility_uuid
      ? context.responsibilityByUuid.get(task.responsibility_uuid)
      : null;
    const b1 = task.backup1UserUuid || responsibility?.backup1UserUuid || '';
    const b2 = task.backup2UserUuid || responsibility?.backup2UserUuid || '';
    return b1 === userUuid || b2 === userUuid;
  };

  const ownedNow = openTasks.filter((task) => task.currentOwner?.userUuid === userUuid);

  // Tasks I own only because someone above me in the chain is unavailable.
  const coveringForOthers = ownedNow.filter((task) => task.transferred);
  // Tasks configured to me that someone else is covering while I'm away.
  const coveredByOthers = openTasks.filter(
    (task) => isPrimary(task) && task.currentOwner && task.currentOwner.userUuid !== userUuid
  );

  const dueSoonWindowMs = 4 * 60 * 60 * 1000;
  const bucket = (task) => {
    if (isDone(task.Status)) return 'completed';
    if (task.overdue) return 'overdue';
    const status = String(task.Status || '').toLowerCase();
    if (status.includes('progress')) return 'in_progress';
    if (status.includes('wait') || status.includes('hold')) return 'waiting';
    if (task.Deadline && new Date(task.Deadline).getTime() - now.getTime() <= dueSoonWindowMs) {
      return 'due_soon';
    }
    return 'in_progress';
  };

  const buckets = { overdue: [], due_soon: [], in_progress: [], waiting: [], completed: [] };
  for (const task of ownedNow) buckets[bucket(task)].push(task);

  const responsibilityViews = context.responsibilities
    .filter((item) => item.isActive !== false)
    .map((item) => resolveResponsibilityOwner(item, context.availabilityMap));

  return {
    availability: context.availabilityMap.get(userUuid) || null,
    buckets,
    primaryTasks: ownedNow.filter(isPrimary),
    backupTasks: openTasks.filter((task) => isBackup(task)),
    transferredToMe: coveringForOthers,
    coveredForMe: coveredByOthers,
    myResponsibilities: {
      configuredPrimary: context.responsibilities.filter((item) => item.primaryUserUuid === userUuid),
      configuredBackup: context.responsibilities.filter(
        (item) => item.backup1UserUuid === userUuid || item.backup2UserUuid === userUuid
      ),
      activeNow: responsibilityViews.filter((view) => view.currentOwner?.userUuid === userUuid),
    },
  };
};

/**
 * §11/§19 — the escalation sweep. Returns what has no available owner so the
 * caller (route or scheduler) can notify management. Nothing is silently
 * dropped and nobody is randomly assigned.
 */
const getEscalations = async ({ date = new Date() } = {}) => {
  const context = await loadResolutionContext({ date });
  const openTasks = await getOpenTasks(context, { date });
  const responsibilityViews = context.responsibilities
    .filter((item) => item.isActive !== false)
    .map((item) => resolveResponsibilityOwner(item, context.availabilityMap));

  const escalatedResponsibilities = responsibilityViews.filter((view) => view.escalated);
  const escalatedTasks = openTasks.filter((task) => task.escalated);

  const targets =
    escalatedResponsibilities.length || escalatedTasks.length
      ? await resolveEscalationTargets(context.storeSettings)
      : [];

  return { escalatedResponsibilities, escalatedTasks, escalationTargets: targets };
};

/**
 * §33 — the ownership chain for an automation hook (an order stage, or a named
 * lifecycle hook), so existing order automation can assign the task to the
 * configured person instead of picking the first user whose group matches a
 * regex. Returns null when no responsibility is mapped, which is the signal to
 * leave the existing behaviour alone.
 */
const resolveOwnerForHook = async (hookKey) => {
  if (!hookKey) return null;
  const mapping = await getStageResponsibilities();
  const responsibilityUuid = mapping[hookKey];
  if (!responsibilityUuid) return null;

  const responsibility = await Responsibility.findOne({
    responsibility_uuid: responsibilityUuid,
    isActive: true,
  }).lean();
  if (!responsibility) return null;

  const users = await User.find({}).select('-Password').lean();
  const availabilityMap = await buildAvailabilityMap(users);
  const view = resolveResponsibilityOwner(responsibility, availabilityMap);

  return {
    responsibility_uuid: responsibility.responsibility_uuid,
    category: responsibility.category || 'general',
    primaryUserUuid: responsibility.primaryUserUuid || '',
    backup1UserUuid: responsibility.backup1UserUuid || '',
    backup2UserUuid: responsibility.backup2UserUuid || '',
    currentOwnerUuid: view.currentOwner?.userUuid || '',
    currentOwnerName: view.currentOwner?.userName || '',
    ownerRole: view.currentOwner ? view.currentOwner.role : 'escalated',
    escalated: view.escalated,
  };
};

/**
 * §22–24 — materialise today's scheduled SOP checklist items as Usertasks so
 * they appear in My Tasks with the same ownership rules as everything else.
 * Idempotent: re-running for the same day updates rather than duplicates.
 */
const generateDailyTasks = async ({ date = new Date(), actorName = 'system' } = {}) => {
  const context = await loadResolutionContext({ date });
  const dayDate = getDateOnly(date);
  const weekDay = dayDate.getDay();

  const sopTasks = await SOPTask.find({ isActive: true, frequency: 'daily' })
    .sort({ sortOrder: 1 })
    .lean();

  const scheduled = sopTasks.filter((task) => {
    const days = Array.isArray(task.weekDays) && task.weekDays.length
      ? task.weekDays
      : context.storeSettings.workingDays;
    return days.includes(weekDay);
  });

  const existing = await Usertasks.find({
    sourceSopUuid: { $in: scheduled.map((task) => task.sop_uuid) },
    Date: dayDate,
  }).lean();
  const existingBySop = new Map(existing.map((task) => [task.sourceSopUuid, task]));

  let lastNumber =
    (await Usertasks.findOne().sort({ Usertask_Number: -1 }).select('Usertask_Number').lean())
      ?.Usertask_Number || 0;

  const created = [];
  const updated = [];

  for (const sop of scheduled) {
    const responsibility = sop.responsibility_uuid
      ? context.responsibilityByUuid.get(sop.responsibility_uuid)
      : null;

    const primaryUserUuid = sop.primaryUserUuid || responsibility?.primaryUserUuid || '';
    const backup1UserUuid = sop.backup1UserUuid || responsibility?.backup1UserUuid || '';
    const backup2UserUuid = sop.backup2UserUuid || responsibility?.backup2UserUuid || '';

    // Group-owned SOP items with no user-level chain stay in the existing SOP
    // screen; they are not turned into user tasks with nobody to own them.
    if (!primaryUserUuid && !backup1UserUuid && !backup2UserUuid) continue;

    const ownership = resolveTaskOwnership(
      { primaryUserUuid, backup1UserUuid, backup2UserUuid, category: sop.category || responsibility?.category },
      context.availabilityMap,
      context.responsibilityByUuid
    );

    const deadline = new Date(dayDate);
    const [hours, minutes] = String(sop.scheduledTime || context.storeSettings.closingTime)
      .split(':')
      .map((part) => Number(part));
    deadline.setHours(Number.isFinite(hours) ? hours : 19, Number.isFinite(minutes) ? minutes : 30, 0, 0);

    const ownerName =
      ownership.currentOwner?.userName
      || context.availabilityMap.get(primaryUserUuid)?.userName
      || '';

    const shared = {
      User: ownerName,
      AssignedBy: actorName,
      Usertask_name: sop.title,
      Deadline: deadline,
      Remark: sop.description || sop.section || sop.title,
      responsibility_uuid: sop.responsibility_uuid || '',
      category: sop.category || responsibility?.category || 'general',
      primaryUserUuid,
      backup1UserUuid,
      backup2UserUuid,
      currentOwnerUuid: ownership.currentOwner?.userUuid || '',
      ownerRole: ownership.currentOwner ? ownership.ownerRole : 'escalated',
      escalated: ownership.escalated,
      scheduledTime: sop.scheduledTime || '',
      durationMinutes: sop.durationMinutes || 0,
      isRequired: !sop.isSkippable,
      sourceSopUuid: sop.sop_uuid,
    };

    const already = existingBySop.get(sop.sop_uuid);
    if (already) {
      if (isDone(already.Status)) continue;
      await Usertasks.updateOne({ _id: already._id }, { $set: shared });
      updated.push(sop.sop_uuid);
      continue;
    }

    lastNumber += 1;
    await Usertasks.create({
      ...shared,
      Usertask_uuid: randomUUID(),
      Usertask_Number: lastNumber,
      Date: dayDate,
      Time: sop.scheduledTime || context.storeSettings.openingTime,
      Status: 'Pending',
    });
    created.push(sop.sop_uuid);
  }

  return { date: dayDate, created: created.length, updated: updated.length, considered: scheduled.length };
};

/**
 * §25 — TEAM DAILY REPORT. Attendance, task and responsibility figures for a
 * date; order/production/financial figures already have their own reports
 * (services/businessReportsService.js) and are not duplicated here.
 */
const getDailyReport = async ({ date = new Date() } = {}) => {
  const context = await loadResolutionContext({ date });
  const dayDate = getDateOnly(date);

  const activeUsers = context.users.filter((user) => user.operations?.active !== false);
  const attendance = { present: 0, absent: 0, late: 0, leave: 0, halfDay: 0, weeklyOff: 0, dayClosed: 0 };
  for (const user of activeUsers) {
    const status = context.availabilityMap.get(user.User_uuid)?.attendanceStatus;
    if (status === 'Present') attendance.present += 1;
    else if (status === 'Late') { attendance.late += 1; attendance.present += 1; }
    else if (status === 'Half Day') { attendance.halfDay += 1; attendance.present += 1; }
    else if (status === 'On Leave') attendance.leave += 1;
    else if (status === 'Weekly Off') attendance.weeklyOff += 1;
    else if (status === 'Day Closed') attendance.dayClosed += 1;
    else if (status === 'On Break') attendance.present += 1;
    else attendance.absent += 1;
  }

  const dayTasks = await Usertasks.find({ Date: dayDate }).lean();
  const decorated = decorateTasks(dayTasks, context, date);
  const tasks = {
    total: decorated.length,
    completed: decorated.filter((task) => isDone(task.Status)).length,
    pending: decorated.filter((task) => !isDone(task.Status)).length,
    overdue: decorated.filter((task) => task.overdue).length,
    escalated: decorated.filter((task) => task.escalated).length,
    reassigned: decorated.filter((task) => task.transferred).length,
  };

  const responsibilityViews = context.responsibilities
    .filter((item) => item.isActive !== false)
    .map((item) => resolveResponsibilityOwner(item, context.availabilityMap));

  const completions = await SOPCompletion.find({ date: dayDate }).lean();

  return {
    date: dayDate,
    attendance,
    tasks,
    responsibilities: {
      total: responsibilityViews.length,
      coveredByPrimary: responsibilityViews.filter((view) => view.currentOwner?.role === 'primary').length,
      coveredByBackup: responsibilityViews.filter(
        (view) => view.currentOwner && view.currentOwner.role !== 'primary'
      ).length,
      escalated: responsibilityViews.filter((view) => view.escalated).length,
      escalatedList: responsibilityViews.filter((view) => view.escalated).map((view) => view.name),
    },
    checklist: {
      completed: completions.filter((row) => !row.skipped).length,
      skipped: completions.filter((row) => row.skipped).length,
    },
    reassignedTasks: decorated
      .filter((task) => task.transferred)
      .map((task) => ({
        task: task.Usertask_name,
        configuredPrimary: task.primaryUserUuid,
        currentOwner: task.currentOwner?.userName || '',
        role: task.ownerRole,
      })),
  };
};

module.exports = {
  isDone,
  taskIsOverdue,
  resolveTaskOwnership,
  loadResolutionContext,
  decorateTasks,
  syncRuntimeOwners,
  getOpenTasks,
  getTeamStatus,
  getMyTasks,
  getEscalations,
  resolveOwnerForHook,
  generateDailyTasks,
  getDailyReport,
};
