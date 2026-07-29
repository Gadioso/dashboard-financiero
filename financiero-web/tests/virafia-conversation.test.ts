import assert from 'node:assert/strict';
import test from 'node:test';
import {
  goalFromUserPerspective,
  removeQuotedGoalLabels,
} from '../lib/virafia-conversation-principles.ts';

test('turns first-person stored goal labels into natural user-facing language', () => {
  assert.equal(goalFromUserPerspective('Independizarme y viajar'), 'independizarte y viajar');
  assert.equal(goalFromUserPerspective('Comprar mi casa'), 'comprar tu casa');
  assert.equal(goalFromUserPerspective('“Irme a vivir solo”'), 'irte a vivir solo');
});

test('removes quoted goal labels instead of displaying them like variables', () => {
  assert.equal(
    removeQuotedGoalLabels(
      'La meta “Independizarme y viajar” necesita atención.',
      ['Independizarme y viajar'],
    ),
    'Tu plan para independizarte y viajar necesita atención.',
  );
});
