import { OWNERSHIP_SLOTS } from '../constants/operations';

/**
 * Client-side checks on a responsibility's ownership chain.
 *
 * The API enforces these too and remains the authority
 * (`services/responsibilityValidation.js`); this exists so the person editing
 * a chain is told what is wrong *while the dialog is still open and their
 * selections are still on screen*, rather than after a round trip that returns
 * one message about a form they can no longer see.
 *
 * Deliberately only the rules that can be judged from the form itself. Whether
 * a user is deactivated, or exists at all, is the server's to answer — the
 * picker already offers only active users, and duplicating that check here
 * would mean maintaining a second copy of a rule that can go stale.
 */

const BACKUP_SLOTS = OWNERSHIP_SLOTS.filter((slot) => slot.role !== 'primary');

export function validateChainSelection(form = {}, nameByUuid = new Map()) {
  const errors = [];
  const nameOf = (uuid) => nameByUuid.get(uuid) || 'That user';
  const valueAt = (field) => String(form[field] || '').trim();

  const primary = valueAt('primaryUserUuid');

  for (const slot of BACKUP_SLOTS) {
    if (primary && valueAt(slot.field) === primary) {
      errors.push(
        `${slot.label} is the same person as the Primary (${nameOf(primary)}). ` +
        'A backup covers the primary being unavailable, so naming the same ' +
        'person leaves this responsibility uncovered.'
      );
    }
  }

  const seen = new Map();
  for (const slot of BACKUP_SLOTS) {
    const uuid = valueAt(slot.field);
    if (!uuid) continue;
    if (seen.has(uuid)) {
      errors.push(
        `${nameOf(uuid)} appears in both ${seen.get(uuid)} and ${slot.label}. ` +
        'Each step of the chain must be a different person.'
      );
    } else {
      seen.set(uuid, slot.label);
    }
  }

  return errors;
}

/**
 * The uuids already used elsewhere in the chain, so a picker can grey them out
 * instead of letting someone choose a clash and only then be told.
 */
export function uuidsUsedElsewhere(form = {}, currentField = '') {
  return new Set(
    OWNERSHIP_SLOTS
      .filter((slot) => slot.field !== currentField)
      .map((slot) => String(form[slot.field] || '').trim())
      .filter(Boolean)
  );
}
