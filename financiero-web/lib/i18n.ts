export type AppLocale = 'es-MX' | 'en-US';

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
};

export function translateUiText(locale: AppLocale, value: string) {
  if (locale === 'es-MX') return value;
  const trimmed = value.trim();
  const translated = uiTranslations[trimmed];
  if (!translated) return value;
  return value.replace(trimmed, translated);
}
