export type AppLocale = 'es-MX' | 'en-US';
import { legalTranslations } from './legal-translations';

export function localeFromCountry(country?: string | null): AppLocale | null {
  if (country === 'US') return 'en-US';
  if (country === 'MX') return 'es-MX';
  return null;
}

export function detectBrowserLocale(): AppLocale {
  if (typeof navigator === 'undefined') return 'es-MX';
  const language = navigator.language.toLowerCase();
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  if (language.startsWith('en-us') || (language.startsWith('en') && !timezone.startsWith('America/Mexico_City'))) return 'en-US';
  if (language.startsWith('es-mx') || timezone.startsWith('America/Mexico_City')) return 'es-MX';
  return language.startsWith('en') ? 'en-US' : 'es-MX';
}

export const messages = {
  'es-MX': {
    language: 'Idioma',
    spanish: 'Español',
    english: 'English',
    dashboard: 'Dashboard',
    login: 'Iniciar sesión',
    signUp: 'Crear cuenta',
    account: 'Cuenta',
    backupAccess: 'Acceso de respaldo',
    enter: 'Entrar',
    email: 'Email',
    password: 'Contraseña',
    fullName: 'Nombre completo',
    country: 'País de residencia',
    mexico: 'México',
    unitedStates: 'Estados Unidos',
    forgotPassword: 'Olvidé mi contraseña',
    continueWith: 'O continúa con',
    financialDirection: 'Tu rumbo financiero',
    loginDescription: 'Entra con tu cuenta para consultar únicamente tu información financiera.',
    settings: 'Configuración',
    profile: 'Perfil',
    financesIntegrations: 'Finanzas e integraciones',
    viewDashboard: 'Ver dashboard',
    backToDashboard: 'Volver al dashboard',
    logout: 'Cerrar sesión',
    languageSaved: 'Idioma actualizado',
    loading: 'Cargando…',
  },
  'en-US': {
    language: 'Language',
    spanish: 'Español',
    english: 'English',
    dashboard: 'Dashboard',
    login: 'Sign in',
    signUp: 'Create account',
    account: 'Account',
    backupAccess: 'Backup access',
    enter: 'Sign in',
    email: 'Email',
    password: 'Password',
    fullName: 'Full name',
    country: 'Country of residence',
    mexico: 'Mexico',
    unitedStates: 'United States',
    forgotPassword: 'Forgot password',
    continueWith: 'Or continue with',
    financialDirection: 'Your financial direction',
    loginDescription: 'Sign in to view only your own financial information.',
    settings: 'Settings',
    profile: 'Profile',
    financesIntegrations: 'Finances & integrations',
    viewDashboard: 'View dashboard',
    backToDashboard: 'Back to dashboard',
    logout: 'Sign out',
    languageSaved: 'Language updated',
    loading: 'Loading…',
  },
} as const;

export type MessageKey = keyof typeof messages['es-MX'];

export function translate(locale: AppLocale, key: MessageKey) {
  return messages[locale][key];
}

