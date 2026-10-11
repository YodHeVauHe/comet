import { describe, it, expect } from 'vitest';
import {
  groupApplicationRuns,
  groupApplicationSteps,
  initialApplicationRecord,
  mergeApplicationRunPages,
} from '../../../domains/dashboard/web/src/application-data.js';

describe('Comet Any workspace identity', () => {
  it('groups versions by application while retaining independent early creations', () => {
    const items = [
      { locator: 'draft', kind: 'creator', goal: 'Goal', application: null },
      {
        locator: 'one',
        kind: 'creator',
        application: { id: 'app', version: '1' },
        applicationId: 'app',
      },
      {
        locator: 'two',
        kind: 'application',
        application: { id: 'app', version: '2' },
        applicationId: 'app',
      },
    ];
    const groups = groupApplicationRuns(items);
    expect(groups).toHaveLength(2);
    expect(groups.find((g: any) => g.id === 'app').versions).toEqual(['1', '2']);
    expect(groups[0].id).toBeNull();
  });
  it('keeps activation identities and chooses attention without hiding concurrent work', () => {
    const records = [
      { id: 'action-old', stepId: 'repeat', status: 'succeeded', active: false },
      { id: 'action-current', stepId: 'repeat', status: 'running', active: true },
      { id: 'approval', stepId: 'approval', status: 'waiting', active: true },
    ];
    const steps = groupApplicationSteps(records);
    expect(steps[0].records.map((r: any) => r.id)).toEqual(['action-old', 'action-current']);
    expect(
      initialApplicationRecord({ records, currentIds: ['action-current', 'approval'] }).id,
    ).toBe('approval');
    expect(records.filter((r) => r.active)).toHaveLength(2);
  });
  it('replaces revised summaries by stable locator when loading more pages', () => {
    expect(
      mergeApplicationRunPages(
        { items: [{ locator: 'one', revision: 1 }] },
        {
          items: [
            { locator: 'one', revision: 2 },
            { locator: 'two', revision: 1 },
          ],
          total: 2,
        },
      ).items,
    ).toEqual([
      { locator: 'one', revision: 2 },
      { locator: 'two', revision: 1 },
    ]);
  });
});
