"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import dynamic from 'next/dynamic';
import {
  ArrowRight,
  ArrowsDownUp,
  Bell,
  CalendarBlank,
  ChartDonut,
  ChartLineUp,
  CreditCard,
  Eye,
  EyeSlash,
  FileText,
  Gear,
  House,
  Microphone,
  Paperclip,
  PencilSimple,
  Plant,
  Receipt,
  ShieldCheck,
  SignOut as SignOutIcon,
  Sparkle,
  Target,
  Wallet,
  X,
} from '@phosphor-icons/react';
import PersonalizationInterview from '@/app/onboarding/PersonalizationInterview';
import VirafiBrand, { VirafiMark } from '@/app/Components/VirafiBrand';
import { fetchWithSessionRefresh as fetchWithSharedSessionRefresh } from '@/lib/authenticated-fetch';
import LanguageSwitcher from '@/app/Components/LanguageSwitcher';
import { useLocale } from '@/app/Components/LocaleProvider';
import {
  calcularIngresosMes,
  calcularGastadoPorBolsa,
  calcularAsignacionFuturo,
  calcularPresupuestoTresTercios,
  calcularPromedioIngresosUltimos3Meses,
  calcularRestantesPorBolsa,
  calcularResumenMensual2026,
  combinarMovimientos,
  etiquetaBolsa,
  finMesISO,
  formatearEntero,
  formatearFecha,
  formatearMonto,
  inicioMesISO,
  mesKeyDesdeFecha,
  meses2026,
  type Gasto,
  type Ingreso,
  type AbonoTarjetaCredito,
  type Movimiento,
  type ResumenMensual,
  nombreBolsa,
  nombreOrigen,
  resumenInicial,
} from '@/lib/financial-core';
import type { WealthRoutePlan } from '@/lib/wealth-route';
import type { GoalCfoPlan } from '@/lib/goal-cfo-plan';

const FinancialImportModal = dynamic(() => import('@/app/Components/FinancialImportModal'), { ssr: false });

type BrowserSpeechRecognitionEvent = {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: {
      isFinal: boolean;
      [index: number]: {
        transcript: string;
      };
    };
  };
};

type BrowserSpeechRecognitionErrorEvent = {
  error?: string;
  message?: string;
};

type BrowserSpeechRecognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null;
  onerror: ((event: BrowserSpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
};

type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

declare global {
  interface Window {
    SpeechRecognition?: BrowserSpeechRecognitionConstructor;
    webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
  }
}

type PresupuestoMensualRow = {
  techo_vida?: number | string | null;
  techo_placeres?: number | string | null;
  techo_futuro?: number | string | null;
  fase_ahorro?: string | null;
};

type DashboardApiResponse = {
  success: boolean;
  error?: string;
  presupuesto: PresupuestoMensualRow | null;
  ingresosAnuales: Ingreso[];
  gastosAnuales: Gasto[];
  abonosTarjetaAnuales: AbonoTarjetaCredito[];
  fondosAcumulados?: FondoAcumulado[];
  cfoPlan?: GoalCfoPlan | null;
};

type BillingStatus = {
  configured: boolean;
  priceConfigured?: {
    beta: boolean;
    premium: boolean;
  };
  plan: 'free' | 'beta' | 'premium';
  status: string;
  active: boolean;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  stripeCustomerId: string | null;
  limits?: {
    telegramAccounts: number;
  };
  error?: string;
};

type PlanOption = {
  name: string;
  price: string;
  plan: 'free' | 'beta' | 'premium';
  description: string;
  features: string[];
};

type FondoAcumulado = {
  id?: string | number;
  cuenta?: string | null;
  nombre?: string | null;
  concepto?: string | null;
  saldo_actual?: number | string | null;
  balance_actual?: number | string | null;
  monto_actual?: number | string | null;
  monto?: number | string | null;
  objetivo?: number | string | null;
  meta?: number | string | null;
  monto_objetivo?: number | string | null;
  meta_monto?: number | string | null;
  fecha_objetivo?: string | null;
  updated_at?: string | null;
  ultima_actualizacion?: string | null;
};

type AgentTask = {
  id: string;
  agent_key: string;
  title: string;
  description?: string | null;
  status: string;
  priority: string;
  due_at?: string | null;
  created_at?: string | null;
};

type MarketSnapshot = {
  id: string;
  provider: string;
  captured_at: string;
  price?: number | null;
  bid?: number | null;
  ask?: number | null;
  spread_bps?: number | null;
  volume_24h?: number | null;
  raw?: Record<string, unknown> | null;
  asset?: {
    id: string;
    asset_type: string;
    symbol?: string | null;
    name: string;
    exchange?: string | null;
    currency?: string | null;
    provider?: string | null;
  } | null;
};

type MarketBriefingItem = {
  id: string;
  topic: 'geopolitics' | 'rates' | 'crypto' | 'technology';
  topicLabel: string;
  headline: string;
  url: string;
  source: string;
  domain: string;
  publishedAt?: string | null;
  whyItMatters: string;
  watchNext: string;
  beginnerContext: string;
};

type StatusTone = 'info' | 'success' | 'warning' | 'error';

type InvestmentRiskProfile = {
  experienceLevel: 'beginner' | 'intermediate' | 'experienced';
  monthlyContribution: number;
  riskTolerance: 'conservative' | 'balanced' | 'aggressive';
  horizon: 'short' | 'medium' | 'long';
  maxDrawdownPct: number;
  maxPositionPct: number;
  emergencyFundMonths: number;
  allowCrypto: boolean;
  allowPredictionMarkets: boolean;
  noLeverage: boolean;
  allowedAssetTypes?: string[];
};

type WealthEligibility = {
  ready: boolean;
  profileCompleted: boolean;
  hasGoals: boolean;
  reason?: string | null;
};

type WealthGoalSummary = {
  id: string;
  name: string;
  currentAmount: number;
  targetAmount: number;
  targetDate?: string | null;
  horizonMonths: number;
};

type GoalContribution = {
  id: string;
  amount: number | string;
  contributed_at: string;
  source: 'manual' | 'investment_transaction' | 'adjustment';
  status: 'suggested' | 'confirmed' | 'rejected';
  confidence?: number | string | null;
  note?: string | null;
};

type GoalContributionPanel = {
  goal: { id: string; name: string; current_amount: number | string; target_amount: number | string };
  contributions: GoalContribution[];
};

type AccountStatus = {
  success: boolean;
  profileId?: string | null;
  profile?: {
    id: string;
    full_name?: string | null;
    avatarUrl?: string | null;
    professional_headline?: string | null;
    bio?: string | null;
    location?: string | null;
    financial_why?: string | null;
    monthly_income_target?: number | string | null;
  } | null;
  billing?: BillingStatus;
  agentTasks?: AgentTask[];
  virafiaMessages?: Array<{
    id: string;
    role: 'user' | 'assistant';
    content: string;
    channel?: string;
    createdAt: string;
    metadata?: { lastExpenseId?: string };
  }>;
  error?: string;
};

async function readJsonResponse<T = Record<string, unknown>>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function formatActionError(data: { error?: unknown; migration?: unknown } | null | undefined, fallback: string) {
  const error = typeof data?.error === 'string' && data.error.trim() ? data.error.trim() : fallback;
  const technicalPattern = /supabase|stripe|vercel|gemini|openrouter|api[_\s-]?key|service[_\s-]?role|webhook|oauth|schema|migration|sql|rls|uuid|profile_id|endpoint|token|secret|environment|env\b|not configured|no est[aá] configurad|could not find|does not exist|invalid.*key/i;

  return technicalPattern.test(error) ? fallback : error;
}

type DashboardAnalysis = {
  headline: string;
  diagnosis: string;
  actions: string[];
  risks: string[];
};

type DashboardAnalysisFallbackInput = {
  scope: 'month' | 'year';
  monthLabel: string;
  ingresosMes: number;
  totalGastadoMes: number;
  flujoNetoMes: number;
  tasaFuturo: number;
  buckets: Array<{ label: string; used: number; limit: number; remaining: number; percent: number }>;
  monthlySeries?: Array<{ mes: string; ingresos: number; egresos: number; resultado: number }>;
};

const mesActualKey = mesKeyDesdeFecha(new Date());
const MOVIMIENTOS_POR_PAGINA = 12;

type DashboardView = 'resumen' | 'movimientos' | 'presupuestos' | 'metas' | 'analisis' | 'wealth' | 'planes' | 'reportes';

type DashboardChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  metadata?: {
    lastExpenseId?: string;
  };
};

type MovementEditForm = {
  id: string;
  tipo: 'gasto' | 'ingreso';
  concepto: string;
  monto: string;
  categoria: string;
  subcategoria: string;
  origen: string;
  fecha: string;
};

type InlineMovementField = 'concepto' | 'subcategoria' | 'fecha' | 'categoria' | 'origen' | 'monto';
type InlineMovementEdit = { id: string; field: InlineMovementField; value: string };

type ManualExpenseForm = {
  concepto: string;
  monto: string;
  categoria: string;
  subcategoria: string;
  fecha: string;
};

type GoalEditForm = {
  id: string;
  name: string;
  current: string;
  target: string;
  targetDate: string;
};

function createClientId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function toDateTimeLocalValue(fecha: string) {
  const date = new Date(fecha);

  if (Number.isNaN(date.getTime())) return '';

  const local = new Date(date.getTime() - (date.getTimezoneOffset() * 60000));
  return local.toISOString().slice(0, 16);
}