const uiTranslations: Record<string, string> = {
  'Iniciar sesión': 'Sign in', 'Crear cuenta': 'Create account', 'Cerrar sesión': 'Sign out', 'Configuración': 'Settings',
  'Perfil': 'Profile', 'Finanzas e integraciones': 'Finances & integrations', 'Ver dashboard': 'View dashboard', 'Volver al dashboard': 'Back to dashboard',
  'Resumen': 'Overview', 'Movimientos': 'Transactions', 'Presupuestos': 'Budgets', 'Metas': 'Goals', 'Análisis': 'Analysis', 'Planes': 'Plans', 'Reportes': 'Reports',
  'Inicio': 'Home', 'Cuenta': 'Account', 'Sesión': 'Session', 'Guardar perfil': 'Save profile', 'Guardando...': 'Saving…', 'Cargando...': 'Loading…', 'Cargando…': 'Loading…',
  'Cancelar': 'Cancel', 'Anterior': 'Back', 'Siguiente': 'Next', 'Listo': 'Done', 'Por completar': 'To complete', 'Actualizar': 'Update', 'Conectar': 'Connect',
  'Tu perfil': 'Your profile', 'Tu espacio financiero': 'Your financial space', 'Tu rumbo financiero': 'Your financial direction', 'Tu identidad en Virafi': 'Your Virafi identity',
  'Configuración financiera': 'Financial settings', 'Personaliza tus metas': 'Personalize your goals', 'Eliminar cuenta y datos': 'Delete account and data',
  'Eliminar mi cuenta': 'Delete my account', 'Eliminar definitivamente': 'Delete permanently', 'Zona de riesgo': 'Danger zone',
  '¿Quieres cerrar tu sesión?': 'Sign out?', '¿Eliminar tu cuenta?': 'Delete your account?', 'Sí, cerrar sesión': 'Yes, sign out', 'Cerrando sesión...': 'Signing out…',
  'O continúa con': 'Or continue with', 'Olvidé mi contraseña': 'Forgot password', 'Nombre completo': 'Full name', 'País de residencia': 'Country of residence',
  'México': 'Mexico', 'Estados Unidos': 'United States', 'Código de acceso': 'Access code', 'Email': 'Email', 'Contraseña': 'Password',
  'Notificaciones': 'Notifications', 'No tienes movimientos nuevos.': 'You have no new movements.', 'No tienes movimientos nuevos': 'You have no movements yet.', 'Movimiento detectado': 'Movement detected', 'Ahora': 'Now',
  'Personaliza tu experiencia financiera': 'Personalize your financial experience', 'Pregunta': 'Question', 'Tus respuestas son privadas': 'Your answers are private',
  'Telegram conectado': 'Telegram connected', 'Genera tu llave personal': 'Generate your personal key', 'Abre el bot oficial': 'Open the official bot',
  'Espera el candado de confirmación': 'Wait for the confirmation lock', 'Conecta Virafi': 'Connect Virafi', 'Tu llave segura': 'Your secure key',
  'Primero, tu rumbo': 'First, your direction', 'Definamos tus metas': 'Let’s define your goals', 'Necesitas iniciar sesión': 'You need to sign in',
  'Ir a login': 'Go to sign in', 'Inicia sesión para guardar tu identidad y preferencias.': 'Sign in to save your identity and preferences.',
  'Tu CFO personal, todos los días.': 'Your personal CFO, every day.', 'Producto': 'Product', 'Nosotros': 'About', 'Seguridad': 'Security',
  'Funciones': 'Features', 'Compañía': 'Company', 'Legal': 'Legal', 'Contacto': 'Contact', 'Aviso de privacidad': 'Privacy notice', 'Términos y condiciones': 'Terms and conditions',
  'Decisiones claras. Progreso real.': 'Clear decisions. Real progress.', 'No espera a que preguntes.': 'It does not wait for you to ask.',
  'Tus metas dejan de ser deseos.': 'Your goals stop being wishes.', 'Cómo cuidamos tus datos': 'How we protect your data', 'Quiero mi CFO': 'I want my CFO',
  'Un CFO que trabaja todos los días para tus metas.': 'A CFO that works every day for your goals.', 'Inteligente, insistente y siempre bajo tu control.': 'Smart, persistent, and always under your control.',
  'Algo salió mal': 'Something went wrong', 'Reintentar': 'Try again', 'Volver': 'Go back', 'Enviar': 'Send', 'Pensando': 'Thinking', 'Abrir navegación': 'Open navigation',
  'Lo que hace tu CFO': 'What your CFO does', 'Te entiende': 'It understands you', 'Conoce tus metas y tu dinero.': 'It knows your goals and your money.',
  'Te guía cada día': 'It guides you every day', 'Te dice qué hacer hoy para avanzar.': 'It tells you what to do today to move forward.',
  'Te ayuda a cumplir': 'It helps you follow through', 'Ajusta el plan y celebra cada logro.': 'It adjusts the plan and celebrates every milestone.',
  'Tu CFO revisa cada día lo que registraste, compara tu ritmo con tus metas y te busca cuando algo necesita atención.': 'Your CFO reviews what you record every day, compares your pace with your goals, and reaches out when something needs attention.',
  'Revisa': 'Review', 'Ingresos, gastos, aportaciones y pendientes.': 'Income, spending, contributions, and pending items.', 'Decide': 'Decide', 'Prioriza el movimiento que más cambia tu rumbo.': 'Prioritize the move that changes your direction the most.', 'Te acompaña': 'Stay with you', 'Da seguimiento, ajusta el plan y vuelve a insistir.': 'Follow up, adjust the plan, and keep you moving.',
  'Esta semana conviene apartar $2,750 para tu mudanza.': 'This week, set aside $2,750 for your move.', 'Tú': 'You', '¿De dónde salió?': 'Where did that come from?', 'Es una propuesta provisional. Primero necesito saber en qué ciudad quieres vivir y cuánto pagarías de renta.': 'It is a provisional proposal. First I need to know which city you want to live in and how much rent you would pay.',
  'Virafi convierte lo que quieres vivir en un plan con prioridades, etapas y una cantidad concreta para hoy.': 'Virafi turns the life you want into a plan with priorities, stages, and a concrete amount for today.', 'Independizarme y viajar': 'Move out and travel', 'Mudanza': 'Move', 'Colchón de transición': 'Transition cushion', 'Primer viaje': 'First trip', '¿En qué ciudad quieres vivir y cuánto pagarías de renta?': 'Which city do you want to live in and how much rent would you pay?', 'Comprar una propiedad': 'Buy a property', 'Precio y ciudad': 'Price and city', 'Enganche y gastos': 'Down payment and costs', 'Mensualidad sostenible': 'Sustainable payment', '¿Sería para vivir o invertir?': 'Would it be for living or investing?', 'Apartado sugerido:': 'Suggested amount:',
  'Virafi puede analizar, priorizar y recordarte. Las decisiones con consecuencias financieras siguen siendo tuyas.': 'Virafi can analyze, prioritize, and remind you. Decisions with financial consequences remain yours.', 'Virafi no recibe, custodia ni transfiere tu dinero.': 'Virafi does not receive, hold, or transfer your money.', 'Cada perfil consulta únicamente su propia información financiera.': 'Each profile can access only its own financial information.', 'Una recomendación nunca significa que el dinero ya se movió.': 'A recommendation never means money has already moved.', 'Si falta un costo o una fecha, Virafi lo dice y pregunta antes de calcular.': 'If a cost or date is missing, Virafi says so and asks before calculating.', 'Virafi orienta y registra; no recibe, transfiere ni invierte por ti.': 'Virafi guides and records; it does not receive, transfer, or invest money for you.', 'No necesitas otra app para mirar tus finanzas.': 'You do not need another app to look at your finances.', 'Necesitas a alguien que no te deje soltar tus metas.': 'You need someone who will not let you drop your goals.',
  'Virafi entiende tu situación, decide qué merece atención y convierte tus números en una acción concreta. Después vuelve para comprobar que avances.': 'Virafi understands your situation, decides what deserves attention, and turns your numbers into a concrete action. Then it comes back to check your progress.', 'No es un chatbot que espera órdenes.': 'It is not a chatbot that waits for commands.', 'Es un sistema financiero proactivo que revisa, razona, explica y te acompaña con el mismo contexto todos los días.': 'It is a proactive financial system that reviews, reasons, explains, and supports you with the same context every day.', 'De lo que hiciste hoy': 'From what you did today', 'a la vida que quieres construir.': 'to the life you want to build.', 'Cada parte del producto alimenta al mismo CFO. El objetivo no es mostrar más gráficas, sino producir mejores decisiones y sostenerlas en el tiempo.': 'Every part of the product feeds the same CFO. The goal is not more charts, but better decisions that last.', 'Proactivo no significa fuera de control.': 'Proactive does not mean out of control.', 'El CFO puede investigar, priorizar, explicar e insistir. Las decisiones con consecuencias financieras permanecen bajo tu control.': 'The CFO can investigate, prioritize, explain, and follow up. Decisions with financial consequences remain under your control.', 'Tus datos se mantienen aislados por perfil y se usan para tu propio plan.': 'Your data stays isolated by profile and is used for your plan.', 'Recomendaciones ligadas a tus metas, liquidez y tolerancia al riesgo.': 'Recommendations linked to your goals, liquidity, and risk tolerance.', 'Evidencia, contexto de mercado y límites visibles para revisar cada sugerencia.': 'Evidence, market context, and visible limits for reviewing every suggestion.', 'Deja de cargar tus metas tú solo.': 'Stop carrying your goals alone.', 'Dale contexto a Virafi y recibe un plan que se revisa contigo cada día.': 'Give Virafi context and receive a plan reviewed with you every day.',
  'Nadie debería perseguir sus metas financieras solo.': 'No one should have to pursue their financial goals alone.', 'Virafi nace de una idea sencilla: entender tus números no basta. Hace falta convertirlos en decisiones, sostener el plan y tener a alguien que te recuerde por qué empezaste.': 'Virafi began with a simple idea: understanding your numbers is not enough. You need decisions, a plan you can sustain, and someone to remind you why you started.', 'Nuestra misión': 'Our mission', 'Nuestra visión': 'Our vision', 'Principios que nos dan rumbo.': 'Principles that guide us.', 'El producto evoluciona; estos criterios no deberían hacerlo.': 'The product evolves; these principles should not.', 'Ver producto': 'View product',
  'Seguridad financiera con controles que puedes entender.': 'Financial security with controls you can understand.', 'Virafi está diseñado para consultar, organizar y explicar información. No recibe ni custodia tu dinero, no ejecuta inversiones y mantiene las acciones sensibles bajo confirmación explícita.': 'Virafi is designed to review, organize, and explain information. It does not receive or hold your money, execute investments, or take sensitive actions without explicit confirmation.', 'Protección por capas.': 'Layered protection.', 'Ningún control aislado es suficiente. Combinamos identidad, permisos, cifrado, auditoría y prácticas operativas.': 'No single control is enough. We combine identity, permissions, encryption, auditing, and operational practices.', 'Tu información, tus controles.': 'Your information, your controls.', 'La seguridad también significa poder consultar, corregir, descargar y eliminar información sin depender de procesos opacos.': 'Security also means being able to review, correct, download, and delete information without opaque processes.', 'La seguridad es un proceso continuo.': 'Security is an ongoing process.', 'Lee el aviso de privacidad': 'Read the privacy notice',
  'Todos los días,': 'Every day,', 'hasta cumplir': 'until you reach', 'tus metas.': 'your goals.', 'Virafi revisa tus números, detecta desvíos y te dice qué hacer hoy para que tus metas sí sucedan.': 'Virafi reviews your numbers, spots deviations, and tells you what to do today so your goals happen.', 'Ver cómo funciona': 'See how it works', 'Vista del plan financiero de Virafi': 'Virafi financial plan preview', 'Vista ilustrativa del CFO personal de Virafi': 'Illustrative view of Virafi personal CFO', 'Plan': 'Plan', 'Buenos días, Diego': 'Good morning, Diego', 'Hoy apartaría': 'Today I would set aside', 'para independizarte y viajar.': 'to move out and travel.', 'Así se vería tu plan de este mes:': 'This is what your plan could look like this month:', 'Fondo de emergencia': 'Emergency fund', 'Independizarte y viajar': 'Move out and travel', 'Inversión': 'Investment', 'Detecté que gastaste más en comida fuera de lo planeado esta semana.': 'I noticed you spent more on eating out than planned this week.', 'Ver mi plan de hoy': 'View my plan for today',
  // @ts-expect-error Existing keys above are reused here to extend the dashboard catalog.
  'Tu CFO personal, todos los días.': 'Your personal CFO, every day.', 'Navegación principal': 'Main navigation', 'Navegación móvil': 'Mobile navigation', 'Abrir mi perfil': 'Open my profile', 'Notificaciones': 'Notifications', 'Movimientos recientes.': 'Recent transactions.', 'Movimientos y acciones que requieren tu atención.': 'Transactions and actions that need your attention.', 'No tienes movimientos todavía.': 'You do not have any transactions yet.', 'No tienes movimientos nuevos.': 'You do not have any new transactions.', 'Ahora': 'Now', 'Hola': 'Hello', 'Mes': 'Month', 'Actualizando datos...': 'Updating data…', 'Vista de': 'View for', 'Información de tu cuenta.': 'Your account information.', 'Tu rumbo financiero': 'Your financial direction', 'Movimientos del mes': 'This month’s transactions', 'Presupuestos y bolsas': 'Budgets and allocations', 'Metas financieras': 'Financial goals', 'Análisis de comportamiento': 'Spending analysis', 'Plan y facturación': 'Plan and billing', 'Elige o administra tu suscripción.': 'Choose or manage your subscription.', 'Reportes': 'Reports', 'Preparando pago seguro': 'Preparing secure payment', 'Abriendo facturación': 'Opening billing', 'Estamos preparando una sesión segura. Si cancelas, volverás al dashboard.': 'We are preparing a secure session. If you cancel, you will return to the dashboard.',
  'Resumen ejecutivo': 'Executive summary', 'Ingresos': 'Income', 'Egresos': 'Expenses', 'Flujo neto': 'Net cash flow', 'Meta mensual': 'Monthly goal', 'Resultado por mes': 'Result by month', 'Distribución 50/25/25': '50/25/25 allocation', 'Movimientos principales': 'Key transactions', 'Información financiera personal. Documento informativo.': 'Personal financial information. Informational document.', 'Preparando reporte PDF...': 'Preparing PDF report…', 'Reporte PDF descargado.': 'PDF report downloaded.', 'No pude generar el PDF. Intenta de nuevo.': 'I could not create the PDF. Please try again.',
  'Vida': 'Living', 'Placeres': 'Wants', 'Futuro': 'Future', 'Emer/Inv': 'Emergency / investments', 'Disponible': 'Available', 'Activo': 'Active', 'Facturación': 'Billing', 'Mejorar plan': 'Upgrade plan', 'Ingresos del mes': 'Income this month', 'Abonos a tarjeta': 'Card payments', 'No hay ingresos registrados.': 'No income has been recorded.', 'No hay abonos registrados.': 'No card payments have been recorded.', 'Ingreso': 'Income', 'Tarjeta': 'Card', 'Eliminar': 'Delete', 'Eliminando': 'Deleting…', 'Editar': 'Edit', 'Guardar': 'Save', 'Cerrar': 'Close', 'Agregar gasto': 'Add expense', 'Importar movimientos': 'Import transactions', 'Analizar': 'Analyze', 'Descargar reporte': 'Download report', 'Mensual': 'Monthly', 'Anual': 'Annual', 'Actualizando información de mercado...': 'Updating market information…', 'Intenta nuevamente más tarde.': 'Please try again later.',
  // @ts-expect-error Existing key above is reused here to extend the import catalog.
  'Importación inteligente': 'Smart import', 'Sube tu historial financiero': 'Upload your financial history', 'Virafi homologa Excel, CSV y estados de cuenta PDF. Primero revisas la previsualización; ningún movimiento se guarda sin tu confirmación.': 'Virafi standardizes Excel, CSV, and PDF statements. First review the preview; no transaction is saved without your confirmation.', 'Cerrar importación': 'Close import', 'Selecciona tu archivo': 'Select your file', 'Cancelar': 'Cancel', 'Analizando y homologando…': 'Analyzing and standardizing…', 'Analizar archivo': 'Analyze file', 'Formato recomendado': 'Recommended format', 'La primera fila puede incluir estos encabezados. Virafi también reconoce variantes habituales de bancos.': 'The first row can contain these headers. Virafi also recognizes common bank variations.', 'Fecha': 'Date', 'Concepto': 'Description', 'Monto': 'Amount', 'Tipo': 'Type', 'Categoría': 'Category', 'Subcategoría': 'Subcategory', 'Moneda': 'Currency', 'Confirmar importación': 'Confirm import', 'Movimientos seleccionados': 'Selected transactions',
  // @ts-expect-error Existing confirmation labels above are reused in the modal.
  '¿Quieres cerrar tu sesión?': 'Do you want to sign out?', 'Tu sesión se cerrará en este dispositivo.': 'Your session will be closed on this device.', 'Mantener sesión': 'Stay signed in', 'Sí, cerrar sesión': 'Yes, sign out', 'Cerrando sesión...': 'Signing out…',
  'Tu CFO personal.': 'Your personal CFO.', 'Propiedad': 'Property', 'al mes': 'per month', 'Ejemplo de conversación con el CFO': 'Example CFO conversation', 'Tus datos, aislados': 'Your data, isolated', 'Tú confirmas': 'You confirm', 'Sin cifras inventadas': 'No invented figures', 'Sin custodiar tu dinero': 'No money custody', 'Misión y visión': 'Mission and vision',
  // @ts-expect-error Existing dashboard profile labels above are reused here.
  'Virafi, tu dinero con claridad y rumbo': 'Virafi, your money with clarity and direction', 'Secciones del dashboard': 'Dashboard sections', 'Abrir mi perfil': 'Open my profile', 'Tu perfil': 'Your profile', 'Plan Gratis': 'Free plan', 'Abrir perfil de': 'Open profile for', 'Hola.': 'Hello.', 'Balance mensual': 'Monthly balance', 'Ocultar saldos': 'Hide balances', 'Mostrar saldos': 'Show balances', 'Flujo neto del mes': 'Net cash flow this month', 'Calculado exclusivamente con los ingresos y gastos que registras en Virafi.': 'Calculated only from the income and expenses you record in Virafi.', 'Gastos': 'Expenses', 'Ver detalle': 'View details', 'Resumen del mes': 'Monthly overview', 'Ingresos, gastos y flujo real': 'Income, expenses, and actual cash flow', 'Mes del resumen': 'Overview month', 'Flujo mensual': 'Monthly cash flow', 'Sin historial suficiente': 'Not enough history', 'Ver análisis completo': 'View full analysis', 'Presupuesto por categoría': 'Budget by category', 'utilizado': 'used', 'Distribución del gasto: Vida 0%, Placeres 0% y Emer/Inv 0%': 'Spending allocation: Living 0%, Wants 0%, and Emergency / investments 0%', 'Gasto total': 'Total spending', 'del gasto': 'of spending', 'presupuesto': 'budget', 'Ver presupuestos': 'View budgets', 'Movimientos recientes': 'Recent transactions', 'Ver todos': 'View all', 'Aún no hay movimientos': 'There are no transactions yet', 'Registra tu primer ingreso o gasto.': 'Record your first income or expense.', 'Agregar movimiento': 'Add transaction', 'VirafIA sugiere': 'VirafIA suggests', 'Tu flujo está en equilibrio. El siguiente paso es registrar ingresos y gastos para que Virafi pueda recomendarte un movimiento concreto.': 'Your cash flow is balanced. Next, record income and expenses so Virafi can recommend a specific action.', 'Tu ritmo de gasto está alineado con el avance del mes. Mantén los límites y revisa de nuevo en una semana.': 'Your spending pace is aligned with the month’s progress. Keep your limits and review again in a week.', 'Ir a asesoría personalizada': 'Go to personalized guidance', 'Registro simple y privado': 'Simple, private record-keeping', 'Virafi no solicita credenciales bancarias ni sincroniza cuentas. Registra tus movimientos desde el dashboard o por Telegram.': 'Virafi does not ask for banking credentials or sync accounts. Record your transactions from the dashboard or Telegram.', 'Ruta hacia tus metas': 'Your route to your goals', 'Define tu primera meta': 'Define your first goal', 'VirafIA relaciona tu flujo, capacidad de aportación y horizonte para proponerte el siguiente paso.': 'VirafIA connects your cash flow, contribution capacity, and horizon to suggest your next step.', 'Ver metas': 'View goals',
};

