import type { Metadata } from 'next';
import LegalPage from '@/app/Components/LegalPage';

const updatedAt = '29 de julio de 2026';

export const metadata: Metadata = {
  title: 'Términos y condiciones',
  description: 'Términos y condiciones de uso de Virafi.',
};

const sections = [
  {
    id: 'aceptacion',
    title: 'Aceptación y proveedor del servicio',
    content: <>
      <p>Estos Términos y condiciones (“Términos”) regulan el acceso y uso de Virafi, servicio digital operado bajo la marca Tendencia.ai (“Virafi”, “nosotros” o el “Proveedor”). Al crear una cuenta, marcar la aceptación o usar el servicio, confirmas que leíste y aceptas estos Términos y el Aviso de privacidad.</p>
      <p>Si utilizas Virafi por cuenta de una empresa, declaras tener facultades para obligarla. Si no aceptas estos Términos, no debes crear una cuenta ni usar el servicio. Los derechos irrenunciables que te correspondan como persona consumidora prevalecen sobre cualquier disposición incompatible.</p>
    </>,
  },
  {
    id: 'elegibilidad',
    title: 'Elegibilidad y cuenta',
    content: <>
      <p>Debes tener al menos 18 años y capacidad legal para contratar. Proporcionarás información correcta y actualizada y mantendrás la confidencialidad de tus credenciales. No compartas códigos de acceso, enlaces de vinculación ni sesiones.</p>
      <p>Eres responsable de las actividades realizadas desde tu cuenta, salvo cuando deriven de una falla imputable a Virafi. Avísanos inmediatamente en <a href="mailto:info@virafi.com">info@virafi.com</a> si detectas acceso no autorizado. Podemos solicitar verificación adicional para proteger la cuenta.</p>
    </>,
  },
  {
    id: 'servicio',
    title: 'Descripción y alcance del servicio',
    content: <>
      <p>Virafi es una plataforma de organización e inteligencia financiera. Según el plan, país, configuración y disponibilidad, puede permitirte registrar y clasificar movimientos; calcular presupuestos; consultar reportes; conversar con VirafIA; analizar archivos; organizar metas, patrimonio y escenarios; y consultar contexto de mercado. Virafi no conecta ni sincroniza cuentas bancarias.</p>
      <p>Algunas funciones se encuentran en beta, requieren proveedores externos o están sujetas a disponibilidad regional. La descripción mostrada dentro del producto o antes de contratar forma parte de la oferta aplicable. No garantizamos que toda función esté disponible para todas las cuentas.</p>
      <p>Virafi no es banco, casa de bolsa, asesor de inversiones, institución de fondos de pago electrónico, transmisor de dinero ni aseguradora. No recibe, custodia, transfiere o invierte tu dinero.</p>
    </>,
  },
  {
    id: 'licencia',
    title: 'Licencia de uso y restricciones',
    content: <>
      <p>Mientras cumplas estos Términos, te otorgamos una licencia limitada, personal, revocable, no exclusiva y no transferible para usar Virafi con fines legítimos personales o internos de negocio.</p>
      <p>No puedes: acceder a cuentas o datos ajenos; eludir controles de seguridad; extraer masivamente contenido; interferir con la operación; introducir código malicioso; usar el servicio para fraude, lavado de dinero o actividades ilícitas; revenderlo sin autorización; realizar ingeniería inversa salvo que la ley lo permita; ni usar respuestas o datos para entrenar un servicio competidor infringiendo nuestros derechos o los de terceros.</p>
    </>,
  },
  {
    id: 'datos-usuario',
    title: 'Tus datos y contenido',
    content: <>
      <p>Conservas los derechos sobre la información, documentos, mensajes y demás contenido que proporcionas. Nos autorizas a alojarlo, procesarlo, transformarlo y comunicarlo a proveedores necesarios únicamente para operar, proteger y mejorar las funciones solicitadas, de acuerdo con el Aviso de privacidad.</p>
      <p>Debes contar con autorización para compartir datos de terceros. No subas contraseñas, claves privadas, NIP, códigos de un solo uso ni información innecesaria. Podemos bloquear archivos que representen un riesgo técnico o legal.</p>
      <p>Puedes corregir, exportar o solicitar la eliminación de información. Ciertas copias pueden permanecer bloqueadas durante plazos legales, ciclos de respaldo o periodos necesarios para resolver responsabilidades.</p>
    </>,
  },
  {
    id: 'integraciones',
    title: 'Integraciones y servicios de terceros',
    content: <>
      <p>Al conectar Telegram, un proveedor de datos de mercado, Stripe u otro servicio disponible, autorizas a Virafi a intercambiar la información necesaria para la función elegida. Debes usar únicamente cuentas que te pertenezcan o para las que tengas autorización.</p>
      <p>Puedes revocar una integración disponible desde Virafi o desde el tercero, sujeto a sus procesos. Virafi no debe solicitar contraseñas, NIP ni credenciales de banca electrónica.</p>
      <p>Los terceros pueden suspender, modificar o descontinuar sus servicios. Sus términos y avisos también aplican a la relación directa que mantengas con ellos. No respondemos por actos de terceros fuera de nuestro control, sin perjuicio de la responsabilidad que legalmente nos corresponda por nuestra selección, instrucciones o tratamiento.</p>
    </>,
  },
  {
    id: 'inteligencia',
    title: 'Inteligencia artificial y exactitud',
    content: <>
      <p>Virafi utiliza reglas y modelos de inteligencia artificial para clasificar, resumir, transcribir, detectar patrones y generar explicaciones. El contenido puede ser incompleto, desactualizado o incorrecto. Debes revisar datos, fechas, categorías, fuentes y supuestos antes de tomar decisiones.</p>
      <p>Las sugerencias son información educativa y apoyo para organizar decisiones; no constituyen asesoría financiera, legal, crediticia o de inversión personalizada. Virafi no promete rendimientos, ahorro ni disponibilidad de crédito.</p>
      <p>Antes de invertir, contratar deuda o realizar otra acción relevante, considera consultar a un profesional autorizado. Tú conservas la decisión final.</p>
    </>,
  },
  {
    id: 'planes',
    title: 'Planes y precios',
    content: <>
      <p>Virafi puede ofrecer un plan gratuito, pruebas y planes de pago con distintos límites. Antes de contratar mostraremos, de forma visible, las funciones, límites, moneda, periodicidad, precio total y cargos aplicables. En caso de diferencia, la información confirmada en el checkout prevalece para esa contratación.</p>
      <p>Podemos modificar precios para periodos futuros. Te informaremos antes de que el nuevo precio sea aplicable y, cuando corresponda, solicitaremos tu aceptación. Una reducción de funciones o cambio material no se aplicará retroactivamente al periodo ya pagado.</p>
    </>,
  },
  {
    id: 'suscripciones',
    title: 'Cobro recurrente, renovación y cancelación',
    content: <>
      <p>Si eliges una suscripción, autorizas cobros recurrentes por la periodicidad, monto y fecha mostrados antes de confirmar. Cuando exista renovación automática, te notificaremos con al menos cinco días naturales de anticipación cuando la ley aplicable así lo requiera.</p>
      <p>Puedes cancelar inmediatamente desde el portal de facturación o mediante el mecanismo disponible en la cuenta, sin penalización por impedir renovaciones futuras. La cancelación surte efecto al terminar el periodo pagado, salvo que la oferta o la ley indiquen un reembolso distinto. Si el portal no está disponible, escribe a <a href="mailto:info@virafi.com">info@virafi.com</a>.</p>
      <p>Los reembolsos proceden cuando lo indiquen la oferta, un error de cobro atribuible a nosotros o la legislación aplicable. Cancelar una suscripción no elimina automáticamente tu cuenta o datos.</p>
    </>,
  },
  {
    id: 'disponibilidad',
    title: 'Disponibilidad, cambios y soporte',
    content: <>
      <p>Trabajamos para mantener Virafi disponible y seguro, pero puede haber mantenimiento, fallas, límites de proveedores o eventos fuera de nuestro control. Podemos modificar funciones para mejorar seguridad, cumplir la ley o evolucionar el producto.</p>
      <p>Cuando un cambio material afecte una función pagada, haremos esfuerzos razonables para avisarte y ofrecer una alternativa, ajuste o terminación conforme a la ley. El soporte se presta por los canales y tiempos indicados en el plan.</p>
    </>,
  },
  {
    id: 'propiedad',
    title: 'Propiedad intelectual',
    content: <>
      <p>Virafi, su software, diseño, marca, documentación, modelos de interfaz y contenido propio pertenecen a sus titulares y están protegidos por la legislación aplicable. Estos Términos no transfieren propiedad intelectual.</p>
      <p>Si envías comentarios o sugerencias, podemos utilizarlos para mejorar el servicio sin obligación de pago, siempre sin identificarte públicamente ni divulgar datos personales salvo autorización.</p>
    </>,
  },
  {
    id: 'suspension',
    title: 'Suspensión y terminación',
    content: <>
      <p>Puedes dejar de usar Virafi, cancelar tu plan o solicitar el cierre de tu cuenta en cualquier momento. Antes de cerrar, descarga la información que necesites.</p>
      <p>Podemos limitar o suspender acceso cuando sea necesario para proteger el servicio, investigar fraude, atender un requerimiento legal, prevenir daño o responder a un incumplimiento material. Cuando sea razonable, te avisaremos y permitiremos subsanar. Podemos terminar cuentas usadas para actividades ilícitas o riesgos graves sin aviso previo cuando la ley lo permita.</p>
    </>,
  },
  {
    id: 'garantias',
    title: 'Garantías y responsabilidad',
    content: <>
      <p>Prestaremos el servicio con diligencia razonable y conforme a las condiciones ofrecidas. No garantizamos que las predicciones, clasificaciones o respuestas sean exactas, que todas las integraciones estén siempre disponibles ni que el servicio sea completamente ininterrumpido.</p>
      <p>En la máxima medida permitida, no seremos responsables por decisiones tomadas sin revisar información, pérdida derivada de credenciales compartidas por el usuario, actos de terceros fuera de nuestro control o daños indirectos que no fueran previsibles. Estas limitaciones no aplican a dolo, negligencia grave, incumplimiento de obligaciones esenciales, vulneraciones imputables a Virafi ni a otros supuestos en que la responsabilidad no pueda limitarse.</p>
      <p>Nada en estos Términos limita derechos de consumidor, garantías legales o remedios obligatorios.</p>
    </>,
  },
  {
    id: 'cambios',
    title: 'Cambios a los Términos',
    content: <>
      <p>Podemos actualizar estos Términos para reflejar cambios del producto, proveedores o ley. Publicaremos la nueva versión y su fecha. Si el cambio es material, lo notificaremos dentro del producto o por correo antes de su entrada en vigor cuando corresponda.</p>
      <p>Los cambios no reducirán retroactivamente derechos ya adquiridos. Si no aceptas una modificación material, puedes terminar el servicio antes de que entre en vigor.</p>
    </>,
  },
  {
    id: 'ley',
    title: 'Ley aplicable y solución de controversias',
    content: <>
      <p>Estos Términos se rigen por las leyes federales de México. Primero intentaremos resolver cualquier problema de buena fe por soporte. Esto no te impide acudir a PROFECO, a la autoridad de protección de datos o a tribunales competentes.</p>
      <p>Cuando tengas carácter de consumidor, la competencia territorial y los procedimientos serán los que determine la legislación protectora aplicable; no se impone una renuncia anticipada a foros o derechos.</p>
      <p>Marco de referencia: <a href="https://www.diputados.gob.mx/LeyesBiblio/pdf/LFPC.pdf" target="_blank" rel="noreferrer">Ley Federal de Protección al Consumidor</a>, incluyendo las reglas vigentes sobre transacciones electrónicas y cancelación de suscripciones.</p>
    </>,
  },
  {
    id: 'contacto',
    title: 'Contacto y datos del proveedor',
    content: <>
      <p>Soporte, aclaraciones, cancelaciones o reclamaciones: <a href="mailto:info@virafi.com">info@virafi.com</a>. Sitio: <a href="https://virafi.com">virafi.com</a>.</p>
      <p>Antes de una apertura comercial general, esta sección deberá completarse con la razón social, RFC, domicilio físico y teléfono del proveedor contractual que aparecerá en comprobantes y checkout.</p>
    </>,
  },
];

export default function TermsPage() {
  return <LegalPage title="Términos y condiciones" description="Las reglas para usar Virafi, conectar servicios, contratar planes y mantener claras las responsabilidades de cada parte." updatedAt={updatedAt} version="2.0" sections={sections} note={<p>Estos términos están redactados para reflejar el producto documentado y el marco mexicano vigente. Los datos corporativos del proveedor y las condiciones comerciales definitivas deben confirmarse antes de una apertura comercial general.</p>} />;
}
