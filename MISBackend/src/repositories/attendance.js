const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    Time: { type: String, required: true },
    Type: { type: String, required: true },
    SourceCommand: { type: String, default: '' },
    // Entry-level source is intentionally a free string. Attendance can arrive
    // from WhatsApp, dashboard, a biometric device, QR, or a future adapter
    // without requiring a schema migration for every new channel.
    Source: { type: String, default: '' },
    Device_uuid: { type: String, default: '' },
    VerificationMethod: { type: String, default: '' },
    ExternalEventId: { type: String, default: '' },
    CreatedAt: { type: Date, required: true} 
});

const AttendanceSchema = new mongoose.Schema({
    Attendance_uuid: { type: String },
    Attendance_Record_ID: { type: Number, required: true, unique: true },
    Employee_uuid: { type: String, required: true },
    Date: { type: Date, required: true },
    Status: { type: String, required: true },
    // Keep the original field for backward compatibility, but do not restrict
    // it to two channels. Per-punch Source above is authoritative when a day
    // contains entries from more than one attendance channel.
    source: { type: String, default: 'dashboard' },
    User: [userSchema]
});

// Indexes to speed up lookups and sorting
AttendanceSchema.index({ Employee_uuid: 1 });
AttendanceSchema.index({ Date: 1 });
AttendanceSchema.index({ Status: 1 });
AttendanceSchema.index({ 'User.Device_uuid': 1, 'User.ExternalEventId': 1 });

const Attendance = mongoose.model("Attendance", AttendanceSchema);
module.exports = Attendance;