// Copy that is assembled inside product cards and dashboard views. Keeping this
// catalog separate prevents duplicate keys from obscuring a newer translation.
const extendedUiTranslations: Record<string, string> = {
  'Revisión financiera diaria': 'Daily financial review',
  'Tu CFO analiza los movimientos que registras, tu flujo, presupuestos, aportaciones y pendientes para detectar qué requiere atención.': 'Your CFO analyzes the transactions you record, your cash flow, budgets, contributions, and outstanding items to identify what needs attention.',
  'Metas convertidas en planes': 'Goals turned into plans',
  'Separa metas grandes en etapas, identifica los datos que faltan y propone cuánto apartar sin inventar el costo del objetivo.': 'Break down big goals into stages, identify missing information, and suggest how much to set aside without inventing the cost of the goal.',
  'Conversación con criterio': 'Thoughtful conversation',
  'Entiende preguntas de seguimiento, explica de dónde sale cada cifra y usa tu contexto personal para priorizar.': 'Understands follow-up questions, explains where every number comes from, and uses your personal context to prioritize.',
  'Acompañamiento proactivo': 'Proactive guidance',
  'No espera a que abras el dashboard: te avisa, vuelve a revisar y da seguimiento al siguiente paso acordado.': 'It does not wait for you to open the dashboard: it alerts you, checks again, and follows up on the agreed next step.',
  'Inversión ligada al propósito': 'Purpose-driven investing',
  'Separa el dinero de corto plazo del capital de largo plazo y filtra alternativas según horizonte, liquidez y perfil de riesgo.': 'Separates short-term money from long-term capital and filters alternatives by horizon, liquidity, and risk profile.',
  'Confirmación antes de actuar': 'Confirmation before acting',
  'Virafi recomienda y registra. Ninguna aportación, operación o decisión sensible ocurre sin una confirmación explícita.': 'Virafi recommends and records. No contribution, transaction, or sensitive decision happens without explicit confirmation.',
  'Claridad antes que complejidad': 'Clarity before complexity',
  'Traducimos datos, escenarios y lenguaje financiero en decisiones que una persona puede entender y revisar.': 'We translate data, scenarios, and financial language into decisions people can understand and review.',
  'Acompañamiento, no abandono': 'Guidance, not abandonment',
  'La inteligencia debe reducir carga mental, proponer el siguiente paso y volver para comprobar si la persona pudo avanzar.': 'Intelligence should reduce mental load, propose the next step, and return to check whether the person could move forward.',
  'Límites visibles': 'Visible boundaries',
  'Explicamos qué sabemos, qué inferimos, qué falta y cuándo conviene recurrir a un especialista.': 'We explain what we know, what we infer, what is missing, and when it is useful to consult a specialist.',
  'Progreso responsable': 'Responsible progress',
  'Priorizamos estabilidad, contexto y pasos sostenibles sobre promesas rápidas o rendimientos garantizados.': 'We prioritize stability, context, and sustainable steps over quick promises or guaranteed returns.',
  'Identidad y acceso': 'Identity and access',
  'Aislamiento de información': 'Information isolation',
  'Secretos fuera del navegador': 'Secrets kept out of the browser',
  'Integraciones revocables': 'Revocable integrations',
  'Acceso mínimo necesario': 'Least-privilege access',
  'Auditoría y operación': 'Auditing and operations',
  'Exporta una copia estructurada de la información asociada a tu cuenta.': 'Export a structured copy of the information associated with your account.',
  'Actualiza tu perfil, preferencias e integraciones desde configuración.': 'Update your profile, preferences, and integrations from Settings.',
  'Desconecta canales externos como Telegram y revoca su acceso cuando lo decidas.': 'Disconnect external channels such as Telegram and revoke their access whenever you choose.',
  'Solicita la eliminación de datos y el cierre de la cuenta, sujeto a retenciones legales.': 'Request deletion of your data and account closure, subject to legal retention requirements.',
  'Dar a cada persona un CFO proactivo que convierta sus metas de vida en decisiones financieras alcanzables.': 'Give every person a proactive CFO that turns their life goals into achievable financial decisions.',
  'Que cada persona en Latinoamérica tenga el criterio, seguimiento y claridad financiera que antes sólo tenía quien podía pagar un gran equipo.': 'Ensure that everyone in Latin America has the financial judgment, follow-through, and clarity that only people who could afford a large team used to have.',
  'De dashboard personal a CFO que trabaja contigo.': 'From a personal dashboard to a CFO that works with you.',
  'Virafi comenzó organizando el flujo cotidiano con una regla simple: dar un propósito claro a cada parte del ingreso. Esa base creció hacia un sistema que entiende metas, hábitos, prioridades y decisiones financieras.': 'Virafi started by organizing everyday cash flow with one simple rule: give every part of income a clear purpose. That foundation grew into a system that understands goals, habits, priorities, and financial decisions.',
  'La siguiente etapa no consiste en añadir más pantallas. Consiste en construir un CFO que revise cada día, detecte desvíos, explique sus recomendaciones y acompañe a la persona hasta cerrar la distancia entre intención y resultado.': 'The next stage is not about adding more screens. It is about building a CFO that reviews every day, detects deviations, explains its recommendations, and supports the person until the gap between intent and outcome is closed.',
  'Seguimos construyendo desde México para Latinoamérica, con una arquitectura pensada para ingresos variables, metas que cambian, distintas filosofías de vida y la necesidad de explicaciones sin tecnicismos.': 'We continue building from Mexico for Latin America, with an architecture designed for variable income, changing goals, different life philosophies, and the need for explanations without jargon.',
  'Un mejor rumbo empieza con alguien que te acompañe.': 'A better direction starts with someone who supports you.',
  'Conoce a tu CFO personal o escríbenos para conversar.': 'Meet your personal CFO or write to us to talk.',
  'Autenticación por cuenta, sesiones protegidas y controles para que cada perfil acceda únicamente a su espacio.': 'Account authentication, protected sessions, and controls so each profile can access only its own space.',
  'Los datos financieros se asocian a un perfil y se protegen con reglas de acceso a nivel de base de datos.': 'Financial data is tied to a profile and protected with database-level access rules.',
  'Las credenciales privadas y llaves de proveedores se mantienen del lado servidor y no se exponen en la interfaz.': 'Private credentials and provider keys stay on the server and are not exposed in the interface.',
  'Los accesos de canales y proveedores se mantienen del lado servidor y pueden revocarse al desconectar el servicio.': 'Channel and provider access stays on the server and can be revoked when the service is disconnected.',
  'Los datos de mercado se consultan en modo de lectura y Virafi no habilita movimientos de dinero.': 'Market data is accessed in read-only mode, and Virafi does not enable money movements.',
  'Registramos acciones relevantes, errores operativos y eventos de seguridad para investigar y responder.': 'We record relevant actions, operational errors, and security events so we can investigate and respond.',
  'Monitoreamos errores, revisamos permisos, probamos respaldos y recuperación, y mantenemos procedimientos para rotar secretos. Ningún sistema puede garantizar riesgo cero; si una vulneración pudiera afectar significativamente tus derechos, te informaremos conforme a la ley aplicable.': 'We monitor errors, review permissions, test backups and recovery, and maintain procedures for rotating secrets. No system can guarantee zero risk; if a breach could significantly affect your rights, we will inform you according to applicable law.',
  'Importar archivo': 'Import file',
  'Detalle de bolsas': 'Allocation details',
  'Lectura rápida': 'Quick read',
  'Primero define tus metas': 'Define your goals first',
  'Tu ruta de inversiones': 'Your investment route',
  'Vista de agosto 2026.': 'August 2026 view.',
  'Vista de septiembre 2026.': 'September 2026 view.',
  'Vista de octubre 2026.': 'October 2026 view.',
  'Vista de noviembre 2026.': 'November 2026 view.',
  'Vista de diciembre 2026.': 'December 2026 view.',
  'Presupuesto, consumo y margen disponible por categoría.': 'Budget, spending, and available room by category.',
  'Define tus metas y completa tu perfil para activar una ruta de inversión personalizada.': 'Define your goals and complete your profile to activate a personalized investment route.',
  'Tu ruta de inversión para alcanzar tus metas': 'Your investment route to reach your goals',
  'Wealth convierte tus metas, plazos y capacidad mensual en un camino concreto para construir patrimonio.': 'Wealth turns your goals, timelines, and monthly capacity into a concrete path for building wealth.',
  'Necesitamos saber qué quieres lograr, en cuánto tiempo y cuánto puedes aportar. Con esas respuestas construiremos tu ruta; Wealth no usa un perfil separado.': 'We need to know what you want to achieve, by when, and how much you can contribute. With those answers, we will build your route; Wealth does not use a separate profile.',
  'Entrevista pendiente': 'Interview pending',
  'Goals pendientes': 'Goals pending',
  'Definir mis metas': 'Define my goals',
  'Pon Virafi a trabajar para ti': 'Put Virafi to work for you',
  'Estamos preparando tu configuración.': 'We are preparing your settings.',
  'preparado': 'ready',
  '100% de configuración completada': '100% of settings completed',
  'Tu plan financiero': 'Your financial plan',
  'Cuéntale a Virafi tus metas y prioridades para recibir recomendaciones personales.': 'Tell Virafi your goals and priorities to receive personal recommendations.',
  'Definir metas': 'Define goals',
  'Asistente en Telegram': 'Telegram assistant',
  'Registra movimientos y consulta tus finanzas desde tu chat.': 'Record transactions and review your finances from your chat.',
  'Cinco preguntas para traducir lo que valoras en resultados financieros concretos. Puedes continuar después.': 'Five questions to translate what you value into concrete financial outcomes. You can continue later.',
  'Vincula tu Telegram personal con esta cuenta de Virafi. La llave es de un solo uso, dura 15 minutos y no debes compartirla.': 'Link your personal Telegram to this Virafi account. The key is single-use, lasts 15 minutes, and must not be shared.',
  'Virafi ya reconoce esta cuenta en el Telegram de Diego Gayoso.': 'Virafi already recognizes this account in Diego Gayoso’s Telegram.',
  'Ya puedes escribir o mandar una nota de voz, por ejemplo: “pagué 250 de gasolina” o “¿cómo voy este mes?”. Para desvincularlo, escribe': 'You can now write or send a voice note, for example: “I paid 250 for gas” or “how am I doing this month?”. To disconnect it, type',
  'en el bot.': 'in the bot.',
  'Completa la breve entrevista de personalización. Con tus respuestas crearemos aquí tus metas reales, sin objetivos genéricos.': 'Complete the short personalization interview. Your answers will let us create your real goals here, without generic objectives.',
  'Entrevista de personalización financiera': 'Financial personalization interview',
  'Aquí aparecen los movimientos que registras manualmente, por Telegram o desde un archivo.': 'Transactions you record manually, through Telegram, or from a file appear here.',
  'No hay movimientos registrados este mes.': 'There are no transactions recorded this month.',
  'Resumen del mes': 'Monthly summary',
  'Lectura mensual con movimientos, bolsas y comparación.': 'Monthly review with transactions, allocations, and comparison.',
  'Centro de reportes': 'Reports center',
  'Elige un periodo, revisa la plantilla y descarga un documento financiero en PDF.': 'Choose a period, review the template, and download a financial PDF document.',
  'Contexto anual 2026': '2026 annual context',
  'La fila azul muestra el mes activo.': 'The blue row shows the active month.',
  'Registro manual y Telegram': 'Manual entry and Telegram',
  'Uso actual de bolsas': 'Current allocation usage',
  'Compartido del año': 'Year-to-date',
  'Bolsa con más presión': 'Most pressured allocation',
  'Dónde se está yendo el dinero': 'Where your money is going',
  'Ritmo del mes': 'Monthly pace',
  'Siguiente ajuste': 'Next adjustment',
  'usados': 'used',
  'del límite': 'of the limit',
  'Aún no hay gastos en este mes.': 'There are no expenses this month yet.',
  'Vas en': 'You are at',
  'de uso contra': 'used versus',
  'de avance calendario.': 'calendar progress.',
  'El gasto va alineado con el avance del mes; mantén los límites actuales y revisa de nuevo en una semana.': 'Spending is aligned with the month’s progress; keep your current limits and review again in a week.',
  'Tus objetivos financieros': 'Your financial goals',
  'Tus valores orientan el plan; aquí sólo aparecen resultados concretos que requieren dinero, monto y fecha.': 'Your values guide the plan; only concrete outcomes that need money, an amount, and a date appear here.',
  'Actualizar mi experiencia': 'Update my experience',
  'Plan mensual recomendado': 'Recommended monthly plan',
  'Es una distribución provisional y explicable. Virafi no asumirá que moviste el dinero: cada aportación requiere tu confirmación.': 'This is a provisional, explainable allocation. Virafi will not assume you moved money: every contribution requires your confirmation.',
  'Fecha objetivo:': 'Target date:',
  'Monto por investigar': 'Amount to research',
  'Aportaciones': 'Contributions',
  'Definir': 'Define',
  'QUÉ SIGNIFICA ESTA META': 'WHAT THIS GOAL MEANS',
  'SIGUIENTE DEFINICIÓN': 'NEXT DEFINITION',
  'Apartado sugerido': 'Suggested allocation',
  'Registrar si ya lo aparté': 'Record if I set it aside',
  'Falta cotizar y confirmar el costo real.': 'The actual cost still needs to be priced and confirmed.',
  'Comparativo del año': 'Year comparison',
  'Datos por mes; la interpretación aparece una sola vez en Análisis VirafIA.': 'Monthly data; the interpretation appears once in VirafIA Analysis.',
  'Análisis VirafIA': 'VirafIA Analysis',
  'Lectura accionable del mes o del año completo.': 'Actionable reading for the month or full year.',
  'Año': 'Year',
  'Listo para analizar': 'Ready to analyze',
  'Presiona Actualizar análisis cuando quieras generar una nueva lectura.': 'Press Update analysis whenever you want to generate a new reading.',
  'Actualizar análisis': 'Update analysis',
  'Generando análisis...': 'Generating analysis...',
  'Analizando...': 'Analyzing...',
  'Planes del producto': 'Product plans',
  'Elige una suscripción o administra tu plan actual.': 'Choose a subscription or manage your current plan.',
  'Plan actual: Gratis': 'Current plan: Free',
  'Gratis': 'Free',
  'Esencial': 'Essential',
  'Para probar el método y conocer a VirafIA.': 'Try the method and get to know VirafIA.',
  'Para organizar tus finanzas con acompañamiento inteligente.': 'Organize your finances with intelligent guidance.',
  'Para seguimiento avanzado y decisiones financieras frecuentes.': 'Advanced tracking and frequent financial decisions.',
  'Registro manual': 'Manual entry',
  '30 días de historial': '30 days of history',
  'créditos IA al mes': 'AI credits per month',
  'Telegram incluido': 'Telegram included',
  '12 meses de historial': '12 months of history',
  'Metas personalizadas': 'Personalized goals',
  'Análisis mensual con VirafIA': 'Monthly analysis with VirafIA',
  'Historial ampliado': 'Extended history',
  'Wealth y escenarios': 'Wealth and scenarios',
  'Análisis mensual/anual con VirafIA': 'Monthly/annual analysis with VirafIA',
  'Soporte prioritario': 'Priority support',
  'Plan actual': 'Current plan',
  'Elegir plan': 'Choose plan',
  'Cargando metas...': 'Loading goals...',
  'Guardar para después': 'Save for later',
  'Finalizar': 'Finish',
};

