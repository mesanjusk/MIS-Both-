jest.mock('../../src/repositories/attendance');
jest.mock('../../src/repositories/sopCompletion');
jest.mock('../../src/repositories/sopHandover');
jest.mock('../../src/repositories/users');
jest.mock('../../src/services/sopService', () => ({
  getDailyStatusForUser: jest.fn(), getDailyStatus: jest.fn(), SOPTask: {},
}));

const Attendance = require('../../src/repositories/attendance');
const SOPCompletion = require('../../src/repositories/sopCompletion');
const SOPHandover = require('../../src/repositories/sopHandover');
const { getDailyStatusForUser, getDailyStatus } = require('../../src/services/sopService');
const { getEmployeeDailyStatus, saveEmployeeCompletion, saveSopHandover, ensureSopClockOut } =
  require('../../src/services/employeeSopDayService');

const employee = { User_uuid: 'emp-1', User_name: 'Asha', User_group: 'Office Admin' };
const attendanceTask = {
  sop_uuid: 'attendance', title: 'Mark attendance & login to MIS',
  timeOfDay: 'morning', isSkippable: false,
};
const sharedTask = { sop_uuid: 'cash', title: 'Cash reconciliation', isSkippable: false, timeOfDay: 'evening' };
const personalTask = {
  sop_uuid: 'proof', title: 'Save proof', isSkippable: false,
  primaryUserUuid: 'emp-1', timeOfDay: 'evening',
};
const optionalTask = { sop_uuid: 'quotation', title: 'Quotation', isSkippable: true };
const day = new Date('2026-09-29T09:00:00+05:30');

const mockQuery = (result) => ({ lean: jest.fn().mockResolvedValue(result) });
beforeEach(() => {
  jest.clearAllMocks();
  getDailyStatusForUser.mockResolvedValue({ tasks: [personalTask] });
  getDailyStatus.mockResolvedValue({ tasks: [attendanceTask, sharedTask, optionalTask] });
  Attendance.findOne.mockReturnValue(mockQuery({ Attendance_uuid: 'a1', User: [{ Type: 'In' }] }));
  SOPCompletion.find.mockReturnValue(mockQuery([]));
  SOPHandover.find.mockReturnValue(mockQuery([]));
  SOPCompletion.findOne.mockResolvedValue(null);
  SOPCompletion.create.mockImplementation(async (item) => item);
  SOPHandover.findOneAndUpdate.mockImplementation(async (_query, update) => update.$set);
});

describe('Employee daily SOP', () => {
  test('merges personal and group tasks, and auto-verifies actual Punch In', async () => {
    const result = await getEmployeeDailyStatus(employee, day);
    expect(result.tasks).toHaveLength(4);
    expect(result.completionMap.attendance).toEqual(expect.objectContaining({
      autoVerified: true, evidence: 'Attendance: In',
    }));
    expect(result.blockingTasks.map((item) => item.sop_uuid).sort()).toEqual(['cash', 'proof']);
    expect(result.canEndDay).toBe(false);
    expect(getDailyStatusForUser).toHaveBeenCalledWith('emp-1');
    expect(getDailyStatus).toHaveBeenCalledWith('Office Admin');
  });

  test('personal completions of a colleague never finish this employee’s task, but shared group completion counts', async () => {
    SOPCompletion.find.mockReturnValue(mockQuery([
      { sop_uuid: 'proof', employee_uuid: 'emp-2', completedBy: 'Other' },
      { sop_uuid: 'cash', employee_uuid: 'emp-2', completedBy: 'Other' },
    ]));
    const result = await getEmployeeDailyStatus(employee, day);
    expect(result.completionMap.proof).toBeUndefined();
    expect(result.completionMap.cash).toBeTruthy();
    expect(result.blockingTasks.map((task) => task.sop_uuid)).toEqual(['proof']);
  });

  test('handover records close the attendance gate but never masquerade as completed work', async () => {
    SOPHandover.find.mockReturnValue(mockQuery([
      { sop_uuid: 'cash', assignedTo: 'Manager' },
      { sop_uuid: 'proof', assignedTo: 'Manager' },
    ]));
    const result = await getEmployeeDailyStatus(employee, day);
    expect(result.canEndDay).toBe(true);
    expect(result.exceptions).toHaveLength(2);
    expect(result.completionMap.cash).toBeUndefined();
  });

  test('mandatory SOP cannot be skipped and another employee’s task cannot be ticked', async () => {
    await expect(saveEmployeeCompletion(employee, 'proof', { skip: true, reason: 'not today' }))
      .rejects.toMatchObject({ status: 400 });
    await expect(saveEmployeeCompletion(employee, 'somebody-else')).rejects.toMatchObject({ status: 403 });
    expect(SOPCompletion.create).not.toHaveBeenCalled();
  });

  test('optional N/A is documented and personal completion uses employee identity', async () => {
    const record = await saveEmployeeCompletion(employee, 'quotation', { skip: true, reason: 'No quotes today' });
    expect(record).toMatchObject({
      sop_uuid: 'quotation', employee_uuid: 'emp-1',
      skipped: true, skipReason: 'No quotes today',
    });
  });

  test('a blocker must have a reason and receiving owner; an approved handover remains visible', async () => {
    await expect(saveSopHandover(employee, 'proof', { reason: 'No', assignedTo: '' }))
      .rejects.toMatchObject({ status: 400 });
    const result = await saveSopHandover(employee, 'proof', {
      reason: 'Client waiting for approval', assignedTo: 'Manager',
    });
    expect(result).toMatchObject({ kind: 'blocked' === 'handover' ? 'blocked' : 'blocked' });
    expect(SOPHandover.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ employee_uuid: 'emp-1', sop_uuid: 'proof' }),
      expect.objectContaining({ $set: expect.objectContaining({ assignedTo: 'Manager' }) }),
      expect.objectContaining({ upsert: true }),
    );
  });

  test('clock-out is refused while mandatory tasks remain incomplete', async () => {
    await expect(ensureSopClockOut(employee)).rejects.toMatchObject({
      status: 409, code: 'SOP_PENDING',
      blockingTasks: expect.arrayContaining([expect.objectContaining({ sop_uuid: 'proof' })]),
    });
    expect(SOPHandover.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test('emergency exit creates reviewable exceptions without fake completions', async () => {
    const status = await ensureSopClockOut(employee, {
      emergencyReason: 'Urgent personal emergency; must leave now', source: 'dashboard',
    });
    expect(status.emergency).toBe(true);
    expect(status.exceptionCount).toBe(2);
    expect(SOPHandover.findOneAndUpdate).toHaveBeenCalledTimes(2);
    expect(SOPCompletion.create).not.toHaveBeenCalled();
  });

  test('when no mandatory tasks are pending, ordinary clock-out is allowed', async () => {
    SOPCompletion.find.mockReturnValue(mockQuery([
      { sop_uuid: 'cash', completedBy: 'Asha' },
      { sop_uuid: 'proof', employee_uuid: 'emp-1', completedBy: 'Asha' },
    ]));
    const status = await ensureSopClockOut(employee);
    expect(status.canEndDay).toBe(true);
    expect(status.emergency).toBe(false);
    expect(SOPHandover.findOneAndUpdate).not.toHaveBeenCalled();
  });
});
