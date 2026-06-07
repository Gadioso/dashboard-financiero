export type CategoriaFinanciera = 'Vida' | 'Placeres' | 'Futuro';
export type CategoriaGasto = CategoriaFinanciera | 'Seguros';
export type TipoMovimiento = 'gasto' | 'ingreso' | 'abono_tarjeta';

export type Gasto = {
  id: string | number;
  concepto: string;
  categoria: CategoriaGasto | string;
  subcategoria?: string | null;
  monto: number | string;
  origen: string;
  fecha: string;
};

export type Ingreso = {
  id: string | number;
  concepto: string | null;
  monto: number | string;
  tipo?: string | null;
  fecha: string;
};

export type AbonoTarjetaCredito = {
  id: string | number;
  concepto: string;
  monto: number | string;
  tarjeta?: string | null;
  origen: string;
  fecha: string;
};

export type Movimiento = {
  id: string;
  tipo: TipoMovimiento;
  concepto: string;
  categoria: CategoriaGasto | 'Ingreso' | string;
  subcategoria?: string | null;
  monto: number | string;
  origen: string;
  fecha: string;
};

export type ClasificacionMovimiento = {
  concepto: string;
  monto: number;
  tipo: TipoMovimiento;
  categoria: CategoriaFinanciera;
  subcategoria: string;
  razon: string;
  fechaMovimiento?: string;
};

export type ResumenFinanciero = {
  ingresosMes: number;
  promedioIngresosUltimos3Meses: number;
  presupuesto: {
    Vida: number;
    Placeres: number;
    Futuro: number;
  };
  gastado: {
    Vida: number;
    Placeres: number;
    Futuro: number;
  };
  faseAhorro: string;
};

export type ResumenMensual = {
  mes: string;
  ingresos: number;
  egresos: number;
  resultado: number;
  saldoAcumulado: number;
};

export const resumenInicial: ResumenFinanciero = {
  ingresosMes: 0,
  promedioIngresosUltimos3Meses: 0,
  presupuesto: { Vida: 0, Placeres: 0, Futuro: 0 },
  gastado: { Vida: 0, Placeres: 0, Futuro: 0 },
  faseAhorro: 'Regla 33/33/33 activa',
};

export const meses2026 = [
  { etiqueta: 'ENERO', indice: 0 },
  { etiqueta: 'FEBRERO', indice: 1 },
  { etiqueta: 'MARZO', indice: 2 },
  { etiqueta: 'ABRIL', indice: 3 },
  { etiqueta: 'MAYO', indice: 4 },
  { etiqueta: 'JUNIO', indice: 5 },
  { etiqueta: 'JULIO', indice: 6 },
  { etiqueta: 'AGOSTO', indice: 7 },
  { etiqueta: 'SEPTIEMBRE', indice: 8 },
  { etiqueta: 'OCTUBRE', indice: 9 },
  { etiqueta: 'NOVIEMBRE', indice: 10 },
  { etiqueta: 'DICIEMBRE', indice: 11 },
];

export const aliasCategoria: Record<string, CategoriaFinanciera> = {
  ahorro: 'Futuro',
  fijo: 'Vida',
  futuro: 'Futuro',
  inv: 'Futuro',
  inversion: 'Futuro',
  inversiones: 'Futuro',
  p: 'Placeres',
  placer: 'Placeres',
  placeres: 'Placeres',
  salida: 'Placeres',
  v: 'Vida',
  vida: 'Vida',
};

export const categoriaParaGastos = (categoria: CategoriaFinanciera): CategoriaGasto =>
  categoria === 'Futuro' ? 'Seguros' : categoria;

