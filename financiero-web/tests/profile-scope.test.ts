import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyProfileFilter,
  normalizeProfileId,
  requireScopedProfileId,
  withProfile,
} from '../lib/profile-scope.ts';

const profileId = '11111111-1111-4111-8111-111111111111';

test('normalizes valid UUID profile identifiers', () => {
  assert.equal(normalizeProfileId(` ${profileId} `), profileId);
  assert.equal(normalizeProfileId('invalid'), null);
});

test('fails closed when profile scope is missing', () => {
  assert.throws(() => requireScopedProfileId(null), /perfil autenticado válido/);
  assert.throws(() => withProfile({ amount: 10 }, undefined), /perfil autenticado válido/);
});

test('always adds profile_id to writes', () => {
  assert.deepEqual(withProfile({ amount: 10 }, profileId), {
    amount: 10,
    profile_id: profileId,
  });
});

test('always adds a profile_id equality filter to reads', () => {
  const calls: Array<[string, string]> = [];
  const query = {
    eq(column: string, value: string) {
      calls.push([column, value]);
      return this;
    },
  };

  assert.equal(applyProfileFilter(query, profileId), query);
  assert.deepEqual(calls, [['profile_id', profileId]]);
});
