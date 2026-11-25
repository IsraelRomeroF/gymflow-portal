'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, CreditCard, Store, Tag } from 'lucide-react';
import { api } from '@/lib/api';
import { concepto, dia, hace, hoyEn, pesos } from '@gymflow/ui/format';
import { Movimientos, textoProximoPago } from '@/components/movimientos';
import { useSocio } from '@/components/socio';
import { Button, Callout, ErrorCarga, IconTile, Section, Sheet, Skeleton } from '@/components/ui';
import type { PortalCharge, PortalChargesPage, PortalPayment, PortalPaymentsPage, PortalStatement } from '@gymflow/core/contracts';

type Metodo = {
  id: string; brand: string | null; last4: string | null;
  expMonth: number | null; expYear: number | null;
  isDefault: boolean; status: 'ACTIVE' | 'EXPIRED' | 'REVOKED';
};
/** El estado de cuenta del socio: contrato del núcleo (`GET /portal/statement`), por páginas (4-15). */
type Cargo = PortalCharge;
type Statement = PortalStatement;

const MARCA: Record<string, string> = { visa: 'Visa', mastercard: 'Mastercard', amex: 'American Express' };

/**
 * Pagos desde el teléfono del socio.
 *
 * Aquí NO se ofrece domiciliar (25-02, D25-01): nadie cobra solo el día de
 * corte todavía, y el socio que domiciliaba caía en mora creyendo que ya
 * pagaba solo. Vuelve con el cobro automático (`payments.charge-due`). Se
 * paga una vez, con la tarjeta capturada en el procesador (prohibido que
 * recepción teclee tarjetas); quien ya tenía una guardada la sigue viendo y
 * la puede quitar.
 *
 * SIN PROCESADOR (el uso real hoy, D-34): la pantalla sigue sirviendo. Dice
 * cuánto debe y de qué, «Paga en recepción» con su número de socio a la
 * vista, y cada pago ya hecho abre su comprobante (bloque 2.8 · 25-14).
 */
