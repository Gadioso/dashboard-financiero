"use client";

import Image from 'next/image';
import { ChangeEvent, FormEvent, useEffect, useRef, useState } from 'react';
import { Camera, CheckCircle, LinkSimple, MapPin, SignOut, Sparkle, Trash, UserCircle } from '@phosphor-icons/react';

type Profile = {
  full_name?: string | null;
  email?: string | null;
  professional_headline?: string | null;
  location?: string | null;
  website_url?: string | null;
  bio?: string | null;
  financial_why?: string | null;
};

type ProfileResponse = {
  success?: boolean;
  profile?: Profile;
  avatarUrl?: string | null;
  error?: string;
};

const emptyProfile: Profile = {
  full_name: '',
  professional_headline: '',
  location: '',
  website_url: '',
  bio: '',
  financial_why: '',
};

export default function ProfileSettings({
  enabled,
  request,
  onSaved,
}: {
  enabled: boolean;
  request: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  onSaved?: () => void | Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [profile, setProfile] = useState<Profile>(emptyProfile);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const [loading, setLoading] = useState(enabled);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void Promise.resolve()
      .then(() => {
        if (!cancelled) setLoading(true);
        return request('/api/account/profile', { cache: 'no-store' });
      })
      .then((response) => response.json() as Promise<ProfileResponse>)
      .then((data) => {
        if (cancelled || !data.success || !data.profile) return;
        setProfile({ ...emptyProfile, ...data.profile });
        setAvatarUrl(data.avatarUrl || null);
      })
      .catch(() => setFeedback('No pude cargar tu perfil. Intenta nuevamente.'))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [enabled, request]);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  function set(key: keyof Profile, value: string) {
    setProfile((current) => ({ ...current, [key]: value }));
  }

  function chooseAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setAvatarFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setRemoveAvatar(false);
    setFeedback('');
  }

  function clearAvatar() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setAvatarFile(null);
    setRemoveAvatar(true);
    if (inputRef.current) inputRef.current.value = '';
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setFeedback('');
    try {
      const form = new FormData();
      Object.entries(profile).forEach(([key, value]) => form.set(key, String(value || '')));
      if (avatarFile) form.set('avatar', avatarFile);
      if (removeAvatar) form.set('removeAvatar', 'true');
      const response = await request('/api/account/profile', { method: 'PUT', body: form });
      const data = await response.json() as ProfileResponse;
      if (!response.ok || !data.success || !data.profile) throw new Error(data.error || 'No pude guardar tu perfil.');
      setProfile({ ...emptyProfile, ...data.profile });
      setAvatarUrl(data.avatarUrl || null);
      setAvatarFile(null);
      setRemoveAvatar(false);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      if (inputRef.current) inputRef.current.value = '';
      setFeedback('Perfil actualizado. Virafi ya usará este contexto en tus metas y recomendaciones.');
      await onSaved?.();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'No pude guardar tu perfil. Intenta nuevamente.');
    } finally {
      setSaving(false);
    }
  }

  async function logout() {
    setLoggingOut(true);
    setFeedback('');

    try {
      const response = await fetch('/api/auth/logout', { method: 'POST' });
      if (!response.ok) throw new Error('No pude cerrar tu sesión. Intenta nuevamente.');
      window.location.assign('/login');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'No pude cerrar tu sesión. Intenta nuevamente.');
      setLogoutConfirmOpen(false);
      setLoggingOut(false);
    }
  }

  const visibleAvatar = previewUrl || (!removeAvatar ? avatarUrl : null);
  const initials = String(profile.full_name || profile.email || 'V')
    .split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || 'V';

  return (
    <>
      <form onSubmit={(event) => void save(event)} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 p-5 md:p-6">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-700">Tu identidad en Virafi</p>
        <h2 className="mt-1 font-brand text-2xl text-slate-950">Un perfil que le da contexto a tu dinero</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">Tu historia, actividad y motivación ayudan a que las metas y recomendaciones se parezcan a tu vida. Tú decides cuánto compartir y puedes editarlo cuando quieras.</p>
      </div>

      <div className="grid gap-8 p-5 md:grid-cols-[220px_minmax(0,1fr)] md:p-6">
        <aside>
          <div className="relative mx-auto size-36 overflow-hidden rounded-full border-4 border-white bg-blue-50 shadow-md md:mx-0">
            {visibleAvatar ? (
              <Image src={visibleAvatar} alt={`Foto de ${profile.full_name || 'perfil'}`} fill sizes="144px" unoptimized className="object-cover" />
            ) : (
              <div className="grid h-full place-items-center text-3xl font-black text-blue-700" aria-label={`Iniciales ${initials}`}>{initials}</div>
            )}
          </div>
          <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={chooseAvatar} className="sr-only" />
          <button type="button" onClick={() => inputRef.current?.click()} disabled={!enabled || loading} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50">
            <Camera aria-hidden="true" className="size-5" weight="bold" /> Cambiar foto
          </button>
          {visibleAvatar && <button type="button" onClick={clearAvatar} className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-50"><Trash aria-hidden="true" className="size-4" /> Quitar foto</button>}
          <p className="mt-3 text-center text-xs leading-5 text-slate-400 md:text-left">JPG, PNG o WebP. Máximo 5 MB. Tu foto no es pública.</p>
        </aside>

        <div className="grid gap-5">
          {loading ? <div className="rounded-lg bg-slate-50 px-4 py-12 text-center text-sm font-semibold text-slate-500">Cargando tu perfil...</div> : <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nombre" icon={UserCircle} value={profile.full_name} onChange={(value) => set('full_name', value)} placeholder="Tu nombre completo" />
              <Field label="Presentación profesional" icon={Sparkle} value={profile.professional_headline} onChange={(value) => set('professional_headline', value)} placeholder="Ej. Fundador de una agencia creativa" />
              <Field label="Ubicación" icon={MapPin} value={profile.location} onChange={(value) => set('location', value)} placeholder="Ej. Ciudad de México" />
              <Field label="Sitio web" icon={LinkSimple} value={profile.website_url} onChange={(value) => set('website_url', value)} placeholder="https://tusitio.com" type="url" />
            </div>
            <TextArea label="Tu biografía" value={profile.bio} onChange={(value) => set('bio', value)} placeholder="Cuéntale a Virafi a qué te dedicas, en qué etapa estás y qué contexto debería conocer para entender mejor tus decisiones." maxLength={1200} />
            <TextArea label="¿Qué quieres que el dinero haga posible para ti?" value={profile.financial_why} onChange={(value) => set('financial_why', value)} placeholder="Ej. Tener libertad de tiempo, cuidar a mi familia y hacer crecer mi negocio sin vivir con incertidumbre." maxLength={600} />

            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
              <p className="flex items-center gap-2 text-sm font-bold text-blue-950"><CheckCircle aria-hidden="true" className="size-5 text-blue-700" weight="fill" /> Cómo se conecta</p>
              <p className="mt-2 text-sm leading-6 text-blue-900">El agente VirafIA tomará este perfil como contexto de identidad. La entrevista seguirá guardando tus cifras, prioridades y horizontes para explicar y recomendar con más sentido.</p>
            </div>
          </>}

          {feedback && <p className={`rounded-lg px-4 py-3 text-sm ${feedback.startsWith('Perfil actualizado') ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>{feedback}</p>}
          <div className="flex justify-end">
            <button type="submit" disabled={!enabled || loading || saving} className="min-h-11 rounded-lg bg-slate-950 px-6 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-50">{saving ? 'Guardando...' : 'Guardar perfil'}</button>
          </div>
        </div>
      </div>
      </form>

      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm md:p-6" aria-labelledby="session-settings-title">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Cuenta</p>
            <h2 id="session-settings-title" className="mt-1 text-lg font-bold text-slate-950">Sesión</h2>
            <p className="mt-1 text-sm text-slate-500">Cierra tu sesión únicamente cuando hayas terminado de usar este dispositivo.</p>
          </div>
          <button
            type="button"
            onClick={() => setLogoutConfirmOpen(true)}
            disabled={loggingOut}
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 text-sm font-semibold text-slate-600 transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50"
          >
            <SignOut aria-hidden="true" className="size-5" /> Cerrar sesión
          </button>
        </div>
      </section>

      {logoutConfirmOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/40 px-4 backdrop-blur-sm" role="presentation">
          <section
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="logout-confirm-title"
            aria-describedby="logout-confirm-description"
            className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-2xl"
          >
            <span className="grid size-11 place-items-center rounded-full bg-rose-50 text-rose-700">
              <SignOut aria-hidden="true" className="size-6" weight="bold" />
            </span>
            <h2 id="logout-confirm-title" className="mt-5 text-xl font-bold text-slate-950">¿Quieres cerrar tu sesión?</h2>
            <p id="logout-confirm-description" className="mt-2 text-sm leading-6 text-slate-600">
              Saldrás de Virafi en este dispositivo y tendrás que iniciar sesión nuevamente para entrar a tu dashboard.
            </p>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setLogoutConfirmOpen(false)}
                disabled={loggingOut}
                className="min-h-11 rounded-lg border border-slate-200 px-4 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void logout()}
                disabled={loggingOut}
                className="min-h-11 rounded-lg bg-rose-600 px-4 text-sm font-bold text-white hover:bg-rose-700 disabled:opacity-50"
              >
                {loggingOut ? 'Cerrando sesión...' : 'Sí, cerrar sesión'}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}

function Field({ label, icon: Icon, value, onChange, placeholder, type = 'text' }: { label: string; icon: typeof UserCircle; value: unknown; onChange: (value: string) => void; placeholder: string; type?: string }) {
  return <label className="grid gap-2 text-sm font-bold text-slate-700">{label}<span className="relative"><Icon aria-hidden="true" className="absolute left-3 top-1/2 size-5 -translate-y-1/2 text-slate-400" /><input type={type} value={String(value || '')} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="h-11 w-full rounded-lg border border-slate-200 pl-10 pr-3 font-normal outline-none focus:border-blue-500" /></span></label>;
}

function TextArea({ label, value, onChange, placeholder, maxLength }: { label: string; value: unknown; onChange: (value: string) => void; placeholder: string; maxLength: number }) {
  return <label className="grid gap-2 text-sm font-bold text-slate-700">{label}<textarea value={String(value || '')} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} maxLength={maxLength} rows={4} className="rounded-lg border border-slate-200 px-3 py-3 font-normal leading-6 outline-none focus:border-blue-500" /><span className="text-right text-xs font-normal text-slate-400">{String(value || '').length}/{maxLength}</span></label>;
}
