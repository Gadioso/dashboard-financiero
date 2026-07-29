import type { Metadata } from 'next';
import LegalPage from '@/app/Components/LegalPage';

const updatedAt = '29 de julio de 2026';

export const metadata: Metadata = {
  title: 'Aviso de privacidad integral',
  description: 'Aviso de privacidad integral de Virafi: datos tratados, finalidades, proveedores, seguridad y derechos ARCO.',
};

const sections = [
  {
    id: 'responsable',
    title: 'Identidad del responsable',
    content: <>
      <p>Virafi es el nombre comercial del servicio digital operado por Tendencia.ai (en este documento, “Virafi”, “nosotros” o el “Responsable”), con operación en México y correo de contacto <a href="mailto:info@virafi.com">info@virafi.com</a>.</p>
      <p>El área encargada de datos personales recibe solicitudes en ese correo. Para cualquier notificación física o para conocer el domicilio completo del Responsable, solicítalo por el mismo medio. Antes de una apertura comercial general, la identidad corporativa y el domicilio legal completos deberán reflejarse en esta sección.</p>
    </>,
  },
  {
    id: 'alcance',
    title: 'Alcance del aviso',
    content: <>
      <p>Este aviso aplica al sitio virafi.com, la aplicación web, el dashboard, los canales conversacionales, las integraciones y los servicios de soporte de Virafi. Describe el tratamiento de datos de usuarios, visitantes y personas que se comunican con nosotros.</p>
      <p>Los sitios y servicios de terceros tienen sus propios avisos. Virafi no controla el tratamiento que esos terceros realizan fuera de las instrucciones necesarias para prestar la función solicitada.</p>
    </>,
  },
  {
    id: 'datos',
    title: 'Datos personales que tratamos',
    content: <>
      <h3>Identificación y cuenta</h3><p>Nombre, correo electrónico, identificador de usuario, fotografía de perfil, país, ubicación general, ocupación, tipo de actividad, preferencias y credenciales de sesión. No almacenamos tu contraseña en texto legible.</p>
      <h3>Información financiera y patrimonial</h3><p>Ingresos, gastos, presupuestos, metas, categorías, saldos declarados, tarjetas, movimientos, deudas, fondos, inversiones declaradas, tolerancia al riesgo, horizonte y demás información que captures. Virafi no conecta ni sincroniza cuentas bancarias. Por su naturaleza, estos datos requieren protección reforzada aunque no todos estén clasificados legalmente como sensibles.</p>
      <h3>Información de metas e inversión</h3><p>Objetivos de vida, plazos, aportaciones, perfil de riesgo, experiencia, preferencias, posiciones declaradas, tesis y simulaciones que guardas para recibir orientación contextual.</p>
      <h3>Conversaciones y archivos</h3><p>Mensajes, notas de voz, transcripciones, archivos, imágenes y documentos que envías por web o Telegram, junto con las respuestas y confirmaciones necesarias para atender tu solicitud.</p>
      <h3>Integraciones y datos técnicos</h3><p>Canal o proveedor conectado, estado de conexión, identificadores técnicos, fechas de actividad, dirección IP convertida en hash para auditoría, dispositivo, navegador, registros de seguridad, errores y uso del servicio.</p>
      <p>No solicitamos datos sensibles como salud, origen étnico, religión, opiniones políticas o preferencia sexual. Si los incluyes voluntariamente en texto o documentos, los trataremos sólo para atender la función solicitada y te recomendamos no compartirlos cuando no sean necesarios.</p>
    </>,
  },
  {
    id: 'origen',
    title: 'Cómo obtenemos la información',
    content: <>
      <ul><li>Directamente de ti al crear la cuenta, completar el perfil, registrar movimientos, conversar o subir archivos.</li><li>De Telegram cuando vinculas voluntariamente tu chat y envías instrucciones o archivos.</li><li>De fuentes de mercado públicas o contratadas para mostrar contexto general, sin atribuir esos datos a tu identidad salvo que los guardes en una tesis o simulación.</li><li>Automáticamente mediante cookies de sesión, registros técnicos, seguridad y diagnóstico.</li></ul>
    </>,
  },
  {
    id: 'finalidades',
    title: 'Finalidades del tratamiento',
    content: <>
      <h3>Finalidades necesarias</h3>
      <ul><li>Crear, autenticar, administrar y proteger tu cuenta.</li><li>Registrar, normalizar, deduplicar y clasificar movimientos.</li><li>Calcular presupuestos, flujo, metas, saldos, reportes, escenarios y alertas.</li><li>Prestar funciones de conversación, transcripción, análisis de documentos e inteligencia financiera.</li><li>Conectar y sincronizar las integraciones que activas.</li><li>Prestar funciones de metas, patrimonio, mercados, inversión y negocio solicitadas.</li><li>Procesar pagos, administrar planes, emitir comprobantes y atender cancelaciones.</li><li>Dar soporte, responder solicitudes, prevenir abuso y mantener seguridad y continuidad.</li><li>Cumplir obligaciones legales, contractuales y requerimientos de autoridad competente.</li></ul>
      <h3>Finalidades opcionales</h3>
      <p>Con tu consentimiento, podremos enviarte novedades de producto, encuestas o comunicaciones comerciales. Puedes oponerte o retirar tu consentimiento en cualquier momento escribiendo a <a href="mailto:info@virafi.com">info@virafi.com</a>. Negarte a estas finalidades no afecta el uso esencial del servicio.</p>
      <p>No vendemos datos personales ni los usamos para publicidad de terceros.</p>
    </>,
  },
  {
    id: 'ia',
    title: 'Inteligencia artificial y decisiones automatizadas',
    content: <>
      <p>Virafi utiliza modelos y reglas para clasificar movimientos, resumir información, transcribir audio, analizar documentos, detectar patrones y generar explicaciones o sugerencias. Las respuestas pueden contener errores y dependen de los datos disponibles.</p>
      <p>El sistema no debe ejecutar por sí solo transferencias, compras, ventas de inversión u otras acciones con efectos relevantes sin una instrucción y confirmación aplicables. Puedes solicitar revisión, corregir información u oponerte a un tratamiento automatizado que produzca efectos jurídicos no deseados o afecte significativamente tus intereses, en los supuestos previstos por la ley.</p>
      <p>Cuando enviamos contexto a un proveedor de IA, buscamos limitarlo a lo necesario para la tarea. Evita incluir secretos, contraseñas o información de terceros sin autorización.</p>
    </>,
  },
  {
    id: 'encargados',
    title: 'Encargados, integraciones y transferencias',
    content: <>
      <p>Para operar el servicio utilizamos proveedores especializados únicamente cuando son necesarios. Estos pueden incluir Railway para infraestructura, Supabase para datos y autenticación, Stripe para pagos, Telegram para mensajería, proveedores de datos de mercado y Google Gemini para inteligencia artificial.</p>
      <p>Estos proveedores pueden tratar información en México u otros países bajo contratos, instrucciones y medidas de protección aplicables. Algunos actúan como encargados por cuenta de Virafi; otros, como Stripe o Telegram, también pueden determinar parte de su tratamiento conforme a sus propios avisos.</p>
      <p>Podemos comunicar datos a autoridades cuando exista un mandato fundado y motivado, o cuando la ley lo permita o exija. Cualquier transferencia que requiera consentimiento se realizará después de informarte y obtenerlo en la forma correspondiente.</p>
    </>,
  },
  {
    id: 'cookies',
    title: 'Cookies y tecnologías similares',
    content: <>
      <p>Usamos cookies estrictamente necesarias para mantener la sesión, proteger rutas autenticadas y recordar preferencias esenciales. También podemos usar telemetría de errores y rendimiento para mantener el servicio.</p>
      <p>No usamos cookies de publicidad conductual. Puedes bloquear cookies desde tu navegador, pero las cookies de sesión son necesarias para entrar al dashboard y algunas funciones dejarán de operar.</p>
    </>,
  },
  {
    id: 'seguridad',
    title: 'Medidas de seguridad',
    content: <>
      <p>Aplicamos medidas administrativas, técnicas y organizativas acordes con la naturaleza de la información: autenticación, aislamiento por perfil, controles a nivel de base de datos, cifrado de tokens, secretos del lado servidor, registros de auditoría, monitoreo de errores, respaldos y pruebas de recuperación.</p>
      <p>Ningún sistema es infalible. Si una vulneración afecta de forma significativa tus derechos patrimoniales o morales, te informaremos de manera oportuna con la información disponible y las medidas recomendadas.</p>
    </>,
  },
  {
    id: 'retencion',
    title: 'Conservación, bloqueo y eliminación',
    content: <>
      <p>Conservamos información mientras tu cuenta esté activa y durante el tiempo necesario para prestar funciones, atender soporte, prevenir fraude, respaldar transacciones, cumplir obligaciones o resolver responsabilidades. Al terminar una finalidad, eliminaremos o disociaremos los datos después del periodo de bloqueo legal aplicable.</p>
      <p>Las conversaciones, documentos temporales y registros técnicos pueden tener periodos más breves que los datos financieros persistentes. La eliminación de respaldos se completa conforme a sus ciclos de rotación. Podemos conservar información mínima cuando sea necesaria para obligaciones contractuales, defensa de reclamaciones o mandatos legales.</p>
    </>,
  },
  {
    id: 'arco',
    title: 'Derechos ARCO, revocación y limitación',
    content: <>
      <p>Puedes ejercer tus derechos de acceso, rectificación, cancelación u oposición (ARCO), revocar el consentimiento o limitar el uso y divulgación de tus datos enviando una solicitud a <a href="mailto:info@virafi.com">info@virafi.com</a> con:</p>
      <ul><li>Tu nombre y un medio para recibir notificaciones.</li><li>Documento para acreditar identidad y, en su caso, representación.</li><li>Descripción clara de los datos y del derecho que deseas ejercer.</li><li>Para rectificación, la corrección solicitada y documentación de soporte.</li><li>Cualquier elemento que ayude a localizar la información.</li></ul>
      <p>Confirmaremos nuestra determinación en un plazo máximo de 20 días hábiles desde una solicitud completa. Si resulta procedente, la haremos efectiva dentro de los 15 días hábiles siguientes. Los plazos pueden ampliarse una vez por un periodo igual cuando las circunstancias lo justifiquen. El ejercicio es gratuito, salvo costos razonables de reproducción o envío.</p>
      <p>También puedes exportar información desde los controles disponibles en la cuenta y desconectar Telegram u otras integraciones desde Virafi o desde el proveedor correspondiente.</p>
    </>,
  },
  {
    id: 'menores',
    title: 'Personas menores de edad',
    content: <p>Virafi está dirigido a mayores de 18 años. No recabamos intencionalmente datos de menores. Si crees que una persona menor nos proporcionó información sin autorización, escribe a <a href="mailto:info@virafi.com">info@virafi.com</a> para revisarla y eliminarla cuando corresponda.</p>,
  },
  {
    id: 'cambios',
    title: 'Cambios al aviso y autoridad',
    content: <>
      <p>Publicaremos modificaciones en esta misma ruta e indicaremos la fecha de actualización. Si un cambio altera materialmente las finalidades o requiere nuevo consentimiento, lo comunicaremos dentro del producto o por correo antes de aplicarlo cuando corresponda.</p>
      <p>Si consideras vulnerado tu derecho a la protección de datos, puedes acudir a la autoridad competente en México. Conforme al marco vigente al publicar este aviso, la autoridad administrativa es la Secretaría Anticorrupción y Buen Gobierno.</p>
      <p>Marco de referencia: <a href="https://www.diputados.gob.mx/LeyesBiblio/pdf/LFPDPPP.pdf" target="_blank" rel="noreferrer">Ley Federal de Protección de Datos Personales en Posesión de los Particulares</a> y su reglamentación aplicable.</p>
    </>,
  },
  {
    id: 'contacto',
    title: 'Contacto',
    content: <p>Privacidad, derechos ARCO, revocación, eliminación o dudas: <a href="mailto:info@virafi.com">info@virafi.com</a>. Incluye “Privacidad Virafi” en el asunto para facilitar la atención.</p>,
  },
];

export default function PrivacyPage() {
  return <LegalPage title="Aviso de privacidad integral" description="Qué información trata Virafi, para qué la utiliza y cómo puedes ejercer control sobre ella." updatedAt={updatedAt} version="2.0" sections={sections} note={<p>Este documento refleja la arquitectura y las integraciones actualmente documentadas de Virafi. La identidad corporativa y el domicilio legal completos deben ser confirmados por el responsable antes de una apertura comercial general.</p>} />;
}
