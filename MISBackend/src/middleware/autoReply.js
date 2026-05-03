const AutoReply = require('../repositories/AutoReply');
const CatalogSession = require('../repositories/catalogSession');
const Customers = require('../repositories/customer');
const Contact = require('../repositories/contact');
const User = require('../repositories/users');

const DEFAULT_DELAY_MIN_SECONDS = 2;
const DEFAULT_DELAY_MAX_SECONDS = 5;
const SESSION_TTL_MS = 30 * 60 * 1000;
const RESTART_INPUTS = new Set(['restart', 'reset', 'start over']);

const normalizeIncomingText = (text) => String(text || '').trim().toLowerCase();
const normalizeDisplayValue = (value) => String(value ?? '').trim();
const normalizeComparableValue = (value) => normalizeDisplayValue(value).toLowerCase();
const normalizePhone = (value) => String(value || '').replace(/\D/g, '');

const isBlankCatalogValue = (value) => {
  const normalized = normalizeDisplayValue(value);
  if (!normalized) return true;
  const lower = normalized.toLowerCase();
  return normalized === '-' || lower === 'nan' || lower === 'null' || lower === 'undefined';
};

const matchAutoReplyRule = (incomingText, rules = []) => {
  const normalizedText = normalizeIncomingText(incomingText);

  if (!normalizedText || !Array.isArray(rules) || !rules.length) {
    return null;
  }

  for (const rule of rules) {
    if (!rule?.isActive) continue;

    const keyword = normalizeIncomingText(rule.keyword);
    if (!keyword) continue;

    const matchType = String(rule.matchType || 'contains').toLowerCase();

    if (matchType === 'exact' && normalizedText === keyword) return rule;
    if (matchType === 'contains' && normalizedText.includes(keyword)) return rule;
    if (matchType === 'starts_with' && normalizedText.startsWith(keyword)) return rule;
  }

  return null;
};

const getCatalogRows = (rule) =>
  (Array.isArray(rule?.catalogRows) ? rule.catalogRows : [])
    .map((row) => (row && typeof row === 'object' ? row : null))
    .filter(Boolean);

const getRuleAudienceScope = (rule) => {
  const scope = String(rule?.audienceScope || 'all').trim().toLowerCase();
  return scope === 'registered_only' ? 'registered_only' : 'all';
};

const getSelectionFields = (rule) =>
  (Array.isArray(rule?.catalogConfig?.selectionFields) ? rule.catalogConfig.selectionFields : [])
    .map((field) => normalizeDisplayValue(field))
    .filter(Boolean);

const getResultFields = (rule) =>
  (Array.isArray(rule?.catalogConfig?.resultFields) ? rule.catalogConfig.resultFields : [])
    .map((field) => normalizeDisplayValue(field))
    .filter(Boolean);

const filterCatalogRows = (rows, filters = {}) =>
  rows.filter((row) =>
    Object.entries(filters).every(([field, expected]) =>
      normalizeComparableValue(row?.[field]) === normalizeComparableValue(expected)
    )
  );

const getOptionsForField = (rows, field) => {
  const options = [];
  const seen = new Set();

  for (const row of rows) {
    const displayValue = normalizeDisplayValue(row?.[field]);
    if (isBlankCatalogValue(displayValue)) continue;

    const compareValue = normalizeComparableValue(displayValue);
    if (seen.has(compareValue)) continue;

    seen.add(compareValue);
    options.push({ display: displayValue, normalized: compareValue });
  }

  return options;
};

const buildCatalogMenuText = ({ rule, field, stepIndex, options, prefix = '' }) => {
  const title = normalizeDisplayValue(rule?.catalogConfig?.menuTitle) || 'Product Catalog';
  const intro = normalizeDisplayValue(rule?.catalogConfig?.menuIntro);
  const lines = [title];

  if (intro && stepIndex === 0) lines.push(intro);
  if (prefix) lines.push(prefix);

  lines.push(`Step ${stepIndex + 1}: choose ${field}`);
  options.forEach((option, index) => lines.push(`${index + 1}. ${option.display}`));
  lines.push('Reply with option number or exact option text.');

  return lines.filter(Boolean).join('\n');
};

