export type OpenBankingProviderId = 'plaid' | 'prometeo' | 'belvo' | 'finerio';

export type OpenBankingProvider = {
  id: OpenBankingProviderId;
  name: string;
  regions: string[];
  status: 'ready_for_sandbox' | 'missing_env' | 'sales_required';
  configured: boolean;
  envVars: string[];
  missingEnvVars: string[];
  priority: number;
  notes: string;
};

const providerDefinitions = [
  {
    id: 'plaid',
    name: 'Plaid',
    regions: ['Estados Unidos', 'Canada', 'Europa'],
    envVars: ['PLAID_CLIENT_ID', 'PLAID_SECRET', 'PLAID_ENV'],
    priority: 1,
    notes: 'Mejor punto de partida para bancos de Estados Unidos. Sandbox listo con client_id + secret.',
  },
  {
    id: 'prometeo',
    name: 'Prometeo',
    regions: ['Latinoamerica'],
    envVars: ['PROMETEO_API_KEY', 'PROMETEO_ENV'],
    priority: 2,
    notes: 'Buen candidato regional para LATAM. Validar cobertura exacta por pais e institucion en sandbox.',
  },
  {
    id: 'belvo',
    name: 'Belvo',
    regions: ['Mexico', 'Brasil', 'Colombia'],
    envVars: ['BELVO_SECRET_ID', 'BELVO_SECRET_PASSWORD', 'BELVO_ENV'],
    priority: 3,
    notes: 'Fuerte en Open Finance LATAM; conviene validar cobertura comercial y costos antes de produccion.',
  },
  {
    id: 'finerio',
    name: 'Finerio Connect',
    regions: ['Mexico', 'Latinoamerica'],
    envVars: ['FINERIO_CLIENT_ID', 'FINERIO_CLIENT_SECRET', 'FINERIO_ENV'],
    priority: 4,
    notes: 'Muy relevante para Mexico; normalmente requiere contacto comercial para llaves y terminos.',
  },
] as const;

function hasEnv(name: string) {
  return Boolean(process.env[name]?.trim());
}

export function getOpenBankingProviders(): OpenBankingProvider[] {
  return providerDefinitions.map((provider) => {
    const missingEnvVars = provider.envVars.filter((name) => !hasEnv(name));
    const configured = missingEnvVars.length === 0;
    const status = configured ? 'ready_for_sandbox' : provider.id === 'finerio' ? 'sales_required' : 'missing_env';

    return {
      ...provider,
      status,
      configured,
      missingEnvVars,
      envVars: [...provider.envVars],
      regions: [...provider.regions],
    };
  });
}

export function getConfiguredOpenBankingProviders() {
  return getOpenBankingProviders().filter((provider) => provider.configured);
}
