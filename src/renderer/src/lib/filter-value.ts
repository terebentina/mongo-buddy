export type FilterValueAction = 'include' | 'exclude';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isOperatorCondition(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value);
  return keys.length > 0 && keys.every((key) => key.startsWith('$'));
}

function valuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;

  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((value, index) => valuesEqual(value, right[index]));
  }

  if (!isRecord(left) || !isRecord(right)) return false;
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every((key, index) => key === rightKeys[index] && valuesEqual(left[key], right[key]))
  );
}

function appendUnique(values: unknown[], value: unknown): unknown[] {
  return values.some((existing) => valuesEqual(existing, value)) ? values : [...values, value];
}

function includeValue(condition: Record<string, unknown>, value: unknown): Record<string, unknown> {
  const included = condition.$in;
  if (Array.isArray(included)) {
    return { ...condition, $in: appendUnique(included, value) };
  }
  return { ...condition, $in: [value] };
}

function excludeValue(condition: Record<string, unknown>, value: unknown): Record<string, unknown> {
  const excluded = condition.$nin;
  if (Array.isArray(excluded)) {
    return { ...condition, $nin: appendUnique(excluded, value) };
  }

  if (Object.hasOwn(condition, '$ne')) {
    const { $ne: firstExcluded, ...otherConditions } = condition;
    if (valuesEqual(firstExcluded, value)) return condition;
    return { ...otherConditions, $nin: appendUnique([firstExcluded], value) };
  }

  return { ...condition, $ne: value };
}

export function combineFilterValue(existing: unknown, selected: unknown, action: FilterValueAction): unknown {
  if (existing === undefined) {
    return action === 'include' ? selected : { $ne: selected };
  }

  if (isOperatorCondition(existing)) {
    return action === 'include' ? includeValue(existing, selected) : excludeValue(existing, selected);
  }

  if (action === 'exclude') {
    return { $in: [existing], $ne: selected };
  }

  return valuesEqual(existing, selected) ? existing : { $in: [existing, selected] };
}