function fromDateTimeLocalValue(value: string) {
  if (!value) return new Date().toISOString();

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function esAbonoTarjetaSospechoso(abono: AbonoTarjetaCredito) {
  const concepto = String(abono.concepto || '').toLowerCase();
  const monto = Number(abono.monto || 0);

  return monto >= 100000 ||
    /(?:l[ií]nea de cr[eé]dito|cr[eé]dito preaprobado|aprovecha|promoci[oó]n|oferta|beneficio|sin concepto|movimiento santander)/i.test(concepto);
}

function GearIcon() {
  return <Gear aria-hidden="true" className="size-5" weight="regular" />;
}

function VirafIAMark({ className = 'size-5' }: { className?: string }) {
  return <VirafiMark className={className} />;
}

function EditIcon() {
  return <PencilSimple aria-hidden="true" className="size-4" weight="regular" />;
}

function CloseIcon() {
  return <X aria-hidden="true" className="size-5" weight="regular" />;
}

function valorNumerico(...values: Array<number | string | null | undefined>) {
  for (const value of values) {
    const numberValue = Number(value);
    if (Number.isFinite(numberValue)) return numberValue;
  }

  return 0;
}

function formatoDineroCorto(value: number) {
  return new Intl.NumberFormat('es-MX', {
    currency: 'MXN',
    maximumFractionDigits: 0,
    style: 'currency',
  }).format(value);
}

function crearAnalisisCliente(input: DashboardAnalysisFallbackInput): DashboardAnalysis {
  if (input.scope === 'year') {
    const months = (input.monthlySeries || []).filter((month) => month.ingresos || month.egresos || month.resultado);
    const bestMonth = [...months].sort((a, b) => b.resultado - a.resultado)[0];
    const worstMonth = [...months].sort((a, b) => a.resultado - b.resultado)[0];
    const averageIncome = months.length ? input.ingresosMes / months.length : 0;
    const averageExpense = months.length ? input.totalGastadoMes / months.length : 0;
    const projectedIncome = averageIncome * 12;
    const projectedFlow = months.length ? (input.flujoNetoMes / months.length) * 12 : 0;
    const positiveMonths = months.filter((month) => month.resultado >= 0).length;
    const headline = input.flujoNetoMes < 0
      ? 'El acumulado anual necesita corregir su trayectoria'
      : `${positiveMonths} de ${months.length || 0} meses mantienen flujo positivo`;
    const diagnosis = months.length
      ? `De enero a la fecha se acumulan ${formatoDineroCorto(input.ingresosMes)} de ingresos y ${formatoDineroCorto(input.totalGastadoMes)} de egresos, con flujo neto de ${formatoDineroCorto(input.flujoNetoMes)}. El promedio mensual es ${formatoDineroCorto(averageIncome)} de ingreso y ${formatoDineroCorto(averageExpense)} de gasto.${bestMonth ? ` ${bestMonth.mes} es el mejor mes con ${formatoDineroCorto(bestMonth.resultado)} de flujo.` : ''}${worstMonth ? ` ${worstMonth.mes} es el más débil con ${formatoDineroCorto(worstMonth.resultado)}.` : ''}`
      : 'Todavía no hay meses con información suficiente para identificar una trayectoria anual.';

    return {
      headline,
      diagnosis,
      actions: [
        `Usar ${formatoDineroCorto(averageIncome)} como referencia mensual y cerrar el año cerca de ${formatoDineroCorto(projectedIncome)} o por encima.`,
        worstMonth ? `Revisar qué elevó el gasto o redujo el ingreso en ${worstMonth.mes} y evitar que ese patrón se repita.` : 'Mantener el registro mensual completo para comparar tendencias.',
        `Proteger una proyección de flujo anual de ${formatoDineroCorto(projectedFlow)} y revisarla al cierre de cada mes.`,
      ],
      risks: [
        positiveMonths < Math.ceil(months.length / 2) ? 'Menos de la mitad de los meses presentan flujo positivo.' : '',
        input.tasaFuturo < 25 ? 'La asignación acumulada a Emer/Inv está por debajo del ritmo anual deseable.' : '',
      ].filter(Boolean).length
        ? [
            positiveMonths < Math.ceil(months.length / 2) ? 'Menos de la mitad de los meses presentan flujo positivo.' : '',
            input.tasaFuturo < 25 ? 'La asignación acumulada a Emer/Inv está por debajo del ritmo anual deseable.' : '',
          ].filter(Boolean)
        : ['El riesgo principal es que un mes atípico cambie la proyección si no se revisa el acumulado mensualmente.'],
    };
  }

  const monthTitle = input.monthLabel.charAt(0).toUpperCase() + input.monthLabel.slice(1);
  const scopeLabel = monthTitle;
  const pressuredBucket = [...input.buckets].sort((a, b) => b.percent - a.percent)[0];
  const hasData = input.ingresosMes || input.totalGastadoMes || input.flujoNetoMes;
  const headline = !hasData
    ? `Lectura de ${input.monthLabel.toLowerCase()} lista`
    : input.flujoNetoMes < 0
      ? `${scopeLabel} necesita recuperar flujo`
      : pressuredBucket && pressuredBucket.percent >= 90
        ? `${scopeLabel} está presionando el presupuesto`
        : `${scopeLabel} mantiene margen positivo`;

  const diagnosis = hasData
    ? `Ingresos registrados: ${formatoDineroCorto(input.ingresosMes)}; egresos: ${formatoDineroCorto(input.totalGastadoMes)}; flujo neto: ${formatoDineroCorto(input.flujoNetoMes)}.${pressuredBucket ? ` ${pressuredBucket.label} es la bolsa con mayor presión: lleva ${Math.round(pressuredBucket.percent)}% usado y le quedan ${formatoDineroCorto(pressuredBucket.remaining)}.` : ''}`
    : 'Aún hay pocos movimientos registrados para este periodo; la prioridad es mantener la captura al día para tomar decisiones con datos completos.';

  const actions = [
    input.flujoNetoMes < 0
      ? `Recortar o diferir ${formatoDineroCorto(Math.abs(input.flujoNetoMes))} en gastos variables para volver a flujo positivo.`
      : `Proteger el margen de ${formatoDineroCorto(input.flujoNetoMes)} antes de autorizar gastos nuevos.`,
    pressuredBucket && pressuredBucket.percent >= 80
      ? `Pausar cargos nuevos en ${pressuredBucket.label} hasta recuperar margen.`
      : 'Revisar ingresos, egresos y flujo neto contra el periodo anterior.',
    input.tasaFuturo < 25
      ? `Acercar Emer/Inv al 25%; hoy falta ${Math.round(Math.max(0, 25 - input.tasaFuturo))}%. De ese 25%, priorizar 10% a emergencia y 15% a la meta de inversión.`
      : 'Mantener Emer/Inv separado de pagos ordinarios y dirigir el 15% de inversión a la meta prioritaria.',
    'Cerrar el periodo con revisión de bolsas fuera de rango.',
  ];

  const risks = [
    input.flujoNetoMes < 0 ? `Flujo neto negativo de ${formatoDineroCorto(input.flujoNetoMes)}.` : '',
    pressuredBucket && pressuredBucket.percent >= 100 ? `${pressuredBucket.label} ya superó su límite.` : '',
    input.tasaFuturo < 25 ? 'Emer/Inv está por debajo del ritmo necesario.' : '',
  ].filter(Boolean);

  return {
    headline,
    diagnosis,
    actions: actions.slice(0, 5),
    risks: risks.length ? risks.slice(0, 4) : ['El principal riesgo es perder visibilidad del flujo real si no se actualizan los movimientos.'],
  };
}

function etiquetaCambio(actual: number, anterior: number, options?: { invert?: boolean; neutral?: string }) {
  if (!Number.isFinite(actual) || !Number.isFinite(anterior)) return options?.neutral || 'Sin base';
  if (anterior === 0) {
    if (actual === 0) return options?.neutral || 'Sin cambio';
    return 'Nuevo';
  }

  const rawChange = ((actual - anterior) / Math.abs(anterior)) * 100;
  const effectiveChange = options?.invert ? -rawChange : rawChange;
  const sign = effectiveChange > 0 ? '+' : '';

  return `${sign}${effectiveChange.toFixed(1)}%`;
}

function tendenciaTone(label: string) {
  if (label === 'Nuevo' || label === 'Sin base' || label === 'Sin cambio') return 'text-slate-500';
  return label.startsWith('-') ? 'text-rose-600' : 'text-emerald-600';
}

function fondoNombre(fondo: FondoAcumulado) {
  return fondo.cuenta || fondo.nombre || fondo.concepto || 'Meta financiera';
}

function fondoActual(fondo: FondoAcumulado) {
  return valorNumerico(fondo.saldo_actual, fondo.balance_actual, fondo.monto_actual, fondo.monto);
}

function fondoObjetivo(fondo: FondoAcumulado) {
  return valorNumerico(fondo.objetivo, fondo.meta, fondo.monto_objetivo, fondo.meta_monto);
}

export default function DashboardFinanciero() {
  const { locale, t } = useLocale();
  const [loading, setLoading] = useState(false);
  const [inputIA, setInputIA] = useState('');
  const [procesando, setProcesando] = useState(false);
  const [escuchandoVoz, setEscuchandoVoz] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<DashboardChatMessage[]>([]);
  const [chatAttachments, setChatAttachments] = useState<File[]>([]);
  const [balanceVisible, setBalanceVisible] = useState(true);
  const [deletingId, setDeletingId] = useState<string | number | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editForm, setEditForm] = useState<MovementEditForm | null>(null);
  const [inlineEdit, setInlineEdit] = useState<InlineMovementEdit | null>(null);
  const [inlineSaving, setInlineSaving] = useState(false);
  const [goalEditForm, setGoalEditForm] = useState<GoalEditForm | null>(null);
  const [goalSaving, setGoalSaving] = useState(false);
  const [goalContributionId, setGoalContributionId] = useState('');
  const [goalContributionPanel, setGoalContributionPanel] = useState<GoalContributionPanel | null>(null);
  const [goalContributionAmount, setGoalContributionAmount] = useState('');
  const [goalContributionLoading, setGoalContributionLoading] = useState(false);
  const [manualExpenseOpen, setManualExpenseOpen] = useState(false);
  const [financialImportOpen, setFinancialImportOpen] = useState(false);
  const [manualExpenseSaving, setManualExpenseSaving] = useState(false);
  const [manualExpenseForm, setManualExpenseForm] = useState<ManualExpenseForm>({
    concepto: '',
    monto: '',
    categoria: 'Placeres',
    subcategoria: 'Otros Placeres',
    fecha: toDateTimeLocalValue(new Date().toISOString()),
  });
  const [mensajeStatus, setMensajeStatus] = useState('');
  const [mesActivo, setMesActivo] = useState(mesActualKey);
  const [vistaActiva, setVistaActiva] = useState<DashboardView>('resumen');
  const [goalsInterviewOpen, setGoalsInterviewOpen] = useState(false);
  const [resumen, setResumen] = useState(resumenInicial);
  const [resumenMensual, setResumenMensual] = useState<ResumenMensual[]>([]);
  const [gastosAnuales, setGastosAnuales] = useState<Gasto[]>([]);
  const [fondosAcumulados, setFondosAcumulados] = useState<FondoAcumulado[]>([]);
  const [goalCfoPlan, setGoalCfoPlan] = useState<GoalCfoPlan | null>(null);
  const [ultimosMovimientos, setUltimosMovimientos] = useState<Movimiento[]>([]);
  const [movimientosPage, setMovimientosPage] = useState(0);
  const [ingresosMensuales, setIngresosMensuales] = useState<Ingreso[]>([]);
  const [gastosMensuales, setGastosMensuales] = useState<Gasto[]>([]);
  const [abonosTarjetaMensuales, setAbonosTarjetaMensuales] = useState<AbonoTarjetaCredito[]>([]);
  const [billingStatus, setBillingStatus] = useState<BillingStatus | null>(null);
  const [accountProfile, setAccountProfile] = useState<NonNullable<AccountStatus['profile']> | null>(null);
  const [monthlyIncomeTarget, setMonthlyIncomeTarget] = useState(0);
  const [agentTasks, setAgentTasks] = useState<AgentTask[]>([]);
  const [notificationTrayOpen, setNotificationTrayOpen] = useState(false);
  const [notificationsSeenAt, setNotificationsSeenAt] = useState(0);
  const [marketSnapshots, setMarketSnapshots] = useState<MarketSnapshot[]>([]);
  const [marketBriefing, setMarketBriefing] = useState<MarketBriefingItem[]>([]);
  const [marketExperience, setMarketExperience] = useState<'simple' | 'advanced'>('simple');
  const [marketSyncLoading, setMarketSyncLoading] = useState(false);
  const [riskProfile, setRiskProfile] = useState<InvestmentRiskProfile>({
    experienceLevel: 'beginner',
    monthlyContribution: 5000,
    riskTolerance: 'balanced',
    horizon: 'medium',
    maxDrawdownPct: 20,
    maxPositionPct: 15,
    emergencyFundMonths: 6,
    allowCrypto: true,
    allowPredictionMarkets: false,
    noLeverage: true,
    allowedAssetTypes: ['cash', 'bond', 'fund', 'etf', 'stock', 'crypto'],
  });
  const [riskProfileSavedAt, setRiskProfileSavedAt] = useState<string | null>(null);
  const [wealthRoutePlan, setWealthRoutePlan] = useState<WealthRoutePlan | null>(null);
  const [wealthEligibility, setWealthEligibility] = useState<WealthEligibility>({ ready: false, profileCompleted: false, hasGoals: false });
  const [wealthGoals, setWealthGoals] = useState<WealthGoalSummary[]>([]);
  const [riskProfileLoading, setRiskProfileLoading] = useState(false);
  const [billingLoading, setBillingLoading] = useState(false);
  const [billingAction, setBillingAction] = useState<'checkout' | 'portal' | null>(null);
  const [analysisScope, setAnalysisScope] = useState<'month' | 'year'>('month');
  const [analysis, setAnalysis] = useState<DashboardAnalysis | null>(null);
  const [analysisResultKey, setAnalysisResultKey] = useState('');
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [reportScope, setReportScope] = useState<'month' | 'year'>('month');
  const [reportDownloading, setReportDownloading] = useState(false);
  const speechRecognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const audioStopTimeoutRef = useRef<number | null>(null);
  const statusTimeoutRef = useRef<number | null>(null);
  const chatFileInputRef = useRef<HTMLInputElement | null>(null);
  const accountProfileIdRef = useRef<string | null>(null);

  async function logoutFromDashboard() {
    await fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    window.location.assign('/login');
  }

  useEffect(() => {
    const stored = window.localStorage.getItem('dashboard_notifications_seen_at_v2');
    queueMicrotask(() => setNotificationsSeenAt(stored ? Number(stored) || 0 : 0));
  }, []);

  const descargarReportePdf = async () => {
    setReportDownloading(true);
    setMensajeStatus('Preparando reporte PDF...');

    try {
      const { jsPDF } = await import('jspdf');
      const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
      const isYear = reportScope === 'year';
      const periodTitle = isYear ? 'Reporte anual 2026' : `Reporte mensual - ${selectedMonthName} 2026`;
      const income = isYear ? ingresosYearToDate : resumen.ingresosMes;
      const expenses = isYear ? totalGastadoYearToDate : totalGastadoMes;
      const net = income - expenses;
      const pageWidth = pdf.internal.pageSize.getWidth();
      const margin = 16;
      const money = (value: number) => `$${formatearMonto(value)} MXN`;

      pdf.setFillColor(37, 99, 235);
      pdf.rect(0, 0, pageWidth, 34, 'F');
      pdf.setTextColor(255, 255, 255);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(19);
      pdf.text('Virafi', margin, 15);
      pdf.setFontSize(11);
      pdf.setFont('helvetica', 'normal');
      pdf.text(periodTitle, margin, 24);
      pdf.text(`Generado ${new Date().toLocaleDateString('es-MX')}`, pageWidth - margin, 24, { align: 'right' });

      pdf.setTextColor(15, 23, 42);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(16);
      pdf.text('Resumen ejecutivo', margin, 48);

      const metrics = [
        ['Ingresos', money(income)],
        ['Egresos', money(expenses)],
        ['Flujo neto', money(net)],
        ['Meta mensual', money(metaMensualActiva)],
      ];
      metrics.forEach(([label, value], index) => {
        const x = margin + (index % 2) * 90;
        const y = 56 + Math.floor(index / 2) * 24;
        pdf.setFillColor(248, 250, 252);
        pdf.roundedRect(x, y, 84, 18, 2, 2, 'F');
        pdf.setFontSize(8);
        pdf.setTextColor(100, 116, 139);
        pdf.text(label, x + 4, y + 6);
        pdf.setFontSize(12);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(15, 23, 42);
        pdf.text(value, x + 4, y + 13);
      });

      let y = 112;
      pdf.setFontSize(14);
      pdf.text(isYear ? 'Resultado por mes' : 'Distribución 50/25/25', margin, y);
      y += 9;

      if (isYear) {
        resumenMensual.forEach((month) => {
          if (y > 275) { pdf.addPage(); y = 20; }
          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(9);
          pdf.setTextColor(51, 65, 85);
          pdf.text(month.mes, margin, y);
          pdf.text(money(month.ingresos), 70, y, { align: 'right' });
          pdf.text(money(month.egresos), 125, y, { align: 'right' });
          pdf.setFont('helvetica', 'bold');
          pdf.text(money(month.resultado), pageWidth - margin, y, { align: 'right' });
          pdf.setDrawColor(226, 232, 240);
          pdf.line(margin, y + 3, pageWidth - margin, y + 3);
          y += 10;
        });
      } else {
        budgetBuckets.forEach((bucket) => {
          const pct = bucket.limit > 0 ? Math.min((bucket.used / bucket.limit) * 100, 999) : 0;
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(10);
          pdf.text(`${bucket.label} - ${pct.toFixed(0)}%`, margin, y);
          pdf.setFont('helvetica', 'normal');
          pdf.text(`${money(bucket.used)} usado | ${money(bucket.remaining)} disponible`, margin + 55, y);
          y += 12;
        });

        y += 4;
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(14);
        pdf.text('Movimientos principales', margin, y);
        y += 9;
        ultimosMovimientos.slice(0, 18).forEach((movement) => {
          if (y > 275) { pdf.addPage(); y = 20; }
          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(8.5);
          pdf.text(formatearFecha(movement.fecha), margin, y);
          pdf.text(String(movement.concepto).slice(0, 48), 44, y);
          pdf.text(`${movement.tipo === 'ingreso' ? '+' : '-'}${money(Number(movement.monto))}`, pageWidth - margin, y, { align: 'right' });
          y += 8;
        });
      }

      const pages = pdf.getNumberOfPages();
      for (let page = 1; page <= pages; page += 1) {
        pdf.setPage(page);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(8);
        pdf.setTextColor(100, 116, 139);
        pdf.text('Información financiera personal. Documento informativo.', margin, 290);
        pdf.text(`${page} / ${pages}`, pageWidth - margin, 290, { align: 'right' });
      }

      pdf.save(`reporte-${isYear ? 'anual-2026' : `${mesActivo}-mensual`}.pdf`);
      setMensajeStatus('Reporte PDF descargado.');
    } catch {
      setMensajeStatus('No pude generar el PDF. Intenta de nuevo.');
    } finally {
      setReportDownloading(false);
      setTimeout(() => setMensajeStatus(''), 4000);
    }
  };

  const fetchWithSessionRefresh = useCallback(
    (input: RequestInfo | URL, init?: RequestInit) => fetchWithSharedSessionRefresh(input, init),
    []
  );

  useEffect(() => {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!timezone) return;
    void fetchWithSessionRefresh('/api/account/daily-cfo', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ timezone }),
    }).catch((error) => console.error('No pude guardar la zona horaria del mentor diario:', error));
  }, [fetchWithSessionRefresh]);

  const mostrarMensajeTemporal = useCallback((mensaje: string, ms = 7000) => {
    if (statusTimeoutRef.current) window.clearTimeout(statusTimeoutRef.current);

    setMensajeStatus(mensaje);
    statusTimeoutRef.current = window.setTimeout(() => {
      setMensajeStatus('');
      statusTimeoutRef.current = null;
    }, ms);
  }, []);

  const changeMesActivo = useCallback((nextMes: string) => {
    setMesActivo(nextMes);
    setMovimientosPage(0);
  }, []);

  const fetchData = useCallback(async (options?: { silent?: boolean }) => {
    try {
      if (!options?.silent) setLoading(true);

      const response = await fetchWithSessionRefresh(`/api/dashboard?mes=${encodeURIComponent(mesActivo)}`, {
        cache: 'no-store',
      });
      const dashboardData = (await response.json()) as DashboardApiResponse;

      if (!response.ok || !dashboardData.success) {
        setMensajeStatus(response.status === 401
          ? 'Tu sesión expiró. Vuelve a iniciar sesión para continuar.'
          : formatActionError(dashboardData, 'No pude cargar tu información. Intenta nuevamente.')
        );
        return;
      }

      const ingresosTodoElAño = dashboardData.ingresosAnuales || [];
      const gastosTodoElAño = dashboardData.gastosAnuales || [];
      const abonosTarjetaTodoElAño = dashboardData.abonosTarjetaAnuales || [];
      setGastosAnuales(gastosTodoElAño);
      setFondosAcumulados(dashboardData.fondosAcumulados || []);
      setGoalCfoPlan(dashboardData.cfoPlan || null);
      const inicioMes = new Date(inicioMesISO(mesActivo)).getTime();
      const finMes = new Date(finMesISO(mesActivo)).getTime();
      const ingresosDelMes = ingresosTodoElAño.filter((ingreso) => {
        const fecha = new Date(ingreso.fecha).getTime();
        return fecha >= inicioMes && fecha < finMes;
      });
      const gastosDelMes = gastosTodoElAño.filter((gasto) => {
        const fecha = new Date(gasto.fecha).getTime();
        return fecha >= inicioMes && fecha < finMes;
      });
      const abonosTarjetaDelMes = abonosTarjetaTodoElAño.filter((abono) => {
        const fecha = new Date(abono.fecha).getTime();
        return fecha >= inicioMes && fecha < finMes;
      }).filter((abono) => !esAbonoTarjetaSospechoso(abono));
      const presupuesto = dashboardData.presupuesto;
      const ingresosMes = calcularIngresosMes(ingresosDelMes);
      const promedioIngresosUltimos3Meses = calcularPromedioIngresosUltimos3Meses({
        ingresos: ingresosTodoElAño,
        mesActivo,
      });
      const gastado = calcularGastadoPorBolsa(gastosDelMes);
      const presupuestoDinamico = presupuesto?.techo_vida && presupuesto.fase_ahorro !== 'Regla 33/33/33 activa'
        ? {
            Vida: Number(presupuesto.techo_vida),
            Placeres: Number(presupuesto.techo_placeres || 0),
            Futuro: Number(presupuesto.techo_futuro || 0),
          }
        : calcularPresupuestoTresTercios(ingresosMes);

      setIngresosMensuales([...ingresosDelMes].sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime()));
      setGastosMensuales([...gastosDelMes].sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime()));
      setAbonosTarjetaMensuales([...abonosTarjetaDelMes].sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime()));
      setUltimosMovimientos(combinarMovimientos({
        ingresos: ingresosDelMes,
        gastos: gastosDelMes,
        abonosTarjeta: abonosTarjetaDelMes,
      }));

      setResumen({
        ingresosMes,
        promedioIngresosUltimos3Meses,
        presupuesto: presupuestoDinamico,
        gastado,
        faseAhorro: 'Regla 50/25/25 activa'
      });

      setResumenMensual(
        calcularResumenMensual2026({
          ingresos: ingresosTodoElAño,
          gastos: gastosTodoElAño,
        })
      );
    } catch (err) {
      console.error("Error cargando datos:", err);
    } finally {
      if (!options?.silent) setLoading(false);
    }
  }, [fetchWithSessionRefresh, mesActivo]);

  useEffect(() => {
    void Promise.resolve().then(() => fetchData());
  }, [fetchData]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const billingResult = params.get('billing');

    if (billingResult === 'cancelled') {
      window.history.replaceState({}, '', '/dashboard');
      void Promise.resolve().then(() => {
        mostrarMensajeTemporal('Pago cancelado. No se realizó ningún cargo y tu plan no cambió.');
      });
      return;
    }

    if (billingResult !== 'success') return;
    const sessionId = params.get('session_id');
    if (!sessionId) return;

    void fetchWithSessionRefresh('/api/billing/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    }).then(async (response) => {
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error('No pude confirmar tu plan.');
      window.history.replaceState({}, '', '/dashboard');
      window.location.reload();
    }).catch(() => mostrarMensajeTemporal('Tu pago fue recibido. Estamos terminando de activar el plan; actualiza en unos segundos.', 12_000));
  }, [fetchWithSessionRefresh, mostrarMensajeTemporal]);

  useEffect(() => {
    const refreshVisibleDashboard = () => {
      if (document.visibilityState === 'visible') {
        void fetchData({ silent: true });
      }
    };
    document.addEventListener('visibilitychange', refreshVisibleDashboard);

    return () => {
      document.removeEventListener('visibilitychange', refreshVisibleDashboard);
    };
  }, [fetchData]);

  useEffect(() => {
    let mounted = true;

    async function fetchAccountStatus() {
      try {
        const [accountResult, riskProfileResult, marketResult, briefingResult] = await Promise.allSettled([
          fetchWithSessionRefresh('/api/account/status'),
          fetchWithSessionRefresh('/api/investments/risk-profile'),
          fetchWithSessionRefresh('/api/investments/market-sync'),
          fetchWithSessionRefresh('/api/investments/market-briefing'),
        ]);

        if (mounted) {
          const accountData = accountResult.status === 'fulfilled' ? await readJsonResponse<AccountStatus>(accountResult.value) : null;
          if (accountData) {
            const nextProfileId = accountData.profileId || accountData.profile?.id || null;
            if (accountProfileIdRef.current !== nextProfileId) {
              accountProfileIdRef.current = nextProfileId;
              setChatMessages([]);
            }
            if (accountData.billing) setBillingStatus(accountData.billing);
            if (accountData.profile) {
              setAccountProfile(accountData.profile);
              setMonthlyIncomeTarget(valorNumerico(accountData.profile.monthly_income_target));
            }
            if (accountData.agentTasks) setAgentTasks(accountData.agentTasks);
            if (accountData.virafiaMessages) {
              setChatMessages((current) => current.length ? current : accountData.virafiaMessages!.map((message) => ({
                id: message.id,
                role: message.role,
                content: message.content,
                createdAt: message.createdAt,
                metadata: message.metadata,
              })));
            }
          }

          const riskProfileData = riskProfileResult.status === 'fulfilled' ? await readJsonResponse<{ riskProfile?: InvestmentRiskProfile; acceptedAt?: string | null; routePlan?: WealthRoutePlan | null; eligibility?: WealthEligibility; goals?: WealthGoalSummary[] }>(riskProfileResult.value) : null;
          if (riskProfileResult.status === 'fulfilled' && riskProfileResult.value.ok && riskProfileData) {
            setWealthEligibility(riskProfileData.eligibility || { ready: false, profileCompleted: false, hasGoals: false });
            setWealthGoals(riskProfileData.goals || []);
            setRiskProfileSavedAt(riskProfileData.acceptedAt || null);
            setWealthRoutePlan(riskProfileData.routePlan || null);
            if (riskProfileData.riskProfile) {
              setRiskProfile((current) => ({ ...current, ...riskProfileData.riskProfile }));
            }
          }

          const marketData = marketResult.status === 'fulfilled' ? await readJsonResponse<{ snapshots?: MarketSnapshot[] }>(marketResult.value) : null;
          if (marketResult.status === 'fulfilled' && marketResult.value.ok && marketData?.snapshots) {
            setMarketSnapshots(marketData.snapshots);
          }
          const briefingData = briefingResult.status === 'fulfilled' ? await readJsonResponse<{ items?: MarketBriefingItem[] }>(briefingResult.value) : null;
          if (briefingResult.status === 'fulfilled' && briefingResult.value.ok && briefingData?.items) setMarketBriefing(briefingData.items);
        }
      } catch (error) {
        console.error('No pude cargar el estado de la cuenta:', error);
      }
    }

    void fetchAccountStatus();

    return () => {
      mounted = false;
    };
  }, [fetchWithSessionRefresh]);

  useEffect(() => {
    let mounted = true;

    async function refreshDailyMentor() {
      if (document.visibilityState === 'hidden') return;
      try {
        const response = await fetchWithSessionRefresh('/api/account/status', { cache: 'no-store' });
        const accountData = await readJsonResponse<AccountStatus>(response);
        if (!mounted || !response.ok || !accountData) return;
        if (accountData.agentTasks) setAgentTasks(accountData.agentTasks);
        const proactive = (accountData.virafiaMessages || []).filter((message) => message.channel === 'proactive');
        if (proactive.length) {
          setChatMessages((current) => {
            const additions = proactive.filter((message) => !current.some((existing) => (
              existing.id === message.id ||
              (existing.role === message.role && existing.content === message.content)
            )));
            return [...current, ...additions.map((message) => ({
              id: message.id,
              role: message.role,
              content: message.content,
              createdAt: message.createdAt,
              metadata: message.metadata,
            }))].slice(-30);
          });
        }
      } catch (error) {
        console.error('No pude actualizar el mensaje diario de VirafIA:', error);
      }
    }

    const intervalId = window.setInterval(() => void refreshDailyMentor(), 5 * 60_000);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void refreshDailyMentor();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      mounted = false;
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [fetchWithSessionRefresh]);

  const guardarPerfilRiesgo = async () => {
    setRiskProfileLoading(true);
    setMensajeStatus('Guardando perfil de riesgo...');

    try {
      const response = await fetchWithSessionRefresh('/api/investments/risk-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ monthlyContribution: riskProfile.monthlyContribution }),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        setMensajeStatus(`No pude guardar perfil de riesgo: ${formatActionError(data, 'respuesta inválida')}`);
        return;
      }

      setRiskProfile((current) => ({ ...current, ...data.riskProfile }));
      setRiskProfileSavedAt(data.acceptedAt || new Date().toISOString());
      setWealthRoutePlan(data.routePlan || null);
      setWealthEligibility(data.eligibility || wealthEligibility);
      setWealthGoals(data.goals || wealthGoals);
      setMensajeStatus('Ruta recalculada con tus metas y tu capacidad mensual.');
    } catch {
      setMensajeStatus('No pude conectar con el perfil de riesgo.');
    } finally {
      setRiskProfileLoading(false);
      setTimeout(() => setMensajeStatus(''), 5000);
    }
  };

  const sincronizarMercado = async () => {
    setMarketSyncLoading(true);
    setMensajeStatus('Actualizando información de mercado...');

    try {
      const [response, briefingResponse] = await Promise.all([
        fetchWithSessionRefresh('/api/investments/market-sync', { method: 'POST' }),
        fetchWithSessionRefresh('/api/investments/market-briefing', { cache: 'no-store' }),
      ]);
      const [data, briefingData] = await Promise.all([response.json(), readJsonResponse<{ items?: MarketBriefingItem[] }>(briefingResponse)]);

      if (!response.ok || !data.success) {
        setMensajeStatus(`No pude actualizar la información de mercado: ${formatActionError(data, 'Intenta nuevamente más tarde.')}`);
        return;
      }

      setMarketSnapshots(data.snapshots || []);
      if (briefingResponse.ok && briefingData?.items) setMarketBriefing(briefingData.items);
      const warnings = Array.isArray(data.warnings) && data.warnings.length > 0 ? ` Advertencia: ${data.warnings.join(' · ')}` : '';
      setMensajeStatus(`${data.partial ? 'Mercado actualizado parcialmente' : 'Mercado actualizado'}: ${data.binance || 0} Binance y ${data.polymarket || 0} Polymarket. Siguiente paso: generar tesis para decidir si vale simular algo.${warnings}`);
    } catch {
      setMensajeStatus('No pude conectar con market sync.');
    } finally {
      setMarketSyncLoading(false);
      setTimeout(() => setMensajeStatus(''), 6000);
    }
  };

  const limpiarGrabacionVoz = useCallback(() => {
    if (audioStopTimeoutRef.current) {
      window.clearTimeout(audioStopTimeoutRef.current);
      audioStopTimeoutRef.current = null;
    }

    audioStreamRef.current?.getTracks().forEach((track) => track.stop());
    audioStreamRef.current = null;
    mediaRecorderRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      speechRecognitionRef.current?.abort();
      if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop();
      limpiarGrabacionVoz();
      if (statusTimeoutRef.current) window.clearTimeout(statusTimeoutRef.current);
    };
  }, [limpiarGrabacionVoz]);

  const formatoAudioPreferido = () => {
    if (typeof MediaRecorder === 'undefined') return '';

    return [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
      'audio/aac',
    ].find((mimeType) => MediaRecorder.isTypeSupported(mimeType)) || '';
  };

  const extensionAudio = (mimeType: string) => {
    if (mimeType.includes('mp4') || mimeType.includes('aac')) return 'm4a';
    if (mimeType.includes('ogg')) return 'ogg';
    return 'webm';
  };

  const agregarTranscripcionAlInput = (transcript: string) => {
    const limpio = transcript.trim();

    if (!limpio) return;

    setInputIA((actual) => {
      const textoActual = actual.trim();
      return textoActual ? `${textoActual} ${limpio}` : limpio;
    });
  };

  const transcribirGrabacion = async (audioBlob: Blob) => {
    if (audioBlob.size < 1000) {
      mostrarMensajeTemporal('No alcancé a grabar audio. Intenta de nuevo hablando después de tocar Voz.');
      return;
    }

    setMensajeStatus('Transcribiendo audio...');

    const formData = new FormData();
    const mimeType = audioBlob.type || 'audio/webm';
    formData.append('audio', audioBlob, `movimiento.${extensionAudio(mimeType)}`);

    const response = await fetchWithSessionRefresh('/api/audio/transcribe', {
      method: 'POST',
      body: formData,
    });
    const data = (await response.json()) as { success?: boolean; transcript?: string; error?: string };

    if (!response.ok || !data.success || !data.transcript) {
      throw new Error(formatActionError(data, 'No pude procesar el audio. Intenta nuevamente.'));
    }

    agregarTranscripcionAlInput(data.transcript);
    mostrarMensajeTemporal('Audio transcrito. Revisa el texto y registra el movimiento.', 5000);
  };

  const iniciarGrabacionTranscripcion = async (mensajeInicial = 'Grabando audio... toca Stop cuando termines.') => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      mostrarMensajeTemporal('Tu navegador no permite grabar audio desde esta página. Prueba en Chrome o Safari actualizado.');
      return false;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = formatoAudioPreferido();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);

      audioChunksRef.current = [];
      audioStreamRef.current = stream;
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      recorder.onerror = () => {
        setEscuchandoVoz(false);
        limpiarGrabacionVoz();
        mostrarMensajeTemporal('Falló la grabación del audio. Intenta otra vez o escribe el movimiento.');
      };

      recorder.onstop = () => {
        const chunks = [...audioChunksRef.current];
        const recordedType = recorder.mimeType || mimeType || 'audio/webm';

        audioChunksRef.current = [];
        setEscuchandoVoz(false);
        limpiarGrabacionVoz();

        void transcribirGrabacion(new Blob(chunks, { type: recordedType })).catch((error: unknown) => {
          const message = error instanceof Error ? error.message : 'No pude transcribir el audio.';
          mostrarMensajeTemporal(message, 8000);
        });
      };

      recorder.start();
      setEscuchandoVoz(true);
      setMensajeStatus(mensajeInicial);
      audioStopTimeoutRef.current = window.setTimeout(() => {
        if (mediaRecorderRef.current?.state === 'recording') {
          mediaRecorderRef.current.stop();
        }
      }, 10000);

      return true;
    } catch (error) {
      const name = error instanceof DOMException ? error.name : '';
      const blocked = ['NotAllowedError', 'PermissionDeniedError', 'SecurityError'].includes(name);
      const missing = ['NotFoundError', 'DevicesNotFoundError'].includes(name);

      mostrarMensajeTemporal(
        blocked
          ? 'Permiso de micrófono bloqueado. Actívalo para este sitio en Chrome y para Chrome en Ajustes del Sistema.'
          : missing
            ? 'No detecté un micrófono disponible.'
            : 'No pude abrir el micrófono. Revisa permisos del navegador.'
      );
      limpiarGrabacionVoz();
      return false;
    }
  };

  const mensajeErrorDictado = (error?: string) => {
    if (error === 'not-allowed' || error === 'service-not-allowed') {
      return 'Permiso de micrófono bloqueado. Actívalo para este sitio en Chrome y para Chrome en Ajustes del Sistema.';
    }

    if (error === 'audio-capture') {
      return 'No detecté un micrófono disponible. Revisa que no esté ocupado por otra app.';
    }

    if (error === 'no-speech') {
      return 'No escuché voz. Intenta otra vez hablando un poco más cerca del micrófono.';
    }

    if (error === 'network') {
      return 'El dictado del navegador falló por red. Intenta de nuevo o escribe el movimiento.';
    }

    return 'El dictado del navegador no respondió. Voy a intentar con grabación y transcripción.';
  };

  const pedirPermisoMicrofono = async () => {
    if (!navigator.mediaDevices?.getUserMedia) return true;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      return true;
    } catch (error) {
      const name = error instanceof DOMException ? error.name : '';
      const blocked = ['NotAllowedError', 'PermissionDeniedError', 'SecurityError'].includes(name);
      const missing = ['NotFoundError', 'DevicesNotFoundError'].includes(name);

      mostrarMensajeTemporal(
        blocked
          ? 'Permiso de micrófono bloqueado. Actívalo para este sitio en Chrome y para Chrome en Ajustes del Sistema.'
          : missing
            ? 'No detecté un micrófono disponible.'
            : 'No pude abrir el micrófono. Revisa permisos del navegador.'
      );
      return false;
    }
  };

  const alternarDictadoMovimiento = async () => {
    if (escuchandoVoz) {
      speechRecognitionRef.current?.stop();
      if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop();
      setEscuchandoVoz(false);
      return;
    }

    if (typeof window === 'undefined') return;

    if (!window.isSecureContext) {
      mostrarMensajeTemporal('El dictado de voz necesita HTTPS o localhost para usar el micrófono.');
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      await iniciarGrabacionTranscripcion('Tu navegador no soporta dictado nativo. Grabando audio para transcribir...');
      return;
    }

    const tienePermisoMicrofono = await pedirPermisoMicrofono();

    if (!tienePermisoMicrofono) return;

    const recognition = new SpeechRecognition();
    let finalTranscript = '';

    recognition.lang = 'es-MX';
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.onresult = (event) => {
      let interimTranscript = '';

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const transcript = event.results[index][0]?.transcript || '';

        if (event.results[index].isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }

      const spokenText = `${finalTranscript} ${interimTranscript}`.trim();
      if (spokenText) setInputIA(spokenText);
    };
    recognition.onerror = (event) => {
      setEscuchandoVoz(false);
      speechRecognitionRef.current = null;
      const puedeUsarGrabacion = event.error !== 'not-allowed' && event.error !== 'audio-capture';

      if (puedeUsarGrabacion) {
        void iniciarGrabacionTranscripcion(mensajeErrorDictado(event.error));
        return;
      }

      mostrarMensajeTemporal(mensajeErrorDictado(event.error));
    };
    recognition.onend = () => {
      setEscuchandoVoz(false);
      speechRecognitionRef.current = null;
    };

    speechRecognitionRef.current = recognition;
    setEscuchandoVoz(true);
    setMensajeStatus('Escuchando movimiento...');

    try {
      recognition.start();
    } catch {
      setEscuchandoVoz(false);
      speechRecognitionRef.current = null;
      await iniciarGrabacionTranscripcion('No pude iniciar el dictado nativo. Grabando audio para transcribir...');
    }
  };

  const abrirCheckoutBilling = async (plan: 'beta' | 'premium' = 'premium') => {
    setBillingLoading(true);
    setBillingAction('checkout');
    setMensajeStatus(`Abriendo checkout ${plan === 'beta' ? 'Esencial' : 'Pro'}...`);

    try {
      const response = await fetchWithSessionRefresh('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      });
      const data = await response.json();

      if (!response.ok || !data.success || !data.url) {
        setMensajeStatus(`Error billing: ${formatActionError(data, 'No pude crear checkout.')}`);
        return;
      }

      window.location.assign(data.url);
    } catch {
      setMensajeStatus('No pude abrir el pago seguro. Intenta nuevamente.');
    } finally {
      setBillingLoading(false);
      setBillingAction(null);
    }
  };

  const comprarCreditos = async (creditPackId: 'credits-100' | 'credits-300' | 'credits-700') => {
    setBillingLoading(true);
    setBillingAction('checkout');
    setMensajeStatus('Abriendo checkout de créditos...');
    try {
      const response = await fetchWithSessionRefresh('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ creditPackId }),
      });
      const data = await response.json();
      if (!response.ok || !data.success || !data.url) {
        setMensajeStatus(`Error billing: ${formatActionError(data, 'No pude crear checkout.')}`);
        return;
      }
      window.location.assign(data.url);
    } catch {
      setMensajeStatus('No pude abrir el pago seguro. Intenta nuevamente.');
    } finally {
      setBillingLoading(false);
      setBillingAction(null);
    }
  };

  const abrirPortalBilling = async () => {
    setBillingLoading(true);
    setBillingAction('portal');
    setMensajeStatus('Abriendo portal de facturación...');

    try {
      const response = await fetchWithSessionRefresh('/api/billing/portal', { method: 'POST' });
      const data = await response.json();

      if (!response.ok || !data.success || !data.url) {
        setMensajeStatus(`Error billing: ${formatActionError(data, 'No pude abrir el portal.')}`);
        return;
      }

      window.location.assign(data.url);
    } catch {
      setMensajeStatus('No pude abrir el portal de facturación.');
    } finally {
      setBillingLoading(false);
      setBillingAction(null);
    }
  };

  const eliminarGasto = async (gasto: Gasto) => {
    const confirmar = window.confirm(`¿Eliminar este gasto?\n\n${gasto.concepto} - $${formatearMonto(gasto.monto)}`);

    if (!confirmar) return;

    setDeletingId(gasto.id);
    setMensajeStatus('Eliminando gasto...');

    try {
      const response = await fetch(`/api/gastos/${gasto.id}`, {
        method: 'DELETE',
      });

      const resultado = await response.json();

      if (resultado.success) {
        setMensajeStatus('Gasto eliminado correctamente.');
        await fetchData();
      } else {
        setMensajeStatus(`Error: ${resultado.error}`);
      }
    } catch {
      setMensajeStatus('Ocurrió un error al eliminar el gasto.');
    } finally {
      setDeletingId(null);
      setTimeout(() => setMensajeStatus(''), 5000);
    }
  };

  const eliminarIngreso = async (ingreso: Ingreso) => {
    const confirmar = window.confirm(`¿Eliminar este ingreso?\n\n${ingreso.concepto || 'Ingreso'} - $${formatearMonto(ingreso.monto)}`);

    if (!confirmar) return;

    const ingresoId = String(ingreso.id);
    setDeletingId(`ingreso-${ingresoId}`);
    setMensajeStatus('Eliminando ingreso...');

    try {
      const response = await fetch(`/api/ingresos/${ingresoId}`, {
        method: 'DELETE',
      });

      const resultado = await response.json();

      if (resultado.success) {
        setMensajeStatus('Ingreso eliminado correctamente. Bolsas recalculadas.');
        await fetchData();
      } else {
        setMensajeStatus(`Error: ${resultado.error}`);
      }
    } catch {
      setMensajeStatus('Ocurrió un error al eliminar el ingreso.');
    } finally {
      setDeletingId(null);
      setTimeout(() => setMensajeStatus(''), 5000);
    }
  };

  const abrirEditorMovimiento = (movimiento: Movimiento) => {
    if (movimiento.tipo !== 'gasto' && movimiento.tipo !== 'ingreso') {
      mostrarMensajeTemporal('Este movimiento todavía no se puede editar desde la tabla.');
      return;
    }

    setEditForm({
      id: movimiento.id.replace(`${movimiento.tipo}-`, ''),
      tipo: movimiento.tipo,
      concepto: movimiento.concepto || (movimiento.tipo === 'ingreso' ? 'Ingreso' : 'Movimiento'),
      monto: String(Math.abs(Number(movimiento.monto || 0))),
      categoria: movimiento.tipo === 'ingreso' ? 'Ingreso' : nombreBolsa(movimiento.categoria),
      subcategoria: movimiento.subcategoria || (movimiento.tipo === 'ingreso' ? 'Extra' : 'Otros Placeres'),
      origen: movimiento.origen || 'Web',
      fecha: toDateTimeLocalValue(movimiento.fecha),
    });
    setEditingId(movimiento.id);
  };

  const cerrarEditorMovimiento = () => {
    if (editSaving) return;
    setEditForm(null);
    setEditingId(null);
  };

  const comenzarEdicionInline = (movimiento: Movimiento, field: InlineMovementField) => {
    if (movimiento.tipo !== 'gasto' && movimiento.tipo !== 'ingreso') return;
    const value = field === 'fecha'
      ? toDateTimeLocalValue(movimiento.fecha).slice(0, 10)
      : field === 'categoria'
        ? nombreBolsa(movimiento.categoria)
        : field === 'monto'
          ? String(Math.abs(Number(movimiento.monto || 0)))
          : field === 'origen'
            ? (movimiento.origen || 'Web')
            : field === 'subcategoria'
              ? (movimiento.subcategoria || '')
              : (movimiento.concepto || '');
    setInlineEdit({ id: movimiento.id, field, value });
  };

  const guardarEdicionInline = async (movimiento: Movimiento, nextValue?: string) => {
    if (!inlineEdit || inlineEdit.id !== movimiento.id || inlineSaving) return;
    const value = (nextValue ?? inlineEdit.value).trim();
    if (inlineEdit.field === 'concepto' && !value) return mostrarMensajeTemporal('El concepto no puede quedar vacío.');
    if (inlineEdit.field === 'monto' && (!Number.isFinite(Number(value)) || Number(value) <= 0)) return mostrarMensajeTemporal('El monto debe ser mayor a cero.');
    setInlineSaving(true);
    const endpoint = movimiento.tipo === 'ingreso' ? `/api/ingresos/${movimiento.id.replace('ingreso-', '')}` : `/api/gastos/${movimiento.id.replace('gasto-', '')}`;
    const concepto = inlineEdit.field === 'concepto' ? value : movimiento.concepto;
    const subcategoria = inlineEdit.field === 'subcategoria' ? value : (movimiento.subcategoria || (movimiento.tipo === 'ingreso' ? 'Extra' : 'Otros Placeres'));
    const origen = inlineEdit.field === 'origen' ? value : (movimiento.origen || 'Web');
    const monto = inlineEdit.field === 'monto' ? Number(value) : Math.abs(Number(movimiento.monto || 0));
    const fecha = inlineEdit.field === 'fecha' ? fromDateTimeLocalValue(`${value}T12:00`) : movimiento.fecha;
    const payload = movimiento.tipo === 'ingreso'
      ? { concepto, monto, tipo: subcategoria, origen, fecha }
      : { concepto, monto, categoria: inlineEdit.field === 'categoria' ? value : nombreBolsa(movimiento.categoria), subcategoria, origen, fecha };
    try {
      const response = await fetchWithSessionRefresh(endpoint, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await response.json();
      if (!response.ok || !data.success) { setMensajeStatus(formatActionError(data, 'No pude guardar el cambio.')); return; }
      setInlineEdit(null);
      await fetchData();
    } catch { setMensajeStatus('No pude conectar para guardar el cambio.'); }
    finally { setInlineSaving(false); }
  };

  const abrirGastoManual = () => {
    setManualExpenseForm({
      concepto: '',
      monto: '',
      categoria: 'Placeres',
      subcategoria: 'Otros Placeres',
      fecha: toDateTimeLocalValue(new Date().toISOString()),
    });
    setManualExpenseOpen(true);
  };

  const cerrarGastoManual = () => {
    if (manualExpenseSaving) return;
    setManualExpenseOpen(false);
  };

  const guardarGastoManual = async (event: React.FormEvent) => {
    event.preventDefault();

    const concepto = manualExpenseForm.concepto.trim();
    const monto = Number(manualExpenseForm.monto);

    if (!concepto) {
      mostrarMensajeTemporal('El concepto no puede quedar vacío.');
      return;
    }

    if (!Number.isFinite(monto) || monto <= 0) {
      mostrarMensajeTemporal('El monto debe ser mayor a cero.');
      return;
    }

    setManualExpenseSaving(true);
    setMensajeStatus('Guardando gasto...');

    try {
      const response = await fetchWithSessionRefresh('/api/gastos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          concepto,
          monto,
          categoria: manualExpenseForm.categoria,
          subcategoria: manualExpenseForm.subcategoria.trim() || 'Otros Placeres',
          fecha: fromDateTimeLocalValue(manualExpenseForm.fecha),
        }),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        setMensajeStatus(formatActionError(data, 'No pude guardar el movimiento. Revisa los datos e intenta nuevamente.'));
        return;
      }

      setMensajeStatus('Gasto agregado.');
      setManualExpenseOpen(false);
      await fetchData();
    } catch {
      setMensajeStatus('No pude conectar para guardar el gasto.');
    } finally {
      setManualExpenseSaving(false);
      setTimeout(() => setMensajeStatus(''), 5000);
    }
  };

  const guardarEdicionMovimiento = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editForm) return;

    const monto = Number(editForm.monto);
    const concepto = editForm.concepto.trim();

    if (!concepto) {
      mostrarMensajeTemporal('El concepto no puede quedar vacío.');
      return;
    }

    if (!Number.isFinite(monto) || monto <= 0) {
      mostrarMensajeTemporal('El monto debe ser mayor a cero.');
      return;
    }

    setEditSaving(true);
    setMensajeStatus('Guardando cambios...');

    const endpoint = editForm.tipo === 'ingreso' ? `/api/ingresos/${editForm.id}` : `/api/gastos/${editForm.id}`;
    const payload = editForm.tipo === 'ingreso'
      ? {
          concepto,
          monto,
          tipo: editForm.subcategoria.trim() || 'Extra',
          origen: editForm.origen.trim() || 'Web',
          fecha: fromDateTimeLocalValue(editForm.fecha),
        }
      : {
          concepto,
          monto,
          categoria: editForm.categoria,
          subcategoria: editForm.subcategoria.trim() || 'Otros Placeres',
          origen: editForm.origen.trim() || 'Web',
          fecha: fromDateTimeLocalValue(editForm.fecha),
        };

    try {
      const response = await fetchWithSessionRefresh(endpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        setMensajeStatus(formatActionError(data, 'No pude guardar los cambios. Revisa los datos e intenta nuevamente.'));
        return;
      }

      setMensajeStatus('Movimiento actualizado.');
      setEditForm(null);
      setEditingId(null);
      await fetchData();
    } catch {
      setMensajeStatus('No pude conectar para guardar la edición.');
    } finally {
      setEditSaving(false);
      setTimeout(() => setMensajeStatus(''), 5000);
    }
  };

  const guardarMeta = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!goalEditForm) return;
    setGoalSaving(true);

    try {
      const response = await fetchWithSessionRefresh(`/api/goals/${encodeURIComponent(goalEditForm.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          current: Number(goalEditForm.current),
          target: Number(goalEditForm.target),
          targetDate: goalEditForm.targetDate,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(formatActionError(data, 'No pude guardar la meta. Intenta nuevamente.'));
      setGoalEditForm(null);
      mostrarMensajeTemporal('Meta actualizada.');
      await fetchData();
    } catch (error) {
      mostrarMensajeTemporal(error instanceof Error ? error.message : 'No pude guardar la meta.');
    } finally {
      setGoalSaving(false);
    }
  };

  const cargarAportacionesMeta = async (goalId: string) => {
    setGoalContributionId(goalId);
    setGoalContributionLoading(true);
    try {
      const response = await fetchWithSessionRefresh(`/api/goals/${encodeURIComponent(goalId)}/contributions`, { cache: 'no-store' });
      const data = await readJsonResponse<GoalContributionPanel & { success?: boolean; error?: string }>(response);
      if (!response.ok || !data?.goal) throw new Error(formatActionError(data, 'No pude cargar las aportaciones.'));
      setGoalContributionPanel(data);
    } catch (error) {
      mostrarMensajeTemporal(error instanceof Error ? error.message : 'No pude cargar las aportaciones.');
      setGoalContributionId('');
    } finally {
      setGoalContributionLoading(false);
    }
  };

  const prepararAportacionRecomendada = (goalId: string, amount: number) => {
    setGoalContributionAmount(String(amount));
    void cargarAportacionesMeta(goalId);
  };

  const actualizarAportacionesMeta = async (payload: Record<string, unknown>) => {
    if (!goalContributionId) return;
    setGoalContributionLoading(true);
    try {
      const response = await fetchWithSessionRefresh(`/api/goals/${encodeURIComponent(goalContributionId)}/contributions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      const data = await readJsonResponse<{ success?: boolean; error?: string; suggested?: number }>(response);
      if (!response.ok || !data?.success) throw new Error(formatActionError(data, 'No pude actualizar las aportaciones.'));
      if (payload.action === 'record_manual') setGoalContributionAmount('');
      const refreshed = await fetchWithSessionRefresh(`/api/goals/${encodeURIComponent(goalContributionId)}/contributions`, { cache: 'no-store' });
      const refreshedData = await readJsonResponse<GoalContributionPanel>(refreshed);
      if (refreshed.ok && refreshedData?.goal) setGoalContributionPanel(refreshedData);
      await fetchData({ silent: true });
      mostrarMensajeTemporal('Aportación actualizada.');
    } catch (error) {
      mostrarMensajeTemporal(error instanceof Error ? error.message : 'No pude actualizar las aportaciones.');
    } finally {
      setGoalContributionLoading(false);
    }
  };

  const calcularPorcentaje = (gastado: number, limite: number) => {
    if (!limite) return gastado > 0 ? 100 : 0;
    return Math.min((gastado / limite) * 100, 100);
  };

  const restantes = calcularRestantesPorBolsa({
    presupuesto: resumen.presupuesto,
    gastado: resumen.gastado,
  });
  const presupuestoPromedio = calcularPresupuestoTresTercios(resumen.promedioIngresosUltimos3Meses);
  const asignacionFuturo = calcularAsignacionFuturo(resumen.ingresosMes);
  const totalAbonosTarjetaMes = abonosTarjetaMensuales.reduce((total, abono) => total + Number(abono.monto || 0), 0);
  const totalGastadoMes = resumen.gastado.Vida + resumen.gastado.Placeres + resumen.gastado.Futuro;
  const flujoNetoMes = resumen.ingresosMes - totalGastadoMes;
  const metaMensualActiva = monthlyIncomeTarget;
  const avanceMetaMensual = metaMensualActiva > 0 ? Math.min((resumen.ingresosMes / metaMensualActiva) * 100, 100) : 0;
  const brechaMetaMensual = Math.max(metaMensualActiva - resumen.ingresosMes, 0);
  const futuroMetaMensual = metaMensualActiva * 0.25;
  const brechaVsPromedio = Math.max(metaMensualActiva - resumen.promedioIngresosUltimos3Meses, 0);
  const tasaFuturo = resumen.ingresosMes > 0 ? (resumen.gastado.Futuro / resumen.ingresosMes) * 100 : 0;
  const fechaActual = new Date();
  const diasDelMes = new Date(Date.UTC(fechaActual.getUTCFullYear(), fechaActual.getUTCMonth() + 1, 0)).getUTCDate();
  const avanceMes = mesActivo === mesActualKey ? Math.min((fechaActual.getUTCDate() / diasDelMes) * 100, 100) : 100;
  const burnRate = resumen.presupuesto.Vida + resumen.presupuesto.Placeres > 0
    ? ((resumen.gastado.Vida + resumen.gastado.Placeres) / (resumen.presupuesto.Vida + resumen.presupuesto.Placeres)) * 100
    : totalGastadoMes > 0 ? 100 : 0;
  const mesSinIngresosConGastos = resumen.ingresosMes === 0 && totalGastadoMes > 0;
  const planLabel = billingStatus?.plan === 'premium'
    ? 'Pro'
    : billingStatus?.plan === 'beta'
      ? 'Esencial'
      : 'Gratis';
  const accountName = accountProfile?.full_name?.trim() || 'Tu perfil';
  const accountFirstName = accountName === 'Tu perfil' ? '' : accountName.split(/\s+/)[0];
  const accountInitials = accountName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'V';
  const statusTone: StatusTone = mensajeStatus.startsWith('Error') || mensajeStatus.startsWith('No pude') || mensajeStatus.startsWith('Ocurrió')
    ? 'error'
    : mensajeStatus.startsWith('Falta') || mensajeStatus.includes('parcial') || mensajeStatus.includes('advertencia')
      ? 'warning'
      : mensajeStatus.includes('guardado') || mensajeStatus.includes('actualizado') || mensajeStatus.includes('completad') || mensajeStatus.includes('list')
        ? 'success'
        : 'info';
  const statusToneClass: Record<StatusTone, string> = {
    info: 'border-blue-100 bg-blue-50 text-blue-800',
    success: 'border-emerald-100 bg-emerald-50 text-emerald-800',
    warning: 'border-amber-200 bg-amber-50 text-amber-800',
    error: 'border-rose-200 bg-rose-50 text-rose-800',
  };
  const billingConfigured = Boolean(billingStatus?.configured);
  const billingPriceConfigured = billingStatus?.priceConfigured || { beta: false, premium: false };
  const isPlanPriceConfigured = (plan: PlanOption['plan']) => {
    if (plan === 'free') return true;
    return billingPriceConfigured[plan];
  };
  const premiumActive = Boolean(billingStatus?.active && billingStatus.plan === 'premium');
  const maxMonthlyBar = Math.max(...resumenMensual.map((mes) => Math.max(mes.ingresos, mes.egresos)), 1);
  const hasMonthlyData = resumenMensual.some((mes) => mes.ingresos > 0 || mes.egresos > 0);
  const selectedMonthName = meses2026.find((mes) => `2026-${String(mes.indice + 1).padStart(2, '0')}` === mesActivo)?.etiqueta || 'MES';
  const selectedMonthIndex = meses2026.findIndex((mes) => mes.etiqueta === selectedMonthName);
  const currentMonthSummary = resumenMensual[selectedMonthIndex] || null;
  const yearToDateMonthIndex = fechaActual.getUTCFullYear() === 2026
    ? Math.min(Math.max(fechaActual.getUTCMonth(), 0), 11)
    : Math.max(selectedMonthIndex, 0);
  const yearToDateMonthName = meses2026[yearToDateMonthIndex]?.etiqueta || selectedMonthName;
  const yearToDateMonthKey = `2026-${String(yearToDateMonthIndex + 1).padStart(2, '0')}`;
  const yearToDateEnd = new Date(finMesISO(yearToDateMonthKey)).getTime();
  const yearToDateMonths = resumenMensual.slice(0, yearToDateMonthIndex + 1);
  const ingresosYearToDate = yearToDateMonths.reduce((total, mes) => total + mes.ingresos, 0);
  const totalGastadoYearToDate = yearToDateMonths.reduce((total, mes) => total + mes.egresos, 0);
  const flujoNetoYearToDate = ingresosYearToDate - totalGastadoYearToDate;
  const gastosYearToDate = gastosAnuales.filter((gasto) => {
    const fecha = new Date(gasto.fecha).getTime();
    return fecha >= new Date(inicioMesISO('2026-01')).getTime() && fecha < yearToDateEnd;
  });
  const gastadoYearToDate = calcularGastadoPorBolsa(gastosYearToDate);
  const presupuestoYearToDate = ingresosYearToDate > 0
    ? calcularPresupuestoTresTercios(ingresosYearToDate)
    : {
        Vida: resumen.presupuesto.Vida * (yearToDateMonthIndex + 1),
        Placeres: resumen.presupuesto.Placeres * (yearToDateMonthIndex + 1),
        Futuro: resumen.presupuesto.Futuro * (yearToDateMonthIndex + 1),
      };
  const presupuestoYearToDateVida = presupuestoYearToDate.Vida;
  const presupuestoYearToDatePlaceres = presupuestoYearToDate.Placeres;
  const presupuestoYearToDateFuturo = presupuestoYearToDate.Futuro;
  const tasaFuturoYearToDate = ingresosYearToDate > 0 ? (gastadoYearToDate.Futuro / ingresosYearToDate) * 100 : 0;
  const burnRateYearToDate = presupuestoYearToDateVida + presupuestoYearToDatePlaceres > 0
    ? ((gastadoYearToDate.Vida + gastadoYearToDate.Placeres) / (presupuestoYearToDateVida + presupuestoYearToDatePlaceres)) * 100
    : totalGastadoYearToDate > 0 ? 100 : 0;
  const previousMonthSummary = selectedMonthIndex > 0 ? resumenMensual[selectedMonthIndex - 1] : null;
  const previousMonthKey = selectedMonthIndex > 0 ? `2026-${String(selectedMonthIndex).padStart(2, '0')}` : null;
  const previousMonthStart = previousMonthKey ? new Date(inicioMesISO(previousMonthKey)).getTime() : null;
  const previousMonthEnd = previousMonthKey ? new Date(finMesISO(previousMonthKey)).getTime() : null;
  const gastosMesAnterior = previousMonthStart && previousMonthEnd
    ? gastosAnuales.filter((gasto) => {
        const fecha = new Date(gasto.fecha).getTime();
        return fecha >= previousMonthStart && fecha < previousMonthEnd;
      })
    : [];
  const gastosPorBolsaMesAnterior = calcularGastadoPorBolsa(gastosMesAnterior);
  const gastoFuturoMesAnterior = gastosPorBolsaMesAnterior.Futuro;
  const burnRateMesAnterior = previousMonthSummary && resumen.presupuesto.Vida + resumen.presupuesto.Placeres > 0
    ? ((gastosPorBolsaMesAnterior.Vida + gastosPorBolsaMesAnterior.Placeres) / (resumen.presupuesto.Vida + resumen.presupuesto.Placeres)) * 100
    : 0;
  const tendencias = {
    ingresos: etiquetaCambio(resumen.ingresosMes, previousMonthSummary?.ingresos || 0),
    egresos: etiquetaCambio(totalGastadoMes, previousMonthSummary?.egresos || 0, { invert: true }),
    flujo: etiquetaCambio(flujoNetoMes, previousMonthSummary?.resultado || 0),
    futuro: etiquetaCambio(resumen.gastado.Futuro, gastoFuturoMesAnterior),
    burnRate: etiquetaCambio(burnRate, burnRateMesAnterior, { invert: true }),
  };
  const reporteMensualCards = [
    { label: 'Ingresos del mes', value: `$${formatearMonto(resumen.ingresosMes)}`, detail: `${ingresosMensuales.length} ingresos`, tone: 'text-emerald-700' },
    { label: 'Egresos del mes', value: `$${formatearMonto(totalGastadoMes)}`, detail: `${gastosMensuales.length} gastos`, tone: 'text-rose-600' },
    { label: 'Flujo neto', value: `$${formatearMonto(flujoNetoMes)}`, detail: previousMonthSummary ? `${tendencias.flujo} vs. mes anterior` : 'Primer mes con comparativa', tone: flujoNetoMes < 0 ? 'text-rose-600' : 'text-blue-700' },
    { label: 'Saldo acumulado', value: `$${formatearMonto(currentMonthSummary?.saldoAcumulado || 0)}`, detail: `Acumulado a ${selectedMonthName.toLowerCase()}`, tone: (currentMonthSummary?.saldoAcumulado || 0) < 0 ? 'text-rose-600' : 'text-slate-950' },
  ];
  const kpiCards = [
    {
      label: 'Ingresos',
      value: `$${formatearMonto(resumen.ingresosMes)}`,
      detail: `${ingresosMensuales.length} registros`,
      tone: 'emerald',
      trend: tendencias.ingresos,
    },
    {
      label: 'Egresos',
      value: `$${formatearMonto(totalGastadoMes)}`,
      detail: `${gastosMensuales.length} gastos`,
      tone: 'rose',
      trend: tendencias.egresos,
    },
    {
      label: 'Flujo neto',
      value: `$${formatearMonto(flujoNetoMes)}`,
      detail: 'Ingresos menos egresos',
      tone: flujoNetoMes < 0 ? 'rose' : 'blue',
      trend: flujoNetoMes < 0 ? 'Atención' : tendencias.flujo,
    },
    {
      label: 'Emer/Inv',
      value: `$${formatearMonto(resumen.gastado.Futuro)}`,
      detail: `${tasaFuturo.toFixed(1)}% del ingreso`,
      tone: 'violet',
      trend: tendencias.futuro,
    },
    {
      label: 'Burn rate',
      value: `${burnRate.toFixed(1)}%`,
      detail: `Mes ${avanceMes.toFixed(1)}%`,
      tone: 'amber',
      trend: tendencias.burnRate,
    },
  ];
  // The stable array is required by the analysis callback/effect to avoid duplicate AI requests.
  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const budgetBuckets = useMemo(() => [
    {
      label: 'Vida',
      used: resumen.gastado.Vida,
      limit: resumen.presupuesto.Vida,
      remaining: restantes.Vida,
      color: 'bg-emerald-500',
      tint: 'bg-emerald-50 text-emerald-700',
    },
    {
      label: 'Placeres',
      used: resumen.gastado.Placeres,
      limit: resumen.presupuesto.Placeres,
      remaining: restantes.Placeres,
      color: 'bg-orange-500',
      tint: 'bg-orange-50 text-orange-700',
    },
    {
      label: 'Emer/Inv',
      used: resumen.gastado.Futuro,
      limit: resumen.presupuesto.Futuro,
      remaining: restantes.Futuro,
      color: 'bg-amber-500',
      tint: 'bg-amber-50 text-amber-700',
    },
  ], [restantes.Futuro, restantes.Placeres, restantes.Vida, resumen.gastado.Futuro, resumen.gastado.Placeres, resumen.gastado.Vida, resumen.presupuesto.Futuro, resumen.presupuesto.Placeres, resumen.presupuesto.Vida]);
  const desktopNavItems: Array<{ label: string; view: DashboardView; icon: React.ElementType }> = [
    { label: locale === 'en-US' ? 'Overview' : 'Resumen', view: 'resumen', icon: House },
    { label: locale === 'en-US' ? 'Transactions' : 'Movimientos', view: 'movimientos', icon: ArrowsDownUp },
    { label: locale === 'en-US' ? 'Budgets' : 'Presupuestos', view: 'presupuestos', icon: ChartDonut },
    { label: locale === 'en-US' ? 'Goals' : 'Metas', view: 'metas', icon: Target },
    { label: locale === 'en-US' ? 'Analysis' : 'Análisis', view: 'analisis', icon: ChartLineUp },
    { label: 'Virafi Wealth', view: 'wealth', icon: Plant },
    { label: locale === 'en-US' ? 'Plans' : 'Planes', view: 'planes', icon: CalendarBlank },
    { label: locale === 'en-US' ? 'Reports' : 'Reportes', view: 'reportes', icon: FileText },
  ];
  const mobileNavItems = [
    { label: locale === 'en-US' ? 'Home' : 'Inicio', view: 'resumen' as const, icon: House },
    { label: locale === 'en-US' ? 'Txns.' : 'Mov.', view: 'movimientos' as const, icon: ArrowsDownUp },
    { label: locale === 'en-US' ? 'Goals' : 'Metas', view: 'metas' as const, icon: Target },
    { label: 'Wealth', view: 'wealth' as const, icon: Plant },
  ];
  const activeNav = desktopNavItems.find((item) => item.view === vistaActiva) || desktopNavItems[0];
  const monthScopedViews: DashboardView[] = ['resumen', 'movimientos', 'presupuestos', 'analisis', 'reportes'];
  const showMonthSelector = monthScopedViews.includes(vistaActiva);
  const movimientosTotalPages = Math.max(1, Math.ceil(ultimosMovimientos.length / MOVIMIENTOS_POR_PAGINA));
  const movimientosPageSafe = Math.min(movimientosPage, movimientosTotalPages - 1);
  const movimientosPageStart = movimientosPageSafe * MOVIMIENTOS_POR_PAGINA;
  const movimientosPageEnd = Math.min(movimientosPageStart + MOVIMIENTOS_POR_PAGINA, ultimosMovimientos.length);
  const movimientosPaginados = ultimosMovimientos.slice(movimientosPageStart, movimientosPageEnd);
  const puedeVerMovimientosPrevios = movimientosPageSafe < movimientosTotalPages - 1;
  const puedeVerMovimientosRecientes = movimientosPageSafe > 0;

  const irAMovimientosPrevios = () => {
    setMovimientosPage((current) => Math.min(current + 1, movimientosTotalPages - 1));
  };

  const irAMovimientosRecientes = () => {
    setMovimientosPage((current) => Math.max(current - 1, 0));
  };

  const agregarAdjuntosChat = (files: File[]) => {
    const uniqueFiles = [...chatAttachments, ...files].filter((file, index, all) => (
      all.findIndex((candidate) => candidate.name === file.name && candidate.size === file.size) === index
    )).slice(0, 12);
    const oversized = uniqueFiles.find((file) => file.size > 10 * 1024 * 1024);
    const totalBytes = uniqueFiles.reduce((total, file) => total + file.size, 0);

    if (oversized) {
      setMensajeStatus(`${oversized.name} supera el límite de 10 MB.`);
      return;
    }
    if (totalBytes > 40 * 1024 * 1024) {
      setMensajeStatus('Los archivos no pueden superar 40 MB en total.');
      return;
    }

    setChatAttachments(uniqueFiles);
  };

  const enviarMensajeChat = async (event: React.FormEvent) => {
    event.preventDefault();
    const texto = inputIA.trim();
    const attachmentsToSend = [...chatAttachments];

    if ((!texto && attachmentsToSend.length === 0) || procesando) return;

    const userMessage: DashboardChatMessage = {
      id: createClientId('user'),
      role: 'user',
      content: texto || `Analiza ${attachmentsToSend.length === 1 ? 'este archivo' : 'estos archivos'}: ${attachmentsToSend.map((file) => file.name).join(', ')}`,
      createdAt: new Date().toISOString(),
    };
    const nextMessages = [...chatMessages, userMessage].slice(-12);

    setChatMessages(nextMessages);
    setInputIA('');
    setChatAttachments([]);
    setProcesando(true);

    try {
      const payload = new FormData();
      payload.set('text', texto);
      payload.set('messages', JSON.stringify(nextMessages));
      attachmentsToSend.forEach((file) => payload.append('attachments', file));
      const response = await fetchWithSessionRefresh('/api/dashboard/chat', { method: 'POST', body: payload });
      const data = await response.json();
      const reply = typeof data.message === 'string' && data.message.trim()
        ? data.message.trim()
        : data.success
          ? 'Listo.'
          : formatActionError(data, 'No pude completar la acción. Intenta nuevamente.');

      const assistantMessage: DashboardChatMessage = {
        id: createClientId('assistant'),
        role: 'assistant',
        content: reply,
        createdAt: new Date().toISOString(),
        metadata: data.lastExpenseId ? { lastExpenseId: String(data.lastExpenseId) } : undefined,
      };

      setChatMessages((current) => ([...current, assistantMessage].slice(-14)));

      if (!response.ok || !data.success) {
        setMensajeStatus(formatActionError(data, 'No pude procesarlo. Intenta nuevamente.'));
        return;
      }

      setMensajeStatus('Listo. Datos actualizados.');
      if (['movement', 'card-payment'].includes(String(data.action || ''))) {
        await fetchData();
      }
    } catch {
      setChatAttachments(attachmentsToSend);
      setMensajeStatus('No pude conectar con el chat financiero.');
      const assistantMessage: DashboardChatMessage = {
        id: createClientId('assistant'),
        role: 'assistant',
        content: 'No pude conectar con el servidor. Intenta de nuevo en unos segundos.',
        createdAt: new Date().toISOString(),
      };

      setChatMessages((current) => ([...current, assistantMessage].slice(-14)));
    } finally {
      setProcesando(false);
      setTimeout(() => setMensajeStatus(''), 5000);
    }
  };

  // Analysis requests are intentionally triggered only by the user-facing button.
  /* eslint-disable react-hooks/preserve-manual-memoization */
  const generarAnalisis = useCallback(async (scope: 'month' | 'year') => {
    setAnalysisScope(scope);
    setAnalysisLoading(true);
    setMensajeStatus(scope === 'year' ? 'VirafIA está generando tu análisis anual...' : 'VirafIA está generando tu análisis mensual...');
    const isYearScope = scope === 'year';
    const resultKey = `${scope}:${isYearScope ? yearToDateMonthKey : mesActivo}`;
    const analysisMonthLabel = isYearScope ? `enero a ${yearToDateMonthName.toLowerCase()}` : selectedMonthName;
    const summary = isYearScope
      ? {
          ingresosMes: ingresosYearToDate,
          totalGastadoMes: totalGastadoYearToDate,
          flujoNetoMes: flujoNetoYearToDate,
          tasaFuturo: tasaFuturoYearToDate,
          burnRate: burnRateYearToDate,
        }
      : {
          ingresosMes: resumen.ingresosMes,
          totalGastadoMes,
          flujoNetoMes,
          tasaFuturo,
          burnRate,
        };
    const analysisBuckets = isYearScope
      ? [
          {
            label: 'Vida',
            used: gastadoYearToDate.Vida,
            limit: presupuestoYearToDateVida,
            remaining: presupuestoYearToDateVida - gastadoYearToDate.Vida,
          },
          {
            label: 'Placeres',
            used: gastadoYearToDate.Placeres,
            limit: presupuestoYearToDatePlaceres,
            remaining: presupuestoYearToDatePlaceres - gastadoYearToDate.Placeres,
          },
          {
            label: 'Emer/Inv',
            used: gastadoYearToDate.Futuro,
            limit: presupuestoYearToDateFuturo,
            remaining: presupuestoYearToDateFuturo - gastadoYearToDate.Futuro,
          },
        ].map((bucket) => ({
          ...bucket,
          percent: bucket.limit > 0 ? (bucket.used / bucket.limit) * 100 : bucket.used > 0 ? 100 : 0,
        }))
      : budgetBuckets.map((bucket) => ({
          label: bucket.label,
          used: bucket.used,
          limit: bucket.limit,
          remaining: bucket.remaining,
          percent: bucket.limit > 0 ? (bucket.used / bucket.limit) * 100 : bucket.used > 0 ? 100 : 0,
        }));
    const clientAnalysis = crearAnalisisCliente({
      scope,
      monthLabel: analysisMonthLabel,
      ingresosMes: summary.ingresosMes,
      totalGastadoMes: summary.totalGastadoMes,
      flujoNetoMes: summary.flujoNetoMes,
      tasaFuturo: summary.tasaFuturo,
      buckets: analysisBuckets,
      monthlySeries: isYearScope ? yearToDateMonths : undefined,
    });

    try {
      const response = await fetch('/api/dashboard/analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope,
          periodKey: isYearScope ? `${yearToDateMonthKey}-ytd-v3` : mesActivo,
          monthLabel: analysisMonthLabel,
          summary,
          goal: {
            monthlyIncomeTarget: metaMensualActiva,
            currentMonthlyIncome: resumen.ingresosMes,
            averageIncomeLast3Months: resumen.promedioIngresosUltimos3Meses,
            monthlyGap: brechaMetaMensual,
            gapVsThreeMonthAverage: brechaVsPromedio,
            targetPerBucket: futuroMetaMensual,
            progressPct: avanceMetaMensual,
          },
          monthly: isYearScope
            ? {
                from: 'enero',
                to: yearToDateMonthName,
                monthsIncluded: yearToDateMonthIndex + 1,
                ingresos: ingresosYearToDate,
                egresos: totalGastadoYearToDate,
                flujoNeto: flujoNetoYearToDate,
              }
            : currentMonthSummary,
          monthlySeries: isYearScope ? yearToDateMonths : undefined,
          buckets: analysisBuckets,
        }),
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        setAnalysis(clientAnalysis);
        setAnalysisResultKey(resultKey);
        setMensajeStatus('Análisis actualizado.');
        return;
      }

      setAnalysis(data.analysis);
      setAnalysisResultKey(resultKey);
      setMensajeStatus('Análisis actualizado.');
    } catch {
      setAnalysis(clientAnalysis);
      setAnalysisResultKey(resultKey);
      setMensajeStatus('Análisis actualizado.');
    } finally {
      setAnalysisLoading(false);
      setTimeout(() => setMensajeStatus(''), 4000);
    }
  }, [avanceMetaMensual, brechaMetaMensual, brechaVsPromedio, budgetBuckets, burnRate, burnRateYearToDate, currentMonthSummary, flujoNetoMes, flujoNetoYearToDate, gastadoYearToDate.Futuro, gastadoYearToDate.Placeres, gastadoYearToDate.Vida, ingresosYearToDate, mesActivo, metaMensualActiva, presupuestoYearToDateFuturo, presupuestoYearToDatePlaceres, presupuestoYearToDateVida, resumen.ingresosMes, resumen.promedioIngresosUltimos3Meses, selectedMonthName, tasaFuturo, tasaFuturoYearToDate, futuroMetaMensual, totalGastadoMes, totalGastadoYearToDate, yearToDateMonthIndex, yearToDateMonthKey, yearToDateMonthName, yearToDateMonths]);
  /* eslint-enable react-hooks/preserve-manual-memoization */

  const currentAnalysisKey = `${analysisScope}:${analysisScope === 'year' ? yearToDateMonthKey : mesActivo}`;
  const visibleAnalysis = analysisResultKey === currentAnalysisKey ? analysis : null;

  const metasFinancieras = fondosAcumulados.map((fondo, index) => {
    const actual = fondoActual(fondo);
    const objetivo = fondoObjetivo(fondo);
    const progreso = objetivo > 0 ? Math.min((actual / objetivo) * 100, 100) : actual > 0 ? 100 : 0;

    return {
      id: fondo.id || `${fondoNombre(fondo)}-${index}`,
      nombre: fondoNombre(fondo),
      actual,
      objetivo,
      progreso,
      fechaObjetivo: fondo.fecha_objetivo || null,
    };
  });
  const gastoPorSubcategoria = gastosMensuales.reduce<Record<string, number>>((acc, gasto) => {
    const label = String(gasto.subcategoria || gasto.concepto || 'Sin categoría').trim();
    acc[label] = (acc[label] || 0) + valorNumerico(gasto.monto);
    return acc;
  }, {});
  const principalesGastos = Object.entries(gastoPorSubcategoria).sort(([, a], [, b]) => b - a).slice(0, 3);
  const detallePorBolsa = (['Vida', 'Placeres', 'Futuro'] as const).reduce<Record<string, { count: number; total: number; top: Array<[string, number]> }>>((result, bolsa) => {
    const rows = gastosMensuales.filter((gasto) => nombreBolsa(gasto.categoria) === bolsa);
    const byConcept = rows.reduce<Record<string, number>>((acc, gasto) => {
      const label = String(gasto.subcategoria || gasto.concepto || 'Sin categoría').trim();
      acc[label] = (acc[label] || 0) + valorNumerico(gasto.monto);
      return acc;
    }, {});
    result[bolsa] = {
      count: rows.length,
      total: rows.reduce((sum, gasto) => sum + valorNumerico(gasto.monto), 0),
      top: Object.entries(byConcept).sort(([, a], [, b]) => b - a).slice(0, 3),
    };
    return result;
  }, {});
  const bolsaMasPresionada = [...budgetBuckets]
    .sort((a, b) => calcularPorcentaje(b.used, b.limit) - calcularPorcentaje(a.used, a.limit))[0] || null;
  const presupuestoTotal = budgetBuckets.reduce((total, bucket) => total + bucket.limit, 0);
  const gastoPresupuestadoTotal = budgetBuckets.reduce((total, bucket) => total + bucket.used, 0);
  const presupuestoUtilizado = presupuestoTotal > 0 ? Math.min((gastoPresupuestadoTotal / presupuestoTotal) * 100, 100) : 0;
  // The budget card is a view of actual spending, so its donut and labels must
  // use the same denominator: the total spent across the three buckets.
  const gastoPorcentajeExacto = budgetBuckets.map((bucket) => (
    gastoPresupuestadoTotal > 0 ? (bucket.used / gastoPresupuestadoTotal) * 100 : 0
  ));
  const gastoPorcentajeEntero = gastoPresupuestadoTotal > 0
    ? gastoPorcentajeExacto.map((value, index) => (
      index === gastoPorcentajeExacto.length - 1
        ? Math.max(0, 100 - gastoPorcentajeExacto.slice(0, -1).reduce((sum, item) => sum + Math.round(item), 0))
        : Math.round(value)
    ))
    : budgetBuckets.map(() => 0);
  const gastoPorcentajeStops = gastoPorcentajeExacto.reduce<number[]>((stops, value, index) => {
    stops.push((stops[index - 1] || 0) + value);
    return stops;
  }, []);
  const gastoPorcentajeTexto = gastoPorcentajeEntero.join('/');
  const recomendacionResumen = flujoNetoMes > 0
    ? `Con tu flujo actual, podrías dirigir ${formatoDineroCorto(Math.max(flujoNetoMes * 0.25, 0))} extra a tu meta prioritaria este mes.`
    : flujoNetoMes < 0
      ? `Tu flujo está ${formatoDineroCorto(Math.abs(flujoNetoMes))} por debajo de cero. Conviene ajustar primero la bolsa con más presión.`
      : 'Tu flujo está en equilibrio. El siguiente paso es registrar ingresos y gastos para que Virafi pueda recomendarte un movimiento concreto.';
  const recomendacionDetalle = bolsaMasPresionada && calcularPorcentaje(bolsaMasPresionada.used, bolsaMasPresionada.limit) > avanceMes
    ? `${bolsaMasPresionada.label} va por delante del ${avanceMes.toFixed(0)}% transcurrido del mes; revisa sus movimientos antes de aumentar aportaciones.`
    : 'Tu ritmo de gasto está alineado con el avance del mes. Mantén los límites y revisa de nuevo en una semana.';
  const openAgentTasks = agentTasks.filter((task) => ['open', 'in_progress', 'waiting_user'].includes(task.status));
  const taskNotifications = openAgentTasks.filter((task) => ['movement_monitor', 'daily_cfo_mentor'].includes(task.agent_key));
  const movementNotifications = ultimosMovimientos.slice(0, 20).map((movement) => ({
    id: `movement-${movement.tipo}-${movement.id}`,
    title: movement.tipo === 'ingreso'
      ? `Ingreso registrado: $${formatearMonto(Math.abs(Number(movement.monto)))}`
      : `Gasto registrado: $${formatearMonto(Math.abs(Number(movement.monto)))}`,
      description: `${movement.concepto} · ${movement.tipo === 'gasto' ? etiquetaBolsa(movement.categoria) : 'Ingreso'} · ${nombreOrigen(movement.origen, movement.subcategoria)}`,
    createdAt: movement.fecha,
  }));
  const cardPaymentNotifications = abonosTarjetaMensuales.slice(0, 10).map((payment) => ({
    id: `card-payment-${payment.id}`,
    title: `Abono a tarjeta: $${formatearMonto(Number(payment.monto))}`,
    description: `${payment.concepto} · No cuenta como gasto`,
    createdAt: payment.fecha,
  }));
  const inboxNotifications = [
    ...taskNotifications.map((task) => ({ id: task.id, title: task.title, description: task.description || 'Movimiento detectado', createdAt: task.created_at || '' })),
    ...movementNotifications,
    ...cardPaymentNotifications,
  ].filter((notification, index, notifications) => notifications.findIndex((candidate) => candidate.id === notification.id) === index)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const unreadNotifications = inboxNotifications.filter((notification) => new Date(notification.createdAt).getTime() > notificationsSeenAt);

  const toggleNotificationTray = () => {
    setNotificationTrayOpen((open) => {
      const next = !open;
      if (next) {
        const now = Date.now();
        setNotificationsSeenAt(now);
        window.localStorage.setItem('dashboard_notifications_seen_at_v2', String(now));
      }
      return next;
    });
  };
  const planOptions: PlanOption[] = [
    {
      name: 'Gratis',
      price: '$0',
      plan: 'free',
      description: 'Para probar el método y conocer a VirafIA.',
      features: ['Registro manual', '30 días de historial', 'Presupuesto 50/25/25', '25 créditos IA al mes'],
    },
    {
      name: 'Esencial',
      price: '$199 MXN',
      plan: 'beta',
      description: 'Para organizar tus finanzas con acompañamiento inteligente.',
      features: ['200 créditos IA al mes', 'Telegram incluido', '12 meses de historial', 'Metas personalizadas', 'Análisis mensual con VirafIA'],
    },
    {
      name: 'Pro',
      price: '$399 MXN',
      plan: 'premium',
      description: 'Para seguimiento avanzado y decisiones financieras frecuentes.',
      features: ['500 créditos IA al mes', 'Historial ampliado', 'Wealth y escenarios', 'Análisis mensual/anual con VirafIA', 'Soporte prioritario'],
    },
  ];
  const manualExpenseModal = manualExpenseOpen ? (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/35 px-4 py-6 backdrop-blur-sm">
      <form onSubmit={guardarGastoManual} className="w-full max-w-lg rounded-lg border border-slate-200 bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase text-blue-700">Agregar gasto</p>
            <h2 className="mt-1 text-xl font-black text-slate-950">Captura manual</h2>
          </div>
          <button
            type="button"
            onClick={cerrarGastoManual}
            aria-label="Cerrar captura manual"
            className="grid size-9 place-items-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"
          >
            <CloseIcon />
          </button>
        </div>
        <div className="mt-5 grid gap-4">
          <label className="grid gap-1 text-sm font-semibold text-slate-700">
            Concepto
            <input
              value={manualExpenseForm.concepto}
              onChange={(event) => setManualExpenseForm((current) => ({ ...current, concepto: event.target.value }))}
              className="h-11 rounded-lg border border-slate-200 px-3 text-sm text-slate-900 outline-none focus:border-blue-500"
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1 text-sm font-semibold text-slate-700">
              Monto
              <input
                type="number"
                min="0"
                step="0.01"
                value={manualExpenseForm.monto}
                onChange={(event) => setManualExpenseForm((current) => ({ ...current, monto: event.target.value }))}
                className="h-11 rounded-lg border border-slate-200 px-3 text-sm text-slate-900 outline-none focus:border-blue-500"
              />
            </label>
            <label className="grid gap-1 text-sm font-semibold text-slate-700">
              Fecha
              <input
                type="datetime-local"
                value={manualExpenseForm.fecha}
                onChange={(event) => setManualExpenseForm((current) => ({ ...current, fecha: event.target.value }))}
                className="h-11 rounded-lg border border-slate-200 px-3 text-sm text-slate-900 outline-none focus:border-blue-500"
              />
            </label>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1 text-sm font-semibold text-slate-700">
              Bolsa
              <select
                value={manualExpenseForm.categoria}
                onChange={(event) => setManualExpenseForm((current) => ({ ...current, categoria: event.target.value }))}
                className="h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-500"
              >
                <option value="Vida">Vida</option>
                <option value="Placeres">Placeres</option>
                <option value="Futuro">Emer/Inv</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm font-semibold text-slate-700">
              Subcategoría
              <input
                value={manualExpenseForm.subcategoria}
                onChange={(event) => setManualExpenseForm((current) => ({ ...current, subcategoria: event.target.value }))}
                className="h-11 rounded-lg border border-slate-200 px-3 text-sm text-slate-900 outline-none focus:border-blue-500"
              />
            </label>
          </div>
        </div>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={cerrarGastoManual}
            disabled={manualExpenseSaving}
            className="h-10 rounded-lg border border-slate-200 px-4 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={manualExpenseSaving}
            className="h-10 rounded-lg bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {manualExpenseSaving ? 'Guardando' : 'Guardar gasto'}
          </button>
        </div>
      </form>
    </div>
  ) : null;

  const editModal = editForm ? (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/35 px-4 py-6 backdrop-blur-sm">
      <form onSubmit={guardarEdicionMovimiento} className="w-full max-w-lg rounded-lg border border-slate-200 bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase text-blue-700">{editForm.tipo === 'ingreso' ? 'Editar ingreso' : 'Editar gasto'}</p>
            <h2 className="mt-1 text-xl font-black text-slate-950">Actualizar movimiento</h2>
          </div>
          <button
            type="button"
            onClick={cerrarEditorMovimiento}
            aria-label="Cerrar editor"
            className="grid size-9 place-items-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"
          >
            <CloseIcon />
          </button>
        </div>
        <div className="mt-5 grid gap-4">
          <label className="grid gap-1 text-sm font-semibold text-slate-700">
            Concepto
            <input
              value={editForm.concepto}
              onChange={(event) => setEditForm((current) => current ? { ...current, concepto: event.target.value } : current)}
              className="h-11 rounded-lg border border-slate-200 px-3 text-sm text-slate-900 outline-none focus:border-blue-500"
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1 text-sm font-semibold text-slate-700">
              Monto
              <input
                type="number"
                min="0"
                step="0.01"
                value={editForm.monto}
                onChange={(event) => setEditForm((current) => current ? { ...current, monto: event.target.value } : current)}
                className="h-11 rounded-lg border border-slate-200 px-3 text-sm text-slate-900 outline-none focus:border-blue-500"
              />
            </label>
            <label className="grid gap-1 text-sm font-semibold text-slate-700">
              Fecha
              <input
                type="datetime-local"
                value={editForm.fecha}
                onChange={(event) => setEditForm((current) => current ? { ...current, fecha: event.target.value } : current)}
                className="h-11 rounded-lg border border-slate-200 px-3 text-sm text-slate-900 outline-none focus:border-blue-500"
              />
            </label>
          </div>
          <label className="grid gap-1 text-sm font-semibold text-slate-700">
            Origen
            <input
              value={editForm.origen}
              onChange={(event) => setEditForm((current) => current ? { ...current, origen: event.target.value } : current)}
              className="h-11 rounded-lg border border-slate-200 px-3 text-sm text-slate-900 outline-none focus:border-blue-500"
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            {editForm.tipo === 'gasto' ? (
              <label className="grid gap-1 text-sm font-semibold text-slate-700">
                Bolsa
                <select
                  value={editForm.categoria}
                  onChange={(event) => setEditForm((current) => current ? { ...current, categoria: event.target.value } : current)}
                  className="h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-500"
                >
                  <option value="Vida">Vida</option>
                  <option value="Placeres">Placeres</option>
                  <option value="Futuro">Emer/Inv</option>
                </select>
              </label>
            ) : (
              <label className="grid gap-1 text-sm font-semibold text-slate-700">
                Tipo
                <input
                  value={editForm.subcategoria}
                  onChange={(event) => setEditForm((current) => current ? { ...current, subcategoria: event.target.value } : current)}
                  className="h-11 rounded-lg border border-slate-200 px-3 text-sm text-slate-900 outline-none focus:border-blue-500"
                />
              </label>
            )}
            {editForm.tipo === 'gasto' && (
              <label className="grid gap-1 text-sm font-semibold text-slate-700">
                Subcategoría
                <input
                  value={editForm.subcategoria}
                  onChange={(event) => setEditForm((current) => current ? { ...current, subcategoria: event.target.value } : current)}
                  className="h-11 rounded-lg border border-slate-200 px-3 text-sm text-slate-900 outline-none focus:border-blue-500"
                />
              </label>
            )}
          </div>
        </div>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={cerrarEditorMovimiento}
            disabled={editSaving}
            className="h-10 rounded-lg border border-slate-200 px-4 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={editSaving}
            className="h-10 rounded-lg bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {editSaving ? 'Guardando' : 'Guardar cambios'}
          </button>
        </div>
      </form>
    </div>
  ) : null;

  const goalEditModal = goalEditForm ? (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/35 px-4 py-6 backdrop-blur-sm">
      <form onSubmit={guardarMeta} className="w-full max-w-lg rounded-xl bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase text-violet-700">Meta financiera</p>
            <h2 className="mt-1 text-xl font-black text-slate-950">{goalEditForm.name}</h2>
          </div>
          <button type="button" onClick={() => setGoalEditForm(null)} aria-label="Cerrar" className="grid size-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-100"><CloseIcon /></button>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1 text-sm font-bold text-slate-700">Ahorrado actualmente
            <input type="number" min="0" step="0.01" value={goalEditForm.current} disabled={/^[0-9a-f-]{36}$/i.test(goalEditForm.id)} onChange={(event) => setGoalEditForm((current) => current ? { ...current, current: event.target.value } : current)} className="h-11 rounded-lg border border-slate-200 bg-slate-50 px-3 outline-none focus:border-violet-500 disabled:text-slate-500" />
          </label>
          <label className="grid gap-1 text-sm font-bold text-slate-700">Monto objetivo
            <input type="number" min="0" step="0.01" value={goalEditForm.target} onChange={(event) => setGoalEditForm((current) => current ? { ...current, target: event.target.value } : current)} className="h-11 rounded-lg border border-slate-200 px-3 outline-none focus:border-violet-500" />
          </label>
          <label className="grid gap-1 text-sm font-bold text-slate-700 sm:col-span-2">Fecha objetivo
            <input type="date" value={goalEditForm.targetDate} onChange={(event) => setGoalEditForm((current) => current ? { ...current, targetDate: event.target.value } : current)} className="h-11 rounded-lg border border-slate-200 px-3 outline-none focus:border-violet-500" />
          </label>
        </div>
        <p className="mt-4 text-sm text-slate-500">El monto objetivo y la fecha definen el plan. El ahorro actual se calcula desde el historial de aportaciones confirmadas.</p>
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={() => setGoalEditForm(null)} className="h-10 rounded-lg border border-slate-200 px-4 text-sm font-bold text-slate-700">Cancelar</button>
          <button type="submit" disabled={goalSaving} className="h-10 rounded-lg bg-violet-600 px-4 text-sm font-bold text-white disabled:opacity-60">{goalSaving ? 'Guardando...' : 'Guardar meta'}</button>
        </div>
      </form>
    </div>
  ) : null;

  const chatAssistant = (
    <div className="fixed bottom-[calc(env(safe-area-inset-bottom)+5.25rem)] right-4 z-40 lg:bottom-5">
      {chatOpen ? (
        <section className="w-[min(420px,calc(100vw-2rem))] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-950 px-4 py-3 text-white">
            <div className="flex min-w-0 items-center gap-3">
              <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-blue-600 text-white">
                <VirafIAMark className="size-6" />
              </div>
              <div className="min-w-0">
                <h2 className="truncate text-sm font-black">VirafIA</h2>
                <p className="truncate text-xs text-slate-300">{selectedMonthName.toLowerCase()} 2026 · {activeNav.label}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setChatOpen(false)}
              aria-label="Cerrar chat"
              className="grid size-9 place-items-center rounded-lg text-slate-300 hover:bg-white/10 hover:text-white"
            >
              <CloseIcon />
            </button>
          </div>
          <div className="max-h-[46vh] space-y-3 overflow-y-auto bg-slate-50 p-4">
            {chatMessages.length === 0 && !procesando ? (
              <div className="flex items-start gap-2.5 rounded-lg bg-white p-3 text-sm text-slate-600 shadow-sm">
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-blue-600 text-white" aria-hidden="true">
                  <VirafIAMark className="size-4" />
                </span>
                <span>Hola, soy VirafIA. Pregúntame por tus movimientos, cuentas, metas, patrimonio o inversiones. También puedo analizar imágenes y documentos.</span>
              </div>
            ) : (
              chatMessages.map((message) => (
                <div key={message.id} className={`flex items-start gap-2 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {message.role === 'assistant' ? (
                    <span className="grid size-7 shrink-0 place-items-center rounded-full bg-blue-600 text-white" aria-label="VirafIA">
                      <VirafIAMark className="size-4" />
                    </span>
                  ) : null}
                  <div className={`max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm shadow-sm ${
                    message.role === 'user' ? 'bg-blue-600 text-white' : 'bg-white text-slate-700'
                  }`}>
                    {message.content}
                  </div>
                </div>
              ))
            )}
            {procesando ? (
              <div className="flex justify-start" role="status" aria-live="polite" aria-label="VirafIA está escribiendo">
                <div className="flex items-center gap-2 rounded-lg bg-white px-3 py-2.5 shadow-sm">
                  <span className="grid size-6 place-items-center rounded-full bg-blue-600 text-white" aria-hidden="true">
                    <VirafIAMark className="size-3.5" />
                  </span>
                  <span className="flex h-4 items-center gap-1" aria-hidden="true">
                    {[0, 1, 2].map((dot) => (
                      <span
                        key={dot}
                        className="size-1.5 animate-bounce rounded-full bg-slate-400"
                        style={{ animationDelay: `${dot * 140}ms`, animationDuration: '900ms' }}
                      />
                    ))}
                  </span>
                  <span className="sr-only">VirafIA está escribiendo</span>
                </div>
              </div>
            ) : null}
          </div>
          <form onSubmit={enviarMensajeChat} className="border-t border-slate-100 bg-white p-3">
            {chatAttachments.length > 0 ? (
              <div className="mb-2 flex flex-wrap gap-2" aria-label="Archivos adjuntos">
                {chatAttachments.map((file) => (
                  <span key={`${file.name}-${file.size}`} className="inline-flex max-w-full items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-700">
                    <FileText aria-hidden="true" className="size-4 shrink-0" />
                    <span className="max-w-44 truncate">{file.name}</span>
                    <button type="button" onClick={() => setChatAttachments((current) => current.filter((item) => item !== file))} aria-label={`Quitar ${file.name}`} className="grid size-5 place-items-center rounded text-slate-400 hover:bg-white hover:text-slate-700">
                      <X aria-hidden="true" className="size-3.5" weight="bold" />
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
            <input
              ref={chatFileInputRef}
              type="file"
              multiple
              accept="image/*,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/plain,text/csv,text/markdown,text/html,application/json,.xlsx,.pdf,.txt,.csv,.md,.json"
              onChange={(event) => {
                agregarAdjuntosChat(Array.from(event.target.files || []));
                event.target.value = '';
              }}
              aria-hidden="true"
              className="sr-only"
              tabIndex={-1}
            />
            <div className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto] gap-2">
              <button
                type="button"
                onClick={() => chatFileInputRef.current?.click()}
                disabled={procesando}
                aria-label="Adjuntar documentos o imágenes"
                title="Adjuntar documentos o imágenes"
                className="grid size-11 place-items-center rounded-lg border border-slate-200 text-slate-600 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-50"
              >
                <Paperclip aria-hidden="true" className="size-5" weight="bold" />
              </button>
              <textarea
                value={inputIA}
                onChange={(event) => setInputIA(event.target.value)}
                disabled={procesando}
                placeholder='Ej. "¿cómo voy este mes?" o "agrega abono de 10k"'
                rows={2}
                className="min-h-11 max-h-32 min-w-0 resize-y rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-500 disabled:opacity-60"
              />
              <button
                type="button"
                onClick={alternarDictadoMovimiento}
                disabled={procesando}
                aria-label={escuchandoVoz ? 'Detener grabación' : 'Hablar con VirafIA'}
                title={escuchandoVoz ? 'Detener grabación' : 'Hablar con VirafIA'}
                className={`grid size-11 place-items-center rounded-lg border transition disabled:opacity-50 ${escuchandoVoz ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-slate-200 text-slate-600 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700'}`}
              >
                <Microphone aria-hidden="true" className="size-5" weight={escuchandoVoz ? 'fill' : 'bold'} />
              </button>
              <button
                type="submit"
                disabled={procesando || (!inputIA.trim() && chatAttachments.length === 0)}
                className="h-11 rounded-lg bg-blue-600 px-4 text-sm font-black text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {procesando ? 'Pensando' : 'Enviar'}
              </button>
            </div>
          </form>
        </section>
      ) : (
        <button
          type="button"
          onClick={() => setChatOpen(true)}
          className="flex h-14 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-black text-white shadow-xl transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2"
        >
          <VirafIAMark className="size-7" />
          VirafIA
        </button>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-[var(--brand-cream)] text-slate-950">
      {billingAction && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/30 px-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-5 text-center shadow-xl">
            <div className="mx-auto grid size-12 animate-spin place-items-center rounded-full border-4 border-blue-100 border-t-blue-600" />
            <p className="mt-4 text-base font-black text-slate-950">
              {billingAction === 'checkout' ? 'Preparando pago seguro' : 'Abriendo facturación'}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Estamos preparando una sesión segura. Si cancelas, volverás al dashboard.
            </p>
          </div>
        </div>
      )}
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[260px_1fr]">
        <aside className="hidden border-r border-slate-200 bg-white lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col">
          <div className="border-b border-slate-100 px-6 pb-5 pt-6">
            <VirafiBrand />
            <p className="mt-4 text-sm leading-5 text-slate-500">Tu CFO personal, todos los días.</p>
          </div>
          <nav className="flex-1 overflow-y-auto px-3 py-4 text-sm font-semibold text-slate-600" aria-label="Secciones del dashboard">
            {desktopNavItems.map((item, index) => {
              const Icon = item.icon;

              return (
                <React.Fragment key={item.label}>
                  {index === 5 && <div className="my-3 border-t border-slate-100" aria-hidden="true" />}
                  <button
                    type="button"
                    onClick={() => setVistaActiva(item.view)}
                    aria-current={vistaActiva === item.view ? 'page' : undefined}
                    className={`mb-1 flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      vistaActiva === item.view ? 'bg-blue-50 text-blue-700' : 'hover:bg-slate-50 hover:text-slate-950'
                    }`}
                  >
                    <Icon aria-hidden="true" className="size-5 shrink-0" weight={vistaActiva === item.view ? 'duotone' : 'regular'} />
                    <span>{item.label}</span>
                  </button>
                </React.Fragment>
              );
            })}
          </nav>
          <div className="border-t border-slate-100 px-4 pb-4 pt-3">
            <div className="flex items-center gap-2"><LanguageSwitcher compact /><Link href="/onboarding" aria-label={t('settings')} className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
              <GearIcon />
              <span>{t('settings')}</span>
            </Link></div>
            <button type="button" onClick={() => void logoutFromDashboard()} className="mt-2 flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-semibold text-slate-500 transition-colors hover:bg-rose-50 hover:text-rose-700">
              <SignOutIcon />
              <span>{t('logout')}</span>
            </button>
            <Link href="/onboarding?tab=profile" className="mt-3 block rounded-lg border border-slate-200 bg-[var(--brand-cream)] p-3 transition-colors hover:border-blue-200 hover:bg-blue-50" aria-label="Abrir mi perfil">
              <div className="flex items-center gap-3">
                <div className="relative grid size-9 shrink-0 place-items-center overflow-hidden rounded-full bg-blue-600 text-sm font-bold text-white">{accountProfile?.avatarUrl ? <Image src={accountProfile.avatarUrl} alt={`Foto de ${accountName}`} fill sizes="36px" unoptimized className="object-cover" /> : accountInitials}</div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">{accountName}</p>
                  <p className="text-xs text-slate-500">Plan {planLabel}</p>
                </div>
              </div>
            </Link>
          </div>
        </aside>

        <main className="min-w-0 pb-24 lg:pb-0">
          <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
            <div className="flex min-h-[72px] flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:justify-between lg:px-8">
              <div className="relative flex items-center justify-between gap-3 md:hidden">
                <div className="flex items-center gap-3">
                  <VirafiBrand compact />
                  <p className="text-xs font-medium text-slate-500">Plan {planLabel}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={toggleNotificationTray} aria-label={`Notificaciones${unreadNotifications.length ? `, ${unreadNotifications.length} nuevas` : ''}`} className="relative grid size-10 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm">
                    <Bell className="size-5" weight="regular" aria-hidden="true" />
                    {unreadNotifications.length > 0 && <span className="absolute -right-1 -top-1 grid min-w-5 place-items-center rounded-full bg-rose-600 px-1 text-[10px] font-black leading-5 text-white">{Math.min(unreadNotifications.length, 99)}</span>}
                  </button>
                  <Link href="/onboarding" aria-label="Configuración" className="grid size-10 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm"><GearIcon /></Link>
                  <button type="button" onClick={() => void logoutFromDashboard()} aria-label={t('logout')} className="grid size-10 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"><SignOutIcon /></button>
                </div>
                {notificationTrayOpen && (
                  <div className="absolute right-0 top-12 z-50 w-[min(360px,calc(100vw-2rem))] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
                    <div className="border-b border-slate-100 px-4 py-3"><p className="font-black text-slate-950">Notificaciones</p><p className="text-xs text-slate-500">Movimientos recientes.</p></div>
                    <div className="max-h-80 overflow-y-auto p-2">{inboxNotifications.length === 0 ? <p className="p-4 text-center text-sm text-slate-500">No tienes movimientos todavía.</p> : inboxNotifications.map((notification) => <div key={notification.id} className="rounded-lg p-3"><p className="text-sm font-bold text-slate-900">{notification.title}</p><p className="mt-1 text-xs text-slate-500">{notification.description}</p><p className="mt-1 text-[11px] text-slate-400">{notification.createdAt ? formatearFecha(notification.createdAt) : 'Ahora'}</p></div>)}</div>
                  </div>
                )}
              </div>
              <div className="hidden min-w-0 flex-1 md:block">
                <p className="font-brand truncate text-2xl text-slate-950">{vistaActiva === 'resumen' ? `Hola${accountFirstName ? `, ${accountFirstName}` : ''}.` : activeNav.label}</p>
                {vistaActiva !== 'resumen' && <p className="mt-0.5 text-xs font-semibold text-slate-400">Virafi · {selectedMonthName} 2026</p>}
              </div>
              <div className="hidden items-center gap-2 md:flex">
                <div className="relative">
                  <button
                    type="button"
                    onClick={toggleNotificationTray}
                    aria-label={`Notificaciones${unreadNotifications.length ? `, ${unreadNotifications.length} nuevas` : ''}`}
                    aria-expanded={notificationTrayOpen}
                    className="relative grid size-10 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50"
                  >
                    <Bell className="size-5" weight="regular" aria-hidden="true" />
                    {unreadNotifications.length > 0 && (
                      <span className="absolute -right-1 -top-1 grid min-w-5 place-items-center rounded-full bg-rose-600 px-1 text-[10px] font-black leading-5 text-white">
                        {Math.min(unreadNotifications.length, 99)}
                      </span>
                    )}
                  </button>
                  {notificationTrayOpen && (
                    <div className="absolute right-0 top-12 z-50 w-[min(360px,calc(100vw-2rem))] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
                      <div className="border-b border-slate-100 px-4 py-3">
                        <p className="font-black text-slate-950">Notificaciones</p>
                        <p className="text-xs text-slate-500">Movimientos y acciones que requieren tu atención.</p>
                      </div>
                      <div className="max-h-96 overflow-y-auto p-2">
                        {inboxNotifications.length === 0 ? (
                          <p className="p-4 text-center text-sm text-slate-500">No tienes movimientos nuevos.</p>
                        ) : inboxNotifications.map((notification) => (
                          <div key={notification.id} className="rounded-lg p-3 hover:bg-slate-50">
                            <p className="text-sm font-bold text-slate-900">{notification.title}</p>
                            <p className="mt-1 text-xs leading-5 text-slate-500">{notification.description || 'Movimiento detectado'}</p>
                            <p className="mt-1 text-[11px] font-semibold text-slate-400">{notification.createdAt ? formatearFecha(notification.createdAt) : 'Ahora'}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                {billingConfigured && (
                  <button
                    type="button"
                    onClick={() => {
                      if (premiumActive) {
                        void abrirPortalBilling();
                        return;
                      }

                      void abrirCheckoutBilling('premium');
                    }}
                    disabled={billingLoading || !billingPriceConfigured.premium}
                    className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60"
                  >
                    {premiumActive ? 'Facturación' : 'Mejorar plan'}
                  </button>
                )}
                <div className="hidden min-w-28 border-l border-slate-200 pl-4 md:block">
                  <p className="text-sm font-bold text-slate-950">Plan {planLabel}</p>
                  <p className="text-xs font-bold text-emerald-700">{billingStatus?.active ? 'Activo' : 'Disponible'}</p>
                </div>
                <Link href="/onboarding?tab=profile" className="relative grid size-10 place-items-center overflow-hidden rounded-full bg-slate-950 text-sm font-bold text-white" aria-label={`Abrir perfil de ${accountName}`}>{accountProfile?.avatarUrl ? <Image src={accountProfile.avatarUrl} alt={`Foto de ${accountName}`} fill sizes="40px" unoptimized className="object-cover" /> : accountInitials}</Link>
              </div>
            </div>
          </header>

          <div className="mx-auto max-w-[1800px] space-y-5 p-3 sm:p-4 md:p-6 lg:p-7">
            {mensajeStatus && (
              <div className={`rounded-lg border px-4 py-3 text-sm font-medium ${statusToneClass[statusTone]}`}>
                {mensajeStatus}
              </div>
            )}

            <section key={vistaActiva} className={`${['wealth', 'resumen'].includes(vistaActiva) ? 'hidden' : 'dashboard-view-panel'} rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5`}>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-sm font-bold text-blue-700">{activeNav.label}</p>
                  <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950 md:text-3xl">
                    {vistaActiva === 'resumen' ? 'Tu rumbo financiero' :
                      vistaActiva === 'movimientos' ? 'Movimientos del mes' :
                      vistaActiva === 'presupuestos' ? 'Presupuestos y bolsas' :
                      vistaActiva === 'metas' ? 'Metas financieras' :
                      vistaActiva === 'analisis' ? 'Análisis de comportamiento' :
                      vistaActiva === 'wealth' ? 'Wealth cockpit' :
                      vistaActiva === 'planes' ? 'Plan y facturación' : 'Reportes'}
                  </h1>
                  <p className="mt-1 text-sm text-slate-500">
                    {loading ? 'Actualizando datos...' : showMonthSelector
                      ? `Vista de ${selectedMonthName.toLowerCase()} 2026.`
                      : vistaActiva === 'metas' ? 'Objetivos creados desde tu experiencia financiera.'
                      : vistaActiva === 'planes' ? 'Elige o administra tu suscripción.'
                      : 'Información de tu cuenta.'}
                  </p>
                </div>
                {showMonthSelector && <div className="flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-2 text-sm font-medium text-slate-500">
                    Mes
                    <select
                      value={mesActivo}
                      onChange={(event) => changeMesActivo(event.target.value)}
                      className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-500"
                    >
                      {meses2026.map((mes) => (
                        <option key={mes.etiqueta} value={`2026-${String(mes.indice + 1).padStart(2, '0')}`}>
                          {mes.etiqueta} 2026
                        </option>
                      ))}
                    </select>
                  </label>
                </div>}
              </div>
            </section>

            <section id="resumen" className={(vistaActiva === 'resumen' ? 'dashboard-view-panel grid' : 'hidden') + ' scroll-mt-28 gap-4 xl:grid-cols-[minmax(270px,0.82fr)_minmax(420px,1.28fr)_minmax(350px,1fr)]'}>
              <article className="flex min-h-[342px] flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-xl text-slate-950">Balance mensual</h2>
                  <button type="button" onClick={() => setBalanceVisible((visible) => !visible)} aria-label={balanceVisible ? 'Ocultar saldos' : 'Mostrar saldos'} className="grid size-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-50 hover:text-slate-950">
                    {balanceVisible
                      ? <Eye aria-hidden="true" className="size-5" weight="regular" />
                      : <EyeSlash aria-hidden="true" className="size-5" weight="regular" />}
                  </button>
                </div>
                <div className="mt-8">
                  <p className="text-sm font-semibold text-slate-500">Flujo neto del mes</p>
                  <p className="mt-1 break-words font-brand text-[clamp(2.25rem,4vw,3.35rem)] leading-none tracking-tight text-slate-950">{balanceVisible ? formatoDineroCorto(flujoNetoMes) : '••••••'}</p>
                  <p className="mt-3 text-sm leading-relaxed text-slate-500">Calculado exclusivamente con los ingresos y gastos que registras en Virafi.</p>
                </div>
                <div className="mt-7 grid gap-3 rounded-xl bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-slate-600">Ingresos</span>
                    <strong className="text-emerald-700">{balanceVisible ? formatoDineroCorto(resumen.ingresosMes) : '••••'}</strong>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-slate-600">Gastos</span>
                    <strong className="text-slate-950">{balanceVisible ? formatoDineroCorto(totalGastadoMes) : '••••'}</strong>
                  </div>
                </div>
                <button type="button" onClick={() => setVistaActiva('analisis')} className="mt-auto inline-flex min-h-11 items-center gap-2 pt-5 text-sm font-bold text-blue-700 hover:text-blue-800">
                  Ver detalle <ArrowRight aria-hidden="true" className="size-4" weight="bold" />
                </button>
              </article>

              <article className="flex min-h-[342px] flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-xl text-slate-950">Resumen del mes</h2>
                    <p className="mt-1 text-sm text-slate-500">Ingresos, gastos y flujo real</p>
                  </div>
                  <select aria-label="Mes del resumen" value={mesActivo} onChange={(event) => changeMesActivo(event.target.value)} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-500">
                    {meses2026.map((mes) => (
                      <option key={mes.etiqueta} value={'2026-' + String(mes.indice + 1).padStart(2, '0')}>{mes.etiqueta} 2026</option>
                    ))}
                  </select>
                </div>
                <div className="mt-7">
                  <p className="text-sm font-semibold text-slate-500">Flujo mensual</p>
                  <p className={'mt-1 font-brand text-4xl leading-none ' + (flujoNetoMes < 0 ? 'text-rose-600' : 'text-emerald-700')}>{formatoDineroCorto(flujoNetoMes)}</p>
                </div>
                <div className="relative mt-6 flex h-32 items-end gap-2 border-b border-slate-200 pb-5">
                  {!hasMonthlyData && <p className="absolute inset-x-0 top-8 text-center text-xs font-semibold text-slate-400">Sin historial suficiente</p>}
                  {resumenMensual.slice(0, 12).map((mes, index) => {
                    const fallbackHeight = 18 + ((index % 4) * 11);
                    const resultado = mes.resultado;
                    const height = hasMonthlyData ? Math.max((Math.abs(resultado) / maxMonthlyBar) * 88, resultado ? 8 : 2) : fallbackHeight;
                    return (
                      <div key={mes.mes} className="flex min-w-4 flex-1 flex-col items-center justify-end gap-2">
                        <span
                          className={'w-full max-w-3 rounded-t-sm ' + (hasMonthlyData ? resultado >= 0 ? 'bg-blue-600' : 'bg-slate-300' : index % 3 === 0 ? 'bg-blue-200' : 'bg-slate-200')}
                          style={{ height: height + 'px' }}
                          title={mes.mes + ': ' + formatoDineroCorto(resultado)}
                        />
                        <span className={'text-[10px] font-bold ' + (mes.mes === selectedMonthName ? 'text-blue-700' : 'text-slate-400')}>{mes.mes.slice(0, 1)}</span>
                      </div>
                    );
                  })}
                </div>
                <button type="button" onClick={() => setVistaActiva('analisis')} className="mt-auto inline-flex min-h-11 items-center gap-2 pt-4 text-sm font-bold text-blue-700 hover:text-blue-800">
                  Ver análisis completo <ArrowRight aria-hidden="true" className="size-4" weight="bold" />
                </button>
              </article>

              <article id="presupuesto" className="flex min-h-[342px] flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-xl text-slate-950">Presupuesto por categoría</h2>
                    <p className="mt-1 text-sm text-slate-500">{presupuestoUtilizado.toFixed(0)}% utilizado</p>
                  </div>
                  <span className="text-base font-black text-blue-700">{gastoPorcentajeTexto}</span>
                </div>
                <div className="mt-6 grid items-center gap-6 sm:grid-cols-[150px_1fr] xl:grid-cols-1 2xl:grid-cols-[160px_1fr]">
                  <div
                    className="relative mx-auto grid size-40 place-items-center rounded-full"
                    style={{ background: gastoPresupuestadoTotal > 0 ? `conic-gradient(var(--brand-future) 0 ${gastoPorcentajeStops[0]}%, var(--brand-business) ${gastoPorcentajeStops[0]}% ${gastoPorcentajeStops[1]}%, var(--brand-wealth) ${gastoPorcentajeStops[1]}% 100%)` : 'conic-gradient(#e2e8f0 0 100%)' }}
                    role="img"
                    aria-label={`Distribución del gasto: Vida ${gastoPorcentajeEntero[0]}%, Placeres ${gastoPorcentajeEntero[1]}% y Emer/Inv ${gastoPorcentajeEntero[2]}%`}
                  >
                    <div className="grid size-24 place-items-center rounded-full bg-white text-center">
                      <div>
                        <p className="font-brand text-xl leading-none text-slate-950">{formatoDineroCorto(gastoPresupuestadoTotal)}</p>
                        <p className="mt-1 text-xs font-semibold text-slate-500">Gasto total</p>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-3">
                    {budgetBuckets.map((bucket, index) => (
                      <div key={bucket.label} className="flex items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <span className={'size-3 shrink-0 rounded-full ' + bucket.color} />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-bold text-slate-950">{bucket.label}</p>
                            <p className="text-xs text-slate-500">{gastoPorcentajeEntero[index]}% del gasto · {formatoDineroCorto(bucket.limit)} presupuesto</p>
                          </div>
                        </div>
                        <p className="text-xs font-bold text-slate-700">{formatoDineroCorto(bucket.used)}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <button type="button" onClick={() => setVistaActiva('presupuestos')} className="mt-auto inline-flex min-h-11 items-center gap-2 pt-4 text-sm font-bold text-blue-700 hover:text-blue-800">
                  Ver presupuestos <ArrowRight aria-hidden="true" className="size-4" weight="bold" />
                </button>
              </article>
            </section>

            <section aria-hidden="true" className="hidden">
              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <div>
                    <h1 className="text-2xl tracking-tight text-slate-950 md:text-3xl">Hola{accountFirstName ? `, ${accountFirstName}` : ''}.</h1>
                  <p className="mt-1 text-sm text-slate-500">
                    {loading ? 'Actualizando datos...' : `Resumen de ${selectedMonthName.toLowerCase()} 2026 con regla 50/25/25.`}
                  </p>
                </div>

                <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_260px]">
                  <div>
                    <p className="text-sm font-semibold text-slate-500">Balance mensual</p>
                    <p className="mt-2 break-words text-4xl font-bold tracking-tight text-slate-950 sm:text-5xl">${formatearMonto(flujoNetoMes)}</p>
                    <p className={`mt-2 text-sm font-semibold ${flujoNetoMes < 0 ? 'text-rose-600' : tendenciaTone(tendencias.flujo)}`}>
                      {flujoNetoMes < 0 ? 'Flujo negativo' : tendencias.flujo} vs. mes anterior
                    </p>
                    <div className="relative mt-6 flex h-28 items-end gap-2 border-b border-slate-200 pb-2">
                      {!hasMonthlyData && (
                        <div className="absolute inset-x-0 top-4 flex items-center justify-center">
                          <span className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-500">
                            Cargando datos
                          </span>
                        </div>
                      )}
                      {resumenMensual.slice(0, 12).map((mes, index) => {
                        const fallbackHeight = 18 + ((index % 4) * 10);
                        return (
                          <div key={mes.mes} className="flex flex-1 flex-col items-center gap-1">
                            <div className="flex h-24 w-full max-w-9 items-end justify-center gap-1">
                              <span
                                className={`w-2 rounded-t ${hasMonthlyData ? 'bg-emerald-500' : 'bg-slate-200'}`}
                                style={{ height: `${hasMonthlyData ? Math.max((mes.ingresos / maxMonthlyBar) * 88, mes.ingresos ? 8 : 0) : fallbackHeight}px` }}
                              />
                              <span
                                className={`w-2 rounded-t ${hasMonthlyData ? 'bg-rose-400' : 'bg-slate-100'}`}
                                style={{ height: `${hasMonthlyData ? Math.max((mes.egresos / maxMonthlyBar) * 88, mes.egresos ? 8 : 0) : Math.max(fallbackHeight - 6, 8)}px` }}
                              />
                            </div>
                            <span className={`text-[11px] font-semibold ${mes.mes === selectedMonthName ? 'text-blue-600' : 'text-slate-400'}`}>
                              {mes.mes.slice(0, 3)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid gap-3">
                    <div id="plan-activo" className="scroll-mt-28 rounded-lg border border-slate-200 bg-slate-50 p-4">
                      <p className="text-sm font-semibold text-slate-500">Plan activo</p>
                      <p className="mt-2 text-lg font-bold text-slate-950">Plan {planLabel}</p>
                      {billingStatus?.currentPeriodEnd && (
                        <p className="text-xs text-slate-500">Renueva {formatearFecha(billingStatus.currentPeriodEnd)}</p>
                      )}
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                      <p className="text-sm font-semibold text-slate-500">Fuente de movimientos</p>
                      <p className="mt-2 text-lg font-bold text-slate-950">Registro manual y Telegram</p>
                    </div>
                  </div>
                </div>
              </div>

              <div id="presupuesto" className="scroll-mt-28 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-slate-950">Presupuesto por categoría</h2>
                    <p className="text-sm text-slate-500">Uso actual de bolsas</p>
                  </div>
                  <span className="rounded-lg bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">50/25/25</span>
                </div>
                <div className="mt-5 space-y-5">
                  {budgetBuckets.map((bucket) => {
                    const pct = calcularPorcentaje(bucket.used, bucket.limit);
                    return (
                      <div key={bucket.label}>
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <span className={`grid size-10 place-items-center rounded-lg text-sm font-black ${bucket.tint}`}>{bucket.label[0]}</span>
                            <div>
                              <p className="text-sm font-bold text-slate-900">{bucket.label}</p>
                              <p className="text-xs text-slate-500">{pct.toFixed(0)}% utilizado</p>
                            </div>
                          </div>
                          <p className="text-sm font-semibold text-slate-800">
                            ${formatearMonto(bucket.used)} <span className="font-normal text-slate-400">/ ${formatearMonto(bucket.limit)}</span>
                          </p>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                          <div className={`h-full rounded-full ${bucket.color}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
                {mesSinIngresosConGastos && (
                  <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                    Este mes tiene gastos, pero aún no tiene ingresos. Referencia por bolsa: ${formatearMonto(presupuestoPromedio.Vida)}.
                  </div>
                )}
              </div>
            </section>

            <section className={`${vistaActiva === 'presupuestos' ? 'dashboard-view-panel grid' : 'hidden'} gap-4 xl:grid-cols-[1fr_360px]`}>
              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-slate-950">Detalle de bolsas</h2>
                    <p className="text-sm text-slate-500">Presupuesto, consumo y margen disponible por categoría.</p>
                  </div>
                  <div className="text-right">
                    <span className="block text-sm font-bold text-blue-700">${formatearMonto(resumen.presupuesto.Vida + resumen.presupuesto.Placeres + resumen.presupuesto.Futuro)} asignados</span>
                    <span className="text-xs text-slate-500">Emer/Inv: 10% emergencia (${formatearMonto(asignacionFuturo.Emergencia)}) · 15% inversión (${formatearMonto(asignacionFuturo.Inversiones)})</span>
                  </div>
                </div>
                <div className="grid gap-3">
                  {budgetBuckets.map((bucket) => {
                    const pct = calcularPorcentaje(bucket.used, bucket.limit);
                    const overBudget = bucket.remaining < 0;
                    const detailBucket = bucket.label === 'Emer/Inv' ? 'Futuro' : bucket.label;
                    return (
                      <div key={bucket.label} className="rounded-lg border border-slate-100 bg-slate-50 p-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex items-center gap-3">
                            <span className={`grid size-11 place-items-center rounded-lg text-sm font-black ${bucket.tint}`}>{bucket.label[0]}</span>
                            <div>
                              <p className="font-bold text-slate-950">{bucket.label}</p>
                              <p className="text-sm text-slate-500">{pct.toFixed(0)}% usado · {overBudget ? 'excedido' : 'disponible'} ${formatearMonto(Math.abs(bucket.remaining))}</p>
                            </div>
                          </div>
                          <div className="text-left sm:text-right">
                            <p className="text-sm font-bold text-slate-950">${formatearMonto(bucket.used)}</p>
                            <p className="text-xs text-slate-500">de ${formatearMonto(bucket.limit)}</p>
                          </div>
                        </div>
                        <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
                          <div className={`h-full rounded-full ${overBudget ? 'bg-rose-500' : bucket.color}`} style={{ width: `${pct}%` }} />
                        </div>
                        <div className="mt-4 border-t border-slate-200 pt-3 text-sm">
                          <p className="font-bold text-slate-700">{detallePorBolsa[detailBucket]?.count || 0} movimientos este mes</p>
                          {(detallePorBolsa[detailBucket]?.top || []).length > 0 ? (
                            <div className="mt-2 flex flex-wrap gap-2">
                              {detallePorBolsa[detailBucket].top.map(([label, amount]) => (
                                <span key={label} className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600">{label}: ${formatearMonto(amount)}</span>
                              ))}
                            </div>
                          ) : <p className="mt-1 text-xs text-slate-500">Todavía no hubo gastos registrados en esta bolsa.</p>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <h2 className="text-lg font-bold text-slate-950">Lectura rápida</h2>
                <div className="mt-4 space-y-3 text-sm">
                  <div className="rounded-lg bg-slate-50 p-3">
                    <p className="font-bold text-slate-900">Bolsa con más presión</p>
                    <p className="mt-1 text-slate-500">
                      {bolsaMasPresionada
                        ? `${bolsaMasPresionada.label}: $${formatearMonto(bolsaMasPresionada.used)} usados (${calcularPorcentaje(bolsaMasPresionada.used, bolsaMasPresionada.limit).toFixed(0)}% del límite).`
                        : 'Sin datos suficientes.'}
                    </p>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-3">
                    <p className="font-bold text-slate-900">Dónde se está yendo el dinero</p>
                    {principalesGastos.length > 0 ? (
                      <div className="mt-2 space-y-1 text-slate-500">
                        {principalesGastos.map(([label, amount], index) => (
                          <p key={label}>{index + 1}. {label}: <span className="font-bold text-slate-700">${formatearMonto(amount)}</span></p>
                        ))}
                      </div>
                    ) : <p className="mt-1 text-slate-500">Aún no hay gastos en este mes.</p>}
                  </div>
                  <div className="rounded-lg bg-slate-50 p-3">
                    <p className="font-bold text-slate-900">Ritmo del mes</p>
                    <p className="mt-1 text-slate-500">Vas en {burnRate.toFixed(1)}% de uso contra {avanceMes.toFixed(1)}% de avance calendario.</p>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-3">
                    <p className="font-bold text-slate-900">Siguiente ajuste</p>
                    <p className="mt-1 text-slate-500">{bolsaMasPresionada && calcularPorcentaje(bolsaMasPresionada.used, bolsaMasPresionada.limit) > avanceMes
                      ? `Pausa gastos opcionales de ${bolsaMasPresionada.label}; su consumo va por delante del ${avanceMes.toFixed(0)}% transcurrido del mes.`
                      : 'El gasto va alineado con el avance del mes; mantén los límites actuales y revisa de nuevo en una semana.'}</p>
                  </div>
                </div>
              </div>
            </section>

            <section className={`${vistaActiva === 'metas' ? 'dashboard-view-panel' : 'hidden'}`}>
              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-slate-950">Tus objetivos financieros</h2>
                    <p className="mt-1 max-w-3xl text-sm text-slate-500">Tus valores orientan el plan; aquí sólo aparecen resultados concretos que requieren dinero, monto y fecha.</p>
                  </div>
                  {metasFinancieras.length > 0 ? (
                    <button type="button" onClick={() => setGoalsInterviewOpen(true)} className="shrink-0 rounded-lg border border-blue-200 bg-white px-4 py-2 text-sm font-bold text-blue-700 hover:bg-blue-50">
                      Actualizar mi experiencia
                    </button>
                  ) : null}
                </div>
                {goalCfoPlan ? (
                  <div className="mb-5 rounded-xl border border-blue-100 bg-blue-50 p-4">
                    <p className="text-sm font-black text-blue-950">Plan mensual recomendado</p>
                    <p className="mt-1 text-sm leading-6 text-blue-900">{goalCfoPlan.summary}</p>
                    <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                      {goalCfoPlan.allocations.map((allocation) => (
                        <div key={allocation.key} className="rounded-lg bg-white p-3 shadow-sm">
                          <div className="flex items-start justify-between gap-2"><p className="text-xs font-bold text-slate-700">{allocation.label}</p><span className="text-xs font-black text-blue-700">{allocation.percent}%</span></div>
                          <p className="mt-1 text-lg font-black text-slate-950">${formatearMonto(allocation.monthlyAmount)}<span className="text-xs font-medium text-slate-500">/mes</span></p>
                          <p className="mt-1 text-xs leading-5 text-slate-500">{allocation.purpose}</p>
                        </div>
                      ))}
                    </div>
                    <p className="mt-3 text-xs leading-5 text-blue-900">Es una distribución provisional y explicable. Virafi no asumirá que moviste el dinero: cada aportación requiere tu confirmación.</p>
                  </div>
                ) : null}
                <div className="space-y-3">
                  {metasFinancieras.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
                      <p className="font-bold text-slate-950">Define qué quieres lograr</p>
                      <p className="mx-auto mt-2 max-w-xl text-sm text-slate-500">Completa la breve entrevista de personalización. Con tus respuestas crearemos aquí tus metas reales, sin objetivos genéricos.</p>
                      <button type="button" onClick={() => setGoalsInterviewOpen(true)} className="mt-4 inline-flex rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700">Comenzar entrevista</button>
                    </div>
                  ) : metasFinancieras.map((meta) => {
                    const recommendation = goalCfoPlan?.goals.find((goal) => goal.id === String(meta.id));
                    return (
                    <div key={meta.id} className="rounded-lg border border-slate-100 bg-slate-50 p-4">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="font-bold text-slate-950">{meta.nombre}</p>
                          <p className="text-sm text-slate-500">{meta.fechaObjetivo ? `Fecha objetivo: ${formatearFecha(meta.fechaObjetivo)}` : 'Fecha objetivo pendiente de configurar'}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <p className="text-sm font-bold text-slate-900">{recommendation?.needsDiscovery ? 'Monto por investigar' : meta.objetivo > 0 ? `$${formatearMonto(meta.actual)} / $${formatearMonto(meta.objetivo)}` : 'Monto por definir'}</p>
                          {/^[0-9a-f-]{36}$/i.test(String(meta.id)) && <button type="button" onClick={() => void cargarAportacionesMeta(String(meta.id))} className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-50">Aportaciones</button>}
                          <button type="button" onClick={() => setGoalEditForm({ id: String(meta.id), name: meta.nombre, current: String(meta.actual), target: String(meta.objetivo), targetDate: meta.fechaObjetivo ? meta.fechaObjetivo.slice(0, 10) : '' })} className="rounded-lg border border-violet-200 bg-white px-3 py-2 text-xs font-bold text-violet-700 hover:bg-violet-50">{meta.objetivo > 0 ? 'Ajustar' : 'Definir'}</button>
                        </div>
                      </div>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
                        <div className="h-full rounded-full bg-violet-600" style={{ width: `${meta.progreso}%` }} />
                      </div>
                      {recommendation ? (
                        <div className="mt-4 grid gap-3 border-t border-slate-200 pt-4 lg:grid-cols-[1fr_1fr_auto]">
                          <div><p className="text-xs font-black uppercase tracking-wide text-violet-700">Qué significa esta meta</p><p className="mt-1 text-sm leading-6 text-slate-600">{recommendation.rationale}</p>{recommendation.targetIssue ? <p className="mt-2 text-xs font-bold text-amber-700">{recommendation.targetIssue}</p> : null}</div>
                          <div><p className="text-xs font-black uppercase tracking-wide text-violet-700">Siguiente definición</p><p className="mt-1 text-sm leading-6 text-slate-600">{recommendation.nextQuestion}</p><p className="mt-2 text-xs text-slate-500">Primeros hitos: {recommendation.milestones.join(' · ')}</p></div>
                          <div className="min-w-44 rounded-lg bg-white p-3"><p className="text-xs font-bold text-slate-500">Apartado sugerido</p><p className="mt-1 text-xl font-black text-slate-950">${formatearMonto(recommendation.monthlyAmount)}<span className="text-xs font-medium text-slate-500">/mes</span></p>{recommendation.monthlyAmount > 0 && /^[0-9a-f-]{36}$/i.test(String(meta.id)) ? <button type="button" onClick={() => prepararAportacionRecomendada(String(meta.id), recommendation.monthlyAmount)} className="mt-3 w-full rounded-lg bg-violet-600 px-3 py-2 text-xs font-bold text-white hover:bg-violet-700">Registrar si ya lo aparté</button> : null}</div>
                        </div>
                      ) : null}
                    </div>
                    );
                  })}
                </div>
              </div>
            </section>

            {goalContributionId && (
              <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/55 p-3 sm:p-6" role="dialog" aria-modal="true" aria-label="Aportaciones de la meta">
                <div className="mx-auto max-w-3xl rounded-xl bg-white p-5 shadow-2xl sm:p-7">
                  <div className="flex items-start justify-between gap-4"><div><p className="text-sm font-bold text-blue-700">Seguimiento auditable</p><h2 className="mt-1 text-2xl font-black">{goalContributionPanel?.goal.name || 'Aportaciones de la meta'}</h2><p className="mt-2 text-sm leading-6 text-slate-500">El avance no se calcula desde todos tus movimientos. Sólo suma aportaciones confirmadas y vinculadas a esta meta.</p></div><button type="button" onClick={() => { setGoalContributionId(''); setGoalContributionPanel(null); }} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold">Cerrar</button></div>
                  <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto]"><label className="grid gap-2 text-sm font-bold text-slate-700">Registrar una aportación manual<input type="number" min="0" step="100" value={goalContributionAmount} onChange={(event) => setGoalContributionAmount(event.target.value)} placeholder="Ej. 2,000" className="h-11 rounded-lg border border-slate-200 px-3 outline-none focus:border-blue-500" /></label><button type="button" disabled={goalContributionLoading || Number(goalContributionAmount) <= 0} onClick={() => void actualizarAportacionesMeta({ action: 'record_manual', amount: Number(goalContributionAmount) })} className="self-end h-11 rounded-lg bg-blue-600 px-4 text-sm font-bold text-white disabled:opacity-50">Registrar</button></div>
                  <div className="mt-6 space-y-3">{goalContributionLoading && !goalContributionPanel ? <p className="text-sm text-slate-500">Cargando...</p> : (goalContributionPanel?.contributions || []).length === 0 ? <div className="rounded-xl bg-slate-50 p-5 text-sm text-slate-600">Todavía no hay aportaciones. Registra la primera manualmente.</div> : goalContributionPanel?.contributions.map((contribution) => <div key={contribution.id} className="flex flex-col gap-3 rounded-xl border border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-black">${formatearMonto(Number(contribution.amount))} MXN</p><p className="mt-1 text-xs text-slate-500">{formatearFecha(contribution.contributed_at)} · {contribution.source === 'manual' ? 'Registro manual' : 'Aportación registrada'}{contribution.note ? ` · ${contribution.note}` : ''}</p></div>{contribution.status === 'suggested' ? <div className="flex gap-2"><button type="button" disabled={goalContributionLoading} onClick={() => void actualizarAportacionesMeta({ action: 'review', contributionId: contribution.id, decision: 'reject' })} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold">No corresponde</button><button type="button" disabled={goalContributionLoading} onClick={() => void actualizarAportacionesMeta({ action: 'review', contributionId: contribution.id, decision: 'confirm' })} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white">Confirmar</button></div> : <span className={`w-fit rounded-lg px-3 py-2 text-xs font-bold ${contribution.status === 'confirmed' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{contribution.status === 'confirmed' ? 'Confirmada' : 'Descartada'}</span>}</div>)}</div>
                </div>
              </div>
            )}

            {goalsInterviewOpen && (
              <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/55 p-3 sm:p-6" role="dialog" aria-modal="true" aria-label="Entrevista de personalización financiera">
                <div className="mx-auto max-w-6xl rounded-xl bg-[var(--brand-cream)] p-3 shadow-2xl sm:p-5">
                  <div className="mb-3 flex items-center justify-between gap-4 px-2">
                    <div>
                      <p className="text-sm font-bold text-blue-700">Metas</p>
                      <h2 className="text-xl font-black text-slate-950">Configura tus metas con una breve entrevista</h2>
                    </div>
                    <button type="button" onClick={() => setGoalsInterviewOpen(false)} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">Cerrar</button>
                  </div>
                  <PersonalizationInterview
                    enabled
                    initialOpen
                    request={fetchWithSessionRefresh}
                    onCompleted={async () => {
                      const [, wealthResponse] = await Promise.all([
                        fetchData({ silent: true }),
                        fetchWithSessionRefresh('/api/investments/risk-profile', { cache: 'no-store' }),
                      ]);
                      const wealthData = await readJsonResponse<{ riskProfile?: InvestmentRiskProfile; routePlan?: WealthRoutePlan | null; eligibility?: WealthEligibility; goals?: WealthGoalSummary[] }>(wealthResponse);
                      if (wealthResponse.ok && wealthData) {
                        if (wealthData.riskProfile) setRiskProfile((current) => ({ ...current, ...wealthData.riskProfile }));
                        setWealthRoutePlan(wealthData.routePlan || null);
                        setWealthEligibility(wealthData.eligibility || { ready: false, profileCompleted: false, hasGoals: false });
                        setWealthGoals(wealthData.goals || []);
                      }
                      setGoalsInterviewOpen(false);
                      mostrarMensajeTemporal('Tu experiencia quedó personalizada y tus metas ya están listas.');
                    }}
                  />
                </div>
              </div>
            )}

            <section className={(vistaActiva === 'resumen' ? 'dashboard-view-panel grid' : 'hidden') + ' gap-4 xl:grid-cols-[1.14fr_0.9fr_1.06fr]'}>
              <article className="flex min-h-[390px] flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-xl text-slate-950">Movimientos recientes</h2>
                  <button type="button" onClick={() => setVistaActiva('movimientos')} className="inline-flex min-h-10 items-center gap-2 text-sm font-bold text-blue-700 hover:text-blue-800">
                    Ver todos <ArrowRight aria-hidden="true" className="size-4" weight="bold" />
                  </button>
                </div>
                <div className="mt-4 divide-y divide-slate-100">
                  {ultimosMovimientos.length === 0 ? (
                    <div className="grid min-h-56 place-items-center rounded-xl bg-slate-50 p-6 text-center">
                      <div>
                        <ArrowsDownUp aria-hidden="true" className="mx-auto size-8 text-slate-400" weight="regular" />
                        <p className="mt-3 font-bold text-slate-950">Aún no hay movimientos</p>
                        <p className="mt-1 text-sm text-slate-500">Registra tu primer ingreso o gasto.</p>
                      </div>
                    </div>
                  ) : ultimosMovimientos.slice(0, 5).map((movimiento) => {
                    const MovementIcon = movimiento.tipo === 'ingreso' ? Wallet : movimiento.tipo === 'abono_tarjeta' ? CreditCard : Receipt;
                    const tone = movimiento.tipo === 'ingreso'
                      ? 'bg-emerald-50 text-emerald-700'
                      : nombreBolsa(movimiento.categoria) === 'Futuro'
                        ? 'bg-amber-50 text-amber-700'
                        : nombreBolsa(movimiento.categoria) === 'Placeres'
                          ? 'bg-orange-50 text-orange-700'
                          : 'bg-blue-50 text-blue-700';

                    return (
                      <div key={movimiento.id} className="flex items-center gap-3 py-3">
                        <span className={'grid size-10 shrink-0 place-items-center rounded-full ' + tone}>
                          <MovementIcon aria-hidden="true" className="size-5" weight="regular" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-slate-950">{movimiento.concepto}</p>
                          <p className="truncate text-xs text-slate-500">{movimiento.subcategoria || etiquetaBolsa(movimiento.categoria)}</p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className={'text-sm font-bold ' + (movimiento.tipo === 'ingreso' ? 'text-emerald-700' : 'text-slate-950')}>
                            {movimiento.tipo === 'ingreso' ? '+' : movimiento.tipo === 'gasto' ? '-' : ''}{formatoDineroCorto(Number(movimiento.monto))}
                          </p>
                          <p className="text-xs text-slate-400">{formatearFecha(movimiento.fecha)}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <button type="button" onClick={abrirGastoManual} className="mt-auto inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-200 px-4 text-sm font-bold text-slate-700 hover:bg-slate-50">
                  Agregar movimiento
                </button>
              </article>

              <article className="flex min-h-[390px] flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-xl text-slate-950">VirafIA sugiere</h2>
                <div className="mt-5 flex flex-1 flex-col rounded-xl bg-slate-50 p-5">
                  <span className="grid size-11 place-items-center rounded-full bg-blue-600 text-white">
                    <Sparkle aria-hidden="true" className="size-5" weight="fill" />
                  </span>
                  <p className="mt-6 font-brand text-2xl leading-8 text-slate-950">{recomendacionResumen}</p>
                  <p className="mt-5 text-sm leading-6 text-slate-600">{recomendacionDetalle}</p>
                  <div className="mt-auto pt-6">
                    <div className="flex items-center justify-between gap-3 text-xs font-bold text-slate-500">
                      <span>Meta mensual</span>
                      <span>{avanceMetaMensual.toFixed(0)}%</span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-white">
                      <div className="h-full rounded-full bg-blue-600" style={{ width: avanceMetaMensual + '%' }} />
                    </div>
                  </div>
                </div>
                <button type="button" onClick={() => setChatOpen(true)} className="inline-flex min-h-11 items-center gap-2 pt-4 text-sm font-bold text-blue-700 hover:text-blue-800">
                  Ir a asesoría personalizada <ArrowRight aria-hidden="true" className="size-4" weight="bold" />
                </button>
              </article>

              <div className="grid gap-4">
                <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h2 className="text-xl text-slate-950">Registro simple y privado</h2>
                  <p className="mt-3 text-sm leading-6 text-slate-500">Virafi no solicita credenciales bancarias ni sincroniza cuentas. Registra tus movimientos desde el dashboard o por Telegram.</p>
                  <button type="button" onClick={abrirGastoManual} className="mt-4 inline-flex min-h-10 items-center gap-2 text-sm font-bold text-blue-700 hover:text-blue-800">
                    Agregar movimiento <ArrowRight aria-hidden="true" className="size-4" weight="bold" />
                  </button>
                </article>

                <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h2 className="text-xl text-slate-950">Ruta hacia tus metas</h2>
                  <div className="mt-4 flex items-start gap-3">
                    <span className="grid size-11 shrink-0 place-items-center rounded-full bg-blue-50 text-blue-700">
                      <Target aria-hidden="true" className="size-6" weight="duotone" />
                    </span>
                    <div>
                      <p className="font-bold text-blue-700">{metasFinancieras.length > 0 ? `${metasFinancieras.length} meta${metasFinancieras.length === 1 ? '' : 's'} en seguimiento` : 'Define tu primera meta'}</p>
                      <p className="mt-1 text-sm leading-5 text-slate-500">VirafIA relaciona tu flujo, capacidad de aportación y horizonte para proponerte el siguiente paso.</p>
                    </div>
                  </div>
                  <button type="button" onClick={() => setVistaActiva('metas')} className="mt-4 inline-flex min-h-10 items-center gap-2 text-sm font-bold text-blue-700 hover:text-blue-800">
                    Ver metas <ArrowRight aria-hidden="true" className="size-4" weight="bold" />
                  </button>
                </article>
              </div>
            </section>

            <section className="hidden">
              {kpiCards.map((card) => (
                <div key={card.label} className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-500">{card.label}</p>
                      <p className="mt-2 break-words text-xl font-bold tracking-tight text-slate-950 sm:mt-3 sm:text-2xl">{card.value}</p>
                    </div>
                    <span className={`size-10 rounded-lg ${
                      card.tone === 'emerald' ? 'bg-emerald-50' :
                      card.tone === 'rose' ? 'bg-rose-50' :
                      card.tone === 'blue' ? 'bg-blue-50' :
                      card.tone === 'violet' ? 'bg-violet-50' :
                      card.tone === 'amber' ? 'bg-amber-50' : 'bg-cyan-50'
                    }`} />
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2 text-xs">
                    <span className="text-slate-500">{card.detail}</span>
                    <span className={`font-bold ${tendenciaTone(card.trend)}`}>{card.trend}</span>
                  </div>
                </div>
              ))}
            </section>

            <section id="analisis" className={`${vistaActiva === 'analisis' ? 'dashboard-view-panel grid' : 'hidden'} scroll-mt-28 gap-4 xl:grid-cols-[1.35fr_1fr]`}>
              <div id="reporte-anual" className="scroll-mt-28 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <div className="mb-5 flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-slate-950">Comparativo del año</h2>
                    <p className="text-sm text-slate-500">Datos por mes; la interpretación aparece una sola vez en Análisis VirafIA.</p>
                  </div>
                  <span className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-bold text-slate-600">2026</span>
                </div>
                <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
                  <div className="relative flex h-56 items-end gap-2 overflow-x-auto border-b border-slate-200 pb-4 sm:h-72 sm:gap-3">
                    {!hasMonthlyData && (
                      <div className="absolute inset-x-0 top-20 flex justify-center">
                        <span className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-500">
                          Sin datos cargados en este entorno
                        </span>
                      </div>
                    )}
                    {resumenMensual.map((mes, index) => {
                      const fallbackHeight = 36 + ((index % 5) * 22);
                      return (
                        <div key={mes.mes} className="flex flex-1 flex-col items-center gap-2">
                          <div className="flex h-60 w-full items-end justify-center gap-1">
                            <span
                              className={`w-3 rounded-t ${hasMonthlyData ? 'bg-emerald-500' : 'bg-slate-200'}`}
                              style={{ height: `${hasMonthlyData ? Math.max((mes.ingresos / maxMonthlyBar) * 220, mes.ingresos ? 10 : 0) : fallbackHeight}px` }}
                            />
                            <span
                              className={`w-3 rounded-t ${hasMonthlyData ? 'bg-rose-400' : 'bg-slate-100'}`}
                              style={{ height: `${hasMonthlyData ? Math.max((mes.egresos / maxMonthlyBar) * 220, mes.egresos ? 10 : 0) : Math.max(fallbackHeight - 16, 12)}px` }}
                            />
                          </div>
                          <span className={`text-xs font-bold ${mes.mes === selectedMonthName ? 'text-blue-600' : 'text-slate-400'}`}>{mes.mes.slice(0, 3)}</span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="overflow-x-auto rounded-lg border border-slate-100 sm:border-0">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 text-xs text-slate-400">
                          <th className="pb-2 font-semibold">Mes</th>
                          <th className="pb-2 text-right font-semibold">Ingresos</th>
                          <th className="pb-2 text-right font-semibold">Egresos</th>
                          <th className="pb-2 text-right font-semibold">Flujo</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {resumenMensual.map((mes) => (
                          <tr key={mes.mes} className={mes.mes === selectedMonthName ? 'bg-blue-50/70' : ''}>
                            <td className="py-2 font-medium text-slate-700">{mes.mes.slice(0, 3)}</td>
                            <td className="py-2 text-right text-slate-600">${formatearEntero(mes.ingresos)}</td>
                            <td className="py-2 text-right text-slate-600">${formatearEntero(mes.egresos)}</td>
                            <td className={`py-2 text-right font-bold ${mes.resultado < 0 ? 'text-rose-600' : 'text-blue-700'}`}>${formatearEntero(mes.resultado)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-slate-950">Análisis VirafIA</h2>
                    <p className="mt-1 text-sm text-slate-500">Lectura accionable del mes o del año completo.</p>
                  </div>
                  <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1 text-sm font-bold">
                    <button
                      type="button"
                      onClick={() => setAnalysisScope('month')}
                      disabled={analysisLoading}
                      className={`rounded-md px-3 py-2 ${analysisScope === 'month' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500'}`}
                    >
                      Mes
                    </button>
                    <button
                      type="button"
                      onClick={() => setAnalysisScope('year')}
                      disabled={analysisLoading}
                      className={`rounded-md px-3 py-2 ${analysisScope === 'year' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500'}`}
                    >
                      Año
                    </button>
                  </div>
                </div>
                <div className="mt-5 min-h-80 rounded-lg bg-slate-50 p-4">
                  {analysisLoading ? (
                    <div className="flex h-72 items-center justify-center text-sm font-semibold text-slate-500">Generando análisis...</div>
                  ) : visibleAnalysis ? (
                    <div className="space-y-5">
                      <div>
                        <p className="text-sm font-bold text-blue-700">
                          {analysisScope === 'year' ? `Análisis anual · enero a ${yearToDateMonthName.toLowerCase()}` : `Análisis de ${selectedMonthName.toLowerCase()}`}
                        </p>
                        <h3 className="mt-1 text-xl font-black text-slate-950">{visibleAnalysis.headline}</h3>
                        <p className="mt-3 text-sm leading-6 text-slate-600">{visibleAnalysis.diagnosis}</p>
                      </div>
                      <div>
                        <p className="mb-2 text-sm font-bold text-slate-950">Acciones sugeridas</p>
                        <div className="space-y-2">
                          {visibleAnalysis.actions.map((action, index) => (
                            <div key={action} className="flex gap-3 rounded-lg bg-white p-3 text-sm text-slate-700">
                              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-blue-50 text-xs font-black text-blue-700">{index + 1}</span>
                              <span>{action}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      {visibleAnalysis.risks.length > 0 && (
                        <div>
                          <p className="mb-2 text-sm font-bold text-slate-950">Riesgos</p>
                          <div className="space-y-2">
                            {visibleAnalysis.risks.map((risk) => (
                              <p key={risk} className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">{risk}</p>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex h-72 flex-col items-center justify-center text-center">
                      <p className="text-sm font-bold text-slate-950">Listo para analizar</p>
                      <p className="mt-1 max-w-xs text-sm text-slate-500">Presiona Actualizar análisis cuando quieras generar una nueva lectura.</p>
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => generarAnalisis(analysisScope)}
                  disabled={analysisLoading}
                  className="mt-4 h-10 w-full rounded-lg bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  {analysisLoading ? 'Analizando...' : 'Actualizar análisis'}
                </button>
              </div>
            </section>

            <section className={(vistaActiva === 'wealth' ? 'dashboard-view-panel grid' : 'hidden') + ' gap-4'}>
              <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
                <p className="text-sm font-bold text-blue-700">Wealth</p>
                <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-950">Tu ruta de inversión para alcanzar tus metas</h2>
                <p className="mt-2 text-base text-slate-500">Wealth convierte tus metas, plazos y capacidad mensual en un camino concreto para construir patrimonio.</p>
                {!wealthEligibility.ready ? (
                  <div className="mt-7 grid gap-5 rounded-xl border border-blue-200 bg-blue-50 p-5 lg:grid-cols-[1fr_auto] lg:items-center">
                    <div>
                      <Target className="size-9 text-blue-600" weight="regular" aria-hidden="true" />
                      <h3 className="mt-4 text-xl font-black text-slate-950">Primero define tus metas</h3>
                      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Necesitamos saber qué quieres lograr, en cuánto tiempo y cuánto puedes aportar. Con esas respuestas construiremos tu ruta; Wealth no usa un perfil separado.</p>
                      <div className="mt-4 flex flex-wrap gap-2 text-xs font-bold">
                        <span className={`rounded-lg px-3 py-2 ${wealthEligibility.profileCompleted ? 'bg-emerald-100 text-emerald-800' : 'bg-white text-slate-600'}`}>Entrevista {wealthEligibility.profileCompleted ? 'lista' : 'pendiente'}</span>
                        <span className={`rounded-lg px-3 py-2 ${wealthEligibility.hasGoals ? 'bg-emerald-100 text-emerald-800' : 'bg-white text-slate-600'}`}>Metas {wealthEligibility.hasGoals ? 'guardadas' : 'pendientes'}</span>
                      </div>
                    </div>
                    <button type="button" onClick={() => { setVistaActiva('metas'); setGoalsInterviewOpen(true); }} className="h-11 rounded-lg bg-blue-600 px-5 text-sm font-bold text-white hover:bg-blue-700">Definir mis metas</button>
                  </div>
                ) : (
                  <div className="mt-7 grid gap-5 xl:grid-cols-[1fr_300px]">
                    <div>
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div><h3 className="text-xl font-black text-slate-950">Tus metas dirigen esta ruta</h3><p className="mt-1 text-sm text-slate-600">La prioridad, el plazo y el monto determinan cómo distribuir tus aportaciones.</p></div>
                        <button type="button" onClick={() => { setVistaActiva('metas'); setGoalsInterviewOpen(true); }} className="h-10 shrink-0 rounded-lg border border-blue-200 px-4 text-sm font-bold text-blue-700 hover:bg-blue-50">Editar metas</button>
                      </div>
                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        {wealthGoals.slice(0, 4).map((goal) => (
                          <div key={goal.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                            <p className="font-black text-slate-950">{goal.name}</p>
                            <p className="mt-2 text-sm text-slate-600">Objetivo: {formatearMonto(goal.targetAmount)} MXN</p>
                            <p className="mt-1 text-xs font-semibold text-blue-700">Plazo estimado: {goal.horizonMonths} meses</p>
                          </div>
                        ))}
                      </div>
                      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_260px] lg:items-end">
                        <label className="grid gap-2 text-sm font-bold text-slate-700">Aportación mensual disponible para tus metas
                          <div className="flex h-12 items-center rounded-lg border border-slate-200 px-4 focus-within:border-blue-500">
                            <span className="text-slate-400">$</span>
                            <input aria-label="Aportación mensual" type="number" min="0" step="500" value={riskProfile.monthlyContribution}
                              onChange={(event) => setRiskProfile((current) => ({ ...current, monthlyContribution: Number(event.target.value) }))}
                              className="min-w-0 flex-1 bg-transparent px-3 font-bold outline-none" />
                            <span className="text-sm text-slate-400">MXN al mes</span>
                          </div>
                        </label>
                        <button type="button" onClick={() => void guardarPerfilRiesgo()} disabled={riskProfileLoading || riskProfile.monthlyContribution <= 0}
                          className="h-12 rounded-lg bg-blue-600 px-5 font-bold text-white hover:bg-blue-700 disabled:opacity-60">
                          {riskProfileLoading ? 'Recalculando...' : riskProfileSavedAt ? 'Recalcular mi ruta' : 'Crear mi ruta'}
                        </button>
                      </div>
                    </div>
                    <aside className="rounded-xl border border-blue-100 bg-blue-50 p-5">
                      <Target className="size-8 text-blue-600" weight="regular" aria-hidden="true" />
                      <p className="mt-4 text-sm font-bold text-blue-800">Base de tu plan</p>
                      <p className="mt-1 text-2xl font-black text-slate-950">{wealthGoals.length} meta{wealthGoals.length === 1 ? '' : 's'}</p>
                      <p className="mt-3 text-sm leading-6 text-slate-600">Capacidad mensual: <strong>{formatearMonto(riskProfile.monthlyContribution)} MXN</strong>.</p>
                      <p className="mt-2 text-sm leading-6 text-slate-600">Meta de ingresos: <strong>{formatearMonto(metaMensualActiva)} MXN al mes</strong>.</p>
                    </aside>
                  </div>
                )}
              </div>

              {wealthEligibility.ready && <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div><h2 className="text-xl font-black text-slate-950">Así se distribuirá tu dinero</h2><p className="mt-1 text-sm text-slate-500">Cada cantidad tiene una función concreta.</p></div>
                  {wealthRoutePlan && <span className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700">Ruta lista</span>}
                </div>
                {!wealthRoutePlan ? <div className="mt-5 rounded-lg border border-dashed border-slate-300 p-5 text-sm text-slate-600">Completa las dos respuestas y crea tu ruta.</div> : <>
                  <div className="mt-5 rounded-lg bg-blue-50 p-4">
                    <p className="font-black text-blue-950">{wealthRoutePlan.profileLabel}</p>
                    <p className="mt-1 text-sm leading-6 text-blue-900">{wealthRoutePlan.summary}</p>
                    <p className="mt-2 text-sm font-bold text-blue-950">Aportación sugerida: {formatearMonto(wealthRoutePlan.weeklyContribution)} MXN por semana.</p>
                  </div>
                  <div className="mt-4 grid gap-3 lg:grid-cols-2">
                    {wealthRoutePlan.goals.map((goal) => (
                      <div key={goal.id} className="rounded-xl border border-blue-100 bg-white p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div><p className="font-black text-slate-950">{goal.name}</p><p className="mt-1 text-xs font-semibold text-slate-500">Faltan {formatearMonto(goal.remainingAmount)} MXN · {goal.monthsRemaining} meses</p></div>
                          <span className="rounded-lg bg-blue-50 px-3 py-2 text-xs font-black text-blue-700">{goal.progressPct}%</span>
                        </div>
                        <div className="mt-3 h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-blue-600" style={{ width: `${goal.progressPct}%` }} /></div>
                        <p className="mt-3 text-sm text-slate-600">Aportación sugerida: <strong className="text-slate-950">{formatearMonto(goal.suggestedMonthly)} MXN al mes</strong>.</p>
                        <p className="mt-1 text-xs text-slate-500">Para cumplir el plazo ideal necesitarías {formatearMonto(goal.requiredMonthly)} MXN al mes.</p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 grid gap-3 lg:grid-cols-2">{wealthRoutePlan.allocations.map((allocation) => (
                    <div key={allocation.key} className="rounded-xl border border-slate-200 p-4">
                      <div className="flex justify-between gap-4">
                        <div><p className="font-black text-slate-950">{allocation.label}</p><p className="mt-1 text-sm leading-6 text-slate-500">{allocation.purpose}</p></div>
                        <span className="h-fit rounded-lg bg-blue-50 px-3 py-2 text-sm font-black text-blue-700">{allocation.percent}%</span>
                      </div>
                      <p className="mt-4 text-xl font-black">{formatearMonto(allocation.monthlyAmount)} MXN <span className="text-sm font-medium text-slate-500">al mes</span></p>
                      <p className="mt-2 text-xs font-semibold text-slate-500">Opción sugerida: {allocation.platform}</p>
                    </div>
                  ))}</div>
                </>}
              </div>}

              {wealthRoutePlan && <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
                <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                  <h2 className="text-xl font-black text-slate-950">Qué hacer ahora</h2>
                  <p className="mt-1 text-sm text-slate-500">Tres acciones claras para empezar.</p>
                  <div className="mt-5 space-y-3">{wealthRoutePlan.steps.slice(0, 3).map((step) => (
                    <div key={step.order} className="flex gap-3 rounded-xl bg-slate-50 p-4">
                      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-blue-600 text-sm font-black text-white">{step.order}</span>
                      <div><p className="text-sm font-black">{step.title}</p><p className="mt-1 text-sm leading-6 text-slate-600">{step.description}</p></div>
                    </div>
                  ))}</div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                  <p className="text-sm font-bold text-blue-700">Dónde hacerlo</p>
                  <h2 className="mt-1 text-xl font-black">Tutorial para hacer tu primera inversión</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600">Virafi te explica la operación paso a paso. Por ahora tú confirmas y ejecutas en una plataforma regulada; nunca se mueve dinero sin tu autorización.</p>
                  <div className="mt-5 space-y-3">{[
                    ['1', 'Protege tu base', 'Antes de invertir, conserva gastos próximos y fondo de emergencia en un instrumento líquido.'],
                    ['2', 'Elige el objetivo', 'Selecciona la meta, revisa cuánto corresponde este mes y confirma que el plazo permita asumir ese riesgo.'],
                    ['3', 'Revisa el instrumento', 'Entiende qué compras, comisiones, liquidez, moneda, diversificación y cuánto podrías perder temporalmente.'],
                    ['4', 'Compra y vincula', 'Ejecuta en la plataforma y vincula la aportación con la meta; Virafi actualizará el avance desde el movimiento confirmado.'],
                  ].map(([number, title, detail]) => <div key={number} className="flex gap-3 rounded-xl bg-slate-50 p-4"><span className="grid size-8 shrink-0 place-items-center rounded-full bg-blue-600 text-xs font-black text-white">{number}</span><div><p className="text-sm font-black">{title}</p><p className="mt-1 text-sm leading-6 text-slate-600">{detail}</p></div></div>)}</div>
                  <details className="mt-4 rounded-xl border border-slate-200 p-4">
                    <summary className="cursor-pointer text-sm font-black text-slate-950">Comparar plataformas y abrir instrucciones</summary>
                    <div className="mt-4 space-y-3">{[
                      ['CETESDirecto', 'Liquidez y deuda gubernamental en México', 'https://www.cetesdirecto.com/'],
                      ['Alpaca', 'Acciones y ETFs; requiere disponibilidad y cuenta elegible', 'https://app.alpaca.markets/signup'],
                      ['Coinbase', 'Criptoactivos y datos de mercado', 'https://www.coinbase.com/'],
                      ['Binance', 'Mercado cripto, sujeto a disponibilidad regional', 'https://www.binance.com/en/markets/overview'],
                    ].map(([platform, detail, url]) => <div key={platform} className="flex items-start justify-between gap-3 border-t border-slate-100 pt-3"><div><p className="text-sm font-black">{platform}</p><p className="mt-1 text-xs leading-5 text-slate-500">{detail}</p></div><a href={url} target="_blank" rel="noreferrer" className="shrink-0 rounded-lg border border-blue-200 px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-50">Abrir</a></div>)}</div>
                  </details>
                  <div className="mt-5 flex gap-3 rounded-xl bg-emerald-50 p-4">
                    <ShieldCheck className="size-6 shrink-0 text-emerald-700" weight="regular" aria-hidden="true" />
                    <p className="text-sm leading-6 text-emerald-900">Virafi no recibe ni guarda tu dinero. Antes de salir verás cuánto corresponde a esa inversión y qué debes revisar.</p>
                  </div>
                </div>
              </div>}

              {wealthRoutePlan && <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm font-bold text-blue-700">Briefing fundamental</p>
                    <h2 className="mt-1 text-xl font-black text-slate-950">Qué está moviendo al mundo y por qué importa</h2>
                    <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">Hechos recientes de fuentes seleccionadas, explicados según tu experiencia. Precio, noticia y escenario son cosas distintas.</p>
                  </div>
                  <div className="flex gap-2"><div className="flex rounded-lg bg-slate-100 p-1"><button type="button" onClick={() => setMarketExperience('simple')} className={`rounded-md px-3 py-2 text-xs font-bold ${marketExperience === 'simple' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500'}`}>Explícame fácil</button><button type="button" onClick={() => setMarketExperience('advanced')} className={`rounded-md px-3 py-2 text-xs font-bold ${marketExperience === 'advanced' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500'}`}>Más detalle</button></div><button type="button" onClick={sincronizarMercado} disabled={marketSyncLoading} className="h-10 shrink-0 rounded-lg border border-blue-200 px-4 text-sm font-bold text-blue-700 hover:bg-blue-50 disabled:opacity-60">{marketSyncLoading ? 'Actualizando...' : 'Actualizar'}</button></div>
                </div>
                <div className="mt-5 grid gap-3 lg:grid-cols-2">{marketBriefing.length === 0 ? <div className="rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">No hay titulares verificados disponibles en este momento. Los precios se muestran por separado.</div> : marketBriefing.slice(0, 8).map((item) => <article key={item.id} className="rounded-xl border border-slate-200 p-4"><div className="flex items-start justify-between gap-3"><span className="rounded-lg bg-blue-50 px-2 py-1 text-xs font-bold text-blue-700">{item.topicLabel}</span><span className="text-xs font-semibold text-slate-400">{item.source}</span></div><a href={item.url} target="_blank" rel="noreferrer" className="mt-3 block font-black leading-6 text-slate-950 hover:text-blue-700">{item.headline}</a><div className="mt-3 rounded-lg bg-slate-50 p-3"><p className="text-xs font-black uppercase tracking-wide text-slate-500">{marketExperience === 'simple' ? 'En palabras simples' : 'Impacto fundamental'}</p><p className="mt-1 text-sm leading-6 text-slate-700">{marketExperience === 'simple' ? item.beginnerContext : item.whyItMatters}</p></div>{marketExperience === 'advanced' && <p className="mt-3 text-xs leading-5 text-slate-500"><strong>Vigilar después:</strong> {item.watchNext}</p>}</article>)}</div>
                <div className="mt-6"><h3 className="text-sm font-black text-slate-950">Precios y lectura técnica básica</h3><p className="mt-1 text-xs text-slate-500">Dato observado, no pronóstico. Nadie puede saber con certeza cuánto subirá Bitcoin.</p><div className="mt-3 grid gap-3 md:grid-cols-3">{marketSnapshots.filter((snapshot) => snapshot.provider !== 'polymarket').slice(0, 3).map((snapshot) => { const change24h = Number(snapshot.raw?.priceChangePercent); return <div key={snapshot.id} className="rounded-xl bg-slate-50 p-4"><p className="text-xs font-bold text-slate-500">{snapshot.asset?.exchange || snapshot.provider}</p><p className="mt-1 font-black text-slate-950">{snapshot.asset?.symbol || snapshot.asset?.name}</p><p className="mt-2 text-xl font-black">${formatearMonto(valorNumerico(snapshot.price))}</p>{Number.isFinite(change24h) && <p className={`mt-2 text-xs font-bold ${change24h >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{change24h >= 0 ? '+' : ''}{change24h.toFixed(2)}% en 24 h</p>}<p className="mt-2 text-xs leading-5 text-slate-500">El movimiento de 24 h describe impulso reciente; no demuestra valor fundamental ni anticipa el siguiente movimiento.</p></div>; })}</div></div>
                {marketSnapshots.some((snapshot) => snapshot.provider === 'polymarket') && <details className="mt-5 rounded-xl border border-slate-200 p-4"><summary className="cursor-pointer text-sm font-black">Señales secundarias de mercados predictivos</summary><p className="mt-2 text-xs leading-5 text-slate-500">Son expectativas agregadas y pueden equivocarse. No sustituyen noticias, datos económicos ni análisis fundamental.</p></details>}
              </div>}
              {wealthEligibility.ready && <p className="px-1 text-xs text-slate-500">Esta ruta parte de tus metas y es educativa. Tú mantienes el control de cada decisión.</p>}
            </section>
            <section className={`${vistaActiva === 'planes' ? 'dashboard-view-panel block' : 'hidden'}`}>
              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-slate-950">Planes del producto</h2>
                    <p className="text-sm text-slate-500">Elige una suscripción o administra tu plan actual.</p>
                  </div>
                  <span className="rounded-lg bg-blue-50 px-3 py-2 text-sm font-bold text-blue-700">Plan actual: {planLabel}</span>
                </div>
                <div className="grid gap-4 lg:grid-cols-3">
                  {planOptions.map((option) => {
                    const isCurrent = option.plan === billingStatus?.plan;
                    const isPaidPlan = option.plan === 'beta' || option.plan === 'premium';
                    const paidPlanConfigured = isPlanPriceConfigured(option.plan);
                    return (
                      <div key={option.name} className={`rounded-lg border p-4 ${isCurrent ? 'border-blue-300 bg-blue-50/50' : 'border-slate-200 bg-white'}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-lg font-black text-slate-950">{option.name}</p>
                            <p className="mt-1 text-sm text-slate-500">{option.description}</p>
                          </div>
                          {isCurrent && <span className="rounded-full bg-blue-600 px-2 py-1 text-xs font-bold text-white">Actual</span>}
                        </div>
                        <p className="mt-5 text-3xl font-black text-slate-950">{option.price}<span className="text-sm font-semibold text-slate-500">/mes</span></p>
                        <div className="mt-5 space-y-2">
                          {option.features.map((feature) => (
                            <p key={feature} className="rounded-lg bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700">{feature}</p>
                          ))}
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            if (option.plan === billingStatus?.plan && billingStatus?.active && billingStatus?.stripeCustomerId) {
                              void abrirPortalBilling();
                              return;
                            }
                            if (option.plan === 'beta' || option.plan === 'premium') {
                              if (!paidPlanConfigured) {
                                setMensajeStatus(`El plan ${option.name} todavía no está disponible para contratar.`);
                                return;
                              }

                              void abrirCheckoutBilling(option.plan);
                              return;
                            }
                            setMensajeStatus('Gratis es el plan base sin suscripción activa.');
                          }}
                          disabled={billingLoading || (isPaidPlan && !paidPlanConfigured)}
                          title={isPaidPlan && !paidPlanConfigured ? `El plan ${option.name} todavía no está disponible.` : isCurrent ? 'Gestionar plan actual' : `Elegir plan ${option.name}`}
                          className={`mt-5 h-10 w-full rounded-lg px-4 text-sm font-bold disabled:opacity-60 ${
                            isCurrent ? 'border border-blue-200 bg-white text-blue-700' : 'bg-blue-600 text-white hover:bg-blue-700'
                          }`}
                        >
                          {isCurrent && billingStatus?.active ? 'Gestionar plan' : option.plan === 'free' ? 'Plan actual' : 'Elegir plan'}
                        </button>
                        {isPaidPlan && !paidPlanConfigured && (
                          <p className="mt-2 text-xs font-semibold text-amber-700">Disponible próximamente.</p>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <h3 className="text-base font-black text-slate-950">¿Te quedaste sin créditos?</h3>
                      <p className="text-sm text-slate-600">Los paquetes sueltos cuestan más por crédito que subir de plan.</p>
                    </div>
                    <a href="mailto:info@virafi.com?subject=Consumo%20alto%20de%20VirafIA" className="text-sm font-bold text-blue-700 hover:underline">Hablar con Virafi</a>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    {[
                      { id: 'credits-100' as const, label: '100 créditos', price: '$49 MXN' },
                      { id: 'credits-300' as const, label: '300 créditos', price: '$129 MXN' },
                      { id: 'credits-700' as const, label: '700 créditos', price: '$279 MXN' },
                    ].map((pack) => (
                      <button key={pack.id} type="button" onClick={() => void comprarCreditos(pack.id)} disabled={billingLoading} className="rounded-lg border border-slate-200 bg-white px-3 py-3 text-left hover:border-blue-300 disabled:opacity-60">
                        <span className="block text-sm font-black text-slate-950">{pack.label}</span>
                        <span className="mt-1 block text-xs font-bold text-blue-700">{pack.price}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            <section className={`${vistaActiva === 'reportes' ? 'dashboard-view-panel block' : 'hidden'}`}>
              <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
                <div className="flex flex-col gap-4 border-b border-slate-200 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-7">
                  <div>
                    <h2 className="text-2xl font-black tracking-tight text-slate-950">Centro de reportes</h2>
                    <p className="mt-1 text-sm text-slate-500">Elige un periodo, revisa la plantilla y descarga un documento financiero en PDF.</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="grid grid-cols-2 rounded-lg bg-slate-100 p-1 text-sm font-bold">
                      <button type="button" onClick={() => setReportScope('month')} className={`rounded-md px-4 py-2 ${reportScope === 'month' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500'}`}>Mensual</button>
                      <button type="button" onClick={() => setReportScope('year')} className={`rounded-md px-4 py-2 ${reportScope === 'year' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500'}`}>Anual</button>
                    </div>
                    <button type="button" onClick={() => void descargarReportePdf()} disabled={reportDownloading} className="h-11 rounded-lg bg-blue-600 px-5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60">
                      {reportDownloading ? 'Generando PDF...' : 'Descargar PDF'}
                    </button>
                  </div>
                </div>

                <div className="bg-slate-100 p-4 sm:p-8">
                  <article className="mx-auto max-w-5xl overflow-hidden rounded-sm bg-white shadow-lg">
                    <header className="bg-blue-600 px-6 py-6 text-white sm:px-10">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                        <div>
                          <p className="font-brand text-lg font-medium italic text-blue-100">Virafi</p>
                          <h3 className="mt-1 text-2xl font-black">{reportScope === 'year' ? 'Reporte anual 2026' : `Reporte mensual · ${selectedMonthName} 2026`}</h3>
                        </div>
                        <p className="text-sm text-blue-100">{accountName} · MXN</p>
                      </div>
                    </header>

                    <div className="space-y-7 p-6 sm:p-10">
                      <section>
                        <h4 className="text-sm font-black uppercase tracking-wider text-slate-400">Resumen ejecutivo</h4>
                        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                          {[
                            ['Ingresos', reportScope === 'year' ? ingresosYearToDate : resumen.ingresosMes, 'text-emerald-700'],
                            ['Egresos', reportScope === 'year' ? totalGastadoYearToDate : totalGastadoMes, 'text-rose-600'],
                            ['Flujo neto', reportScope === 'year' ? flujoNetoYearToDate : flujoNetoMes, (reportScope === 'year' ? flujoNetoYearToDate : flujoNetoMes) < 0 ? 'text-rose-600' : 'text-blue-700'],
                            ['Meta mensual', metaMensualActiva, 'text-slate-950'],
                          ].map(([label, value, tone]) => (
                            <div key={String(label)} className="border-l-2 border-blue-600 bg-slate-50 p-4">
                              <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</p>
                              <p className={`mt-2 text-xl font-black ${tone}`}>${formatearMonto(Number(value))}</p>
                            </div>
                          ))}
                        </div>
                      </section>

                      {reportScope === 'month' ? (
                        <section className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
                          <div>
                            <h4 className="text-base font-black text-slate-950">Distribución 50/25/25</h4>
                            <div className="mt-4 space-y-4">
                              {budgetBuckets.map((bucket) => {
                                const pct = bucket.limit > 0 ? Math.min((bucket.used / bucket.limit) * 100, 100) : 0;
                                return <div key={bucket.label}>
                                  <div className="flex justify-between text-sm"><span className="font-bold text-slate-700">{bucket.label}</span><span className="text-slate-500">{pct.toFixed(0)}%</span></div>
                                  <div className="mt-2 h-2 bg-slate-100"><div className={`h-2 ${bucket.color}`} style={{ width: `${pct}%` }} /></div>
                                  <p className="mt-1 text-xs text-slate-400">${formatearMonto(bucket.used)} utilizado · ${formatearMonto(bucket.remaining)} disponible</p>
                                </div>;
                              })}
                            </div>
                          </div>
                          <div>
                            <h4 className="text-base font-black text-slate-950">Movimientos principales</h4>
                            <div className="mt-4 divide-y divide-slate-100 border-y border-slate-100">
                              {ultimosMovimientos.slice(0, 6).map((movement) => (
                                <div key={movement.id} className="grid grid-cols-[1fr_auto] gap-4 py-3 text-sm">
                                  <div><p className="font-bold text-slate-800">{movement.concepto}</p><p className="text-xs text-slate-400">{formatearFecha(movement.fecha)} · {nombreOrigen(movement.origen)}</p></div>
                                  <p className={`font-black ${movement.tipo === 'ingreso' ? 'text-emerald-700' : 'text-slate-900'}`}>{movement.tipo === 'ingreso' ? '+' : '-'}${formatearMonto(movement.monto)}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        </section>
                      ) : (
                        <section>
                          <h4 className="text-base font-black text-slate-950">Resultado por mes</h4>
                          <div className="mt-4 overflow-x-auto">
                            <table className="w-full min-w-[620px] text-sm">
                              <thead><tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400"><th className="py-3">Mes</th><th className="py-3 text-right">Ingresos</th><th className="py-3 text-right">Egresos</th><th className="py-3 text-right">Flujo</th><th className="py-3 text-right">Saldo acumulado</th></tr></thead>
                              <tbody className="divide-y divide-slate-100">{resumenMensual.map((month) => <tr key={month.mes}><td className="py-3 font-bold text-slate-700">{month.mes}</td><td className="py-3 text-right text-slate-600">${formatearMonto(month.ingresos)}</td><td className="py-3 text-right text-slate-600">${formatearMonto(month.egresos)}</td><td className={`py-3 text-right font-bold ${month.resultado < 0 ? 'text-rose-600' : 'text-blue-700'}`}>${formatearMonto(month.resultado)}</td><td className="py-3 text-right font-bold text-slate-900">${formatearMonto(month.saldoAcumulado)}</td></tr>)}</tbody>
                            </table>
                          </div>
                        </section>
                      )}

                      <footer className="flex flex-col gap-2 border-t border-slate-200 pt-4 text-xs text-slate-400 sm:flex-row sm:justify-between">
                        <p>Documento informativo generado desde tus movimientos registrados.</p>
                        <p>{reportScope === 'year' ? 'Periodo: enero-diciembre 2026' : `Periodo: ${selectedMonthName.toLowerCase()} 2026`}</p>
                      </footer>
                    </div>
                  </article>
                </div>
              </div>

              <div className="hidden">
                <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                  <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <h2 className="text-lg font-bold text-slate-950">Reporte de {selectedMonthName.toLowerCase()} 2026</h2>
                      <p className="text-sm text-slate-500">Lectura mensual con movimientos, bolsas y comparación.</p>
                    </div>
                    <Link href="/api/account/export" className="inline-flex h-10 items-center rounded-lg border border-slate-200 px-4 text-sm font-bold text-slate-700 hover:bg-slate-50">Exportar datos</Link>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {reporteMensualCards.map((card) => (
                      <div key={card.label} className="rounded-lg bg-slate-50 p-3">
                        <p className="text-sm text-slate-500">{card.label}</p>
                        <p className={`mt-1 text-xl font-black ${card.tone}`}>{card.value}</p>
                        <p className="mt-1 text-xs font-semibold text-slate-500">{card.detail}</p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    {budgetBuckets.map((bucket) => (
                      <div key={bucket.label} className="rounded-lg border border-slate-100 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-bold text-slate-900">{bucket.label}</p>
                          <p className="text-xs font-bold text-slate-500">{bucket.limit > 0 ? `${Math.min((bucket.used / bucket.limit) * 100, 999).toFixed(0)}%` : 'Sin limite'}</p>
                        </div>
                        <div className="mt-2 h-2 rounded-full bg-slate-100">
                          <div className={`h-2 rounded-full ${bucket.color}`} style={{ width: `${bucket.limit > 0 ? Math.min((bucket.used / bucket.limit) * 100, 100) : bucket.used > 0 ? 100 : 0}%` }} />
                        </div>
                        <p className="mt-2 text-xs text-slate-500">${formatearMonto(bucket.used)} usado · ${formatearMonto(bucket.remaining)} restante</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-bold text-slate-950">Movimientos del mes</h2>
                      <p className="text-sm text-slate-500">{ultimosMovimientos.length} movimientos registrados en {selectedMonthName.toLowerCase()}.</p>
                    </div>
                  </div>
                  <div className="overflow-x-auto rounded-lg border border-slate-100">
                    <table className="w-full min-w-[620px] text-left text-sm">
                      <thead>
                        <tr className="border-b border-slate-100 bg-slate-50 text-xs text-slate-500">
                          <th className="px-4 py-3 font-semibold">Fecha</th>
                          <th className="px-4 py-3 font-semibold">Concepto</th>
                          <th className="px-4 py-3 font-semibold">Bolsa</th>
                          <th className="px-4 py-3 font-semibold">Origen</th>
                          <th className="px-4 py-3 text-right font-semibold">Monto</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {ultimosMovimientos.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-500">No hay movimientos para este mes.</td>
                          </tr>
                        ) : (
                          ultimosMovimientos.map((movimiento) => (
                            <tr key={movimiento.id}>
                              <td className="px-4 py-3 text-slate-500">{formatearFecha(movimiento.fecha)}</td>
                              <td className="px-4 py-3 font-semibold text-slate-900">{movimiento.concepto}</td>
                              <td className="px-4 py-3 text-slate-600">{etiquetaBolsa(String(movimiento.categoria))}</td>
                              <td className="px-4 py-3 text-slate-500">{nombreOrigen(movimiento.origen)}</td>
                              <td className={`px-4 py-3 text-right font-bold ${movimiento.tipo === 'ingreso' ? 'text-emerald-700' : 'text-slate-900'}`}>
                                {movimiento.tipo === 'ingreso' ? '+' : '-'}${formatearMonto(movimiento.monto)}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <h2 className="text-lg font-bold text-slate-950">Contexto anual 2026</h2>
                    <p className="text-sm text-slate-500">La fila azul muestra el mes activo.</p>
                  </div>
                </div>
                <div className="overflow-x-auto rounded-lg border border-slate-100">
                  <table className="w-full min-w-[620px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50 text-xs text-slate-500">
                        <th className="px-4 py-3 font-semibold">Mes</th>
                        <th className="px-4 py-3 text-right font-semibold">Ingresos</th>
                        <th className="px-4 py-3 text-right font-semibold">Egresos</th>
                        <th className="px-4 py-3 text-right font-semibold">Flujo</th>
                        <th className="px-4 py-3 text-right font-semibold">Saldo acum.</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {resumenMensual.map((mes) => (
                        <tr key={mes.mes} className={mes.mes === selectedMonthName ? 'bg-blue-50/60' : ''}>
                          <td className="px-4 py-3 font-bold text-slate-900">{mes.mes}</td>
                          <td className="px-4 py-3 text-right text-slate-600">${formatearEntero(mes.ingresos)}</td>
                          <td className="px-4 py-3 text-right text-slate-600">${formatearEntero(mes.egresos)}</td>
                          <td className={`px-4 py-3 text-right font-bold ${mes.resultado < 0 ? 'text-rose-600' : 'text-blue-700'}`}>${formatearEntero(mes.resultado)}</td>
                          <td className="px-4 py-3 text-right font-bold text-slate-900">${formatearEntero(mes.saldoAcumulado)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                </div>
              </div>
              <div className="hidden">
                <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                  <h2 className="text-lg font-bold text-slate-950">Resumen del mes</h2>
                  <div className="mt-4 space-y-3">
                    <div className="rounded-lg bg-slate-50 p-3">
                      <p className="text-sm text-slate-500">Ingresos</p>
                      <p className="text-xl font-black text-slate-950">${formatearMonto(resumen.ingresosMes)}</p>
                    </div>
                    <div className="rounded-lg bg-slate-50 p-3">
                      <p className="text-sm text-slate-500">Egresos</p>
                      <p className="text-xl font-black text-slate-950">${formatearMonto(totalGastadoMes)}</p>
                    </div>
                    <div className="rounded-lg bg-slate-50 p-3">
                      <p className="text-sm text-slate-500">Flujo mensual</p>
                      <p className={`text-xl font-black ${flujoNetoMes < 0 ? 'text-rose-600' : 'text-blue-700'}`}>${formatearMonto(flujoNetoMes)}</p>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section id="movimientos" className={`${vistaActiva === 'movimientos' ? 'dashboard-view-panel block' : 'hidden'} scroll-mt-28 rounded-lg border border-slate-200 bg-white shadow-sm`}>
              <div className="flex flex-col gap-2 border-b border-slate-200 p-5 md:flex-row md:items-end md:justify-between">
                <div>
                  <h2 className="text-lg font-bold text-slate-950">Movimientos recientes</h2>
                  <p className="text-sm text-slate-500">Aquí aparecen los movimientos que registras manualmente, por Telegram o desde un archivo.</p>
                </div>
                <div className="flex flex-wrap items-center gap-3 self-start md:self-auto">
                  <button
                    type="button"
                    onClick={() => setFinancialImportOpen(true)}
                    className="inline-flex h-9 items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 text-sm font-bold text-blue-700 hover:bg-blue-100"
                  >
                    <FileText className="size-4" weight="duotone" />
                    Importar archivo
                  </button>
                  <button
                    type="button"
                    onClick={abrirGastoManual}
                    className="h-9 rounded-lg bg-blue-600 px-3 text-sm font-bold text-white hover:bg-blue-700"
                  >
                    Agregar gasto
                  </button>
                  <span className="text-sm font-semibold text-blue-700">
                    {ultimosMovimientos.length === 0
                      ? '0 movimientos'
                      : `${movimientosPageStart + 1}-${movimientosPageEnd} de ${ultimosMovimientos.length}`}
                  </span>
                  <div className="flex items-center overflow-hidden rounded-lg border border-slate-200 bg-white">
                    <button
                      type="button"
                      onClick={irAMovimientosRecientes}
                      disabled={!puedeVerMovimientosRecientes}
                      aria-label="Ver movimientos más recientes"
                      title="Más recientes"
                      className="grid h-9 w-9 place-items-center text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
                    >
                      ‹
                    </button>
                    <button
                      type="button"
                      onClick={irAMovimientosPrevios}
                      disabled={!puedeVerMovimientosPrevios}
                      aria-label="Ver movimientos anteriores"
                      title="Anteriores"
                      className="grid h-9 w-9 place-items-center border-l border-slate-200 text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
                    >
                      ›
                    </button>
                  </div>
                </div>
              </div>
              <div className="space-y-3 p-3 md:hidden">
                {ultimosMovimientos.length === 0 ? (
                  <p className="rounded-lg bg-slate-50 p-4 text-center text-sm text-slate-500">No hay movimientos registrados este mes.</p>
                ) : (
                  movimientosPaginados.map((movimiento) => (
                    <div key={movimiento.id} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                        {inlineEdit?.id === movimiento.id && inlineEdit.field === 'concepto' ? <input autoFocus value={inlineEdit.value} onChange={(event) => setInlineEdit({ ...inlineEdit, value: event.target.value })} onBlur={() => void guardarEdicionInline(movimiento)} onKeyDown={(event) => { if (event.key === 'Enter') void guardarEdicionInline(movimiento); if (event.key === 'Escape') setInlineEdit(null); }} className="h-8 w-full rounded border border-blue-300 px-2 text-sm text-slate-900" /> : <button type="button" onClick={() => comenzarEdicionInline(movimiento, 'concepto')} className="block max-w-full truncate text-left text-sm font-bold text-slate-950 hover:text-blue-700">{movimiento.concepto}</button>}
                        {inlineEdit?.id === movimiento.id && inlineEdit.field === 'subcategoria' ? <input autoFocus value={inlineEdit.value} onChange={(event) => setInlineEdit({ ...inlineEdit, value: event.target.value })} onBlur={() => void guardarEdicionInline(movimiento)} onKeyDown={(event) => { if (event.key === 'Enter') void guardarEdicionInline(movimiento); if (event.key === 'Escape') setInlineEdit(null); }} className="mt-1 h-7 w-full rounded border border-blue-300 px-2 text-xs text-slate-900" /> : <button type="button" onClick={() => comenzarEdicionInline(movimiento, 'subcategoria')} className="mt-1 block max-w-full truncate text-left text-xs text-slate-500 hover:text-blue-700">{movimiento.subcategoria || 'Sin subcategoría'}</button>}
                        <div className="mt-1 flex flex-wrap items-center gap-1 text-xs text-slate-500">
                          {inlineEdit?.id === movimiento.id && inlineEdit.field === 'fecha' ? <input autoFocus type="date" value={inlineEdit.value} onChange={(event) => setInlineEdit({ ...inlineEdit, value: event.target.value })} onBlur={() => void guardarEdicionInline(movimiento)} onKeyDown={(event) => { if (event.key === 'Enter') void guardarEdicionInline(movimiento); if (event.key === 'Escape') setInlineEdit(null); }} className="h-7 rounded border border-blue-300 px-1 text-xs text-slate-900" /> : <button type="button" onClick={() => comenzarEdicionInline(movimiento, 'fecha')} className="hover:text-blue-700">{formatearFecha(movimiento.fecha)}</button>}
                          <span>·</span>
                          {inlineEdit?.id === movimiento.id && inlineEdit.field === 'origen' ? <input autoFocus value={inlineEdit.value} onChange={(event) => setInlineEdit({ ...inlineEdit, value: event.target.value })} onBlur={() => void guardarEdicionInline(movimiento)} onKeyDown={(event) => { if (event.key === 'Enter') void guardarEdicionInline(movimiento); if (event.key === 'Escape') setInlineEdit(null); }} className="h-7 min-w-20 rounded border border-blue-300 px-1 text-xs text-slate-900" /> : <button type="button" onClick={() => comenzarEdicionInline(movimiento, 'origen')} className="hover:text-blue-700">{nombreOrigen(movimiento.origen, movimiento.subcategoria)}</button>}
                        </div>
                        </div>
                        {inlineEdit?.id === movimiento.id && inlineEdit.field === 'monto' ? <input autoFocus type="number" min="0" step="0.01" value={inlineEdit.value} onChange={(event) => setInlineEdit({ ...inlineEdit, value: event.target.value })} onBlur={() => void guardarEdicionInline(movimiento)} onKeyDown={(event) => { if (event.key === 'Enter') void guardarEdicionInline(movimiento); if (event.key === 'Escape') setInlineEdit(null); }} className="h-8 w-24 rounded border border-blue-300 px-1 text-right text-sm text-slate-900" /> : <button type="button" onClick={() => comenzarEdicionInline(movimiento, 'monto')} className={`shrink-0 text-sm font-black hover:text-blue-700 ${movimiento.tipo === 'ingreso' ? 'text-emerald-600' : movimiento.tipo === 'abono_tarjeta' ? 'text-violet-700' : 'text-slate-950'}`}>{movimiento.tipo === 'ingreso' ? '+' : movimiento.tipo === 'gasto' ? '-' : ''}${formatearMonto(movimiento.monto)}</button>}
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-3">
                        {inlineEdit?.id === movimiento.id && inlineEdit.field === 'categoria' ? <select autoFocus value={inlineEdit.value} onChange={(event) => void guardarEdicionInline(movimiento, event.target.value)} onBlur={() => setInlineEdit(null)} className="h-8 rounded border border-blue-300 bg-white px-2 text-xs font-bold text-slate-900"><option value="Vida">Vida</option><option value="Placeres">Placeres</option><option value="Futuro">Emer/Inv</option></select> : <button type="button" onClick={() => comenzarEdicionInline(movimiento, 'categoria')} className={`rounded-md px-2 py-1 text-xs font-bold ${
                          nombreBolsa(movimiento.categoria) === 'Ingreso' ? 'bg-emerald-50 text-emerald-700' :
                          nombreBolsa(movimiento.categoria) === 'Placeres' ? 'bg-amber-50 text-amber-700' :
                          nombreBolsa(movimiento.categoria) === 'Vida' ? 'bg-emerald-50 text-emerald-700' : 'bg-violet-50 text-violet-700'
                        }`}>{etiquetaBolsa(movimiento.categoria)}</button>}
                        {movimiento.tipo === 'abono_tarjeta' ? (
                          <span className="text-xs font-bold text-violet-700">No cuenta como gasto</span>
                        ) : <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => abrirEditorMovimiento(movimiento)}
                            disabled={editingId === movimiento.id}
                            className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-slate-200 px-3 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                          >
                            <EditIcon />
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => movimiento.tipo === 'gasto'
                              ? eliminarGasto({
                                  id: movimiento.id.replace('gasto-', ''),
                                  concepto: movimiento.concepto,
                                  categoria: movimiento.categoria,
                                  subcategoria: movimiento.subcategoria,
                                  monto: movimiento.monto,
                                  origen: movimiento.origen,
                                  fecha: movimiento.fecha,
                                })
                              : eliminarIngreso({
                                  id: movimiento.id.replace('ingreso-', ''),
                                  concepto: movimiento.concepto,
                                  monto: movimiento.monto,
                                  tipo: movimiento.subcategoria,
                                  fecha: movimiento.fecha,
                                })}
                            disabled={deletingId === movimiento.id || deletingId === movimiento.id.replace('gasto-', '')}
                            className="min-h-9 rounded-lg border border-rose-200 px-3 text-xs font-bold text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                          >
                            {deletingId === movimiento.id || deletingId === movimiento.id.replace('gasto-', '') ? 'Eliminando' : 'Eliminar'}
                          </button>
                        </div>}
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[900px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50 text-xs text-slate-500">
                      <th className="px-5 py-3 font-semibold">Fecha</th>
                      <th className="px-5 py-3 font-semibold">Concepto</th>
                      <th className="px-5 py-3 font-semibold">Categoría</th>
                      <th className="px-5 py-3 font-semibold">Origen</th>
                      <th className="px-5 py-3 text-right font-semibold">Monto</th>
                      <th className="px-5 py-3 text-right font-semibold">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {ultimosMovimientos.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-5 py-8 text-center text-slate-500">No hay movimientos registrados este mes.</td>
                      </tr>
                    ) : (
                      movimientosPaginados.map((movimiento) => (
                        <tr key={movimiento.id} className="hover:bg-slate-50">
                          <td className="whitespace-nowrap px-5 py-3 text-slate-500">
                            {inlineEdit?.id === movimiento.id && inlineEdit.field === 'fecha' ? <input autoFocus type="date" value={inlineEdit.value} onChange={(event) => setInlineEdit({ ...inlineEdit, value: event.target.value })} onBlur={() => void guardarEdicionInline(movimiento)} onKeyDown={(event) => { if (event.key === 'Enter') void guardarEdicionInline(movimiento); if (event.key === 'Escape') setInlineEdit(null); }} className="h-8 rounded border border-blue-300 px-2 text-sm text-slate-900" /> : <button type="button" onClick={() => comenzarEdicionInline(movimiento, 'fecha')} className="text-left hover:text-blue-700">{formatearFecha(movimiento.fecha)}</button>}
                          </td>
                          <td className="px-5 py-3">
                            {inlineEdit?.id === movimiento.id && inlineEdit.field === 'concepto' ? <input autoFocus value={inlineEdit.value} onChange={(event) => setInlineEdit({ ...inlineEdit, value: event.target.value })} onBlur={() => void guardarEdicionInline(movimiento)} onKeyDown={(event) => { if (event.key === 'Enter') void guardarEdicionInline(movimiento); if (event.key === 'Escape') setInlineEdit(null); }} className="h-8 w-full rounded border border-blue-300 px-2 text-sm text-slate-900" /> : <button type="button" onClick={() => comenzarEdicionInline(movimiento, 'concepto')} className="block text-left font-semibold text-slate-900 hover:text-blue-700">{movimiento.concepto}</button>}
                            {inlineEdit?.id === movimiento.id && inlineEdit.field === 'subcategoria' ? <input autoFocus value={inlineEdit.value} onChange={(event) => setInlineEdit({ ...inlineEdit, value: event.target.value })} onBlur={() => void guardarEdicionInline(movimiento)} onKeyDown={(event) => { if (event.key === 'Enter') void guardarEdicionInline(movimiento); if (event.key === 'Escape') setInlineEdit(null); }} className="mt-1 h-7 w-full rounded border border-blue-300 px-2 text-xs text-slate-900" /> : <button type="button" onClick={() => comenzarEdicionInline(movimiento, 'subcategoria')} className="mt-1 block text-left text-xs text-slate-500 hover:text-blue-700">{movimiento.subcategoria || 'Sin subcategoría'}</button>}
                          </td>
                          <td className="px-5 py-3">
                            {inlineEdit?.id === movimiento.id && inlineEdit.field === 'categoria' ? <select autoFocus value={inlineEdit.value} onChange={(event) => void guardarEdicionInline(movimiento, event.target.value)} onBlur={() => setInlineEdit(null)} className="h-8 rounded border border-blue-300 bg-white px-2 text-xs font-bold text-slate-900"><option value="Vida">Vida</option><option value="Placeres">Placeres</option><option value="Futuro">Emer/Inv</option></select> : <button type="button" onClick={() => comenzarEdicionInline(movimiento, 'categoria')} className={`rounded-md px-2 py-1 text-xs font-bold ${
                              nombreBolsa(movimiento.categoria) === 'Ingreso' ? 'bg-emerald-50 text-emerald-700' :
                              nombreBolsa(movimiento.categoria) === 'Placeres' ? 'bg-amber-50 text-amber-700' :
                              nombreBolsa(movimiento.categoria) === 'Vida' ? 'bg-emerald-50 text-emerald-700' : 'bg-violet-50 text-violet-700'
                            }`}>{etiquetaBolsa(movimiento.categoria)}</button>}
                          </td>
                          <td className="px-5 py-3 text-slate-500">
                            {inlineEdit?.id === movimiento.id && inlineEdit.field === 'origen' ? <input autoFocus value={inlineEdit.value} onChange={(event) => setInlineEdit({ ...inlineEdit, value: event.target.value })} onBlur={() => void guardarEdicionInline(movimiento)} onKeyDown={(event) => { if (event.key === 'Enter') void guardarEdicionInline(movimiento); if (event.key === 'Escape') setInlineEdit(null); }} className="h-8 w-full rounded border border-blue-300 px-2 text-sm text-slate-900" /> : <button type="button" onClick={() => comenzarEdicionInline(movimiento, 'origen')} className="text-left hover:text-blue-700">{nombreOrigen(movimiento.origen, movimiento.subcategoria)}</button>}
                          </td>
                          <td className={`px-5 py-3 text-right font-bold ${movimiento.tipo === 'ingreso' ? 'text-emerald-600' : movimiento.tipo === 'abono_tarjeta' ? 'text-violet-700' : 'text-slate-900'}`}>
                            {inlineEdit?.id === movimiento.id && inlineEdit.field === 'monto' ? <input autoFocus type="number" min="0" step="0.01" value={inlineEdit.value} onChange={(event) => setInlineEdit({ ...inlineEdit, value: event.target.value })} onBlur={() => void guardarEdicionInline(movimiento)} onKeyDown={(event) => { if (event.key === 'Enter') void guardarEdicionInline(movimiento); if (event.key === 'Escape') setInlineEdit(null); }} className="h-8 w-28 rounded border border-blue-300 px-2 text-right text-sm text-slate-900" /> : <button type="button" onClick={() => comenzarEdicionInline(movimiento, 'monto')} className="hover:text-blue-700">{movimiento.tipo === 'ingreso' ? '+' : movimiento.tipo === 'gasto' ? '-' : ''}${formatearMonto(movimiento.monto)}</button>}
                          </td>
                          <td className="px-5 py-3 text-right">
                            {movimiento.tipo === 'abono_tarjeta' ? (
                              <span className="text-xs font-bold text-violet-700">No afecta gastos</span>
                            ) : <div className="flex justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => abrirEditorMovimiento(movimiento)}
                                disabled={editingId === movimiento.id}
                                className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                              >
                                <EditIcon />
                                Editar
                              </button>
                            {movimiento.tipo === 'gasto' ? (
                              <button
                                type="button"
                                onClick={() => eliminarGasto({
                                  id: movimiento.id.replace('gasto-', ''),
                                  concepto: movimiento.concepto,
                                  categoria: movimiento.categoria,
                                  subcategoria: movimiento.subcategoria,
                                  monto: movimiento.monto,
                                  origen: movimiento.origen,
                                  fecha: movimiento.fecha,
                                })}
                                disabled={deletingId === movimiento.id.replace('gasto-', '')}
                                className="rounded-md border border-rose-200 px-3 py-1.5 text-xs font-bold text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                              >
                                {deletingId === movimiento.id.replace('gasto-', '') ? 'Eliminando' : 'Eliminar'}
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => eliminarIngreso({
                                  id: movimiento.id.replace('ingreso-', ''),
                                  concepto: movimiento.concepto,
                                  monto: movimiento.monto,
                                  tipo: movimiento.subcategoria,
                                  fecha: movimiento.fecha,
                                })}
                                disabled={deletingId === movimiento.id}
                                className="rounded-md border border-rose-200 px-3 py-1.5 text-xs font-bold text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                              >
                                {deletingId === movimiento.id ? 'Eliminando' : 'Eliminar'}
                              </button>
                            )}
                            </div>}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section className={`${vistaActiva === 'movimientos' ? 'dashboard-view-panel grid' : 'hidden'} gap-4 xl:grid-cols-2`}>
              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-lg font-bold text-slate-950">Ingresos del mes</h2>
                  <span className="text-sm font-bold text-emerald-600">${formatearMonto(resumen.ingresosMes)}</span>
                </div>
                <div className="min-w-0 overflow-x-auto">
                  <table className="w-full sm:min-w-[560px] text-left text-sm">
                    <tbody className="divide-y divide-slate-100">
                      {ingresosMensuales.length === 0 ? (
                        <tr><td className="py-5 text-center text-slate-500">No hay ingresos registrados.</td></tr>
                      ) : ingresosMensuales.map((ingreso) => (
                        <tr key={ingreso.id}>
                          <td className="py-3 text-slate-500">{formatearFecha(ingreso.fecha)}</td>
                          <td className="py-3 font-semibold text-slate-900">{ingreso.concepto || 'Ingreso'}</td>
                          <td className="py-3 text-slate-500">{ingreso.tipo || 'Ingreso'}</td>
                          <td className="py-3 text-right font-bold text-emerald-600">+${formatearMonto(ingreso.monto)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-lg font-bold text-slate-950">Abonos a tarjeta</h2>
                  <span className="text-sm font-bold text-violet-600">${formatearMonto(totalAbonosTarjetaMes)}</span>
                </div>
                <div className="min-w-0 overflow-x-auto">
                  <table className="w-full sm:min-w-[560px] text-left text-sm">
                    <tbody className="divide-y divide-slate-100">
                      {abonosTarjetaMensuales.length === 0 ? (
                        <tr><td className="py-5 text-center text-slate-500">No hay abonos registrados.</td></tr>
                      ) : abonosTarjetaMensuales.map((abono) => (
                        <tr key={abono.id}>
                          <td className="py-3 text-slate-500">{formatearFecha(abono.fecha)}</td>
                          <td className="py-3 font-semibold text-slate-900">{abono.concepto}</td>
                          <td className="py-3 text-slate-500">{abono.tarjeta || 'Tarjeta'}</td>
                          <td className="py-3 text-right font-bold text-violet-600">-${formatearMonto(abono.monto)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          </div>
        </main>
      </div>
      {manualExpenseModal}
      {editModal}
      {goalEditModal}
      {financialImportOpen ? <FinancialImportModal
        open={financialImportOpen}
        onClose={() => setFinancialImportOpen(false)}
        onImported={async (message) => {
          await fetchData({ silent: true });
          mostrarMensajeTemporal(message, 9_000);
        }}
      /> : null}
      {chatAssistant}
      <nav
        aria-label="Navegación móvil"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-2 shadow-[0_-16px_40px_rgba(15,23,42,0.12)] backdrop-blur lg:hidden"
      >
        <div className="grid grid-cols-5 gap-2">
          {mobileNavItems.map((item) => {
            const Icon = item.icon;

            return (
              <button
                key={item.view}
                type="button"
                onClick={() => setVistaActiva(item.view)}
                aria-current={vistaActiva === item.view ? 'page' : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-lg text-xs font-bold transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  vistaActiva === item.view ? 'bg-blue-50 text-blue-700' : 'text-slate-500 hover:bg-slate-50 hover:text-blue-700'
                }`}
              >
                <Icon aria-hidden="true" className="size-6" weight={vistaActiva === item.view ? 'duotone' : 'regular'} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
      <style jsx global>{`
        @keyframes dashboard-view-in {
          from {
            opacity: 0;
            transform: translateY(14px) scale(0.985);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        .dashboard-view-panel {
          animation: dashboard-view-in 260ms cubic-bezier(0.2, 0.8, 0.2, 1);
        }

        @media (prefers-reduced-motion: reduce) {
          .dashboard-view-panel {
            animation: none;
          }
        }
      `}</style>
    </div>
  );
}
