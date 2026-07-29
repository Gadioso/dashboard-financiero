import {
  ChartLineUp,
  House,
  ListChecks,
  Sparkle,
  Target,
  Wallet,
} from '@phosphor-icons/react/dist/ssr';
import VirafiBrand from '@/app/Components/VirafiBrand';

const allocation = [
  { label: 'Fondo de emergencia', amount: '$2,800', percent: '35%', tone: 'emergency' },
  { label: 'Independizarte y viajar', amount: '$2,750', percent: '34%', tone: 'goal' },
  { label: 'Propiedad', amount: '$1,650', percent: '21%', tone: 'property' },
  { label: 'Inversión', amount: '$800', percent: '10%', tone: 'investment' },
];

export default function MarketingDashboardPreview() {
  return (
    <div className="product-preview cfo-product-preview" aria-label="Vista ilustrativa del CFO personal de Virafi">
      <aside className="product-preview-sidebar">
        <VirafiBrand compact />
        <div className="product-preview-nav" aria-hidden="true">
          <span className="active"><House weight="duotone" />Inicio</span>
          <span><ListChecks weight="duotone" />Plan</span>
          <span><Target weight="duotone" />Metas</span>
          <span><Wallet weight="duotone" />Movimientos</span>
          <span><ChartLineUp weight="duotone" />Análisis</span>
        </div>
      </aside>
      <div className="product-preview-main cfo-preview-main">
        <div className="cfo-preview-heading"><span><Sparkle weight="duotone" /></span><h2>Buenos días, Diego</h2></div>
        <div className="cfo-preview-message">Hoy apartaría <strong>$2,750</strong><br />para independizarte y viajar.</div>
        <p className="cfo-preview-label">Así se vería tu plan de este mes:</p>
        <div className="cfo-preview-allocation">
          {allocation.map((item) => (
            <div key={item.label}>
              <span className={item.tone}><i>{item.percent}</i></span>
              <p>{item.label}</p><strong>{item.amount}</strong>
            </div>
          ))}
        </div>
        <div className="cfo-preview-insight"><Sparkle weight="duotone" /><span>Detecté que gastaste más en comida fuera de lo planeado esta semana.</span></div>
        <button type="button" tabIndex={-1}>Ver mi plan de hoy</button>
      </div>
    </div>
  );
}
