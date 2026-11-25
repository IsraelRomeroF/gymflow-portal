import type { PublicPlan } from '@gymflow/core/contracts';
import { pesos } from '@gymflow/ui/format';

const UNIDAD: Record<string, [string, string]> = { DAY: ['día', 'días'], WEEK: ['semana', 'semanas'], MONTH: ['mes', 'meses'] };

/** Cada cuánto se paga o qué incluye: «/ mes», «/ 12 meses», «10 visitas», «por visita». */
export function periodoDelPlan(p: Pick<PublicPlan, 'billingModel' | 'durationUnit' | 'durationValue' | 'visitsIncluded'>): string {
  if (p.billingModel === 'DAY_PASS') return 'por visita';
  if (p.billingModel === 'VISIT_PACK') {
    const n = p.visitsIncluded ?? p.durationValue;
    return `${n} ${n === 1 ? 'visita' : 'visitas'}`;
  }
  const [uno, varios] = UNIDAD[p.durationUnit] ?? ['periodo', 'periodos'];
  return p.durationValue === 1 ? `/ ${uno}` : `/ ${p.durationValue} ${varios}`;
}

/**
 * LOS PLANES DE LA SUCURSAL, CON SU PRECIO (D-31, bloque 4.7).
 *
 * Quien escanea el cartel quiere saber cuánto cuesta antes de dar sus datos.
 * Son los planes que ESA sucursal vende, con su precio de lista: sin
 * promociones ni precios acordados. Solo se enseñan: el plan se elige en
 * recepción, donde se cobra. Sin planes a la venta, no se pinta nada.
 */
export function PlanesDeLaSede({ planes, sede }: { planes: readonly PublicPlan[]; sede: string }) {
  if (planes.length === 0) return null;
  return (
    <section className="planes-alta" data-testid="planes-de-la-sede" aria-labelledby="planes-alta-titulo">
      <p className="section-title eyebrow" id="planes-alta-titulo">Planes y precios en {sede}</p>
      <ul className="list card">
        {planes.map((p) => (
          <li key={p.id} className="planes-alta-fila">
            <div className="item-body">
              <p className="item-title">{p.name}</p>
              {(p.description || p.signupFeeCents !== '0') && (
                <p className="item-sub">{[p.description, p.signupFeeCents !== '0' ? `+ inscripción ${pesos(p.signupFeeCents, { decimals: false })}` : null].filter(Boolean).join(' · ')}</p>
              )}
            </div>
            <p className="planes-alta-precio"><span className="num">{pesos(p.priceCents, { decimals: false })}</span> <span className="item-sub">{periodoDelPlan(p)}</span></p>
          </li>
        ))}
      </ul>
      <p className="hint">Son los precios de lista de esta sucursal. Aquí solo dejas tus datos: tu plan lo eliges en recepción.</p>
    </section>
  );
}
