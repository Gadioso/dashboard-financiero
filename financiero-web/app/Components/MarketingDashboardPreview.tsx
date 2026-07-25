import {
  ArrowDown,
  ArrowUp,
  ChartDonut,
  House,
  Plant,
  Receipt,
  Sparkle,
  Target,
  Wallet,
} from '@phosphor-icons/react/dist/ssr';
import VirafiBrand from '@/app/Components/VirafiBrand';

const movements = [
  { label: 'Supermercado', detail: 'Alimentos', amount: '−$1,250', tone: '' },
  { label: 'Ingreso mensual', detail: 'Ingreso', amount: '+$25,000', tone: 'positive' },
  { label: 'Aportación a meta', detail: 'Futuro', amount: '−$5,000', tone: '' },
];

export default function MarketingDashboardPreview() {
  return (
    <div className="product-preview" aria-label="Vista ilustrativa del dashboard de Virafi">
      <aside className="product-preview-sidebar">
        <VirafiBrand compact />
        <div className="product-preview-nav" aria-hidden="true">
          <span className="active"><House weight="duotone" />Resumen</span>
          <span><Receipt weight="duotone" />Movimientos</span>
          <span><Target weight="duotone" />Metas</span>
          <span><Plant weight="duotone" />Patrimonio</span>
          <span><Sparkle weight="duotone" />VirafIA</span>
        </div>
      </aside>
      <div className="product-preview-main">
        <div className="product-preview-heading">
          <div>
            <h2>Buenos días, Diego</h2>
            <p>Así va tu panorama financiero</p>
          </div>
          <span>Este mes</span>
        </div>
        <div className="product-preview-grid">
          <section className="preview-balance">
            <p>Patrimonio</p>
            <strong>$1,250,000 <small>MXN</small></strong>
            <span><ArrowUp /> 4.2% vs. mes anterior</span>
          </section>
          <section className="preview-distribution">
            <div className="preview-section-title"><p>Distribución 33/33/33</p><ChartDonut /></div>
            <div className="preview-bars" aria-hidden="true">
              <span><i className="life" style={{ width: '82%' }} /></span>
              <span><i className="joy" style={{ width: '64%' }} /></span>
              <span><i className="future" style={{ width: '76%' }} /></span>
            </div>
            <div className="preview-legend"><span>Vida</span><span>Placeres</span><span>Futuro</span></div>
          </section>
          <section className="preview-movements">
            <div className="preview-section-title"><p>Movimientos recientes</p><Wallet /></div>
            {movements.map((movement) => (
              <div className="preview-movement" key={movement.label}>
                <span className="preview-movement-icon">{movement.tone ? <ArrowUp /> : <ArrowDown />}</span>
                <span><b>{movement.label}</b><small>{movement.detail}</small></span>
                <strong className={movement.tone}>{movement.amount}</strong>
              </div>
            ))}
          </section>
          <section className="preview-assistant">
            <div className="preview-section-title"><p>Asistente Virafi</p><Sparkle weight="fill" /></div>
            <p>Tu ritmo de gasto está estable. Tienes margen para acercarte a tu meta de este mes.</p>
            <span>Ver siguiente paso</span>
          </section>
        </div>
      </div>
    </div>
  );
}
