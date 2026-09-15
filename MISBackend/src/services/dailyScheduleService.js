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
  let dirty = false;

  for (const job of jobs) {
    const verdict = decide({ ist, ...job, lastRunDay: lastRuns[job.key] });
    if (verdict === 'skip') continue;

    lastRuns[job.key] = today;
    dirty = true;

    if (verdict === 'stale') {
      logger.warn({ job: job.key, day: today }, '[scheduler] catch-up window closed; skipping today');
      outcomes.push({ key: job.key, ran: false, reason: 'stale' });
      continue;
    }

    const lateBy = minutesSinceMidnight(ist) - (job.hour * 60 + job.minute);
    try {
      await saveLastRuns(lastRuns);
      dirty = false;
      logger.info({ job: job.key, day: today, lateByMinutes: lateBy }, '[scheduler] running daily job');
      await job.run();
      outcomes.push({ key: job.key, ran: true, lateByMinutes: lateBy });
    } catch (error) {
      logger.error({ job: job.key, err: error.message }, '[scheduler] daily job failed');
      outcomes.push({ key: job.key, ran: false, reason: 'error', error: error.message });
    }
  }

  if (dirty) {
    try {
      await saveLastRuns(lastRuns);
    } catch (error) {
      logger.error({ err: error.message }, '[scheduler] could not persist last-run markers');
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
