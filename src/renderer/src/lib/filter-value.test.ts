import { describe, expect, it } from 'vitest';
import { combineFilterValue } from './filter-value';

describe('combineFilterValue', () => {
  it('uses an exact condition for the first included value', () => {
    expect(combineFilterValue(undefined, 'active', 'include')).toBe('active');
  });

  it('uses $ne for the first excluded value', () => {
    expect(combineFilterValue(undefined, 'archived', 'exclude')).toEqual({ $ne: 'archived' });
  });

  it('uses $in for multiple included values without duplicates', () => {
    const combined = combineFilterValue('active', 'pending', 'include');

    expect(combined).toEqual({ $in: ['active', 'pending'] });
    expect(combineFilterValue(combined, 'pending', 'include')).toEqual({ $in: ['active', 'pending'] });
  });

  it('uses $nin for multiple excluded values without duplicates', () => {
    const combined = combineFilterValue({ $ne: 'archived' }, 'blocked', 'exclude');

    expect(combineFilterValue({ $ne: 'archived' }, 'archived', 'exclude')).toEqual({ $ne: 'archived' });
    expect(combined).toEqual({ $nin: ['archived', 'blocked'] });
    expect(combineFilterValue(combined, 'blocked', 'exclude')).toEqual({ $nin: ['archived', 'blocked'] });
  });

  it('preserves custom operators on the same field', () => {
    const included = combineFilterValue({ $gt: 18, $lt: 65 }, 30, 'include');

    expect(included).toEqual({ $gt: 18, $lt: 65, $in: [30] });
    expect(combineFilterValue(included, 40, 'exclude')).toEqual({
      $gt: 18,
      $lt: 65,
      $in: [30],
      $ne: 40,
    });
  });

  it('preserves conflicts between included and excluded values', () => {
    expect(combineFilterValue({ $ne: 'blocked' }, 'blocked', 'include')).toEqual({
      $ne: 'blocked',
      $in: ['blocked'],
    });

    expect(combineFilterValue({ $in: ['blocked'] }, 'blocked', 'exclude')).toEqual({
      $in: ['blocked'],
      $ne: 'blocked',
    });
  });

  it.each([
    ['scalar', 'active', 'pending'],
    ['object', { state: 'active' }, { state: 'pending' }],
    ['array', ['active'], ['pending']],
  ])('combines an exact %s condition with the same rules', (_name, existing, selected) => {
    expect(combineFilterValue(existing, selected, 'include')).toEqual({ $in: [existing, selected] });
    expect(combineFilterValue(existing, selected, 'exclude')).toEqual({ $in: [existing], $ne: selected });
  });

  it('removes duplicate object and array values from operator lists', () => {
    const objectValue = { state: 'active' };
    const arrayValue = ['active', 'pending'];

    expect(combineFilterValue({ $in: [objectValue] }, { state: 'active' }, 'include')).toEqual({
      $in: [objectValue],
    });
    expect(combineFilterValue({ $nin: [arrayValue] }, ['active', 'pending'], 'exclude')).toEqual({
      $nin: [arrayValue],
    });
  });
});
