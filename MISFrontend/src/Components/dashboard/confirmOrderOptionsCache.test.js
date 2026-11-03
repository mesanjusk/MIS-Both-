import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearConfirmOptionsCache, loadConfirmOptions, readConfirmOptions, replaceConfirmOptions,
} from './confirmOrderOptionsCache';

beforeEach(() => clearConfirmOptionsCache());

describe('Confirm MIS Order dropdown cache', () => {
  it('reuses loaded options, scopes data by user and deduplicates concurrent fetches', async () => {
    const loader = vi.fn().mockResolvedValue([{ Item_name: 'Flex Banner' }]);
    const [first, second] = await Promise.all([
      loadConfirmOptions('operator-a', 'items', loader),
      loadConfirmOptions('operator-a', 'items', loader),
    ]);
    expect(first).toEqual(second);
    expect(loader).toHaveBeenCalledTimes(1);
    expect(await loadConfirmOptions('operator-a', 'items', loader)).toEqual(first);
    expect(loader).toHaveBeenCalledTimes(1);
    expect(readConfirmOptions('operator-b', 'items')).toBeNull();
  });

  it('replaces only the edited master after an inline addition', async () => {
    replaceConfirmOptions('operator-a', 'customers', [{ Customer_name: 'Old Client' }]);
    replaceConfirmOptions('operator-a', 'items', [{ Item_name: 'Old Product' }]);
    replaceConfirmOptions('operator-a', 'items', [{ Item_name: 'New Product' }]);
    expect(readConfirmOptions('operator-a', 'customers')).toEqual([{ Customer_name: 'Old Client' }]);
    expect(readConfirmOptions('operator-a', 'items')).toEqual([{ Item_name: 'New Product' }]);
  });
});
