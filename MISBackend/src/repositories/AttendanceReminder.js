const mongoose = require('mongoose');

// Queue of proactive "ready to start your day?" nudges, created either when
// an employee taps "Coming Tomorrow" at Day End, or automatically when
// tomorrow is a configured weekly-off day (see whatsappAttendanceService.js's
// sendDayEndTomorrowPreview). Polled by attendanceReminderScheduler.js.
const AttendanceReminderSchema = new mongoose.Schema(
  {
    phone: { type: String, required: true },
    employeeUuid: { type: String, required: true },
    employeeName: { type: String, default: '' },
    forDate: { type: Date, required: true },
    fireAt: { type: Date, required: true },
    status: { type: String, enum: ['pending', 'sent', 'skipped', 'failed'], default: 'pending' },
    sentAt: { type: Date, default: null },
    error: { type: String, default: '' },
  },
  { timestamps: true }
);

AttendanceReminderSchema.index({ status: 1, fireAt: 1 });
AttendanceReminderSchema.index({ employeeUuid: 1, forDate: 1 }, { unique: true });

module.exports = mongoose.model('AttendanceReminder', AttendanceReminderSchema);