export function translateUiText(locale: AppLocale, value: string) {
  if (locale === 'es-MX') return value;
  const trimmed = value.trim();
  const translated = legalTranslations[trimmed] ?? extendedUiTranslations[trimmed] ?? uiTranslations[trimmed];
  if (translated) return value.replace(trimmed, translated);
  return value
    .replace(/\bdel gasto\b/g, 'of spending')
    .replace(/\bpresupuesto\b/g, 'budget')
    .replace(/\butilizado\b/g, 'used')
    .replace(/\bPlan Gratis\b/g, 'Free plan')
    .replace(/\bNotificaciones\b/g, 'Notifications')
    .replace(/\bAbrir perfil de\b/g, 'Open profile for')
    .replace(/\bMes del resumen\b/g, 'Overview month')
    .replace(/\bVista de\b/g, 'View for')
    .replace(/\benero\b/gi, 'January')
    .replace(/\bfebrero\b/gi, 'February')
    .replace(/\bmarzo\b/gi, 'March')
    .replace(/\babril\b/gi, 'April')
    .replace(/\bmayo\b/gi, 'May')
    .replace(/\bjunio\b/gi, 'June')
    .replace(/\bjulio\b/gi, 'July')
    .replace(/\bagosto\b/gi, 'August')
    .replace(/\bseptiembre\b/gi, 'September')
    .replace(/\boctubre\b/gi, 'October')
    .replace(/\bnoviembre\b/gi, 'November')
    .replace(/\bdiciembre\b/gi, 'December');
}
