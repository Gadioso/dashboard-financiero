import { NextResponse } from 'next/server';
import { calcularPresupuestoTresTercios } from '@/lib/financial-core';
import { getSupabaseServiceClient } from '@/lib/supabase-server';
import { getRequestTenantContext, withProfile } from '@/lib/tenant-context';

export const dynamic = 'force-dynamic';

function normalizeName(value?: string | null) {
  const trimmed = value?.trim();

  return trimmed ? trimmed.slice(0, 140) : null;
}

function normalizeMoney(value?: number | string | null) {
  const numeric = typeof value === 'number' ? value : Number(String(value || '').replace(/[,$\s]/g, ''));

  if (!Number.isFinite(numeric) || numeric < 0) return null;

  return Math.min(numeric, 999999999);
}

function currentMonthKey() {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');

  return `${year}-${month}-01`;
}

export async function POST(request: Request) {
  try {
    const supabase = getSupabaseServiceClient();

    if (!supabase) {
      return NextResponse.json({ success: false, error: 'Falta configurar llave de Supabase.' }, { status: 500 });
    }

    const tenant = await getRequestTenantContext(request);

    if (!tenant.profileId) {
      return NextResponse.json({ success: false, error: 'No autorizado.' }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      fullName?: string | null;
      monthlyIncomeTarget?: number | string | null;
      initializeBudget?: boolean;
    };
    const fullName = normalizeName(body.fullName);
    const requestedTarget = normalizeMoney(body.monthlyIncomeTarget);

    const { data: currentProfile, error: profileReadError } = await supabase
      .from('profiles')
      .select('id, email, full_name, monthly_income_target')
      .eq('id', tenant.profileId)
      .maybeSingle();

    if (profileReadError) {
      throw new Error(`No pude leer tu perfil: ${profileReadError.message}`);
    }

    const monthlyIncomeTarget = requestedTarget ?? normalizeMoney(currentProfile?.monthly_income_target) ?? 0;
    const profilePayload: Record<string, unknown> = {
      id: tenant.profileId,
      email: currentProfile?.email || tenant.email || null,
      monthly_income_target: monthlyIncomeTarget,
      updated_at: new Date().toISOString(),
    };

    if (fullName) {
      profilePayload.full_name = fullName;
    } else if (currentProfile?.full_name) {
      profilePayload.full_name = currentProfile.full_name;
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .upsert(profilePayload, { onConflict: 'id' })
      .select('id, email, full_name, monthly_income_target, created_at, updated_at')
      .single();

    if (profileError) {
      throw new Error(`No pude guardar tu perfil: ${profileError.message}`);
    }

    let initialBudget = null;
    let budgetCreated = false;
    const mesAnio = currentMonthKey();

    if (body.initializeBudget) {
      const { data: existingBudget, error: budgetReadError } = await supabase
        .from('presupuestos_mensuales')
        .select('id, mes_anio, techo_vida, techo_placeres, techo_futuro, fase_ahorro')
        .eq('profile_id', tenant.profileId)
        .eq('mes_anio', mesAnio)
        .maybeSingle();

      if (budgetReadError) {
        throw new Error(`No pude revisar tu presupuesto inicial: ${budgetReadError.message}`);
      }

      if (existingBudget) {
        initialBudget = existingBudget;
      } else {
        const presupuesto = calcularPresupuestoTresTercios(monthlyIncomeTarget);
        const budgetPayload = withProfile({
          mes_anio: mesAnio,
          techo_vida: presupuesto.Vida,
          techo_placeres: presupuesto.Placeres,
          techo_futuro: presupuesto.Futuro,
          fase_ahorro: 'Regla 33/33/33 activa',
        }, tenant.profileId);
        const { data: insertedBudget, error: budgetInsertError } = await supabase
          .from('presupuestos_mensuales')
          .insert([budgetPayload])
          .select('id, mes_anio, techo_vida, techo_placeres, techo_futuro, fase_ahorro')
          .single();

        if (budgetInsertError) {
          throw new Error(`No pude crear tu presupuesto inicial: ${budgetInsertError.message}`);
        }

        initialBudget = insertedBudget;
        budgetCreated = true;
      }
    }

    return NextResponse.json({
      success: true,
      profile,
      initialBudget,
      budgetCreated,
      profileScoped: true,
      profileId: tenant.profileId,
      tenantSource: tenant.source,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
