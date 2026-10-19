const Contact = require('../repositories/contact');
const { AppSetting } = require('../repositories/appSetting');
const { normalizePhone } = require('./leadIdentityService');
const { parseVcf } = require('./leadVcfService');

const IG_NAME_KEY_PREFIX = 'unified_lead_name_instagram:';
const MAX_LEAD_NAME = 120;
const BULK_SIZE = 400;

function safeName(value) {
  if (typeof value !== 'string') throw new Error('Lead Name must be text.');
  const name = value.trim().replace(/\s+/g, ' ');
  if (name.length > MAX_LEAD_NAME) throw new Error('Lead Name cannot exceed 120 characters.');
  return name;
}

const digitsKey = (phone) => String(phone || '').replace(/\D/g, '');
const validInstagramId = (id) => /^[a-zA-Z0-9_-]{1,100}$/.test(String(id || ''));

async function existingContactMap() {
  // One small projection, regardless of whether the VCF has 100 or 20,000 rows.
  // Preserve historical 91-prefixed phone keys instead of creating duplicate
  // Contact records that share the same normalized phone.
  const rows = await Contact.find({}).select('phone').lean();
  const map = new Map();
  for (const row of rows) {
    const key = normalizePhone(row.phone);
    if (key && !map.has(key)) map.set(key, row.phone);
  }
  return map;
}

async function importVcf(buffer) {
  const parsed = parseVcf(buffer.toString('utf8'));
  if (!parsed.cards || !parsed.contacts.length) {
    throw new Error('No named contacts with valid phone numbers were found in this VCF.');
  }
  const existing = await existingContactMap();
  let added = 0;
  let updated = 0;
  const now = new Date();
  const operations = [];
  const flush = async () => {
    if (operations.length) {
      await Contact.bulkWrite(operations.splice(0), { ordered: false });
    }
  };
  for (const { phone, vcfName } of parsed.contacts) {
    const storedPhone = existing.get(phone) || digitsKey(phone);
    if (!storedPhone) continue;
    if (existing.has(phone)) updated += 1;
    else { added += 1; existing.set(phone, storedPhone); }
    operations.push({
      updateOne: {
        filter: { phone: storedPhone },
        update: {
          $set: { vcfName, leadLastImportedAt: now },
          $setOnInsert: { phone: storedPhone },
        },
        upsert: true,
      },
    });
    if (operations.length >= BULK_SIZE) await flush();
  }
  await flush();
  return {
    cards: parsed.cards, uniquePhones: parsed.contacts.length,
    duplicatesOrInvalid: parsed.skipped, added, updated,
    message: 'VCF names imported. Manual Lead Names and Customer Names have not been changed.',
  };
}

async function updatePhoneLeadName(phoneInput, rawName) {
  const phone = normalizePhone(phoneInput);
  if (!phone) throw new Error('Enter a valid mobile number.');
  const leadName = safeName(rawName);
  const existing = await existingContactMap();
  const storedPhone = existing.get(phone) || digitsKey(phone);
  const update = leadName
    ? { $set: { leadName }, $setOnInsert: { phone: storedPhone } }
    : { $unset: { leadName: 1 }, $setOnInsert: { phone: storedPhone } };
  await Contact.updateOne({ phone: storedPhone }, update, { upsert: true });
  return { phone, leadName };
}

async function updateInstagramLeadName(instagramId, rawName) {
  if (!validInstagramId(instagramId)) throw new Error('Invalid Instagram identity.');
  const leadName = safeName(rawName);
  const key = IG_NAME_KEY_PREFIX + instagramId;
  await AppSetting.findOneAndUpdate(
    { key },
    { $set: { value: { leadName }, description: 'Manually entered Instagram lead name; not a customer ledger name' } },
    { upsert: true, setDefaultsOnInsert: true }
  );
  return { instagramId, leadName };
}

async function loadLeadDirectory() {
  const [contacts, instagram] = await Promise.all([
    Contact.find({
      $or: [
        { leadName: { $exists: true, $nin: ['', null] } },
        { vcfName: { $exists: true, $nin: ['', null] } },
      ],
    }).select('phone leadName vcfName leadLastImportedAt').lean(),
    AppSetting.find({ key: { $regex: '^' + IG_NAME_KEY_PREFIX } }).select('key value').lean(),
  ]);
  const phones = new Map();
  for (const contact of contacts) {
    const phone = normalizePhone(contact.phone);
    if (!phone) continue;
    const current = phones.get(phone) || { phone, leadName: '', vcfName: '', importedAt: '' };
    // A manual label always wins over a VCF label.
    if (contact.leadName) current.leadName = contact.leadName;
    if (contact.vcfName && !current.vcfName) current.vcfName = contact.vcfName;
    if (contact.leadLastImportedAt) current.importedAt = contact.leadLastImportedAt;
    phones.set(phone, current);
  }
  const instagramNames = new Map(instagram
    .filter(record => record.value && typeof record.value.leadName === 'string' && record.value.leadName.trim())
    .map(record => [record.key.slice(IG_NAME_KEY_PREFIX.length), record.value.leadName.trim()]));
  return { phones, instagramNames };
}

function decorateLeads(leads, directory) {
  const byPhone = new Map();
  for (const lead of leads) {
    if (lead.phone) byPhone.set(lead.phone, lead);
  }
  // Importing a VCF enriches names for existing WhatsApp/call leads, and also
  // makes unsent phone contacts searchable without pretending they contacted us.
  for (const record of directory.phones.values()) {
    if (!byPhone.has(record.phone)) {
      const lead = {
        id: 'phone:' + record.phone, name: record.vcfName || record.leadName || record.phone,
        phone: record.phone, instagramId: '', instagramHandle: '',
        sources: [], firstContact: null, lastContact: null, interactions: 0,
        history: [], directoryOnly: true,
      };
      leads.push(lead);
      byPhone.set(record.phone, lead);
    }
  }
  for (const lead of leads) {
    const record = directory.phones.get(lead.phone);
    const instagramLeadName = directory.instagramNames.get(lead.instagramId) || '';
    lead.leadName = record?.leadName || instagramLeadName || '';
    lead.vcfName = record?.vcfName || '';
    lead.name = lead.leadName || lead.vcfName || lead.name || lead.phone || (lead.instagramHandle ? '@' + lead.instagramHandle : 'Instagram contact');
    lead.directoryOnly = !lead.firstContact;
  }
  return leads;
}

module.exports = {
  importVcf, updatePhoneLeadName, updateInstagramLeadName, loadLeadDirectory,
  decorateLeads, safeName, IG_NAME_KEY_PREFIX,
};