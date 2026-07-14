import Link from 'next/link';

const updatedAt = '13 de junio de 2026';

export const metadata = {
  title: 'Términos | Dashboard Financiero',
  description: 'Términos de servicio de Dashboard Financiero.',
};

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[#f5f7fb] px-5 py-10 text-slate-950">
      <article className="mx-auto max-w-3xl rounded-lg border border-slate-200 bg-white p-6 shadow-sm md:p-10">
        <Link href="/login" className="inline-flex items-center gap-3 text-sm font-semibold text-slate-900 hover:text-blue-700">
          <span className="grid size-9 place-items-center rounded-lg bg-blue-600 text-white">D</span>
          <span>Dashboard Financiero</span>
        </Link>
        <h1 className="mt-6 text-4xl font-bold tracking-tight">Términos de servicio</h1>
        <p className="mt-3 text-sm text-slate-500">Última actualización: {updatedAt}</p>

        <section className="mt-8 space-y-5 text-sm leading-7 text-slate-600">
          <p>
            Al usar Dashboard Financiero aceptas estos términos. Si no estás de acuerdo, no uses el servicio.
          </p>

          <h2 className="pt-4 text-xl font-bold text-slate-950">Uso del servicio</h2>
          <p>
            Dashboard Financiero es una herramienta de organización financiera personal. Puedes registrar movimientos, consultar reportes, conectar integraciones y automatizar la captura de datos permitidos por ti.
          </p>

          <h2 className="pt-4 text-xl font-bold text-slate-950">No es asesoría financiera</h2>
          <p>
            La información del dashboard es orientativa y depende de los datos registrados o conectados por el usuario. El servicio no ofrece asesoría financiera, fiscal, legal, contable ni de inversión.
          </p>

          <h2 className="pt-4 text-xl font-bold text-slate-950">Responsabilidades del usuario</h2>
          <p>
            Eres responsable de mantener segura tu cuenta, revisar la exactitud de tus datos y conectar solo correos, chats o servicios sobre los que tengas autorización. No debes usar el servicio para acceder a información de terceros sin permiso.
          </p>

          <h2 className="pt-4 text-xl font-bold text-slate-950">Integraciones</h2>
          <p>
            Al conectar servicios como Google, Gmail o Telegram, autorizas a Dashboard Financiero a usar esos accesos para las funciones que activaste. Puedes revocar integraciones desde el proveedor correspondiente o solicitando soporte.
          </p>

          <h2 className="pt-4 text-xl font-bold text-slate-950">Disponibilidad</h2>
          <p>
            Trabajamos para mantener el servicio disponible y seguro, pero puede haber interrupciones, errores, cambios de proveedores externos o mantenimiento. Algunas integraciones pueden requerir verificaciones o aprobaciones de terceros.
          </p>

          <h2 className="pt-4 text-xl font-bold text-slate-950">Cambios</h2>
          <p>
            Podemos actualizar estos términos para reflejar cambios de producto, seguridad o requisitos legales. La versión vigente estará disponible en esta página.
          </p>

          <h2 className="pt-4 text-xl font-bold text-slate-950">Contacto</h2>
          <p>
            Para soporte o preguntas sobre estos términos, escribe a info@tendencia.ai.
          </p>
        </section>
      </article>
    </main>
  );
}
