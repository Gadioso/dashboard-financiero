let sessionRefreshPromise: Promise<boolean> | null = null;

async function refreshSessionOnce() {
  if (!sessionRefreshPromise) {
    sessionRefreshPromise = (async () => {
      try {
        const response = await fetch('/api/auth/refresh', {
          method: 'POST',
          cache: 'no-store',
          credentials: 'same-origin',
        });

        return response.ok;
      } catch {
        return false;
      } finally {
        sessionRefreshPromise = null;
      }
    })();
  }

  return sessionRefreshPromise;
}

export async function fetchWithSessionRefresh(input: RequestInfo | URL, init?: RequestInit) {
  const retryInput = input instanceof Request ? input.clone() : input;
  const response = await fetch(input, init);

  if (response.status !== 401) return response;

  const refreshed = await refreshSessionOnce();

  if (!refreshed) return response;

  return fetch(retryInput, init);
}
