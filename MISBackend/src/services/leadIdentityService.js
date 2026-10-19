
const PHONE_PREFIX = 'phone:';
const INSTAGRAM_PREFIX = 'instagram:';

function normalizePhone(value) {
  const raw = String(value || '').trim();
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10 && /^[6-9]/.test(digits)) return digits;
  if (digits.length === 12 && digits.startsWith('91') && /^[6-9]/.test(digits.slice(2))) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0') && /^[6-9]/.test(digits.slice(1))) return digits.slice(1);
  if (raw.startsWith('+') && digits.length >= 10 && digits.length <= 15) return '+' + digits;
  return '';
}

function normalizedEvent(raw) {
  const source = String(raw.source || '').toLowerCase();
  if (!['whatsapp', 'instagram', 'call'].includes(source)) return null;
  const phone = normalizePhone(raw.phone);
  const instagramId = String(raw.instagramId || '').trim();
  const id = String(raw.id || '').trim();
  if (!phone && !instagramId) return null;
  const parsed = new Date(raw.at || 0);
  const at = Number.isNaN(parsed.getTime()) ? new Date(0) : parsed;
  return {
    id: id || `${source}:${phone || instagramId}:${at.getTime()}`,
    source,
    phone,
    instagramId,
    instagramHandle: String(raw.instagramHandle || '').replace(/^@/, '').trim().slice(0,80),
    name: String(raw.name || '').trim().slice(0,120),
    at,
    detail: String(raw.detail || '').trim().slice(0,320),
  };
}

function groupLeadEvents(rawEvents, instagramPhoneLinks = {}) {
  const parent = new Map();
  const root = (key) => {
    if (!parent.has(key)) parent.set(key, key);
    const prev = parent.get(key);
    if (prev !== key) parent.set(key, root(prev));
    return parent.get(key);
  };
  const union = (left, right) => {
    const a = root(left); const b = root(right);
    if (a !== b) parent.set(b, a);
  };

  // Link only deterministic identity evidence: identical canonical phone or
  // a verified manual Instagram-account-to-phone link. Never match by name.
  for (const [igId, number] of Object.entries(instagramPhoneLinks || {})) {
    const phone = normalizePhone(number);
    if (igId && phone) union(INSTAGRAM_PREFIX + igId, PHONE_PREFIX + phone);
  }

  const events = [];
  const seenIds = new Set();
  for (const raw of rawEvents || []) {
    const event = normalizedEvent(raw);
    if (!event || seenIds.has(event.id)) continue;
    seenIds.add(event.id);
    if (event.phone && event.instagramId) union(PHONE_PREFIX + event.phone, INSTAGRAM_PREFIX + event.instagramId);
    root(event.phone ? PHONE_PREFIX + event.phone : INSTAGRAM_PREFIX + event.instagramId);
    events.push(event);
  }

  events.sort((a, b) => a.at.getTime() - b.at.getTime() || a.id.localeCompare(b.id));
  const groups = new Map();
  for (const event of events) {
    const key = root(event.phone ? PHONE_PREFIX + event.phone : INSTAGRAM_PREFIX + event.instagramId);
    if (!groups.has(key)) {
      groups.set(key, {
        id: key, name: '', phone: '', instagramId: '', instagramHandle: '',
        sources: [], firstContact: null, lastContact: null, interactions: 0,
        history: [],
      });
    }
    const lead = groups.get(key);
    if (!lead.phone && event.phone) lead.phone = event.phone;
    if (!lead.instagramId && event.instagramId) lead.instagramId = event.instagramId;
    if (!lead.instagramHandle && event.instagramHandle) lead.instagramHandle = event.instagramHandle;
    if (!lead.name && event.name) lead.name = event.name;
    if (!lead.sources.includes(event.source)) lead.sources.push(event.source);
    if (!lead.firstContact) lead.firstContact = { source: event.source, at: event.at.toISOString() };
    lead.lastContact = { source: event.source, at: event.at.toISOString(), detail: event.detail };
    lead.interactions += 1;
    // Keep a bounded recent history in the response, not unlimited message bodies.
    lead.history.push({ id: event.id, source: event.source, at: event.at.toISOString(), detail: event.detail });
    if (lead.history.length > 15) lead.history.shift();
  }
  const leads = [...groups.values()];
  for (const lead of leads) {
    // A persisted link also shows the matched phone in the Instagram-only row.
    const link = instagramPhoneLinks[lead.instagramId];
    if (!lead.phone && link) lead.phone = normalizePhone(link);
    if (!lead.name) lead.name = lead.instagramHandle ? '@' + lead.instagramHandle : lead.phone;
    lead.sources.sort();
    lead.history.reverse();
  }
  return leads.sort((a, b) => b.lastContact.at.localeCompare(a.lastContact.at));
}

module.exports = { normalizePhone, normalizedEvent, groupLeadEvents };
