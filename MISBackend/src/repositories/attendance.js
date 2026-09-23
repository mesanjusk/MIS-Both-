const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const { businessDateString } = require('../utils/businessDay');

const userSchema = new mongoose.Schema({
    Time: { type: String, required: true },
    Type: { type: String, required: true },
    SourceCommand: { type: String, default: '' },
    CreatedAt: { type: Date, required: true}
});

const AttendanceSchema = new mongoose.Schema({
    Attendance_uuid: { type: String },
    Attendance_Record_ID: { type: Number, required: true, unique: true },
    Employee_uuid: { type: String, required: true },
    Date: { type: Date, required: true },
    // Stable business-date key used to prevent a second row for the same
    // employee/day. Historical rows are backfilled only when the migration
    // proves there is no duplicate group, so no record is deleted or merged.
    Business_day: { type: String, default: undefined },
    Status: { type: String, required: true },
    source: { type: String, enum: ['dashboard', 'whatsapp'], default: 'dashboard' },
    User: [userSchema]
});

AttendanceSchema.pre('validate', function (next) {
    if (!this.Attendance_uuid) this.Attendance_uuid = uuidv4();
    // New rows are keyed immediately. Existing rows are not silently keyed by
    // unrelated edits; the migration handles them after checking duplicates.
    if (this.isNew || this.Business_day) {
        this.Business_day = businessDateString(this.Date);
    }
    next();
});

// Indexes to speed up lookups and sorting
AttendanceSchema.index({ Employee_uuid: 1 });
AttendanceSchema.index({ Date: 1 });
AttendanceSchema.index({ Status: 1 });
AttendanceSchema.index(
    { Employee_uuid: 1, Business_day: 1 },
    {
        unique: true,
        partialFilterExpression: { Business_day: { $type: 'string' } },
        name: 'employee_business_day_unique',
    }
);

const Attendance = mongoose.model("Attendance", AttendanceSchema);
module.exports = Attendance;