const buildCatalogResultText = ({ selectionFields = [], resultFields = [], selectedValues = {}, row = {} }) => {
  const lines = [];
  const used = new Set();

  const pushLine = (field, value) => {
    const display = normalizeDisplayValue(value);
    if (isBlankCatalogValue(display)) return;

    const key = `${normalizeComparableValue(field)}::${normalizeComparableValue(display)}`;
    if (used.has(key)) return;
    used.add(key);

    lines.push(`${field}: ${display}`);
  };

  selectionFields.forEach((field) => {
    pushLine(field, selectedValues?.[field]);
  });

  resultFields.forEach((field) => {
    pushLine(field, row?.[field]);
  });

  return lines.length ? `Here is your result:\n${lines.join('\n')}` : 'No matching catalog details found.';
};

const expireStaleSessions = async (phone) => {
  const now = new Date();
  await CatalogSession.updateMany(
    {
      ...(phone ? { phone } : {}),
      status: 'active',
      $or: [{ expiresAt: { $lte: now } }, { updatedAt: { $lte: new Date(Date.now() - SESSION_TTL_MS) } }],
    },
    { $set: { status: 'expired' } }
  );
};

const closeSession = async (sessionId, status = 'closed') => {
  if (!sessionId) return;
  await CatalogSession.updateOne({ _id: sessionId }, { $set: { status, expiresAt: new Date() } });
};

const upsertActiveSession = async ({
  phone,
  rule,
  currentStepIndex,
  selectionFields,
  resultFields,
  selectedValues,
  lastInboundText = '',
}) => {
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  return CatalogSession.findOneAndUpdate(
    { phone, ruleId: rule._id, status: 'active' },
    {
      $set: {
        keyword: normalizeIncomingText(rule.keyword),
        currentStepIndex,
        selectionFields,
        resultFields,
        selectedValues,
        expiresAt,
        lastInboundText: String(lastInboundText || ''),
      },
      $setOnInsert: {
        phone,
        ruleId: rule._id,
      },
    },
    { upsert: true, new: true }
  );
};

const parseIncomingOption = (incomingText, options = []) => {
  const raw = String(incomingText || '').trim();
  if (!raw) return null;

  const numeric = Number.parseInt(raw, 10);
  if (Number.isFinite(numeric) && numeric >= 1 && numeric <= options.length) {
    return options[numeric - 1];
  }

  const normalized = normalizeComparableValue(raw);
  return options.find((option) => option.normalized === normalized) || null;
};

const getUniqueCatalogRows = (rows = []) => {
  const uniqueRows = [];
  const seen = new Set();

  for (const row of Array.isArray(rows) ? rows : []) {
    const key = JSON.stringify(row || {});
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueRows.push(row);
  }

  return uniqueRows;
};

const SMALL_RESULT_THRESHOLD = 4;
const MIN_STEPS_BEFORE_SMALL_RESULT = 2;

const buildCatalogMultiResultText = ({ selectionFields = [], resultFields = [], selectedValues = {}, rows = [] }) => {
  const uniqueRows = getUniqueCatalogRows(rows);
  const lines = [];

  if (Object.keys(selectedValues || {}).length) {
    lines.push('Selected filters:');
    selectionFields.forEach((field) => {
      const value = normalizeDisplayValue(selectedValues?.[field]);
      if (!isBlankCatalogValue(value)) {
        lines.push(`${field}: ${value}`);
      }
    });
    lines.push('');
  }

  lines.push(`I found ${uniqueRows.length} matching options:`);
  lines.push('');

  uniqueRows.forEach((row, index) => {
    lines.push(`${index + 1}.`);
    const shownFields = new Set();
    [...selectionFields, ...resultFields].forEach((field) => {
      const value = field in (selectedValues || {}) ? selectedValues[field] : row?.[field];
      const display = normalizeDisplayValue(value);
      if (isBlankCatalogValue(display)) return;
      const key = normalizeComparableValue(field);
      if (shownFields.has(key)) return;
      shownFields.add(key);
      lines.push(`${field}: ${display}`);
    });
    lines.push('');
  });

  lines.push('Reply with the option number to choose one, or send the keyword again to restart.');
  return lines.join('\n').trim();
};