export const formatoFechaMX = new Intl.DateTimeFormat('es-MX', {
  timeZone: 'America/Mexico_City',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export const formatoEnteroMX = new Intl.NumberFormat('es-MX', {
  maximumFractionDigits: 0,
});

export const formatoMontoMX = new Intl.NumberFormat('es-MX', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export const formatearEntero = (valor: number | string) => formatoEnteroMX.format(Number(valor));
export const formatearMonto = (valor: number | string) => formatoMontoMX.format(Number(valor));
export const formatearFecha = (valor: string) => {
  const fecha = new Date(valor);
  const dia = String(fecha.getUTCDate()).padStart(2, '0');
  const mes = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'][fecha.getUTCMonth()];
  const year = fecha.getUTCFullYear();

  return `${dia} ${mes} ${year}`;
};

export function calcularPresupuestoTresTercios(ingresosMes: number) {
  const tercio = ingresosMes > 0 ? ingresosMes / 3 : 0;

  return {
    Vida: tercio,
    Placeres: tercio,
    Futuro: tercio,
  };
}

export function mesKeyDesdeFecha(fecha: Date) {
  const year = fecha.getUTCFullYear();
  const month = String(fecha.getUTCMonth() + 1).padStart(2, '0');

  return `${year}-${month}`;
}

export function inicioMesISO(mesKey: string) {
  const [year, month] = mesKey.split('-').map(Number);

  return new Date(Date.UTC(year, month - 1, 1)).toISOString();
}

export function finMesISO(mesKey: string) {
  const [year, month] = mesKey.split('-').map(Number);

  return new Date(Date.UTC(year, month, 1)).toISOString();
}

export function calcularIngresosMes(ingresos: Pick<Ingreso, 'monto'>[]) {
  return ingresos.reduce((total, ingreso) => total + Number(ingreso.monto || 0), 0);
}

export function calcularPromedioIngresosUltimos3Meses({
  ingresos,
  mesActivo,
}: {
  ingresos: Pick<Ingreso, 'monto' | 'fecha'>[];
  mesActivo: string;
}) {
  const [year, month] = mesActivo.split('-').map(Number);
  const mesesObjetivo = Array.from({ length: 3 }, (_, offset) => {
    const fecha = new Date(Date.UTC(year, month - 1 - offset, 1));
    return mesKeyDesdeFecha(fecha);
  }).reverse();

  const totales = mesesObjetivo.map((mesKey) => {
    const inicio = new Date(inicioMesISO(mesKey)).getTime();
    const fin = new Date(finMesISO(mesKey)).getTime();

    return ingresos
      .filter((ingreso) => {
        const fecha = new Date(ingreso.fecha).getTime();
        return fecha >= inicio && fecha < fin;
      })
      .reduce((total, ingreso) => total + Number(ingreso.monto || 0), 0);
  });

  return totales.reduce((total, monto) => total + monto, 0) / 3;
}

export function calcularResumenMensual2026({
  ingresos,
  gastos,
}: {
  ingresos: Pick<Ingreso, 'monto' | 'fecha'>[];
  gastos: Pick<Gasto, 'monto' | 'fecha'>[];
}) {
  let saldoAcumulado = 0;

  return meses2026.map(({ etiqueta, indice }) => {
    const ingresosMes = ingresos
      .filter((ingreso) => new Date(ingreso.fecha).getUTCFullYear() === 2026 && new Date(ingreso.fecha).getUTCMonth() === indice)
      .reduce((total, ingreso) => total + Number(ingreso.monto || 0), 0);
    const egresosMes = gastos
      .filter((gasto) => new Date(gasto.fecha).getUTCFullYear() === 2026 && new Date(gasto.fecha).getUTCMonth() === indice)
      .reduce((total, gasto) => total + Number(gasto.monto || 0), 0);
    const resultado = ingresosMes - egresosMes;
    saldoAcumulado += resultado;

    return {
      mes: etiqueta,
      ingresos: ingresosMes,
      egresos: egresosMes,
      resultado,
      saldoAcumulado,
    };
  });
}

export function calcularGastadoPorBolsa(gastos: Pick<Gasto, 'categoria' | 'monto'>[]) {
  return gastos.reduce(
    (acumulado, gasto) => {
      if (gasto.categoria === 'Vida') acumulado.Vida += Number(gasto.monto);
      if (gasto.categoria === 'Placeres') acumulado.Placeres += Number(gasto.monto);
      if (gasto.categoria === 'Seguros' || gasto.categoria === 'Futuro') acumulado.Futuro += Number(gasto.monto);
      return acumulado;
    },
    { Vida: 0, Placeres: 0, Futuro: 0 }
  );
}

export function calcularRestantesPorBolsa({
  presupuesto,
  gastado,
}: Pick<ResumenFinanciero, 'presupuesto' | 'gastado'>) {
  return {
    Vida: presupuesto.Vida - gastado.Vida,
    Placeres: presupuesto.Placeres - gastado.Placeres,
    Futuro: presupuesto.Futuro - gastado.Futuro,
  };
}

export function nombreBolsa(categoria: string) {
  if (categoria === 'Seguros' || categoria === 'Futuro') return 'Futuro';
  if (categoria === 'Placeres') return 'Placeres';
  if (categoria === 'Vida') return 'Vida';
  if (categoria === 'Ingreso') return 'Ingreso';

  return categoria;
}

export function nombreOrigen(origen: string, subcategoria?: string | null) {
  if (origen === 'Santander_Email' || subcategoria === 'Santander') return 'Santander Email';
  if (origen === 'Supabase') return 'Supabase';
  if (origen === 'Telegram') return 'Telegram';
  if (origen === 'Web') return 'Web';

  return origen;
}

export function combinarMovimientos({
  ingresos,
  gastos,
}: {
  ingresos: Ingreso[];
  gastos: Gasto[];
}) {
  const movimientosIngreso: Movimiento[] = ingresos.map((ingreso) => ({
    id: `ingreso-${ingreso.id}`,
    tipo: 'ingreso',
    concepto: ingreso.concepto || 'Ingreso',
    categoria: 'Ingreso',
    subcategoria: ingreso.tipo || 'Ingreso',
    monto: ingreso.monto,
    origen: 'Supabase',
    fecha: ingreso.fecha,
  }));
  const movimientosGasto: Movimiento[] = gastos.map((gasto) => ({
    id: `gasto-${gasto.id}`,
    tipo: 'gasto',
    concepto: gasto.concepto,
    categoria: gasto.categoria,
    subcategoria: gasto.subcategoria,
    monto: gasto.monto,
    origen: nombreOrigen(gasto.origen, gasto.subcategoria),
    fecha: gasto.fecha,
  }));

  return [...movimientosIngreso, ...movimientosGasto].sort(
    (a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime()
  );
}

function limpiarMonto(valor: string) {
  return Number(valor.replace(/,/g, ''));
}

export function esComandoAyuda(texto: string) {
  const partes = texto.trim().split(/\s+/);
  const comando = partes[0]?.toLowerCase();

  return comando === '/start' || comando === 'start' || comando === 'hola' || comando === 'ayuda' || comando === '/help';
}

export function parsearMovimientoEstructurado(texto: string) {
  const partes = texto.trim().split(/\s+/);
  const monto = limpiarMonto(partes[0] || '');
  const posibleCategoria = partes[partes.length - 1]?.toLowerCase();
  const categoria = aliasCategoria[posibleCategoria];

  if (!Number.isFinite(monto) || monto <= 0) {
    return {
      ok: false as const,
      error: 'Formato inválido. Usa algo como: 150 taxi placeres',
    };
  }

  if (!categoria) {
    return {
      ok: false as const,
      error: 'No identifiqué la categoría. Usa vida, placeres o futuro. Ejemplo: 150 taxi placeres',
    };
  }

  const concepto = partes.slice(1, -1).join(' ').trim();

  if (!concepto) {
    return {
      ok: false as const,
      error: 'Falta el concepto. Ejemplo: 150 taxi placeres',
    };
  }

  return {
    ok: true as const,
    concepto,
    monto,
    categoria,
    tipo: 'gasto' as const,
    subcategoria: categoria,
    razon: 'Clasificado por categoría explícita en el mensaje.',
  };
}
