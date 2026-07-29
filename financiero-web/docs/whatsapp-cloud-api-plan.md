# Viabilidad de WhatsApp para Virafi

Estado: base técnica preparada en modo seguro; compra y activación productiva detenidas hasta resolver la clasificación contractual de VirafIA.

## Decisión recomendada

Usar directamente la **WhatsApp Business Platform Cloud API de Meta**. No usar automatización de WhatsApp Web ni agregar Twilio u otro BSP mientras no exista una necesidad concreta. La conexión directa conserva la propiedad del WABA y evita sumar un proveedor, margen y dependencia innecesarios.

La integración debe tratar WhatsApp como un adaptador de canal. La memoria, autorización por `profile_id`, herramientas financieras y confirmaciones deterministas siguen viviendo en Virafi/Supabase; Meta sólo transporta mensajes.

## Bloqueo contractual vigente

Las [WhatsApp Business Solution Terms](https://www.whatsapp.com/legal/business-solution-terms/) modificadas el 6 de marzo de 2026 prohíben que proveedores o desarrolladores de IA usen WhatsApp Business Solution para ofrecer tecnologías de IA cuando éstas sean la funcionalidad principal. La excepción explícita sólo cubre números registrados del Espacio Económico Europeo y Brasil.

VirafIA es un asistente financiero conversacional basado en Gemini y opera desde México. Aunque Virafi también es un dashboard financiero y podría argumentarse que la IA es auxiliar del producto, Meta se reserva determinar unilateralmente si la IA es principal o incidental. Una integración conversacional completa tiene, por tanto, riesgo material de suspensión.

Antes de activar `WHATSAPP_CHANNEL_MODE=assistant` se requiere una confirmación escrita de Meta o una evaluación jurídica documentada que concluya que Virafi entra como servicio financiero con IA incidental. El código exige además `WHATSAPP_AI_POLICY_APPROVED=true`; una sola variable no basta para activarlo accidentalmente.

Texto sugerido para el caso de soporte de Meta:

> Virafi is a personal-finance SaaS for users in Mexico. Its primary product is a financial dashboard that stores user-entered income, expenses, budgets and goals. We want WhatsApp to be an authenticated channel for users to register their own movements, query their own dashboard and receive requested account/goal updates. Google Gemini assists with natural-language interpretation, but Virafi does not expose a general-purpose model, model API or open-ended AI assistant. Would this use be considered incidental or ancillary AI functionality under section “AI Providers” of the WhatsApp Business Solution Terms dated March 6, 2026? Please confirm whether Cloud API may be used for this functionality with a Mexican business number.

Mientras tanto son candidatos de menor riesgo:

- verificación y vinculación del canal;
- soporte humano sobre la cuenta de Virafi;
- notificaciones de utilidad solicitadas por el usuario;
- autenticación y confirmaciones transaccionales con plantillas aprobadas;
- enlaces hacia la experiencia conversacional en web.

## Requisitos de Meta

La [colección oficial de Meta para Cloud API](https://www.postman.com/meta/whatsapp-business-platform/documentation/wlk6lh4/whatsapp-cloud-api) exige:

1. Un portafolio empresarial de Meta.
2. Una WhatsApp Business Account (WABA).
3. Una app de Meta con el producto WhatsApp.
4. Un número empresarial capaz de recibir el código de propiedad por SMS o llamada.
5. Registro del número y un PIN de verificación en dos pasos de seis dígitos.
6. Un token permanente de System User con los permisos mínimos de WhatsApp.
7. Suscribir la app al WABA y configurar el webhook público de Railway.
8. Perfil comercial, datos de soporte, política de privacidad y opt-in válidos.

Meta proporciona un número de prueba para desarrollar antes de comprar una línea. Esa debe ser la primera prueba.

## Número recomendado

No comprar el número dentro de Meta: Cloud API registra un número que Virafi ya posee. Para producción conviene una línea mexicana nueva y dedicada a Virafi, comprada directamente a un operador que permita recibir SMS o llamada de verificación y conservar la titularidad empresarial.

Antes de comprar, confirmar:

- titularidad a nombre de la entidad que operará Virafi;
- recepción confiable de SMS y llamadas internacionales;
- portabilidad y recuperación del número;
- que no esté registrado actualmente en WhatsApp personal o Business, salvo que Meta confirme un flujo de coexistencia aplicable;
- costo mensual, vigencia y proceso de reposición de SIM/eSIM.

No reutilizar el número personal del fundador. Separar el activo evita pérdida de conversaciones, conflictos de registro y dependencia de una persona.

## Costos

Meta cobra por mensaje entregado según país y categoría. La [página oficial de precios](https://whatsappbusiness.com/es-la/products/platform-pricing/) indica:

- los mensajes de servicio dentro de la ventana de 24 horas iniciada por el usuario no tienen costo;
- los mensajes de utilidad enviados como respuesta al usuario tampoco tienen costo;
- los mensajes iniciados por la empresa requieren una plantilla aprobada y pueden generar cargo;
- la tarifa exacta de México cambia por categoría, moneda y volumen, por lo que debe tomarse de la hoja vigente al momento de activar producción;
- aparte se paga la línea telefónica al operador; con Cloud API directa no hay cuota de un BSP.

## Base técnica implementada

- `GET /api/whatsapp/webhook`: handshake de verificación de Meta.
- `POST /api/whatsapp/webhook`: verificación HMAC `X-Hub-Signature-256`, parseo limitado y acuse sin PII.
- Adaptador para envío de texto por Graph API, sin SDK archivado ni proveedor adicional.
- Estados de salud separados para webhook, envío y asistente.
- Doble feature flag contractual; el endpoint es sólo recepción durante la fase de preparación.

Variables privadas requeridas:

```bash
WHATSAPP_CHANNEL_MODE=setup
WHATSAPP_AI_POLICY_APPROVED=false
WHATSAPP_APP_SECRET=...
WHATSAPP_WEBHOOK_VERIFY_TOKEN=...
WHATSAPP_ACCESS_TOKEN=...
WHATSAPP_PHONE_NUMBER_ID=...
WHATSAPP_GRAPH_API_VERSION=...
```

No deben usar el prefijo `NEXT_PUBLIC_` ni almacenarse en Git.

Callback para Meta:

```text
https://virafi.com/api/whatsapp/webhook
```

## Fases de activación

1. **Sandbox**: crear app/WABA de prueba, usar el número temporal de Meta y verificar el webhook.
2. **Cumplimiento**: solicitar a Meta confirmación escrita sobre el caso de uso de asistente financiero vertical; documentar consentimiento, retención y uso de Gemini como tercero encargado.
3. **Número**: comprar la línea empresarial únicamente después de la respuesta anterior.
4. **Piloto transaccional**: vinculación de un perfil, idempotencia por `wamid`, opt-in y plantillas de utilidad.
5. **Conversación**: sólo si cumplimiento lo permite, reutilizar el núcleo de VirafIA con autorización por `profile_id`, memoria compartida y confirmaciones deterministas.
6. **Producción**: métricas de entrega, calidad, opt-out, borrado, límites por plan y revisión de privacidad/términos.

## Criterio de salida

La integración completa puede declararse viable cuando existan simultáneamente: aprobación contractual documentada, WABA verificado, número empresarial propio, webhook firmado, token permanente, opt-in, plantillas aprobadas, pruebas de aislamiento entre perfiles y monitoreo de entrega. Hasta entonces el modo `assistant` debe permanecer apagado.
