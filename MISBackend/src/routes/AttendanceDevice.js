const express = require('express');
const crypto = require('crypto');
const { v4: uuid } = require('uuid');
const AttendanceDevice = require('../repositories/attendanceDevice');
const User = require('../repositories/users');
const { recordAttendanceEntry, getKnownAttendanceTypes } = require('../services/attendanceService');
const { requireAuth } = require('../middleware/auth');
const { requireAdminOrOwner } = require('../middleware/authorize');
const logger = require('../utils/logger');

const router = express.Router();

const hashKey = (value) => crypto.createHash('sha256').update(String(value || '')).digest('hex');
const generateDeviceKey = () => crypto.randomBytes(32).toString('hex');

const safeDevice = (device) => {
  const value = device?.toObject ? device.toObject() : { ...(device || {}) };
  delete value.SecretHash;
  return value;
};

const authenticateDevice = async (req, res, next) => {
  const deviceId = String(req.headers['x-device-id'] || '').trim();
  const deviceKey = String(req.headers['x-device-key'] || '').trim();

  if (!deviceId || !deviceKey) {
    return res.status(401).json({ success: false, message: 'Device credentials are required.' });
  }

  try {
    const device = await AttendanceDevice.findOne({
      $or: [{ Device_uuid: deviceId }, { SerialNumber: deviceId }],
    }).select('+SecretHash');

    if (!device || !device.Enabled) {
      return res.status(403).json({ success: false, message: 'Attendance device is not authorized.' });
    }

    const supplied = Buffer.from(hashKey(deviceKey), 'hex');
    const expected = Buffer.from(String(device.SecretHash || ''), 'hex');
    if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) {
      return res.status(403).json({ success: false, message: 'Attendance device is not authorized.' });
    }

    req.attendanceDevice = device;
    next();
  } catch (error) {
    logger.error({ err: error }, 'Attendance device authentication failed');
    return res.status(500).json({ success: false, message: 'Unable to authenticate attendance device.' });
  }
};

const resolveAttendanceType = (device, payload) => {
  const knownTypes = getKnownAttendanceTypes();
  const directType = String(payload?.type || '').trim();
  if (directType) return knownTypes.includes(directType) ? directType : '';

  const punchCode = payload?.punchCode;
  const punchTypeMap = device?.Settings?.punchTypeMap;
  if (punchCode !== undefined && punchCode !== null && punchTypeMap && typeof punchTypeMap === 'object') {
    const mapped = String(punchTypeMap[String(punchCode)] || '').trim();
    return knownTypes.includes(mapped) ? mapped : '';
  }

  const fallback = String(device?.Settings?.defaultAttendanceType || '').trim();
  return knownTypes.includes(fallback) ? fallback : '';
};

// ---------------- Device-facing API ----------------
// No employee biometrics are received or stored here. Fingerprint/face matching
// happens on the terminal; the MIS receives only the enrolled employee code and
// the verified punch event.
router.post('/punch', authenticateDevice, async (req, res) => {
  const employeeId = String(req.body?.employeeId || '').trim();
  const eventId = String(req.body?.eventId || req.body?.externalEventId || '').trim();
  const verificationMethod = String(req.body?.verificationMethod || '').trim();
  const timestamp = req.body?.timestamp ? new Date(req.body.timestamp) : new Date();
  const device = req.attendanceDevice;

  if (!employeeId) {
    return res.status(400).json({ success: false, message: 'employeeId is required.' });
  }
  if (Number.isNaN(timestamp.getTime())) {
    return res.status(400).json({ success: false, message: 'timestamp is invalid.' });
  }

  const attendanceType = resolveAttendanceType(device, req.body);
  if (!attendanceType) {
    return res.status(400).json({
      success: false,
      message: 'Punch type is not configured. Send type or configure Settings.punchTypeMap for this device.',
      allowedTypes: getKnownAttendanceTypes(),
    });
  }

  try {
    const user = await User.findOne({ employeeId }).select('User_uuid User_name employeeId operations.active').lean();
    if (!user) {
      return res.status(404).json({ success: false, message: 'No employee is mapped to this employeeId.' });
    }
    if (user?.operations?.active === false) {
      return res.status(409).json({ success: false, message: 'Employee is inactive.' });
    }

    const result = await recordAttendanceEntry({
      employeeUuid: user.User_uuid,
      type: attendanceType,
      status: 'Active',
      source: 'device',
      sourceCommand: req.body?.punchCode !== undefined ? `punch:${String(req.body.punchCode)}` : '',
      createdAt: timestamp,
      deviceUuid: device.Device_uuid,
      verificationMethod,
      externalEventId: eventId,
    });

    device.LastSeenAt = new Date();
    await device.save();

    return res.status(result.duplicate ? 200 : 201).json({
      success: true,
      duplicate: Boolean(result.duplicate),
      employee: { employeeId: user.employeeId, name: user.User_name },
      attendanceType,
      timestamp: timestamp.toISOString(),
    });
  } catch (error) {
    logger.error({ err: error, device: device.Device_uuid, employeeId }, 'Attendance device punch failed');
    return res.status(error.statusCode || 500).json({
      success: false,
      code: error.code || undefined,
      message: error.statusCode ? error.message : 'Unable to record attendance punch.',
    });
  }
});

