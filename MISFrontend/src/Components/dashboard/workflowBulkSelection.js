// IDs shown in the currently active Workflow view. The Board embeds its
// own Design Files widget, so only its rendered order-task columns are
// selectable there. By User lists all pending order tasks.
export const MAX_WORKFLOW_BULK_ORDERS = 50;

export function visibleWorkflowOrderIds(tab, sections, byUserGroups, workflowGroups) {
  const tasks = tab === 'board'
    ? workflowGroups.filter((group) => group.key !== 'design')
      .flatMap((group) => group.sectionKeys.flatMap((key) => sections.get(key) || []))
    : tab === 'byUser'
      ? byUserGroups.flatMap((group) => group.tasks || [])
      : [];
  return [...new Set(tasks.map((task) => task.orderId).filter(Boolean))];
}

export function selectionAfterBulkMove(failures = []) {
  return new Set(failures.map((failure) => failure.orderId).filter(Boolean));
}
