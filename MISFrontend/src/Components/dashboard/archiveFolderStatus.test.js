import { describe, expect, it } from 'vitest';
import { archiveFolderSummary, isConfirmedArchiveOrder, archiveFolderStatusSx } from './archiveFolderStatus';

const confirmed = (id) => ({ fileId: id, matched: true, orderUuid: 'order-' + id, isDraft: false, isTemporaryOrder: false });
const pending = (id) => ({ fileId: id, matched: false, isDraft: false, isTemporaryOrder: false });
const date = (...sections) => ({ sections: sections.map((files, index) => ({ sectionName: 'Section ' + index, files })) });

describe('archive date and month folder alerts', () => {
  it('uses exactly the real MIS confirmed-order card status', () => {
    expect(isConfirmedArchiveOrder(confirmed('1'))).toBe(true);
    expect(isConfirmedArchiveOrder({ ...confirmed('2'), isTemporaryOrder: true })).toBe(false);
    expect(isConfirmedArchiveOrder({ ...confirmed('3'), isDraft: true })).toBe(false);
    expect(isConfirmedArchiveOrder(pending('4'))).toBe(false);
  });

  it('marks the entire date folder amber if even one file is still pending', () => {
    expect(archiveFolderSummary([date(
      [confirmed('1'), confirmed('2')],
      [pending('3')],
    )])).toEqual({ total: 3, confirmed: 2, pending: 1, status: 'pending' });
  });

  it('counts temporary orders as pending, not completed MIS orders', () => {
    expect(archiveFolderSummary([date([{ ...confirmed('1'), isTemporaryOrder: true }])]))
      .toMatchObject({ pending: 1, status: 'pending' });
  });

  it('turns the date folder green when all its cards are confirmed', () => {
    expect(archiveFolderSummary([date([confirmed('1'), confirmed('2')])]))
      .toEqual({ total: 2, confirmed: 2, pending: 0, status: 'confirmed' });
  });

  it('rolls a pending date up to the month folder without losing counts', () => {
    expect(archiveFolderSummary([
      date([confirmed('1'), confirmed('2')]),
      date([confirmed('3'), pending('4')]),
    ])).toEqual({ total: 4, confirmed: 3, pending: 1, status: 'pending' });
  });

  it('leaves an empty folder neutral and provides distinct green/amber appearances', () => {
    expect(archiveFolderSummary([]).status).toBe('empty');
    expect(archiveFolderStatusSx.pending.bgcolor).not.toBe(archiveFolderStatusSx.confirmed.bgcolor);
  });
});
