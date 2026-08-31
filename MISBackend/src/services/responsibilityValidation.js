// Save-time validation for operations configuration.
//
// `validateConfiguration` in operationsService reports on the whole
// configuration after the fact — it is the "what is wrong right now" view
// behind GET /api/operations/validate, and it deliberately warns rather than
// blocks. This module is the other half: the checks that refuse a save, so a
// chain that could never resolve is not written in the first place.
//
// Two rules shape everything here:
//
//   1. **Only new problems block.** A record saved before these checks existed
//      must stay editable — otherwise fixing a typo on a responsibility whose
//      backup left the company becomes impossible, and the only way to repair
//      the data is a mongo shell. So a slot is validated when its value
//      changes; an untouched slot is left alone however wrong it is, and
//      `validateConfiguration` keeps reporting it.
//
//   2. **Nothing here writes or migrates.** These are pure functions over the
//      submitted payload and the current user list.

const { OWNERSHIP_SLOTS, BACKUP_SLOTS } = require('../constants/ownership');

/** `HH:MM` on a 24-hour clock, or `H:MM AM/PM`. Same shapes the attendance
 *  parser accepts, so a saved working hour is one the resolver can read. */
const CLOCK_PATTERN = /^(\d{1,2}):(\d{2})\s*([AaPp][Mm])?$/;

/** Minutes since midnight, or null when the text is not a clock time. */
const parseClock = (value) => {
  const match = CLOCK_PATTERN.exec(String(value || '').trim());
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const meridiem = (match[3] || '').toLowerCase();
  if (minutes > 59) return null;
  if (meridiem === 'pm' && hours < 12) hours += 12;
  if (meridiem === 'am' && hours === 12) hours = 0;
  if (hours > 23) return null;
  return hours * 60 + minutes;
};

/**
 * Validate one responsibility's ownership chain.
 *
 * `submitted` is the incoming chain, `existing` the stored record (absent when
 * creating). `operators` is a Map of uuid -> { name, active, isVirtual },
 * covering both real users and virtual operators such as the AI assistant.
 *
 * Returns a list of message strings; empty means the save may proceed.
 */
const validateResponsibilityChain = ({ submitted = {}, existing = null, operators = new Map() }) => {
  const errors = [];

  // Which slots are actually being set to something new. On create, every
  // populated slot is new; on update, only the ones whose value changed.
  const isNewValue = (field) => {
    if (submitted[field] === undefined) return false;
    const next = String(submitted[field] || '').trim();
    if (!next) return false; // clearing a slot is always allowed
    const prev = String(existing?.[field] || '').trim();
    return next !== prev;
  };

  // ── Unknown or deactivated operators, for newly filled slots only ────────
  for (const slot of OWNERSHIP_SLOTS) {
    if (!isNewValue(slot.field)) continue;
    const uuid = String(submitted[slot.field]).trim();
    const operator = operators.get(uuid);

    if (!operator) {
      errors.push(`${slot.label} refers to a user that does not exist.`);
      continue;
    }
    if (operator.active === false) {
      errors.push(
        `${slot.label} (${operator.name}) is deactivated and cannot be newly assigned. ` +
        'Reactivate the user first, or choose someone else.'
      );
    }
    // A backup slot is walked only when the holder is backup-eligible, so
    // filling one with an ineligible user configures a step that can never be
    // taken. The primary slot is a direct assignment and ignores that flag.
    if (slot.role !== 'primary' && operator.backupEligible === false) {
      errors.push(
        `${slot.label} (${operator.name}) is not marked backup eligible, so this ` +
        'slot would always be skipped. Mark them eligible or choose someone else.'
      );
    }
  }

  // ── Duplicates within the chain ─────────────────────────────────────────
  // Read the effective chain: submitted values win, stored values fill the
  // rest, so adding a backup that duplicates an untouched primary is caught.
  const effective = {};
  for (const slot of OWNERSHIP_SLOTS) {
    const value =
      submitted[slot.field] !== undefined ? submitted[slot.field] : existing?.[slot.field];
    effective[slot.field] = String(value || '').trim();
  }

  const primary = effective.primaryUserUuid;
  const touched = OWNERSHIP_SLOTS.some((slot) => isNewValue(slot.field));

  if (touched) {
    for (const slot of BACKUP_SLOTS) {
      if (primary && effective[slot.field] === primary) {
        const who = operators.get(primary)?.name || 'that user';
        errors.push(
          `${slot.label} is the same person as the Primary (${who}). ` +
          'A backup exists to cover the primary being unavailable, so naming ' +
          'the same person leaves the responsibility uncovered.'
        );
      }
    }

    const seen = new Map();
    for (const slot of BACKUP_SLOTS) {
      const uuid = effective[slot.field];
      if (!uuid) continue;
      if (seen.has(uuid)) {
        const who = operators.get(uuid)?.name || 'The same user';
        errors.push(
          `${who} appears in both ${seen.get(uuid)} and ${slot.label}. ` +
          'Each step of the chain must be a different person.'
        );
      } else {
        seen.set(uuid, slot.label);
      }
    }
  }

  return errors;
};

/**
 * Validate the working-hours and working-days part of a user's operations
 * profile. Only submitted fields are checked, so a partial update stays partial.
 */
const validateWorkingHours = (payload = {}) => {
  const errors = [];
  const times = {};

  for (const field of ['startTime', 'endTime', 'breakStart', 'breakEnd']) {
    if (payload[field] === undefined) continue;
    const raw = String(payload[field] || '').trim();
    if (!raw) { times[field] = null; continue; } // clearing is allowed
    const minutes = parseClock(raw);
    if (minutes === null) {
      errors.push(`${field} must be a time such as 09:30 or 6:00 PM (got "${raw}").`);
      continue;
    }
    times[field] = minutes;
  }

  // Only compare when both ends of a pair were supplied and both parsed.
  if (times.startTime != null && times.endTime != null && times.endTime <= times.startTime) {
    errors.push('endTime must be later than startTime.');
  }
  if (times.breakStart != null && times.breakEnd != null && times.breakEnd <= times.breakStart) {
    errors.push('breakEnd must be later than breakStart.');
  }

  if (payload.workingDays !== undefined) {
    if (!Array.isArray(payload.workingDays)) {
      errors.push('workingDays must be a list of day numbers (0 = Sunday .. 6 = Saturday).');
    } else {
      const invalid = payload.workingDays.filter(
        (day) => !Number.isInteger(Number(day)) || Number(day) < 0 || Number(day) > 6
      );
      if (invalid.length) {
        errors.push(`workingDays contains invalid day numbers: ${invalid.join(', ')} (expected 0-6).`);
      }
    }
  }

  return errors;
};

/**
 * Validate a submitted priority-levels catalogue.
 *
 * The catalogue itself is editable from Settings → Operations — P1..P4 are not
 * compiled in, and this does not impose them. What it rejects is a catalogue
 * that cannot work: a level with no code, or two levels sharing one.
 */
const validatePriorityLevels = (levels) => {
  const errors = [];
  if (!Array.isArray(levels)) return ['Priority levels must be a list.'];

  const seen = new Set();
  levels.forEach((level, index) => {
    const code = String(level?.code || '').trim();
    if (!code) {
      errors.push(`Priority level ${index + 1} has no code.`);
      return;
    }
    if (seen.has(code.toUpperCase())) {
      errors.push(`Priority code "${code}" is listed more than once.`);
    }
    seen.add(code.toUpperCase());
  });

  return errors;
};

module.exports = {
  validateResponsibilityChain,
  validateWorkingHours,
  validatePriorityLevels,
  parseClock,
};