const runCatalogStateMachine = ({ rule, selectionFields, resultFields, rows, selectedValues, startStep, incomingText }) => {
  let filters = { ...(selectedValues || {}) };
  let stepIndex = Number(startStep || 0);
  let candidateRows = filterCatalogRows(rows, filters);
  let incomingConsumed = false;
  const normalizedIncoming = String(incomingText || '').trim();

  while (stepIndex < selectionFields.length) {
    const uniqueRows = getUniqueCatalogRows(candidateRows);
    if (
      stepIndex >= MIN_STEPS_BEFORE_SMALL_RESULT &&
      uniqueRows.length > 1 &&
      uniqueRows.length <= SMALL_RESULT_THRESHOLD
    ) {
      return {
        status: 'small_result_set',
        selectedValues: filters,
        stepIndex,
        rows: uniqueRows,
      };
    }

    const field = selectionFields[stepIndex];
    const options = getOptionsForField(candidateRows, field);

    if (!options.length) {
      return { status: 'no_match', selectedValues: filters, stepIndex, field, options: [] };
    }

    if (options.length === 1) {
      filters[field] = options[0].display;
      candidateRows = filterCatalogRows(rows, filters);
      stepIndex += 1;
      continue;
    }

    if (incomingConsumed || !normalizedIncoming) {
      return {
        status: normalizedIncoming && incomingConsumed ? 'prompt' : normalizedIncoming ? 'invalid_option' : 'prompt',
        selectedValues: filters,
        stepIndex,
        field,
        options,
      };
    }

    const parsed = parseIncomingOption(normalizedIncoming, options);
    if (!parsed) {
      return {
        status: 'invalid_option',
        selectedValues: filters,
        stepIndex,
        field,
        options,
      };
    }

    incomingConsumed = true;
    filters[field] = parsed.display;
    candidateRows = filterCatalogRows(rows, filters);
    stepIndex += 1;
  }

  if (!candidateRows.length) {
    return {
      status: 'no_match',
      selectedValues: filters,
      stepIndex,
      row: null,
    };
  }

  const uniqueRows = getUniqueCatalogRows(candidateRows);

  if (uniqueRows.length > 1) {
    return {
      status: 'small_result_set',
      selectedValues: filters,
      stepIndex,
      rows: uniqueRows,
    };
  }

  return {
    status: 'completed',
    selectedValues: filters,
    stepIndex,
    row: uniqueRows[0] || null,
  };
};

const isRegisteredSender = async (phone) => {
  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone) return false;

  const [customer, user, contact] = await Promise.all([
    Customers.exists({ Mobile_number: normalizedPhone }),
    User.exists({ $or: [{ Mobile_number: normalizedPhone }, { phone: normalizedPhone }] }),
    Contact.findOne({ phone: normalizedPhone }, { name: 1, tags: 1, assignedAgent: 1 }).lean(),
  ]);

  const isRecognizedContact =
    !!contact &&
    Boolean(
      String(contact?.name || '').trim() ||
        String(contact?.assignedAgent || '').trim() ||
        (Array.isArray(contact?.tags) && contact.tags.length)
    );

  return Boolean(customer || user || isRecognizedContact);
};

const ensureRuleAccess = async ({ rule, phone }) => {
  if (getRuleAudienceScope(rule) !== 'registered_only') {
    return { allowed: true };
  }

  const registered = await isRegisteredSender(phone);
  if (registered) return { allowed: true };

  return {
    allowed: false,
    message: 'This catalog is only for registered customers. Please contact admin to get access.',
  };
};

