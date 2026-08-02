# Plantillas de correo de Supabase

Estas plantillas se pegan en Supabase Dashboard → Authentication → Email Templates.
Supabase permite usar `{{ .Data }}` (los metadatos de `auth.users`) y condicionales de Go Templates. Virafi guarda `country_code` y `locale` al crear la cuenta, por lo que el correo se renderiza en español para `MX` y en inglés para `US`.

Configura:

- **Confirm signup**: asunto `{{ if eq .Data.locale "en-US" }}Confirm your Virafi email{{ else }}Confirma tu correo y activa tu cuenta de Virafi{{ end }}` y contenido de `confirmation.html`.
- **Reset password**: asunto `{{ if eq .Data.locale "en-US" }}Reset your Virafi password{{ else }}Restablece tu contraseña de Virafi{{ end }}` y contenido de `recovery.html`.

Las cuentas existentes sin `locale` caen intencionalmente al español. Pegar la plantilla en el Dashboard es un paso de configuración del proyecto Supabase; el código de la aplicación ya envía y conserva el dato de país/idioma.
