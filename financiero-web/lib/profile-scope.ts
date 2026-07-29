const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function normalizeProfileId(value?: string | null) {
  const trimmed = value?.trim();

  if (!trimmed) return null;

  return uuidPattern.test(trimmed) ? trimmed : null;
}

export function requireScopedProfileId(profileId?: string | null) {
  const normalized = normalizeProfileId(profileId);

  if (!normalized) {
    throw new Error('La operación requiere un perfil autenticado válido.');
  }

  return normalized;
}

export function withProfile<T extends Record<string, unknown>>(payload: T, profileId?: string | null): T & { profile_id: string } {
  return {
    ...payload,
    profile_id: requireScopedProfileId(profileId),
  };
}

export function applyProfileFilter<Query>(query: Query, profileId?: string | null): Query {
  return (query as Query & { eq: (column: string, value: string) => Query })
    .eq('profile_id', requireScopedProfileId(profileId));
}