const shouldRestartCatalog = ({ incomingText, rule }) => {
  const normalized = normalizeIncomingText(incomingText);
  if (!normalized) return false;
  if (RESTART_INPUTS.has(normalized)) return true;
  return normalized === normalizeIncomingText(rule?.keyword);
};

const startCatalogSession = async ({ rule, phone, incomingText = '' }) => {
  const rows = getCatalogRows(rule);
  const selectionFields = getSelectionFields(rule);
  const resultFields = getResultFields(rule);

  const machineResult = runCatalogStateMachine({
    rule,
    selectionFields,
    resultFields,
    rows,
    selectedValues: {},
    startStep: 0,
    incomingText: '',
  });

  if (machineResult.status === 'completed') {
    await CatalogSession.updateMany({ phone, ruleId: rule._id, status: 'active' }, { $set: { status: 'completed' } });
    return {
      replyType: 'text',
      reply: buildCatalogResultText({
        selectionFields,
        resultFields,
        selectedValues: machineResult.selectedValues,
        row: machineResult.row,
      }),
    };
  }

  if (machineResult.status === 'small_result_set') {
    await upsertActiveSession({
      phone,
      rule,
      currentStepIndex: machineResult.stepIndex,
      selectionFields,
      resultFields,
      selectedValues: machineResult.selectedValues,
      lastInboundText: incomingText,
    });

    return {
      replyType: 'text',
      reply: buildCatalogMultiResultText({
        selectionFields,
        resultFields,
        selectedValues: machineResult.selectedValues,
        rows: machineResult.rows,
      }),
    };
  }

  if (machineResult.status === 'no_match') {
    await CatalogSession.updateMany({ phone, ruleId: rule._id, status: 'active' }, { $set: { status: 'closed' } });
    return { replyType: 'text', reply: 'No matching products were found. Send the keyword again to restart.' };
  }

  await upsertActiveSession({
    phone,
    rule,
    currentStepIndex: machineResult.stepIndex,
    selectionFields,
    resultFields,
    selectedValues: machineResult.selectedValues,
    lastInboundText: incomingText,
  });

  return {
    replyType: 'text',
    reply: buildCatalogMenuText({
      rule,
      field: machineResult.field,
      stepIndex: machineResult.stepIndex,
      options: machineResult.options,
    }),
  };
};

const continueCatalogSession = async ({ rule, session, incomingText, phone }) => {
  const rows = getCatalogRows(rule);
  const selectionFields = Array.isArray(session?.selectionFields) && session.selectionFields.length
    ? session.selectionFields
    : getSelectionFields(rule);
  const resultFields = Array.isArray(session?.resultFields) ? session.resultFields : getResultFields(rule);

  const machineResult = runCatalogStateMachine({
    rule,
    selectionFields,
    resultFields,
    rows,
    selectedValues: session?.selectedValues || {},
    startStep: Number(session?.currentStepIndex || 0),
    incomingText,
  });

  if (machineResult.status === 'completed') {
    await closeSession(session?._id, 'completed');

    if (!machineResult.row) {
      return { replyType: 'text', reply: 'No matching products were found. Send the keyword again to restart.' };
    }

    return {
      replyType: 'text',
      reply: buildCatalogResultText({
        selectionFields,
        resultFields,
        selectedValues: machineResult.selectedValues,
        row: machineResult.row,
      }),
    };
  }

  if (machineResult.status === 'small_result_set') {
    await upsertActiveSession({
      phone,
      rule,
      currentStepIndex: machineResult.stepIndex,
      selectionFields,
      resultFields,
      selectedValues: machineResult.selectedValues,
      lastInboundText: incomingText,
    });

    return {
      replyType: 'text',
      reply: buildCatalogMultiResultText({
        selectionFields,
        resultFields,
        selectedValues: machineResult.selectedValues,
        rows: machineResult.rows,
      }),
    };
  }

  if (machineResult.status === 'no_match') {
    await closeSession(session?._id, 'closed');
    return { replyType: 'text', reply: 'No matching products were found. Send the keyword again to restart.' };
  }

  await upsertActiveSession({
    phone,
    rule,
    currentStepIndex: machineResult.stepIndex,
    selectionFields,
    resultFields,
    selectedValues: machineResult.selectedValues,
    lastInboundText: incomingText,
  });

  return {
    replyType: 'text',
    reply: buildCatalogMenuText({
      rule,
      field: machineResult.field,
      stepIndex: machineResult.stepIndex,
      options: machineResult.options,
      prefix: machineResult.status === 'invalid_option' ? 'Invalid option. Please choose from the list below.' : '',
    }),
  };
};

