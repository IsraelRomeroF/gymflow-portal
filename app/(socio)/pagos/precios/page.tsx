'use client';

import { useCallback } from 'react';
import Link from 'next/link';
import { ChevronLeft, RefreshCw, Store } from 'lucide-react';
import type { PortalOffer, PortalOfferPlan } from '@gymflow/core/contracts';
import { api } from '@/lib/api';
import { dia, pesos, ultimoDia } from '@gymflow/ui/format';
import { EstadoCarga, useCarga } from '@gymflow/ui/carga';
import { useSocio } from '@/components/socio';
import { Badge, IconTile, Section, Skeleton } from '@/components/ui';

const GRUPOS: ReadonlyArray<{ kind: PortalOfferPlan['kind']; titulo: string }> = [
  { kind: 'PLAN', titulo: 'Planes' },
  { kind: 'VISIT_PACK', titulo: 'Paquetes de visitas' },
  { kind: 'DAY_PASS', titulo: 'Pase del día' },
];

/** «Cada mes», «Cada 12 meses», «10 visitas · valen 60 días». */
function loQueTrae(p: PortalOfferPlan): string {
  const partes: string[] = [];
  if (p.kind === 'VISIT_PACK') {
    if (p.visitsIncluded) partes.push(p.visitsIncluded === 1 ? '1 visita' : `${p.visitsIncluded} visitas`);
    if (p.visitValidityDays) partes.push(`valen ${p.visitValidityDays} días`);
  } else if (p.kind === 'DAY_PASS') {
    partes.push('Vale el día que lo compras');
  } else {
    const n = p.durationValue;
    const cada = p.durationUnit === 'MONTH' ? (n === 1 ? 'Cada mes' : `Cada ${n} meses`)
      : p.durationUnit === 'WEEK' ? (n === 1 ? 'Cada semana' : `Cada ${n} semanas`)
        : p.durationUnit === 'DAY' ? (n === 1 ? 'Cada día' : `Cada ${n} días`) : null;
    if (cada) partes.push(cada);
  }
  if (p.includesClasses) partes.push('incluye clases');
  return partes.join(' · ');
}

/**
 * PLANES Y PRECIOS (fase 3, bloque 3.10; D-35 opción c, lo que no depende del
 * procesador de pagos).
 *
 * Renovar, cambiar de plan y comprar paquetes o clases sueltas desde el
 * teléfono llega con el cobro en línea. Mientras tanto esta pantalla NO
 * compra nada: dice qué hay y cuánto cuesta para que el socio llegue al
 * mostrador sabiéndolo, y «Paga en recepción» con su número a la vista.
 *
 * Los precios son de LISTA en su sede. Las promociones y los descuentos de
 * estudiante o de familia no se muestran ni se calculan aquí: se aplican en
 * el mostrador, y la pantalla lo dice para que nadie crea que no existen.
 */
export default function PreciosPage() {
  const { me } = useSocio();
  const carga = useCarga(useCallback(() => api<PortalOffer>('/portal/offer'), []));

  return (
    <>
      <div className="between mb-12">
        <Link href="/pagos" className="link"><ChevronLeft size={16} /> Pagos</Link>
      </div>
      <h1 className="title pagina-titulo">Planes y precios</h1>
      <EstadoCarga carga={carga} titulo="No pudimos cargar los precios" esqueleto={<div className="stack"><Skeleton h={110} r={16} /><Skeleton h={180} /></div>}>
        {(o) => {
          const nada = o.plans.length === 0 && o.classes.length === 0 && !o.renewal;
          return (
            <>
              {/* Siempre arriba: aquí no se compra, se paga en recepción (D-34, D-35). */}
              <div className="card card-pad paga-en-recepcion" data-testid="precios-paga-en-recepcion">
                <div className="row items-start">
                  <IconTile><Store /></IconTile>
                  <div className="flex-1">
                    <p className="item-title">Paga en recepción</p>
                    <p className="small muted mt-2">Desde el teléfono todavía no se compra ni se renueva: aquí ves cuánto cuesta y en recepción lo pagas, en efectivo, con tarjeta o por transferencia.</p>
                  </div>
                </div>
                <div className="socio-numero">
                  <span className="tiny muted">Di tu número de socio</span>
                  <span className="mono socio-numero-codigo">{me.memberCode}</span>
                </div>
              </div>

              {o.renewal && (
                <Section title="Renovar tu plan">
                  <div className="card card-pad precio-renovar" data-testid="renovar">
                    <div className="row items-start">
                      <IconTile tone="volt"><RefreshCw /></IconTile>
                      <div className="flex-1">
                        <p className="item-title">{o.renewal.planName}</p>
                        <p className="small muted mt-2">
                          {o.renewal.priceKind === 'LIST'
                            ? 'Tu plan ya terminó: lo vuelves a contratar al precio de lista.'
                            : o.renewal.autoRenew
                              ? `Se renueva solo: tu siguiente periodo empieza el ${o.renewal.from ? dia(o.renewal.from) : 'día de corte'}, al precio que tienes hoy.`
                              : `Tu plan termina el ${o.renewal.from ? dia(ultimoDia(o.renewal.from)) : 'último día de tu periodo'} y no se renueva solo. Lo renuevas al precio que tienes hoy.`}
                        </p>
                      </div>
                      <p className="amount precio-monto">{pesos(o.renewal.priceCents)}</p>
                    </div>
                  </div>
                </Section>
              )}

              {GRUPOS.map((g) => {
                const planes = o.plans.filter((p) => p.kind === g.kind);
                if (planes.length === 0) return null;
                return (
                  <Section key={g.kind} title={g.titulo}>
                    <div className="card" data-testid={`precios-${g.kind}`}>
                      <ul className="list">
                        {planes.map((p) => (
                          <li key={p.id} className="item">
                            <div className="item-body">
                              <p className="item-title">{p.name} {p.current && <Badge tone="volt">Tu plan</Badge>}</p>
                              <p className="item-sub">{loQueTrae(p)}</p>
                              {p.description && <p className="item-sub">{p.description}</p>}
                              {BigInt(p.signupFeeCents) > 0n && <p className="item-sub">Inscripción de {pesos(p.signupFeeCents)} aparte; en recepción te dicen si te toca.</p>}
                            </div>
                            <p className="amount precio-monto">{pesos(p.priceCents)}</p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </Section>
                );
              })}

              {o.classes.length > 0 && (
                <Section title="Clases sueltas">
                  <div className="card" data-testid="precios-clases">
                    <ul className="list">
                      {o.classes.map((c) => (
                        <li key={c.id} className="item">
                          <div className="item-body">
                            <p className="item-title">{c.name}</p>
                            <p className="item-sub">Por clase, si tu plan no la incluye</p>
                          </div>
                          <p className="amount precio-monto">{pesos(c.dropInPriceCents)}</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                </Section>
              )}

              {nada
                ? <p className="small muted mt-16" data-testid="precios-vacio">Tu gimnasio no tiene precios publicados para {o.branchName ? `la sucursal ${o.branchName}` : 'tu sucursal'}. Pregunta en recepción.</p>
                : (
                  <p className="tiny muted mt-16" data-testid="precios-de-lista">
                    Precios de lista{o.branchName ? ` en la sucursal ${o.branchName}` : ''}. Las promociones y los descuentos de estudiante o de familia no aparecen aquí: se aplican en recepción.
                  </p>
                )}
            </>
          );
        }}
      </EstadoCarga>
    </>
  );
}
