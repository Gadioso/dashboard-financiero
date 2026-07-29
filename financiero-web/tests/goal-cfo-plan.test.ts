import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGoalCfoPlan } from '../lib/goal-cfo-plan.ts';

test('builds an explainable allocation without treating capacity as a goal price', () => {
  const plan = buildGoalCfoPlan({
    personalization: {
      monthly_goal_capacity: 8000,
      emergency_fund_status: '3 meses',
      investment_experience: 'basica',
      risk_tolerance: 'moderada',
    },
    goals: [
      { id: 'travel', name: 'Independizarme y viajar', target_amount: 16000, horizon_months: 12, source: 'personalization' },
      { id: 'property', name: 'Comprar una propiedad', target_amount: 48000, horizon_months: 36, source: 'personalization' },
    ],
    legacyGeneratedGoalIds: ['faith', 'family', 'work', 'pleasure', 'travel', 'property'],
  });

  assert.equal(plan.monthlyCapacity, 8000);
  assert.equal(plan.allocations.reduce((sum, item) => sum + item.monthlyAmount, 0), 8000);
  assert.equal(plan.emergency.monthlyAmount, 2800);
  assert.equal(plan.investing.monthlyAmount, 800);
  assert.equal(plan.goals[0].targetAmount, null);
  assert.equal(plan.goals[1].targetAmount, null);
  assert.match(plan.goals[0].targetIssue || '', /fórmula antigua/);
  assert.deepEqual(plan.goals[0].milestones, [
    'Depósito, mudanza y equipamiento básico',
    'Colchón para sostener la nueva vida',
    'Viaje con destino, fecha y presupuesto propios',
  ]);
});

test('keeps a confirmed target when there is no evidence of legacy generation', () => {
  const plan = buildGoalCfoPlan({
    personalization: { monthly_goal_capacity: 5000, emergency_fund_status: '6 meses', investment_experience: 'intermedia' },
    goals: [{ id: 'home', name: 'Comprar una propiedad', target_amount: 500000, horizon_months: 60, source: 'manual' }],
    legacyGeneratedGoalIds: ['home'],
  });

  assert.equal(plan.goals[0].targetAmount, 500000);
  assert.equal(plan.goals[0].needsDiscovery, false);
  assert.equal(plan.allocations.reduce((sum, item) => sum + item.monthlyAmount, 0), 5000);
});
