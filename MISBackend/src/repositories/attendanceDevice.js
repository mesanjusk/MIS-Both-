const mongoose = require('mongoose');

const AttendanceDeviceSchema = new mongoose.Schema({
  Device_uuid: { type: String, required: true, unique: true, index: true },
  Name: { type: String, required: true, trim: true },
  SerialNumber: { type: String, required: true, unique: true, trim: true, index: true },
  Location: { type: String, default: '', trim: true },
  Provider: { type: String, default: 'Generic', trim: true },
  Protocol: { type: String, default: 'API', trim: true },
  Enabled: { type: Boolean, default: true },
  LastSeenAt: { type: Date, default: null },
  // Hash only. The plaintext device key is returned once when a device is
  // registered or its key is rotated and is never stored in MongoDB.
  SecretHash: { type: String, required: true, select: false },
  // Vendor-specific behavior belongs in configuration, not application code.
  // Example: { punchTypeMap: { "0": "In", "1": "Out" } }.
  Settings: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
}, { timestamps: true });

module.exports = mongoose.model('AttendanceDevice', AttendanceDeviceSchema);