router.post('/heartbeat', authenticateDevice, async (req, res) => {
  try {
    req.attendanceDevice.LastSeenAt = new Date();
    await req.attendanceDevice.save();
    return res.json({ success: true, serverTime: new Date().toISOString() });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Unable to update device heartbeat.' });
  }
});

router.get('/employees', authenticateDevice, async (req, res) => {
  try {
    const employees = await User.find({
      employeeId: { $exists: true, $nin: ['', null] },
      'operations.active': { $ne: false },
    })
      .select('employeeId User_name')
      .sort({ User_name: 1 })
      .lean();

    return res.json({
      success: true,
      result: employees.map((employee) => ({
        employeeId: employee.employeeId,
        name: employee.User_name,
      })),
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Unable to load device employee list.' });
  }
});

// ---------------- Admin-facing device management ----------------
router.use(requireAuth, requireAdminOrOwner);

router.get('/', async (_req, res) => {
  try {
    const devices = await AttendanceDevice.find({}).sort({ createdAt: -1 }).lean();
    return res.json({ success: true, result: devices.map(safeDevice) });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Unable to load attendance devices.' });
  }
});

router.post('/', async (req, res) => {
  const Name = String(req.body?.Name || '').trim();
  const SerialNumber = String(req.body?.SerialNumber || '').trim();
  if (!Name || !SerialNumber) {
    return res.status(400).json({ success: false, message: 'Name and SerialNumber are required.' });
  }

  try {
    const exists = await AttendanceDevice.findOne({ SerialNumber }).lean();
    if (exists) {
      return res.status(409).json({ success: false, message: 'A device with this serial number already exists.' });
    }

    const deviceKey = generateDeviceKey();
    const device = await AttendanceDevice.create({
      Device_uuid: uuid(),
      Name,
      SerialNumber,
      Location: String(req.body?.Location || '').trim(),
      Provider: String(req.body?.Provider || 'Generic').trim() || 'Generic',
      Protocol: String(req.body?.Protocol || 'API').trim() || 'API',
      Enabled: req.body?.Enabled !== false,
      SecretHash: hashKey(deviceKey),
      Settings: req.body?.Settings && typeof req.body.Settings === 'object' ? req.body.Settings : {},
    });

    return res.status(201).json({
      success: true,
      result: safeDevice(device),
      deviceKey,
      message: 'Device registered. Save the device key now; it will not be shown again.',
    });
  } catch (error) {
    logger.error({ err: error }, 'Attendance device registration failed');
    return res.status(500).json({ success: false, message: 'Unable to register attendance device.' });
  }
});

// Employee codes are stored on the existing Users collection. This endpoint is
// only an admin UI for that field; it does not create a second employee mapping
// table or duplicate staff identity.
router.get('/employee-mappings', async (_req, res) => {
  try {
    const users = await User.find({})
      .select('User_uuid User_name User_group employeeId operations.active')
      .sort({ User_name: 1 })
      .lean();
    return res.json({ success: true, result: users });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Unable to load employee device codes.' });
  }
});

router.put('/employee-mappings/:userUuid', async (req, res) => {
  const employeeId = String(req.body?.employeeId || '').trim();

  try {
    if (employeeId) {
      const duplicate = await User.findOne({
        employeeId,
        User_uuid: { $ne: req.params.userUuid },
      }).select('User_name').lean();
      if (duplicate) {
        return res.status(409).json({
          success: false,
          message: `Employee code is already assigned to ${duplicate.User_name}.`,
        });
      }
    }

    const user = await User.findOneAndUpdate(
      { User_uuid: req.params.userUuid },
      { $set: { employeeId } },
      { new: true }
    ).select('User_uuid User_name User_group employeeId operations.active');

    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
    return res.json({ success: true, result: user });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Unable to save employee device code.' });
  }
});

router.put('/:deviceUuid', async (req, res) => {
  const allowed = ['Name', 'SerialNumber', 'Location', 'Provider', 'Protocol', 'Enabled', 'Settings'];
  const update = {};
  allowed.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(req.body || {}, key)) update[key] = req.body[key];
  });

  try {
    const device = await AttendanceDevice.findOneAndUpdate(
      { Device_uuid: req.params.deviceUuid },
      { $set: update },
      { new: true, runValidators: true }
    );
    if (!device) return res.status(404).json({ success: false, message: 'Attendance device not found.' });
    return res.json({ success: true, result: safeDevice(device) });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ success: false, message: 'Device serial number must be unique.' });
    }
    return res.status(500).json({ success: false, message: 'Unable to update attendance device.' });
  }
});

router.post('/:deviceUuid/rotate-key', async (req, res) => {
  try {
    const deviceKey = generateDeviceKey();
    const device = await AttendanceDevice.findOneAndUpdate(
      { Device_uuid: req.params.deviceUuid },
      { $set: { SecretHash: hashKey(deviceKey) } },
      { new: true }
    );
    if (!device) return res.status(404).json({ success: false, message: 'Attendance device not found.' });

    return res.json({
      success: true,
      result: safeDevice(device),
      deviceKey,
      message: 'Device key rotated. Save the new key now; it will not be shown again.',
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Unable to rotate attendance device key.' });
  }
});

module.exports = router;
