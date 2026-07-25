# Launch readiness

## Producto

- El onboarding pide una meta real, monto, horizonte y prioridad.
- El usuario obtiene un primer plan útil sin configurar módulos innecesarios.
- El dashboard explica avance, capacidad mensual y siguiente acción.
- La conversación de VirafIA usa cuentas, movimientos, metas, deuda, patrimonio e inversiones.
- Las recomendaciones de inversión muestran horizonte, riesgo, liquidez, fuentes y alternativas.
- No se promete rendimiento ni se ejecutan acciones sensibles sin confirmación.

## Datos e integraciones

- Confirmar autenticación real y aislamiento por `profile_id`.
- Aplicar las migraciones pendientes y verificar RLS.
- Probar conexión bancaria, renovación de consentimiento, sincronización y desconexión.
- Mostrar cobertura, estado y frescura de cada fuente.
- Mantener carga manual como alternativa cuando falle una conexión.
- Validar precios y marcas de tiempo del contexto de mercado.

## Seguridad y operación

- Rotar secretos que hayan salido del gestor autorizado.
- Confirmar variables de producción en Vercel sin exponer valores.
- Verificar rate limiting, auditoría, alertas y exportación/borrado de cuenta.
- Probar restore en staging y documentar responsable y tiempo de recuperación.
- Revisar que ninguna integración pueda mover dinero o ejecutar operaciones sin consentimiento explícito.

## Verificación técnica

```bash
npm run lint
npm run build
npm run security:secrets
npm run data:audit
```

Ejecutar también el plan manual en [manual-test-plan.md](./manual-test-plan.md) y el chequeo contra producción con las credenciales administradas del entorno.

## Prueba privada

Antes de marketing amplio, validar con una cohorte pequeña:

- 60% recibe un plan útil durante la primera sesión.
- 50% vuelve durante la primera semana.
- 40% conserva una meta activa después de cuatro semanas.
- La mayoría entiende por qué recibió cada recomendación.
- La sincronización bancaria cumple el nivel de frescura comunicado.
- No existen incidentes graves de datos ni acciones sensibles no autorizadas.

## Escala

- 10–100 usuarios: comprobar activación, confianza y soporte necesario.
- 100–1,000 usuarios: workers, colas, límites por proveedor y monitoreo de costos.
- 1,000–100,000 usuarios: backpressure, cache, observabilidad por cohorte y data warehouse.
- Más de 100,000 usuarios: aislamiento avanzado, particionado y operación dedicada.
