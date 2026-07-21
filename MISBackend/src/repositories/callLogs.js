const mongoose = require('mongoose');

const CallLogsSchema=new mongoose.Schema({
    CallLog_uuid: { type: String },
    Name: { type: String, required: true },
    // String, not Number — a numeric type silently drops a leading '0' or '+91'.
    // Existing documents stored as Number will read back as their numeric string
    // form (e.g. missing leading zeros already lost); this only prevents new
    // writes from losing them going forward.
    Mobile_number: { type: String, required: true, unique: true},
    Type: { type: String, required: true },
    Duration: { type: Number, required: true },
    Status: { type: String, required: true}
 })

// Indexes to optimise frequent call log operations
CallLogsSchema.index({ Name: 1 });
CallLogsSchema.index({ Type: 1 });
CallLogsSchema.index({ Status: 1 });
CallLogsSchema.index({ CallLog_uuid: 1 });

 const CallLogs = mongoose.model("CallLogs", CallLogsSchema);

module.exports = CallLogs;
