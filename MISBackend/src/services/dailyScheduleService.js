const { AppSetting } = require('../repositories/appSetting');
const logger = require('../utils/logger');

/**
 * Runs once-a-day jobs on a host that does not stay up.
 *
 * The schedulers used to fire on an exact wall-clock match — `hour === 9 &&
 * minute === 0` — with the "already ran today" marker held in a module
 * variable. Both halves fail on a free-tier host that sleeps:
 *
 *   A sleeping or restarting process is not ticking at 09:00, so the one
 *   minute the job was allowed to run passes unobserved and that day's
 *   digests, owner summary and attendance check-in simply never happen. No
 *   error, no retry, nothing in the log to notice.
 *
 *   The in-memory marker dies with the process. A restart inside the matching
 *   minute re-fires a job that already ran — a second digest to every
 *   employee — and a restart after it leaves no record that it ran at all.
 *
 * So the question this asks is not "is it 09:00 right now" but "is today's
 * 09:00 behind us, and has this job not run yet today", with the answer to
 * the second half kept in Mongo where a restart cannot lose it. A process
 * that wakes at 09:40 still sends the morning digest; one that wakes at 09:00
 * having already sent it does not send it twice.
 *
 * Catch-up is bounded per job. A morning digest delivered a little late is
 * useful; the same digest delivered at 23:00 is noise, and an attendance
 * check-in asking "are you coming in today?" after the day is over is worse
 * than silence. Past its window a job is marked as run and skipped, so it
 * does not queue up behind the next one.
 */

const SETTING_KEY = 'scheduler_last_runs';
const DEFAULT_CATCH_UP_MINUTES = 4 * 60;

/** Wall-clock time in Asia/Kolkata, which is what the schedules are written in. */
const istNow = (now = new Date()) => new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));

/** The day a run belongs to, as YYYY-MM-DD in IST. */
const dayKeyOf = (ist) => {
  const year = ist.getFullYear();
  const month = String(ist.getMonth() + 1).padStart(2, '0');
  const day = String(ist.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const minutesSinceMidnight = (ist) => ist.getHours() * 60 + ist.getMinutes();

const loadLastRuns = async () => {
  const stored = await AppSetting.getSetting(SETTING_KEY, null);
  return stored && typeof stored === 'object' ? { ...stored } : {};
};

const saveLastRuns = (lastRuns) =>
  AppSetting.upsertSetting({
    key: SETTING_KEY,
    value: lastRuns,
    description: 'Last completed run day (IST) per scheduled job',
  });

/**
 * Claim today's run of one job.
 *
 * Every job's marker lives in a single settings object that was loaded whole,
 * mutated and written back whole. Jobs are driven by separate timers, so two
 * saves overlapping meant one job's marker overwrote another's — and the job
 * whose marker was lost ran a second time.
 *
 * The claim is one conditional update touching only that job's field: it
 * succeeds for exactly one caller, and cannot disturb any other job's marker.
 *
 * @returns {Promise<boolean>} true if this caller may run the job
 */
const claimJobForToday = async (jobKey, today) => {
  const field = `value.${jobKey}`;

  // The settings document must exist before a field-level update can match it.
  await AppSetting.updateOne(
    { key: SETTING_KEY },
    {
      $setOnInsert: {
        key: SETTING_KEY,
        value: {},
        description: 'Last completed run day (IST) per scheduled job',
      },
    },
    { upsert: true }
  );

  const result = await AppSetting.updateOne(
    { key: SETTING_KEY, [field]: { $ne: today } },
    { $set: { [field]: today } }
  );

  return Number(result.modifiedCount || result.nModified || 0) === 1;
};

/**
 * Decides what a job should do right now.
 *
 *   'run'   — its time has passed today, it has not run, and it is still
 *             inside its catch-up window.
 *   'skip'  — nothing to do: not due yet, or already run today.
 *   'stale' — its time passed today but the catch-up window has closed. The
 *             caller records it as run without sending, so tomorrow starts
 *             clean.
 */
const decide = ({ ist, hour, minute, lastRunDay, catchUpMinutes = DEFAULT_CATCH_UP_MINUTES }) => {
  const today = dayKeyOf(ist);
  if (lastRunDay === today) return 'skip';

  const dueAt = hour * 60 + minute;
  const nowAt = minutesSinceMidnight(ist);
  if (nowAt < dueAt) return 'skip';

  return nowAt - dueAt <= catchUpMinutes ? 'run' : 'stale';
};

/**
 * Runs every job that is due, newest state persisted as it goes.
 *
 * A job is marked as run BEFORE its work starts, not after. A digest that
 * throws halfway has already messaged some of its recipients, so retrying it
 * on the next tick — sixty seconds later, all day — would message them again
 * and again. One attempt per day, and a failure is a log line to act on.
 */
const runDueJobs = async (jobs, { now = new Date() } = {}) => {
  const ist = istNow(now);
  const today = dayKeyOf(ist);

  let lastRuns;
  try {
    lastRuns = await loadLastRuns();
  } catch (error) {
    // Without the marker there is no safe way to tell "not yet today" from
    // "already sent", and guessing wrong means duplicate messages to every
    // employee. Skipping this tick costs at most a minute.
    logger.error({ err: error.message }, '[scheduler] could not read last-run markers; skipping this tick');
    return [];
  }

  const outcomes = [];

  for (const job of jobs) {
    const verdict = decide({ ist, ...job, lastRunDay: lastRuns[job.key] });
    if (verdict === 'skip') continue;

    // Claim before doing anything. Whoever wins the claim owns today's run;
    // a concurrent timer that loses simply moves on.
    let claimed;
    try {
      claimed = await claimJobForToday(job.key, today);
    } catch (error) {
      logger.error({ job: job.key, err: error.message }, '[scheduler] could not claim daily job; skipping');
      outcomes.push({ key: job.key, ran: false, reason: 'claim_failed', error: error.message });
      continue;
    }

    if (!claimed) {
      // Someone else already has today: not an error.
      outcomes.push({ key: job.key, ran: false, reason: 'already_claimed' });
      continue;
    }

    if (verdict === 'stale') {
      logger.warn({ job: job.key, day: today }, '[scheduler] catch-up window closed; skipping today');
      outcomes.push({ key: job.key, ran: false, reason: 'stale' });
      continue;
    }

    const lateBy = minutesSinceMidnight(ist) - (job.hour * 60 + job.minute);
    try {
      logger.info({ job: job.key, day: today, lateByMinutes: lateBy }, '[scheduler] running daily job');
      await job.run();
      outcomes.push({ key: job.key, ran: true, lateByMinutes: lateBy });
    } catch (error) {
      // The claim is deliberately NOT released. These jobs message every
      // employee, and a job that failed partway has already sent to some of
      // them; retrying would message those people twice. At-most-once is the
      // safer default here, so a failure is surfaced loudly and left for a
      // person to decide about.
      logger.error(
        { job: job.key, day: today, err: error.message },
        '[scheduler] daily job failed after claiming today — it will NOT be retried automatically'
      );
      outcomes.push({ key: job.key, ran: false, reason: 'error', error: error.message });
    }
  }

  return outcomes;
};

module.exports = {
  SETTING_KEY,
  DEFAULT_CATCH_UP_MINUTES,
  istNow,
  dayKeyOf,
  decide,
  runDueJobs,
};
