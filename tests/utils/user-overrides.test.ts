// ============================================================================
// Tests — user-overrides deepMerge + resolveUserConfig
// ============================================================================
// Covers the prototype-pollution guard (review §S-2) and the basic merge
// semantics used by per-user / per-role config resolution.
// ============================================================================

import { describe, it, expect } from 'vitest';

import { deepMerge } from '../../src/utils/user-overrides';

describe('deepMerge — prototype-pollution guard (S-2)', () => {
  it('ignores __proto__ keys in the override', () => {
    const base = { foo: 1 } as Record<string, unknown>;
    const malicious = JSON.parse('{"__proto__":{"polluted":true}}') as Record<string, unknown>;
    const result = deepMerge(base, malicious);
    // Result must NOT pick up the polluted property via the prototype chain
    expect((result as Record<string, unknown>).polluted).toBeUndefined();
    // Plain Object.prototype must be untouched (defence in depth)
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('ignores constructor keys in the override', () => {
    const base = { foo: 1 };
    const malicious = JSON.parse('{"constructor":{"prototype":{"hacked":true}}}') as Record<string, unknown>;
    const result = deepMerge(base, malicious);
    expect((result as Record<string, unknown>).hacked).toBeUndefined();
    expect(({} as Record<string, unknown>).hacked).toBeUndefined();
  });

  it('ignores prototype keys in the override', () => {
    const base = { foo: 1 };
    const malicious = JSON.parse('{"prototype":{"hacked":true}}') as Record<string, unknown>;
    const result = deepMerge(base, malicious);
    expect((result as Record<string, unknown>).hacked).toBeUndefined();
  });

  it('still merges legitimate nested overrides', () => {
    const base = { a: { b: 1, c: 2 } };
    const override = { a: { c: 99, d: 3 } } as Partial<typeof base>;
    const result = deepMerge(base, override);
    // c overridden, b kept, d added
    expect(result.a.b).toBe(1);
    expect((result.a as Record<string, number>).c).toBe(99);
    expect((result.a as Record<string, number>).d).toBe(3);
  });

  it('replaces arrays instead of concatenating', () => {
    const base = { list: [1, 2, 3] };
    const override = { list: [9] };
    const result = deepMerge(base, override);
    expect(result.list).toEqual([9]);
  });
});
