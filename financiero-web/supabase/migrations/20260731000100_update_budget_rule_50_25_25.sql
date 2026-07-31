-- Replace the legacy equal-thirds label with the current 50/25/25 rule.
ALTER TABLE presupuestos_mensuales
  DROP CONSTRAINT IF EXISTS presupuestos_mensuales_fase_ahorro_check;

ALTER TABLE presupuestos_mensuales
  ADD CONSTRAINT presupuestos_mensuales_fase_ahorro_check
  CHECK (fase_ahorro IN ('Regla 33/33/33 activa', 'Regla 50/25/25 activa', 'Fase 1: Escudo', 'Fase 2: Crecimiento'));

UPDATE presupuestos_mensuales
SET fase_ahorro = 'Regla 50/25/25 activa'
WHERE fase_ahorro = 'Regla 33/33/33 activa';

UPDATE presupuestos_mensuales
SET fase_ahorro = 'Regla 50/25/25 activa'
WHERE fase_ahorro = 'Fase 1: Escudo';
