'use client';

import Link from 'next/link';
import { ChevronRight, CircleCheck, Receipt, Undo2 } from 'lucide-react';
import { concepto, dia, pesos } from '@gymflow/ui/format';
import { IconTile } from '@gymflow/ui/compartido';
import { COMO_SE_SALDO, METODO_DE_PAGO as METODO } from '@gymflow/core/vocabulario';
import type { PortalCharge, PortalPayment } from '@gymflow/core/contracts';

/** Lo que manda `GET /portal/statement` (contratos del núcleo); aquí basta con lo que se pinta. */
export type Cargo = Pick<PortalCharge, 'id' | 'concept' | 'amountCents' | 'balanceCents' | 'dueDate'> & { status?: string; settledBy?: PortalCharge['settledBy'] };
export type Pago = Pick<PortalPayment, 'id' | 'amountCents' | 'businessDate'> & { method: string; folio?: string | null; hasReceipt?: boolean };

// Cómo se pagó: el vocabulario del núcleo, la misma palabra que ve recepción (27-07).

/**
 * UNA sola lista de movimientos (UX5-P-05): lo que se le cobró y lo que pagó,
 * del más reciente al más viejo. Dos listas separadas ("Historial" y
 * "Cargos") obligaban a cruzarlas para saber qué pago cubrió qué.
 *
 * Con `recibos`, el pago que tiene comprobante se toca y lo abre (25-14):
 * «¿me das mi recibo?» ya no es una vuelta al mostrador.
 */
export function Movimientos({ charges, payments, max, recibos = false }: { charges: Cargo[]; payments: Pago[]; max: number; recibos?: boolean }) {
  const filas = [
    ...payments.map((p) => {
      const devolucion = BigInt(p.amountCents) < 0n;
      // Una nota de crédito no es un pago tuyo: es saldo a tu favor (lo que sobró al bajar de plan, por ejemplo).
      const aFavor = p.method === 'CREDIT_NOTE';
      return {
        id: `p-${p.id}`, fecha: p.businessDate,
        titulo: aFavor ? (devolucion ? 'Se quitó saldo a favor' : 'Saldo a favor (nota de crédito)') : devolucion ? 'Te devolvimos' : 'Pago recibido',
        sub: aFavor ? (p.folio ? `Folio ${p.folio}` : 'No es un pago: queda a tu favor')
          : `${METODO[p.method] ?? p.method}${p.folio ? ` · Folio ${p.folio}` : ''}`,
        monto: pesos(devolucion ? -BigInt(p.amountCents) : BigInt(p.amountCents)), tipo: devolucion ? 'devolucion' as const : 'pago' as const,
        recibo: recibos && p.hasReceipt ? p.id : null,
      };
    }),
    ...charges.map((c) => {
      // Un cargo anulado o condonado no se debe ni se pagó (PS-05): se dice tal cual.
      // Una cuota que se le perdonó tampoco se «pagó» (3-06): la API dice cómo quedó saldada
      // (`settledBy`) y aquí se usa la misma palabra que ve recepción. Una condonación total deja
      // el cargo PAID, así que mirar solo el estado decía «Pagado».
      const perdonado = c.settledBy === 'WAIVER' || c.status === 'WRITTEN_OFF';
      const cerrado = c.status === 'VOID' ? 'Anulado' : perdonado ? COMO_SE_SALDO.WAIVER!.socio : null;
      const pendiente = !cerrado && BigInt(c.balanceCents) > 0n;
      return {
        id: `c-${c.id}`, fecha: c.dueDate, titulo: concepto(c.concept),
        sub: cerrado ?? (pendiente ? 'Pendiente' : c.settledBy ? COMO_SE_SALDO[c.settledBy]?.socio ?? 'Pagado' : 'Pagado'), monto: pesos(c.amountCents),
        tipo: pendiente ? 'pendiente' as const : cerrado ? 'anulado' as const : 'cargo' as const,
        recibo: null as string | null,
      };
    }),
  ].sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, max);

  if (filas.length === 0) return <p className="card-pad small muted">Sin movimientos todavía.</p>;
  const COLOR = { pago: ' amount-ok', pendiente: ' amount-danger', anulado: ' amount-anulado', devolucion: '', cargo: '' } as const;
  return (
    <ul className="list" data-testid="movimientos">
      {filas.map((m) => {
        const cuerpo = (
          <>
            <IconTile tone={m.tipo === 'pago' ? 'ok' : 'neutral'}>
              {m.tipo === 'pago' ? <CircleCheck /> : m.tipo === 'devolucion' ? <Undo2 /> : <Receipt />}
            </IconTile>
            <div className="item-body">
              <p className="item-title item-title-base">{m.titulo}</p>
              <p className="item-sub">{dia(m.fecha, { day: 'numeric', month: 'short' })} · {m.sub}{m.recibo ? ' · Ver comprobante' : ''}</p>
            </div>
            <span className={`amount${COLOR[m.tipo]}`}>{m.tipo === 'pago' ? '+' : ''}{m.monto}</span>
            {m.recibo && <ChevronRight size={16} className="muted" aria-hidden />}
          </>
        );
        return m.recibo
          ? <li key={m.id}><Link href={`/pagos/recibo/${m.recibo}`} className="item item-link" data-testid="ver-comprobante">{cuerpo}</Link></li>
          : <li key={m.id} className="item">{cuerpo}</li>;
      })}
    </ul>
  );
}

/** "Próximo pago: $650 · miércoles 28 de octubre". */
export function textoProximoPago(n: { amountCents: string; date: string }): { monto: string; cuando: string } {
  return { monto: pesos(n.amountCents), cuando: dia(n.date, { weekday: 'long', day: 'numeric', month: 'long' }) };
}
