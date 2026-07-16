import Link from 'next/link';
import VirafiBrand from '@/app/Components/VirafiBrand';

const updatedAt = '13 de junio de 2026';

export const metadata = {
  title: 'Privacidad',
  description: 'Política de privacidad de Virafi.',
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[var(--brand-cream)] px-5 py-10 text-slate-950">
      <article className="mx-auto max-w-3xl rounded-lg border border-slate-200 bg-white p-6 shadow-sm md:p-10">
        <Link href="/login" className="inline-flex items-center gap-3 text-sm font-semibold text-slate-900 hover:text-blue-700">
          <VirafiBrand compact />
        </Link>
        <h1 className="mt-6 text-4xl font-bold tracking-tight">Politica de privacidad</h1>
        <p className="mt-3 text-sm text-slate-500">Ultima actualizacion: {updatedAt}</p>

        <section className="mt-8 space-y-5 text-sm leading-7 text-slate-600">
          <p>
            Virafi ayuda a cada usuario a registrar, clasificar y consultar su información financiera personal. Esta política explica qué datos tratamos, para qué los usamos y qué controles tiene cada usuario.
          </p>

          <h2 className="pt-4 text-xl font-bold text-slate-950">Datos que recopilamos</h2>
          <p>
            Podemos recopilar datos de cuenta como nombre, correo electronico, identificador de usuario, integraciones conectadas, movimientos financieros capturados manualmente, mensajes enviados al bot de Telegram y metadatos tecnicos necesarios para operar el servicio.
          </p>
          <p>
            Si conectas Gmail, solicitamos permiso de lectura para identificar correos bancarios relevantes y convertirlos en movimientos financieros dentro de tu dashboard. No vendemos datos de Gmail ni los usamos para publicidad.
          </p>

          <h2 className="pt-4 text-xl font-bold text-slate-950">Uso de datos de Gmail</h2>
          <p>
            El acceso a Gmail se usa exclusivamente para buscar y procesar correos relacionados con movimientos bancarios, como cargos, abonos o notificaciones financieras. El sistema guarda tokens cifrados para mantener la conexion autorizada por el usuario y registra los resultados de ingesta para evitar duplicados y diagnosticar errores.
          </p>
          <p>
            Virafi no transfiere datos de Gmail a terceros salvo cuando sea estrictamente necesario para operar la funcionalidad solicitada por el usuario, cumplir la ley, proteger el servicio o con consentimiento explícito del usuario.
          </p>

          <h2 className="pt-4 text-xl font-bold text-slate-950">Como protegemos la informacion</h2>
          <p>
            Usamos autenticacion por usuario, aislamiento por perfil, reglas de seguridad en la base de datos y cifrado para tokens de integraciones. Cada cuenta debe ver solo sus propios datos. Las operaciones sensibles se registran para auditoria y diagnostico.
          </p>

          <h2 className="pt-4 text-xl font-bold text-slate-950">Retencion y eliminacion</h2>
          <p>
            Conservamos los datos mientras la cuenta o integracion permanezca activa, o mientras sean necesarios para prestar el servicio. Puedes solicitar desconectar integraciones, eliminar datos asociados o cerrar tu cuenta escribiendo a info@tendencia.ai.
          </p>

          <h2 className="pt-4 text-xl font-bold text-slate-950">Revocar acceso de Google</h2>
          <p>
            Puedes revocar el acceso de Virafi desde tu Cuenta de Google, en Seguridad, Conexiones con apps y servicios de terceros. Al revocar acceso, la sincronización de Gmail dejará de funcionar.
          </p>

          <h2 className="pt-4 text-xl font-bold text-slate-950">Contacto</h2>
          <p>
            Para dudas, solicitudes de privacidad o eliminacion de datos, escribe a info@tendencia.ai.
          </p>
        </section>
      </article>
    </main>
  );
}
