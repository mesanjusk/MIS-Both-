const mongoose = require('mongoose');

const UsertasksSchema=new mongoose.Schema({
    Usertask_uuid: { type: String },
    Usertask_Number: { type: Number, required: true, unique: true },
    User: { type: String, required: true},
    AssignedBy: { type: String, default: '' },
    Usertask_name: { type: String, required: true },
    Date: { type: Date, required: true },
    Time: { type: String, required: true },
    Deadline: { type: Date, required: true},
    Remark: { type: String, required: true},
    Status: { type: String, required: true},

    // ── Operations linkage ────────────────────────────────────────────────
    // `User` above stays the resolved owner's name so every existing screen
    // and query keeps working untouched. These fields add the responsibility
    // chain behind it: ownership is stored as User_uuid values, so a task
    // survives a rename and never depends on a priority code.
    responsibility_uuid: { type: String, default: '' },
    category: { type: String, default: 'general' },
    primaryUserUuid: { type: String, default: '' },
    backup1UserUuid: { type: String, default: '' },
    backup2UserUuid: { type: String, default: '' },
    // Runtime owner — recomputed from attendance on every read, so the
    // configured chain above is never overwritten when someone is absent and
    // the primary silently gets their work back on return.
    currentOwnerUuid: { type: String, default: '' },
    ownerRole: { type: String, enum: ['primary', 'backup1', 'backup2', 'escalated', ''], default: '' },
    escalated: { type: Boolean, default: false },

    // Schedule metadata for the configurable daily plan (§22).
    scheduledTime: { type: String, default: '' },   // 'HH:MM'
    durationMinutes: { type: Number, default: 0 },
    isRequired: { type: Boolean, default: false },
    Priority: { type: String, default: '' },
    sourceSopUuid: { type: String, default: '' },
 },  { timestamps: true })

UsertasksSchema.index({ User: 1 });
UsertasksSchema.index({ Date: 1 });
UsertasksSchema.index({ Deadline: 1 });
UsertasksSchema.index({ Status: 1 });
UsertasksSchema.index({ Usertask_name: 1 });
UsertasksSchema.index({ Status: 1, User: 1 });
UsertasksSchema.index({ responsibility_uuid: 1 });
UsertasksSchema.index({ primaryUserUuid: 1 });
UsertasksSchema.index({ currentOwnerUuid: 1 });
UsertasksSchema.index({ sourceSopUuid: 1, Date: 1 });

 const Usertasks = mongoose.model("Usertasks", UsertasksSchema);

module.exports = Usertasks;
