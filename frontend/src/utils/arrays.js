// src/utils/arrays.js
export function shallowEqualArray(a, b) {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i],
      y = b[i];
    if (x?.id != null || y?.id != null) {
      if (x?.id !== y?.id) return false;
    } else if (x !== y) {
      return false;
    }
  }
  return true;
}

export const setIfChanged = (set, next, eq) =>
  set((prev) => (eq(prev, next) ? prev : next));