export default function PagosPage() {
  const { me, reload, toast } = useSocio();
  const [metodos, setMetodos] = useState<Metodo[] | null>(null);
  const [st, setSt] = useState<Statement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ tone: 'warn' | 'info'; text: string } | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  // Sin tarjeta guardada se paga «solo esta vez», en una hoja que dice cuánto y qué.
  const [hoja, setHoja] = useState<Cargo | null>(null);
  // Quitar la tarjeta no se deshace desde aquí: se confirma en su hoja (25-21).
  const [porQuitar, setPorQuitar] = useState<Metodo | null>(null);

  // «Ver más»: antes se veían 20 movimientos de los 24 que mandaba la API y no había cómo ver el resto.
  const [mas, setMas] = useState<{ charges: PortalCharge[]; payments: PortalPayment[]; cargos: string | null; pagos: string | null } | null>(null);
  const [pidiendoMas, setPidiendoMas] = useState(false);

  const cargar = useCallback(async () => {
    setError(null);
    try {
      const [m, s] = await Promise.all([
        api<{ methods: Metodo[] }>('/portal/payment-methods'),
        api<Statement>('/portal/statement'),
      ]);
      setMetodos(m.methods);
      setSt(s);
      setMas(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    }
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  async function capturarTarjeta(): Promise<string> {
    // Aquí el socio captura su tarjeta EN EL PROCESADOR. Si es formulario
    // embebido o redirección completa lo decide la respuesta del procesador
    // (P4); mientras tanto corre contra la caja de arena (ADR-031).
    const setup = await api<{ setupId: string }>('/portal/payment-methods/setup', {
      method: 'POST', body: JSON.stringify({ returnUrl: `${window.location.origin}/pagos` }),
    });
    return setup.setupId;
  }

  async function cancelar(id: string) {
    setOcupado(id);
    try {
      await api(`/portal/payment-methods/${id}`, { method: 'DELETE' });
      toast('Tarjeta quitada. Puedes seguir pagando aquí o en recepción.');
      setPorQuitar(null);
      await cargar();
    } catch (e) {
      setPorQuitar(null);
      setAviso({ tone: 'warn', text: e instanceof Error ? e.message : 'No se pudo quitar la tarjeta' });
    } finally {
      setOcupado(null);
    }
  }

  async function pagar(cargo: Cargo, modo: 'guardada' | 'una-vez' = 'guardada') {
    setOcupado(cargo.id);
    setAviso(null);
    try {
      const setupId = modo === 'una-vez' ? await capturarTarjeta() : undefined;
      setHoja(null);
      const r = await api<{ status: string }>(`/portal/charges/${cargo.id}/pay`, {
        method: 'POST', body: JSON.stringify({ returnUrl: `${window.location.origin}/pagos`, ...(setupId ? { setupId } : {}) }),
      });
      if (r.status === 'SUCCEEDED') toast(`Pago de ${pesos(cargo.balanceCents)} aplicado. ¡Gracias!`);
      else setAviso({
        tone: 'info',
        text: r.status === 'REQUIRES_ACTION'
          ? 'Tu banco pide confirmar el cargo. Sigue las instrucciones de tu app bancaria.'
          : 'El cargo quedó pendiente de confirmación. No lo intentes de nuevo: revisa aquí en unos minutos; también te llega un aviso en la campana.',
      });
      await Promise.all([cargar(), reload()]);
    } catch (e) {
      setAviso({ tone: 'warn', text: e instanceof Error ? e.message : 'No se pudo cobrar' });
    } finally {
      setOcupado(null);
    }
  }

  async function verMas() {
    if (!st) return;
    const cargos = mas ? mas.cargos : st.pages.charges.nextCursor;
    const pagos = mas ? mas.pagos : st.pages.payments.nextCursor;
    setPidiendoMas(true);
    try {
      const [c, p] = await Promise.all([
        cargos ? api<PortalChargesPage>(`/portal/statement/charges?cursor=${encodeURIComponent(cargos)}`) : null,
        pagos ? api<PortalPaymentsPage>(`/portal/statement/payments?cursor=${encodeURIComponent(pagos)}`) : null,
      ]);
      setMas((a) => ({
        charges: [...(a?.charges ?? []), ...(c?.items ?? [])], payments: [...(a?.payments ?? []), ...(p?.items ?? [])],
        cargos: c ? c.nextCursor : null, pagos: p ? p.nextCursor : null,
      }));
    } catch (e) {
      setAviso({ tone: 'warn', text: e instanceof Error ? e.message : 'No se pudieron cargar más movimientos' });
    } finally {
      setPidiendoMas(false);
    }
  }

  if (error) return <ErrorCarga titulo="No pudimos cargar tus pagos" mensaje={error} onReintentar={() => void cargar()} />;
  if (!metodos || !st) return <div className="stack mt-8"><Skeleton h={130} r={22} /><Skeleton h={90} /><Skeleton h={150} /></div>;

  const activos = metodos.filter((m) => m.status === 'ACTIVE');
  // Sin procesador conectado no hay pago aquí: se paga en recepción.
  const enLinea = me.features.onlinePayments;
  const pendientes = st.charges.filter((c) => BigInt(c.balanceCents) > 0n);
  // Lo que debe llega también con la primera respuesta aunque sea viejo: al juntar páginas no se repite.
  const sinRepetir = <T extends { id: string }>(xs: T[]) => [...new Map(xs.map((x) => [x.id, x])).values()];
  const todosLosCargos = sinRepetir([...st.charges, ...(mas?.charges ?? [])]);
  const todosLosPagos = sinRepetir([...st.payments, ...(mas?.payments ?? [])]);
  const hayMas = mas ? !!(mas.cargos || mas.pagos) : st.pages.charges.hasMore || st.pages.payments.hasMore;
  const totalMovimientos = st.pages.charges.total + st.pages.payments.total;
  const debe = BigInt(st.netBalanceCents) > 0n;
  // En mora o suspendida sin un cargo a la vista (lo quitó una corrección, o viene de una importación): también se resuelve en recepción.
  const sinAcceso = me.membershipStatus === 'PAST_DUE' || me.membershipStatus === 'SUSPENDED';

  return (
    <>
      <h1 className="title pagina-titulo">Pagos</h1>

      <div className={`card card-pad${debe ? ' card-debe' : ''}`}>
        <p className="small muted">{debe ? 'Tienes pendiente' : 'Tu saldo'}</p>
        <p className={`big-stat num mt-6${debe ? ' text-danger' : ''}`}>
          {debe ? pesos(st.netBalanceCents) : 'Al corriente'}
        </p>
        <p className="tiny muted mt-8">
          Actualizado {hace(st.computedAt)}
          {BigInt(st.creditCents) > 0n ? ` · a tu favor ${pesos(st.creditCents)}` : ''}
        </p>
        {/* Hasta dónde PAGÓ, no el fin del periodo (auditoría 8, 3-01). */}
        {me.paidThrough && <p className="small mt-8" data-testid="pagado-hasta">Tu membresía está pagada hasta el <strong>{dia(me.paidThrough, { day: 'numeric', month: 'long', year: 'numeric' })}</strong>.</p>}
        {!debe && me.nextPayment && (() => { const p = textoProximoPago(me.nextPayment); return <p className="small mt-10" data-testid="proximo-pago">Próximo pago: <strong className="num">{p.monto}</strong> · {p.cuando}</p>; })()}
      </div>

      {/* Sin procesador no hay botón que no sirva: dónde se paga y con qué número lo buscan (D-34). */}
      {!enLinea && (debe || !!me.nextPayment || sinAcceso) && (
        <div className="card card-pad mt-12 paga-en-recepcion" data-testid="paga-en-recepcion">
          <div className="row items-start">
            <IconTile tone={debe || sinAcceso ? 'warn' : 'neutral'}><Store /></IconTile>
            <div className="flex-1">
              <p className="item-title">Paga en recepción</p>
              <p className="small muted mt-2">En efectivo, con tarjeta o por transferencia. {debe ? 'En cuanto se registre tu pago lo verás aquí y tu acceso se activa al momento.' : sinAcceso ? 'Tu membresía está detenida: en recepción te dicen cuánto es y te la reactivan.' : 'Aquí verás tu pago en cuanto se registre.'}</p>
            </div>
          </div>
          <div className="socio-numero">
            <span className="tiny muted">Di tu número de socio</span>
            <span className="mono socio-numero-codigo">{me.memberCode}</span>
          </div>
        </div>
      )}

      {/* Qué puede renovar o comprar y cuánto cuesta (D-35): solo se mira; se paga en recepción. */}
      <Link href="/pagos/precios" className="card item item-suelto mt-12" data-testid="ir-a-precios">
        <IconTile tone="volt"><Tag /></IconTile>
        <div className="item-body">
          <p className="item-title">Renovar o comprar</p>
          <p className="item-sub">Planes, paquetes de visitas y clases sueltas, con su precio de lista.</p>
        </div>
        <ChevronRight size={18} className="muted" />
      </Link>

      {aviso && <div className="mt-12"><Callout tone={aviso.tone}>{aviso.text}</Callout></div>}

      {pendientes.length > 0 && (
        <Section title="Por pagar">
          <div className="card">
            <ul className="list">
              {pendientes.map((c) => (
                <li key={c.id} className="item">
                  <div className="item-body">
                    <p className="item-title">{concepto(c.concept)}</p>
                    <p className="item-sub">{vencimiento(c.dueDate)}</p>
                  </div>
                  <div className="text-right">
                    <p className="amount">{pesos(c.balanceCents)}</p>
                    {enLinea && <Button size="sm" className="mt-6" loading={ocupado === c.id}
                      disabled={!!ocupado} onClick={() => (activos.some((m) => m.isDefault) ? void pagar(c) : setHoja(c))}>Pagar</Button>}
                  </div>
                </li>
              ))}
            </ul>
          </div>
          {enLinea && activos.length === 0 && <p className="tiny muted mt-8">Pagas con tu tarjeta solo esta vez: no se guarda. También puedes pagar en recepción.</p>}
        </Section>
      )}

      {/* Solo quien ya tenía una tarjeta guardada: se ve y se quita. No se cobra sola (25-02). */}
      {activos.length > 0 && <Section title="Tu tarjeta">
        <p className="tiny muted mb-8">No se cobra sola el día de corte: cuando te toque pagar, toca «Pagar» y se cobra a esta tarjeta.</p>
        {activos.map((m) => (
          <div key={m.id} className="member-card tarjeta-guardada">
            <div className="mc-top">
              <div>
                <div className="mc-gym">{m.isDefault ? 'Tarjeta guardada' : 'Tarjeta'}</div>
                <div className="mc-plan">{MARCA[m.brand ?? ''] ?? m.brand ?? 'Tarjeta'}</div>
              </div>
              <CreditCard size={26} className="mc-icon ok" />
            </div>
            <div className="between tarjeta-pie">
              <div>
                <div className="mono tarjeta-numero">•••• {m.last4}</div>
                <div className="mc-meta">Vence <strong>{String(m.expMonth).padStart(2, '0')}/{String(m.expYear).slice(-2)}</strong></div>
              </div>
              {/* Fácil de quitar (una baja difícil no retiene a nadie: produce un contracargo),
                  pero no en un toque: se confirma en su hoja (25-21). */}
              <button className="btn btn-sm btn-sobre-tinta" disabled={!!ocupado} onClick={() => setPorQuitar(m)}>Quitar tarjeta</button>
            </div>
          </div>
        ))}
      </Section>}

      <Sheet open={!!hoja} onClose={() => setHoja(null)} title={hoja ? `Pagar ${pesos(hoja.balanceCents)}` : 'Pagar'}>
        {hoja && (
          <div className="stack" data-testid="hoja-pago">
            <p className="small muted">{concepto(hoja.concept)}. Capturas tu tarjeta en el banco: el gimnasio no la ve. Se usa solo esta vez y no se guarda.</p>
            <Button block loading={ocupado === hoja.id} onClick={() => void pagar(hoja, 'una-vez')}>
              {`Pagar ${pesos(hoja.balanceCents)} solo esta vez`}
            </Button>
          </div>
        )}
      </Sheet>

      <Sheet open={!!porQuitar} onClose={() => setPorQuitar(null)} title="¿Quitar esta tarjeta?"
        footer={porQuitar && <>
          <Button variant="secondary" block onClick={() => setPorQuitar(null)}>No, dejarla</Button>
          <Button variant="danger" block loading={ocupado === porQuitar.id} onClick={() => void cancelar(porQuitar.id)}>Sí, quitarla</Button>
        </>}>
        {porQuitar && <p className="small">{MARCA[porQuitar.brand ?? ''] ?? porQuitar.brand ?? 'Tarjeta'} •••• {porQuitar.last4} deja de estar guardada. Para volver a pagar aquí la capturas otra vez; en recepción puedes pagar igual.</p>}
      </Sheet>

      <Section title="Movimientos">
        <div className="card"><Movimientos charges={todosLosCargos} payments={todosLosPagos} max={totalMovimientos} recibos /></div>
        {todosLosPagos.some((x) => x.hasReceipt) && <p className="tiny muted mt-8">Toca un pago para ver y descargar su comprobante.</p>}
        {hayMas && (
          <div className="mt-10" data-testid="ver-mas-movimientos">
            <p className="tiny muted mb-8">Se muestran {todosLosCargos.length + todosLosPagos.length} de {totalMovimientos} movimientos.</p>
            <Button block variant="secondary" loading={pidiendoMas} onClick={() => void verMas()}>Ver más movimientos</Button>
          </div>
        )}
      </Section>
    </>
  );
}

/** "Venció el" solo si ya pasó: a una cuota que vence mañana la asustaba de más. */
function vencimiento(dueDate: string): string {
  const d = dueDate.slice(0, 10);
  const hoy = hoyEn();
  return d < hoy ? `Venció el ${dia(d)}` : d === hoy ? 'Vence hoy' : `Vence el ${dia(d)}`;
}
