'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { CalendarCheck, CalendarX2, ChevronRight, MapPin, UserRound, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { capital, dia, hora } from '@/lib/format';
import { useSocio } from '@/components/socio';
import { Badge, Button, Callout, Empty, ErrorCarga, Sheet, Skeleton } from '@/components/ui';
import { useCarga } from '@/lib/carga';

type Clase = {
  id: string;
  className: string | null;
  /** Quién la imparte (2026-10-09). */
  coachName?: string | null;
  room: string | null;
  branchId?: string;
  branchName?: string | null;
  startsAt: string;
  endsAt: string;
  spotsLeft: number;
  booked: boolean;
  bookingId: string | null;
  canBook: boolean;
  reason: string | null;
  requiresPayment: boolean;
  priceLabel: string | null;
  warnings: string[];
};

/** Por qué no se puede reservar, dicho como se lo diría una persona. */
const MOTIVO: Record<string, string> = {
  CLASS_FULL: 'Sin lugares',
  ALREADY_BOOKED: 'Ya tienes lugar',
  BOOKING_WINDOW_NOT_OPEN: 'Aún no se abre',
  MEMBERSHIP_NOT_VALID_AT_CLASS_TIME: 'Tu plan no llega a esa fecha',
  MEMBERSHIP_FROZEN: 'Tu plan está congelado',
  NO_MEMBERSHIP: 'Sin plan vigente',
  BRANCH_NOT_ALLOWED: 'Tu plan no incluye esta sucursal',
  BLOCKED_BY_NO_SHOWS: 'Reservas bloqueadas por faltas',
  MEMBER_ARCHIVED: 'Cuenta dada de baja',
};

const claveDia = (iso: string) => new Date(iso).toLocaleDateString('en-CA');

/**
 * Hasta cuántos minutos antes se cancela sin que cuente como falta: el mismo
 * valor que `DEFAULT_BOOKING_SETTINGS.cancelCutoffMinutes` del núcleo, que es
 * el que aplica la API. Si un día cambia allá, cambia aquí (11-10).
 */
const CANCELAR_SIN_FALTA_MIN = 120;

/** Lo que pasa si cancela ahora, dicho ANTES de cancelar (11-10). */
function consecuencia(c: { startsAt: string }, pago: Inscripcion['payment'] | null, ahora = Date.now()): { aTiempo: boolean; texto: string } {
  const minutos = Math.max(0, Math.round((new Date(c.startsAt).getTime() - ahora) / 60000));
  if (minutos >= CANCELAR_SIN_FALTA_MIN) {
    return {
      aTiempo: true,
      texto: `Aún estás a tiempo: no cuenta como falta.${pago === 'PENDING' ? ' El cargo de la clase suelta se anula.' : pago === 'PAID' ? ' Ya la pagaste: pregunta en recepción si se te devuelve o queda a tu favor.' : ''}`,
    };
  }
  const cuanto = minutos >= 60 ? `${Math.floor(minutos / 60)} h ${minutos % 60} min` : `${minutos} min`;
  return {
    aTiempo: false,
    texto: `Faltan ${cuanto}: si cancelas ahora, cuenta como falta.${pago === 'PENDING' ? ' La clase suelta se cobra igual.' : pago === 'PAID' ? ' La clase suelta pagada no se devuelve.' : ''} Tu lugar queda libre para alguien más.`,
  };
}

/** Una clase en la que ya está inscrito: por el portal o porque recepción lo inscribió. */
type Inscripcion = {
  id: string; classScheduleId: string; className: string | null; coachName: string | null;
  branchName: string | null; room: string | null; startsAt: string; endsAt: string;
  status: string; payment: 'INCLUDED' | 'PAID' | 'PENDING';
};
const PAGO: Record<Inscripcion['payment'], { label: string; tone: 'ok' | 'warn' | 'volt' }> = {
  INCLUDED: { label: 'Incluida en tu plan', tone: 'ok' },
  PAID: { label: 'Clase suelta pagada', tone: 'ok' },
  PENDING: { label: 'Por pagar en recepción', tone: 'warn' },
};

/**
 * Clases. Un día a la vez, elegido arriba con el pulgar: la lista entera de
 * la semana obliga a desplazar para encontrar el martes.
 */
