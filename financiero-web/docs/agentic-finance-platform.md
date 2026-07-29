# Virafi: plataforma financiera orientada a metas

## Visión

Virafi convierte metas de vida en un plan financiero ejecutable. El usuario conecta sus cuentas, define qué quiere lograr y recibe acompañamiento continuo de VirafIA, que entiende su flujo de dinero, anticipa riesgos y propone el siguiente mejor paso.

El producto no es un dashboard ni un catálogo de funciones. Su ciclo central es:

1. Entender la meta, el monto, el horizonte y la prioridad.
2. Construir una fotografía financiera con cuentas, movimientos, ingresos, deudas y patrimonio.
3. Calcular una ruta viable con ahorro periódico, colchón y límites de gasto.
4. Detectar desviaciones automáticamente con datos bancarios actualizados.
5. Explicar el impacto y proponer una acción concreta.
6. Aprender de la respuesta del usuario y ajustar el plan.

## Promesa de producto

> Dile a Virafi qué quieres lograr. Virafi organiza tu dinero, vigila tu avance y te ayuda a tomar mejores decisiones para llegar.

La experiencia debe responder de forma simple cuatro preguntas:

- ¿Dónde estoy hoy?
- ¿Qué tan viable es mi meta?
- ¿Qué debo hacer ahora?
- ¿Qué cambió y cómo afecta mi plan?

## Pilares

### Metas financieras y de vida

Cada meta tiene monto, fecha, prioridad, moneda, avance y aportación sugerida. El plan considera liquidez, gastos recurrentes, deuda, ingresos variables y otras metas que compiten por el mismo dinero.

### Finanzas automatizadas

Las integraciones bancarias de solo lectura alimentan cuentas y movimientos. La aplicación clasifica, concilia y detecta recurrencias o anomalías. Cuando una institución no esté disponible debe existir importación manual y una indicación transparente de frescura y cobertura.

### VirafIA proactiva

VirafIA no espera una pregunta. Genera hallazgos priorizados, explica por qué importan y propone acciones medibles: ajustar una aportación, reducir una fuga, reprogramar una meta, atender deuda o proteger liquidez. Las recomendaciones deben ser auditables, reversibles y confirmadas por la persona cuando impliquen una acción sensible.

### Inversión con propósito

Virafi conecta la inversión con la meta, el horizonte, la capacidad de pérdida, la liquidez y el perfil de riesgo. Usa precios y contexto de mercado actualizados cuando la licencia y el proveedor lo permitan. Presenta escenarios, riesgos, costos y alternativas; no promete rendimientos ni ejecuta operaciones sin consentimiento explícito.

## Arquitectura funcional

- **Goal engine:** metas, dependencias, aportaciones y probabilidad de cumplimiento.
- **Financial graph:** cuentas, movimientos, ingresos, deudas, patrimonio y relaciones entre ellos.
- **Planning engine:** flujo proyectado, colchón, capacidad mensual y escenarios.
- **Proactive agent:** señales, prioridad, explicación, propuesta, seguimiento y aprendizaje.
- **Investment intelligence:** perfil de riesgo, universo permitido, datos de mercado, tesis y simulaciones.
- **Trust layer:** consentimiento, trazabilidad, privacidad, límites de acción y confirmación humana.

## Experiencia objetivo

### Activación

1. Crear cuenta.
2. Definir una primera meta significativa.
3. Conectar una cuenta o cargar movimientos.
4. Confirmar ingresos, compromisos y nivel de liquidez.
5. Recibir un primer plan en menos de diez minutos.

### Uso recurrente

- Resumen semanal de avance y cambios relevantes.
- Una acción prioritaria, no una lista infinita de alertas.
- Ajuste automático de escenarios ante nuevos movimientos.
- Conversación con contexto completo y respuestas respaldadas por los datos del usuario.
- Revisión mensual de metas, patrimonio, deuda y estrategia de inversión.

## Límites de automatización

Virafi puede analizar, clasificar, proyectar, simular y recomendar. Transferencias, contratación de productos y operaciones de inversión requieren confirmación explícita y las integraciones o autorizaciones correspondientes. La autonomía debe ampliarse únicamente después de demostrar precisión, seguridad y confianza.

## Roadmap recomendado

### Fase 1: meta y plan confiable

- Onboarding por metas.
- Cálculo de capacidad y aportación.
- Seguimiento de avance.
- Datos bancarios con indicador de frescura.

### Fase 2: VirafIA proactiva

- Detección de desvíos y recurrencias.
- Hallazgos priorizados y explicables.
- Resumen semanal y seguimiento de acciones.
- Memoria de preferencias y decisiones.

### Fase 3: inversión orientada a objetivos

- Perfil de riesgo y horizonte por meta.
- Contexto de mercado y lista de activos permitidos.
- Escenarios, simulación y post-mortem.
- Recomendaciones con riesgos y alternativas visibles.

### Fase 4: automatización supervisada

- Reglas configurables por el usuario.
- Confirmaciones y límites por monto o tipo de acción.
- Integraciones de ejecución solo donde exista capacidad legal, técnica y operativa.

## Métricas de producto

- Tiempo hasta el primer plan útil.
- Porcentaje que crea una meta y conecta una fuente de datos.
- Retención semanal y mensual por cohorte.
- Metas con aportación activa y avance dentro del plan.
- Porcentaje de recomendaciones aceptadas, ignoradas o rechazadas.
- Precisión de clasificación y frescura de conexiones.
- Mejora en ahorro, liquidez y deuda frente a la línea base.
- Costo de IA e integraciones por usuario activo.
- Incidentes de seguridad o acciones incorrectas.

## Criterio de enfoque

Virafi inicia B2C porque la unidad de valor es una persona y sus metas. Una futura oferta B2B o B2B2C debe reutilizar el mismo motor para beneficios financieros, acompañamiento o bienestar de colaboradores, sin desviar el núcleo del producto.
