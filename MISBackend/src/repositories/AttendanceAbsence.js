const mongoose = require('mongoose');

// Employee-declared "won't be in" notice, captured via WhatsApp after
// tapping "Not Coming Tomorrow" at Day End. Audit record only — owner/manager
// notification happens at capture time, not read from here.
const AttendanceAbsenceSchema = new mongoose.Schema(
  {
    Employee_uuid: { type: String, required: true },
    Employee_name: { type: String, default: '' },
    phone: { type: String, required: true },
    forDate: { type: Date, required: true },
    reason: { type: String, required: true },
  },
  { timestamps: true, collection: 'attendanceAbsences' }
);

AttendanceAbsenceSchema.index({ Employee_uuid: 1 });
AttendanceAbsenceSchema.index({ forDate: 1 });

module.exports = mongoose.model('AttendanceAbsence', AttendanceAbsenceSchema);
