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
};

export function translateUiText(locale: AppLocale, value: string) {
  if (locale === 'es-MX') return value;
  const trimmed = value.trim();
  const translated = uiTranslations[trimmed];
  if (!translated) return value;
  return value.replace(trimmed, translated);
}
