import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, CheckCircle, Database, Export, Eye, Key, LockKey, ShieldCheck, UserFocus } from '@phosphor-icons/react/dist/ssr';
import MarketingShell from '@/app/Components/MarketingShell';

export const metadata: Metadata = {
  title: 'Seguridad y control',
  description: 'Conoce los controles de acceso, aislamiento, cifrado, auditoría y privacidad de Virafi.',
};

const layers = [
  { icon: UserFocus, title: 'Identidad y acceso', text: 'Autenticación por cuenta, sesiones protegidas y controles para que cada perfil acceda únicamente a su espacio.' },
  { icon: Database, title: 'Aislamiento de información', text: 'Los datos financieros se asocian a un perfil y se protegen con reglas de acceso a nivel de base de datos.' },
  { icon: Key, title: 'Secretos fuera del navegador', text: 'Las credenciales privadas y llaves de proveedores se mantienen del lado servidor y no se exponen en la interfaz.' },
  { icon: LockKey, title: 'Integraciones revocables', text: 'Los accesos de canales y proveedores se mantienen del lado servidor y pueden revocarse al desconectar el servicio.' },
  { icon: Eye, title: 'Acceso mínimo necesario', text: 'Los datos de mercado se consultan en modo de lectura y Virafi no habilita movimientos de dinero.' },
  { icon: ShieldCheck, title: 'Auditoría y operación', text: 'Registramos acciones relevantes, errores operativos y eventos de seguridad para investigar y responder.' },
];

export default function SecurityPage() {
  return (
    <MarketingShell>
      <main>
        <section className="marketing-page-hero security-hero">
          <div className="marketing-container marketing-page-hero-grid">
            <div><h1>Seguridad financiera con controles que puedes entender.</h1><p>Virafi está diseñado para consultar, organizar y explicar información. No recibe ni custodia tu dinero, no ejecuta inversiones y mantiene las acciones sensibles bajo confirmación explícita.</p></div>
            <div className="security-orbit" aria-hidden="true"><ShieldCheck weight="duotone" /><i /><i /></div>
          </div>
        </section>

        <section className="marketing-section security-layers">
          <div className="marketing-container">
            <div className="marketing-section-heading"><h2>Protección por capas.</h2><p>Ningún control aislado es suficiente. Combinamos identidad, permisos, cifrado, auditoría y prácticas operativas.</p></div>
            <div className="security-layer-list">
              {layers.map(({ icon: Icon, title, text }, index) => (
                <article key={title}><span>0{index + 1}</span><Icon weight="duotone" /><div><h3>{title}</h3><p>{text}</p></div></article>
              ))}
            </div>
          </div>
        </section>

        <section className="marketing-security-band data-controls">
          <div className="marketing-container">
            <div className="security-band-intro"><h2>Tu información, tus controles.</h2><p>La seguridad también significa poder consultar, corregir, descargar y eliminar información sin depender de procesos opacos.</p></div>
            <div className="data-control-list">
              <p><Export /> Exporta una copia estructurada de la información asociada a tu cuenta.</p>
              <p><CheckCircle /> Actualiza tu perfil, preferencias e integraciones desde configuración.</p>
              <p><LockKey /> Desconecta canales externos como Telegram y revoca su acceso cuando lo decidas.</p>
              <p><Database /> Solicita la eliminación de datos y el cierre de la cuenta, sujeto a retenciones legales.</p>
            </div>
          </div>
        </section>

        <section className="marketing-section security-transparency">
          <div className="marketing-container boundaries-grid">
            <h2>La seguridad es un proceso continuo.</h2>
            <div><p>Monitoreamos errores, revisamos permisos, probamos respaldos y recuperación, y mantenemos procedimientos para rotar secretos. Ningún sistema puede garantizar riesgo cero; si una vulneración pudiera afectar significativamente tus derechos, te informaremos conforme a la ley aplicable.</p><Link href="/privacy" className="marketing-text-link">Lee el aviso de privacidad <ArrowRight /></Link></div>
          </div>
        </section>
      </main>
    </MarketingShell>
  );
}
