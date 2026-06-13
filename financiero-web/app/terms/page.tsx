import Link from 'next/link';

const updatedAt = '13 de junio de 2026';

export const metadata = {
  title: 'Terminos | Dashboard Financiero',
  description: 'Terminos de servicio de Dashboard Financiero.',
};

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-slate-950 px-5 py-10 text-slate-100">
      <article className="mx-auto max-w-3xl">
        <Link href="/login" className="text-sm font-semibold text-emerald-300 hover:text-emerald-200">
          Dashboard Financiero
        </Link>
        <h1 className="mt-6 text-4xl font-bold tracking-tight">Terminos de servicio</h1>
        <p className="mt-3 text-sm text-slate-400">Ultima actualizacion: {updatedAt}</p>

        <section className="mt-8 space-y-5 text-sm leading-7 text-slate-300">
          <p>
            Al usar Dashboard Financiero aceptas estos terminos. Si no estas de acuerdo, no uses el servicio.
          </p>

          <h2 className="pt-4 text-xl font-bold text-slate-100">Uso del servicio</h2>
          <p>
            Dashboard Financiero es una herramienta de organizacion financiera personal. Puedes registrar movimientos, consultar reportes, conectar integraciones y automatizar la captura de datos permitidos por ti.
          </p>

          <h2 className="pt-4 text-xl font-bold text-slate-100">No es asesoria financiera</h2>
          <p>
            La informacion del dashboard es orientativa y depende de los datos registrados o conectados por el usuario. El servicio no ofrece asesoria financiera, fiscal, legal, contable ni de inversion.
          </p>

          <h2 className="pt-4 text-xl font-bold text-slate-100">Responsabilidades del usuario</h2>
          <p>
            Eres responsable de mantener segura tu cuenta, revisar la exactitud de tus datos y conectar solo correos, chats o servicios sobre los que tengas autorizacion. No debes usar el servicio para acceder a informacion de terceros sin permiso.
          </p>

          <h2 className="pt-4 text-xl font-bold text-slate-100">Integraciones</h2>
          <p>
            Al conectar servicios como Google, Gmail o Telegram, autorizas a Dashboard Financiero a usar esos accesos para las funciones que activaste. Puedes revocar integraciones desde el proveedor correspondiente o solicitando soporte.
          </p>

          <h2 className="pt-4 text-xl font-bold text-slate-100">Disponibilidad</h2>
          <p>
            Trabajamos para mantener el servicio disponible y seguro, pero puede haber interrupciones, errores, cambios de proveedores externos o mantenimiento. Algunas integraciones pueden requerir verificaciones o aprobaciones de terceros.
          </p>

          <h2 className="pt-4 text-xl font-bold text-slate-100">Cambios</h2>
          <p>
            Podemos actualizar estos terminos para reflejar cambios de producto, seguridad o requisitos legales. La version vigente estara disponible en esta pagina.
          </p>

          <h2 className="pt-4 text-xl font-bold text-slate-100">Contacto</h2>
          <p>
            Para soporte o preguntas sobre estos terminos, escribe a info@tendencia.ai.
          </p>
        </section>
      </article>
    </main>
  );
}
