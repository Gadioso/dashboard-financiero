-- Permite que el dashboard deje de hablar de "Fase 1: Escudo" y registre origen Santander_Email.
-- Ejecutar en Supabase SQL Editor cuando quieras aplicar el cambio de esquema.

ALTER TABLE presupuestos_mensuales
  DROP CONSTRAINT IF EXISTS presupuestos_mensuales_fase_ahorro_check;

ALTER TABLE presupuestos_mensuales
  ADD CONSTRAINT presupuestos_mensuales_fase_ahorro_check
  CHECK (fase_ahorro IN ('Regla 33/33/33 activa', 'Fase 1: Escudo', 'Fase 2: Crecimiento'));

UPDATE presupuestos_mensuales
SET fase_ahorro = 'Regla 33/33/33 activa'
WHERE fase_ahorro = 'Fase 1: Escudo';

ALTER TABLE gastos
  DROP CONSTRAINT IF EXISTS gastos_origen_check;

ALTER TABLE gastos
  ADD CONSTRAINT gastos_origen_check
  CHECK (origen IN ('Web', 'Telegram', 'Santander_Email'));