export default function ClasesPage() {
  const { me, toast } = useSocio();

  const [ocupado, setOcupado] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  // Cancelar se confirma diciendo qué pasa: falta o no, y qué pasa con la clase suelta (11-10).
  const [confirmar, setConfirmar] = useState<Clase | null>(null);
  const [diaSel, setDiaSel] = useState<string | null>(null);
  // Cada clase es de una sucursal. Se empieza por la suya; las demás, a un toque.
  const [sedeSel, setSedeSel] = useState<string | null>(null);

  // El horario y sus reservas, cada uno con sus tres estados (26-01): si sus
  // reservas no responden, ya no desaparecen en silencio como si no tuviera.
  const horario = useCarga(useCallback(() => api<{ classes: Clase[]; blockedUntil?: string | null }>('/portal/classes'), []));
  const clases = horario.datos?.classes ?? null;
  // Bloqueado por faltas: hasta cuándo (11-08, bloque 2.5). Antes solo decía «bloqueadas por faltas» en cada clase.
  const bloqueadoHasta = horario.datos?.blockedUntil ?? null;
  const error = horario.error;
  // Sus clases por venir (2026-10-09): también las que le apartó recepción.
  const reservas = useCarga(useCallback(() => api<{ bookings: Inscripcion[] }>('/portal/bookings')
    .then((b) => b.bookings.filter((x) => x.status === 'BOOKED' && new Date(x.endsAt).getTime() > Date.now())), []));
  const mias = reservas.datos ?? null;
  const recargarHorario = horario.recargar;
  const recargarReservas = reservas.recargar;
  const cargar = useCallback(async () => { await Promise.all([recargarHorario(), recargarReservas()]); }, [recargarHorario, recargarReservas]);

  const sedes = useMemo(() => [...new Set((clases ?? []).map((c) => c.branchName).filter((x): x is string => !!x))], [clases]);
  const sede = sedeSel ?? (me.homeBranchName && sedes.includes(me.homeBranchName) ? me.homeBranchName : sedes[0] ?? null);
  const visibles = useMemo(() => (clases ?? []).filter((c) => sedes.length < 2 || !sede || c.branchName === sede), [clases, sedes, sede]);

  const dias = useMemo(() => {
    const m = new Map<string, Clase[]>();
    for (const c of visibles) m.set(claveDia(c.startsAt), [...(m.get(claveDia(c.startsAt)) ?? []), c]);
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [visibles]);

  // Sin membresía al corriente, "Sin plan vigente" en cada clase no le dice
  // qué hacer: se le dice una vez arriba y se le lleva a pagar (UX4-23).
  const debeMembresia = me.membershipStatus === 'PAST_DUE' || me.membershipStatus === 'SUSPENDED' || me.membershipStatus === 'PENDING';
  const porAdeudo = debeMembresia && (clases ?? []).some((c) => !c.booked && !c.canBook && (c.reason === 'NO_MEMBERSHIP' || c.reason === 'MEMBERSHIP_NOT_VALID_AT_CLASS_TIME'));
  const seleccionado = diaSel ?? dias[0]?.[0] ?? null;
  const delDia = dias.find(([k]) => k === seleccionado)?.[1] ?? [];

  async function reservar(clase: Clase) {
    setOcupado(clase.id);
    setAviso(null);
    try {
      const r = await api<{ warnings: string[] }>(`/portal/classes/${clase.id}/book`, { method: 'POST', body: '{}' });
      // El aviso de adeudo va DESPUÉS de reservar, no en lugar de reservar:
      // enterarse aquí es lo que le da tiempo de pagar antes de la clase.
      if (r.warnings.includes('WILL_BE_DENIED_AT_DOOR')) {
        setAviso('Tu lugar está apartado, pero con adeudo no podrás entrar. Ponte al corriente en Pagos antes de la clase.');
      } else {
        // Una clase con costo NO se cobra aquí: queda el cargo para pagar en recepción (UX5-P-02).
        toast(clase.requiresPayment && clase.priceLabel
          ? `Listo, tienes lugar en ${clase.className ?? 'la clase'}. Paga ${clase.priceLabel} en recepción antes de la clase.`
          : `Listo, tienes lugar en ${clase.className ?? 'la clase'}.`);
      }
      await cargar();
    } catch (e) {
      setAviso(e instanceof Error ? e.message : 'No se pudo reservar');
      await cargar();
    } finally {
      setOcupado(null);
    }
  }

  async function cancelar(clase: Clase) {
    if (!clase.bookingId) return;
    setOcupado(clase.id);
    setAviso(null);
    setConfirmar(null);
    try {
      const r = await api<{ note: string | null; chargeVoided?: boolean; paidChargeKept?: boolean; lateChargeKept?: boolean }>(`/portal/bookings/${clase.bookingId}/cancel`, { method: 'POST', body: '{}' });
      if (r.lateChargeKept) setAviso('Cancelaste fuera de plazo: cuenta como falta y la clase suelta no se devuelve. Tu lugar quedó libre para alguien más.');
      else if (r.note) setAviso(r.note);
      else toast(r.chargeVoided ? 'Reserva cancelada. Se anuló el cargo de la clase suelta.'
        : r.paidChargeKept ? 'Reserva cancelada. Ya la habías pagado: pregunta en recepción si se te devuelve o queda a tu favor.'
          : 'Reserva cancelada. Tu lugar quedó libre para alguien más.');
      await cargar();
    } catch (e) {
      setAviso(e instanceof Error ? e.message : 'No se pudo cancelar');
    } finally {
      setOcupado(null);
    }
  }

  return (
    <>
      <h1 className="title" style={{ margin: '4px 0 16px' }}>Clases</h1>

      {error && <ErrorCarga titulo="No pudimos cargar las clases" mensaje={error} onReintentar={() => void cargar()} />}
      {porAdeudo && (
        <div className="mb-14">
          <Callout tone="warn" title="Ponte al corriente para reservar">
            <p className="small">Con tu pago pendiente no puedes apartar lugar. En cuanto pagues, reservas desde aquí.</p>
            <Link href="/pagos" className="btn btn-sm btn-primary mt-10" data-testid="ir-a-pagos">Ir a Pagos <ChevronRight size={15} /></Link>
          </Callout>
        </div>
      )}
      {bloqueadoHasta && (
        <div className="mb-14" data-testid="bloqueo-por-faltas">
          <Callout tone="warn" title={`Puedes volver a reservar el ${dia(bloqueadoHasta, { day: 'numeric', month: 'long' })}`}>
            <p className="small">Tus reservas están en pausa por faltas a clases que tenías apartadas. No es un cargo, y los lugares que ya tienes siguen siendo tuyos.</p>
          </Callout>
        </div>
      )}
      {!clases && !error && <div className="stack"><Skeleton h={78} /><Skeleton h={96} /><Skeleton h={96} /></div>}

      {reservas.error && (
        <div className="mb-20"><ErrorCarga titulo="No pudimos cargar tus reservas" mensaje={reservas.error} onReintentar={() => void recargarReservas()} /></div>
      )}
      {mias && mias.length > 0 && (
        <section className="mb-20" data-testid="mis-clases">
          <p className="section-title eyebrow" style={{ margin: '0 0 10px' }}>Mis clases</p>
          <div className="stack-sm">
            {mias.map((x) => {
              const pago = PAGO[x.payment];
              return (
                <div key={x.id} className="card mi-clase">
                  <CalendarCheck size={20} className="mi-clase-icono" aria-hidden />
                  <div className="flex-1">
                    <div className="between items-start gap-8">
                      <p className="class-name">{x.className ?? 'Clase'}</p>
                      <Badge tone={pago.tone}>{pago.label}</Badge>
                    </div>
                    <p className="small mt-4">{capital(dia(x.startsAt, { weekday: 'long', day: 'numeric', month: 'long' }))} · {hora(x.startsAt)}</p>
                    <div className="row tiny muted gap-12 mt-4 flex-wrap">
                      <span className="row gap-4"><UserRound size={13} />{x.coachName ? `Con ${x.coachName}` : 'Coach por confirmar'}</span>
                      <span className="row gap-4"><MapPin size={13} />{[x.branchName, x.room].filter(Boolean).join(' · ') || 'Sucursal'}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {clases && dias.length === 0 && (
        <div className="card"><Empty icon={<CalendarX2 />} title="Sin clases esta semana" text="Cuando tu sucursal publique su horario, aparecerá aquí." /></div>
      )}

      {sedes.length > 1 && (
        <div className="row gap-8 flex-wrap mb-12" role="group" aria-label="Sucursal">
          {sedes.map((x) => (
            <button key={x} type="button" className="chip" aria-pressed={x === sede} onClick={() => { setSedeSel(x); setDiaSel(null); }}>
              {x}{x === me.homeBranchName ? ' · tu sucursal' : ''}
            </button>
          ))}
        </div>
      )}

      {dias.length > 0 && (
        <div className="days" role="group" aria-label="Día">
          {dias.map(([k, cs]) => {
            const d = new Date(`${k}T12:00:00`);
            return (
              <button key={k} className="day" aria-pressed={k === seleccionado} onClick={() => setDiaSel(k)}>
                <div className="day-name">{dia(k, { weekday: 'short' }).replace('.', '')}</div>
                <div className="day-num">{d.getDate()}</div>
                {cs.some((c) => c.booked) && <div className="day-dot" />}
              </button>
            );
          })}
        </div>
      )}

      {seleccionado && (
        <p className="section-title eyebrow" style={{ margin: '18px 0 10px' }}>
          {capital(dia(seleccionado, { weekday: 'long', day: 'numeric', month: 'long' }))}
        </p>
      )}

      {aviso && <div className="mb-12"><Callout tone="warn">{aviso}</Callout></div>}

      <div className="stack">
        {delDia.map((c) => {
          const minutos = Math.round((new Date(c.endsAt).getTime() - new Date(c.startsAt).getTime()) / 60000);
          const pocos = c.spotsLeft > 0 && c.spotsLeft <= 3;
          return (
            <div key={c.id} className="card class-card" style={c.booked ? { borderColor: 'var(--volt-strong)', boxShadow: '0 0 0 1px var(--volt-strong)' } : undefined}>
              <div className="class-time">
                <div className="class-hour num">{hora(c.startsAt)}</div>
                <div className="class-dur">{minutos} min</div>
              </div>
              <div className="class-body">
                <div className="between items-start">
                  <p className="class-name">{c.className ?? 'Clase'}</p>
                  {c.booked && <Badge tone="volt">Tu lugar</Badge>}
                </div>
                <div className="row tiny muted gap-12 mt-4 flex-wrap">
                  {c.coachName && <span className="row gap-4"><UserRound size={13} />{c.coachName}</span>}
                  <span className="row gap-4"><MapPin size={13} />{[sedes.length > 1 ? c.branchName : null, c.room].filter(Boolean).join(' · ') || 'Sucursal'}</span>
                  <span className="row" style={{ gap: 4, color: pocos ? 'var(--warn)' : undefined, fontWeight: pocos ? 700 : undefined }}>
                    <Users size={13} />
                    {c.spotsLeft > 0 ? `${c.spotsLeft} ${c.spotsLeft === 1 ? 'lugar' : 'lugares'}` : 'Llena'}
                  </span>
                  {c.requiresPayment && c.priceLabel && <span className="text-warn">{c.warnings.includes('DROP_IN_ONLY') ? 'Clase suelta' : 'No incluida en tu plan'} · {c.priceLabel}</span>}
                </div>
                <div className="mt-12">
                  {c.booked ? (
                    <Button variant="danger" size="sm" loading={ocupado === c.id} disabled={!!ocupado} onClick={() => setConfirmar(c)}>Cancelar reserva</Button>
                  ) : c.canBook ? (
                    <Button size="sm" variant={c.requiresPayment ? 'secondary' : 'primary'} loading={ocupado === c.id} onClick={() => void reservar(c)}>
                      {c.requiresPayment && c.priceLabel ? `Reservar · se paga en recepción` : 'Reservar'}
                    </Button>
                  ) : (
                    // Nunca un botón apagado sin explicación: un "no" mudo manda
                    // al socio al mostrador, que es lo que el portal evita.
                    debeMembresia && (c.reason === 'NO_MEMBERSHIP' || c.reason === 'MEMBERSHIP_NOT_VALID_AT_CLASS_TIME')
                      ? <Link href="/pagos" className="small strong" style={{ textDecoration: 'underline' }}>Ponte al corriente para reservar</Link>
                      : <span className="small muted">{MOTIVO[c.reason ?? ''] ?? 'No disponible'}</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <Sheet open={!!confirmar} onClose={() => setConfirmar(null)} title="¿Cancelar tu lugar?">
        {confirmar && (() => {
          const pago = mias?.find((x) => x.classScheduleId === confirmar.id)?.payment ?? null;
          const r = consecuencia(confirmar, pago);
          return (
            <div className="stack" data-testid="confirmar-cancelar">
              <p className="small"><strong>{confirmar.className ?? 'Clase'}</strong> · {capital(dia(confirmar.startsAt, { weekday: 'long', day: 'numeric', month: 'long' }))} a las {hora(confirmar.startsAt)}</p>
              <Callout tone={r.aTiempo ? 'info' : 'warn'}>{r.texto}</Callout>
              <div className="row gap-10">
                <Button variant="secondary" block onClick={() => setConfirmar(null)}>No, conservar mi lugar</Button>
                <Button variant="danger" block loading={ocupado === confirmar.id} onClick={() => void cancelar(confirmar)}>Sí, cancelar</Button>
              </div>
            </div>
          );
        })()}
      </Sheet>
    </>
  );
}
