import { NextResponse } from 'next/server';
import { listSyncfyCatalogueSites, listSyncfyCountries, listSyncfySites } from '@/lib/open-banking/syncfy';
import { getRequestTenantContext } from '@/lib/tenant-context';

export const dynamic = 'force-dynamic';

function getCountryFromRequest(request: Request) {
  const url = new URL(request.url);
  const country = url.searchParams.get('country') || 'MX';

  return country.trim().toUpperCase() || 'MX';
}

export async function GET(request: Request) {
  try {
    const tenant = await getRequestTenantContext(request);

    if (!tenant.profileId) {
      return NextResponse.json({ success: false, error: 'No autorizado.' }, { status: 401 });
    }

    const country = getCountryFromRequest(request);
    const [countries, catalogueSites, sites] = await Promise.all([
      listSyncfyCountries(),
      listSyncfyCatalogueSites(country),
      listSyncfySites(country),
    ]);

    const selectedCountry = countries.find((item) => item.code === country) || null;
    const siteOrganizations = selectedCountry
      ? sites.filter((site) => site.id_country === selectedCountry.id_country)
      : sites;

    return NextResponse.json({
      success: true,
      provider: 'syncfy',
      country,
      selectedCountry,
      supportedCountries: countries.filter((item) => ['MX', 'US', 'AR', 'BR', 'CO', 'CL', 'PE'].includes(item.code)),
      catalogueSites,
      siteOrganizations,
      counts: {
        catalogueSites: catalogueSites.length,
        siteOrganizations: siteOrganizations.length,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'No pude consultar el catalogo de Syncfy.';

    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
