// Shared "Account Payable" party classification — see
// MISBackend/src/routes/Assignees.js for the full rationale. Both the order
// task-assign menu and the design-file assign menu source their assignable
// people from Customers under this Customer_group, not from Users or the
// separate vendor_masters collection.
const ACCOUNT_PAYABLE_GROUP = /^account\s*payable$/i;

module.exports = { ACCOUNT_PAYABLE_GROUP };
