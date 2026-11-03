import { describe, expect, it } from 'vitest';
import {
  MAX_WORKFLOW_BULK_ORDERS, visibleWorkflowOrderIds, selectionAfterBulkMove,
} from './workflowBulkSelection';

const groups = [
  { key: 'design', sectionKeys: [] },
  { key: 'print', sectionKeys: ['print'] },
  { key: 'postPrint', sectionKeys: ['fitting', 'bindPack'] },
  { key: 'ready', sectionKeys: ['ready'] },
];
const sections = new Map([
  ['todaysNew', [{ orderId: 'design-1' }]],
  ['print', [{ orderId: 'print-1' }]],
  ['fitting', [{ orderId: 'fitting-1' }]],
  ['bindPack', [{ orderId: 'bind-1' }]],
  ['ready', [{ orderId: 'ready-1' }]],
]);

describe('Workflow bulk selection', () => {
  it('selects rendered board stages but not hidden design orders', () => {
    expect(visibleWorkflowOrderIds('board', sections, [], groups))
      .toEqual(['print-1', 'fitting-1', 'bind-1', 'ready-1']);
  });

  it('allows selection from By User including design-stage tasks', () => {
    expect(visibleWorkflowOrderIds('byUser', sections, [
      { tasks: [{ orderId: 'design-1' }, { orderId: 'print-1' }] },
      { tasks: [{ orderId: 'print-1' }, { orderId: 'ready-1' }] },
    ], groups)).toEqual(['design-1', 'print-1', 'ready-1']);
  });

  it('retains only failures for retry after a partial bulk move', () => {
    expect([...selectionAfterBulkMove([{ orderId: 'failed-1' }])]).toEqual(['failed-1']);
    expect(MAX_WORKFLOW_BULK_ORDERS).toBe(50);
  });
});