const resolveAutoReplyRule = async (incomingText) => {
  const rules = await AutoReply.find({ isActive: true }).sort({ createdAt: 1 }).lean();
  return matchAutoReplyRule(incomingText, rules);
};

const resolveAutoReplyAction = async ({ incomingText, filters = {}, contactDoc = null, fromPhone = '' }) => {
  let rules = await AutoReply.find({ isActive: true, ...filters }).sort({ createdAt: 1 });

  if (!rules.length) {
    rules = await AutoReply.find({
      isActive: true,
      $or: [{ userId: { $exists: false } }, { userId: null }, { userId: '' }],
    }).sort({ createdAt: 1 });
  }

  const senderPhone = normalizePhone(fromPhone || contactDoc?.phone || '');
  await expireStaleSessions(senderPhone);

  const activeSession = senderPhone
    ? await CatalogSession.findOne({ phone: senderPhone, status: 'active' }).sort({ updatedAt: -1 })
    : null;

  if (activeSession) {
    const sessionRule = rules.find(
      (rule) =>
        String(rule?._id || '') === String(activeSession.ruleId || '') &&
        String(rule?.ruleType || 'keyword') === 'product_catalog'
    );

    if (!sessionRule) {
      await closeSession(activeSession._id, 'closed');
    } else {
      const access = await ensureRuleAccess({ rule: sessionRule, phone: senderPhone });
      if (!access.allowed) {
        await closeSession(activeSession._id, 'closed');
        return { replyType: 'text', reply: access.message };
      }

      if (shouldRestartCatalog({ incomingText, rule: sessionRule })) {
        await closeSession(activeSession._id, 'closed');
        return startCatalogSession({ rule: sessionRule, phone: senderPhone, incomingText });
      }

      return continueCatalogSession({
        rule: sessionRule,
        session: activeSession,
        incomingText,
        phone: senderPhone,
      });
    }
  }

  const matchedRule = matchAutoReplyRule(incomingText, rules);
  if (!matchedRule) return null;

  const access = await ensureRuleAccess({ rule: matchedRule, phone: senderPhone });
  if (!access.allowed) {
    return { replyType: 'text', reply: access.message };
  }

  if (String(matchedRule.ruleType || 'keyword') === 'product_catalog') {
    return startCatalogSession({ rule: matchedRule, phone: senderPhone, incomingText });
  }

  return matchedRule;
};

const resolveReplyDelayMs = (rule) => {
  const configured = Number(rule?.delaySeconds);

  if (Number.isFinite(configured) && configured >= 0) return configured * 1000;

  const randomDelay = Math.floor(Math.random() * (DEFAULT_DELAY_MAX_SECONDS - DEFAULT_DELAY_MIN_SECONDS + 1)) + DEFAULT_DELAY_MIN_SECONDS;
  return randomDelay * 1000;
};

module.exports = {
  normalizeIncomingText,
  matchAutoReplyRule,
  resolveAutoReplyRule,
  resolveAutoReplyAction,
  resolveReplyDelayMs,
};
