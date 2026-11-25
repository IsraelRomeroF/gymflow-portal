'use client';

import { useCallback } from 'react';
import Link from 'next/link';
import {
  ScanFace, Fingerprint, ConciergeBell, CalendarPlus, CalendarCheck, ChevronRight,
  Flame, BadgeCheck, ShieldCheck, Clock, Ban, Snowflake, Lock, Ticket, WifiOff,
} from 'lucide-react';
import type { PortalAttendanceSummary, PortalConsents, PortalStatement } from '@gymflow/core/contracts';
import { api } from '@/lib/api';
import { estadoDeHoy, haceCuanto, lineaDelPaquete } from '@/lib/acceso';
import { capital, dia, hace, haceTanto, hora, nombreMes, pesos } from '@gymflow/ui/format';
import { Movimientos, textoProximoPago } from '@/components/movimientos';
import { useSocio } from '@/components/socio';
import { InstalarApp } from '@/components/instalar';
import { Badge, Callout, ErrorCarga, Section, Skeleton } from '@/components/ui';
import { IconTile } from '@gymflow/ui/compartido';
import { useCarga } from '@gymflow/ui/carga';

type Clase = { id: string; className: string | null; room: string | null; startsAt: string; booked: boolean; coachName?: string | null };

const ICONO = {
  ok: <ShieldCheck className="mc-icon ok" />,
  warn: <Clock className="mc-icon warn" />,
  danger: <Ban className="mc-icon danger" />,
  info: <Snowflake className="mc-icon info" />,
} as const;

/**
 * Inicio del socio.
 *
 * En la primera pantalla, lo que de verdad quiere saber: si hoy entra, cómo
 * entra, cuándo es su próxima clase y si debe algo. «¿Puedo entrar hoy?» lo
 * contesta la API con la regla de la puerta (27-04): aquí solo se le pone la
 * frase (`lib/acceso.ts`). El saldo lleva «actualizado hace X» y, sin señal,
 * la tarjeta dice de cuándo son sus datos (25-18).
 */
export default function InicioPage() {
  const { me, ofreceClases, guardadoEn } = useSocio();
  // Cada bloque con sus tres estados (26-01): sin red ya no es «0 visitas»
  // ni «Sin clases reservadas»; se dice y se reintenta.
  const saldo = useCarga(useCallback(() => api<PortalStatement>('/portal/statement'), []));
  const st = saldo.datos ?? null;
  const proxima = useCarga(useCallback(() => api<{ classes: Clase[] }>('/portal/classes')
    .then((r) => r.classes.filter((c) => c.booked && new Date(c.startsAt) > new Date())
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0] ?? null), []));
  const clase = proxima.datos;
  // Las visitas del mes las cuenta la API por días de operación del gimnasio (27-05): la misma cifra que en Asistencia.
  const asistencia = useCarga(useCallback(() => api<PortalAttendanceSummary>('/portal/attendance/summary'), []));
  const visitasMes = asistencia.datos?.daysThisMonth ?? null;
  // Su firma del uso del rostro es de un texto anterior al vigente (6-03, 21-09): se vuelve a firmar en recepción.
  const conRostro = me.accessMethods.length > 0;
  const firmas = useCarga(useCallback(() => (conRostro
    ? api<PortalConsents>('/portal/consents').then((r) => r.consents)
    : Promise.resolve([] as PortalConsents['consents'])), [conRostro]));
  const porFirmar = firmas.datos?.find((c) => c.consentType === 'BIOMETRIC' && c.needsResign) ?? null;

  const nombre = me.fullName.split(' ')[0];
  const debe = st ? BigInt(st.netBalanceCents) > 0n : false;
  const enLinea = me.features.onlinePayments;
  const puedeEntrar = me.canEnter;
  const palabras = {
    fechaLarga: (iso: string) => dia(iso, { weekday: 'long', day: 'numeric', month: 'long' }),
    fechaCorta: (iso: string) => dia(iso, { day: 'numeric', month: 'short' }),
    deuda: debe && st ? pesos(st.netBalanceCents) : null,
    enLinea,
  };
  const estadoHoy = estadoDeHoy(me, palabras);
  const paquete = lineaDelPaquete(me, palabras);
  const hoy = capital(dia(new Date(), { weekday: 'long', day: 'numeric', month: 'long' }));
  const mes = asistencia.datos ? nombreMes(asistencia.datos.today.slice(0, 7)).split(' ')[0]!.toLowerCase() : dia(new Date(), { month: 'long' });

  const proximo = !debe && me.nextPayment ? textoProximoPago(me.nextPayment) : null;
  const sedeDeLaTarjeta = me.homeBranchName ?? me.accessBranchName;

  return (
    <>
      <p className="hello">{hoy}</p>
      <h1 className="title mb-16">Hola, {nombre}</h1>

      {/* Teléfono: una columna. Tableta y escritorio: dos (25, «Inicio en tableta»). */}
      <div className="inicio">
        <div className="inicio-col">
          {/* La tarjeta contesta primero "¿puedo entrar hoy?" (UX5-P-01), con la respuesta de la puerta. */}
          <div className="member-card" data-estado={puedeEntrar ? 'ok' : 'no'} data-testid="tarjeta-hoy">
            <div className="mc-gym">{me.planName ?? me.planEnded?.planName ?? (me.visitPack ? 'Paquete de visitas' : me.dayPass ? 'Pase del día' : me.trialPass ? 'Pase de prueba' : 'Sin plan')}{sedeDeLaTarjeta ? ` · ${sedeDeLaTarjeta}` : ''}</div>
            <div className="mc-status">
              {ICONO[estadoHoy.tono]}
              <span>{estadoHoy.titulo}</span>
            </div>
            <p className="mc-detalle">{estadoHoy.detalle}</p>
            {guardadoEn !== null && (
              <p className="mc-copia" data-testid="datos-de-copia"><WifiOff aria-hidden /> Datos de {haceCuanto(guardadoEn)} · sin señal. Puede haber cambiado.</p>
            )}
            {debe && st && <Link href="/pagos" className="btn btn-volt btn-sm mt-12">{enLinea ? `Pagar ${pesos(st.netBalanceCents)}` : `Ver cómo pagar ${pesos(st.netBalanceCents)}`}</Link>}
            {/* Sin plan vivo: qué hay y cuánto cuesta, para llegar al mostrador sabiéndolo (D-35; se paga en recepción). */}
            {!debe && !me.membershipStatus && !me.dayPass && !me.trialPass && <Link href="/pagos/precios" className="btn btn-volt btn-sm mt-12" data-testid="ver-precios">Ver planes y precios</Link>}
            {paquete && <p className="mc-proximo" data-testid="paquete">{paquete}</p>}
            {proximo && <p className="mc-proximo" data-testid="proximo-pago">Próximo pago: <strong className="num">{proximo.monto}</strong> · {proximo.cuando}</p>}
            <div className="mc-meta">
              <span>{me.fullName}</span>
              <span className="mono nowrap">{me.memberCode}</span>
              <span>Socio {((t) => (t === 'hoy' ? 'desde hoy' : t))(haceTanto(me.tenureDays))}</span>
            </div>
          </div>

          <Section title="Cómo entras">
            <div className="card">
              <ul className="list">
                {/* Hoy trae pase del día (1.8): vale hoy y en esa sede, tenga o no rostro registrado. */}
                {me.dayPass && (
                  <li className="item" data-testid="pase-de-hoy">
                    <IconTile tone="ok"><Ticket /></IconTile>
                    <div className="item-body">
                      <p className="item-title">Hoy traes pase del día</p>
                      <p className="item-sub">Vale solo hoy y solo en {me.dayPass.branchName}. Di tu nombre en recepción.</p>
                    </div>
                    <BadgeCheck size={20} className="text-ok" />
                  </li>
                )}
                {/* Hoy trae pase de prueba (D-08): gratis, una vez, hoy y en esa sede. */}
                {me.trialPass && (
                  <li className="item" data-testid="pase-de-prueba">
                    <IconTile tone="ok"><Ticket /></IconTile>
                    <div className="item-body">
                      <p className="item-title">Hoy traes pase de prueba</p>
                      <p className="item-sub">Es gratis y vale solo hoy y solo en {me.trialPass.branchName}. Di tu nombre en recepción.</p>
                    </div>
                    <BadgeCheck size={20} className="text-ok" />
                  </li>
                )}
                {me.accessMethods.map((m) => (
                  <li key={`${m.modality}-${m.branchName}`} className="item">
                    <IconTile tone={puedeEntrar ? 'ok' : 'neutral'}>
                      {m.modality === 'FACE' ? <ScanFace /> : <Fingerprint />}
                    </IconTile>
                    <div className="item-body">
                      <p className="item-title">{m.modality === 'FACE' ? 'Con tu rostro' : 'Con tu huella'}</p>
                      <p className="item-sub">{puedeEntrar ? `En ${m.branchName} · sin credencial ni fila` : `En ${m.branchName} · se activa cuando puedas entrar`}</p>
                    </div>
                    {puedeEntrar ? <BadgeCheck size={20} className="text-ok" /> : <Lock size={20} className="muted" />}
                  </li>
                ))}
                {me.accessMethods.length > 0 ? (
                  <li className="item">
                    <p className="tiny muted">
                      {me.accessMethods.every((m) => m.modality === 'FACE')
                        ? 'Tu rostro se reconoce solo en esa sucursal. La foto no se guarda: solo una plantilla cifrada en el servidor del gimnasio, ligada a tu consentimiento. En otra sucursal, recepción te abre.'
                        : 'Se reconoce solo en la sucursal donde lo registraste, ligado a tu consentimiento. En otra sucursal, recepción te abre.'}
                    </p>
                  </li>
                ) : me.faceRule ? (
                  /* El gimnasio pide entrar con el rostro (D-06): ya no es «opcional», y se dice qué pasa mientras no lo tenga. */
                  <li className="item" data-testid="falta-rostro">
                    <IconTile tone="warn"><ScanFace /></IconTile>
                    <div className="item-body">
                      <p className="item-title">Te falta registrar tu rostro</p>
                      <p className="item-sub">Tu gimnasio pide entrar con el rostro. Regístralo en recepción la próxima vez que vengas; mientras no lo tengas, la gerencia tiene que autorizar cada visita.</p>
                    </div>
                  </li>
                ) : (
                  <li className="item">
                    <span className="item-icon"><ConciergeBell /></span>
                    <div className="item-body">
                      <p className="item-title">Por recepción</p>
                      <p className="item-sub">Si quieres entrar con tu rostro o huella, pídelo en el mostrador. Es opcional.</p>
                    </div>
                  </li>
                )}
                {porFirmar && (
                  <li className="item" data-testid="rostro-por-firmar">
                    <Callout tone="warn" title="Cambió el texto del uso de tu rostro">
                      <p className="small">Fírmalo de nuevo en recepción la próxima vez que vengas{porFirmar.currentVersion ? ` (versión ${porFirmar.currentVersion})` : ''}. Mientras tanto sigues entrando igual.</p>
                    </Callout>
                  </li>
                )}
              </ul>
            </div>
          </Section>
        </div>

        <div className="inicio-col">
          {ofreceClases && <Section title="Tu próxima clase" action={<Link href="/clases" className="link">Horario <ChevronRight size={15} /></Link>}>
            {proxima.error ? <div className="card card-pad"><ErrorCarga titulo="No pudimos revisar tus clases" mensaje={proxima.error} onReintentar={() => void proxima.recargar()} /></div>
              : clase === undefined ? <Skeleton h={76} /> : clase ? (
              <Link href="/clases" className="card item item-suelto">
                <IconTile tone="volt"><CalendarCheck /></IconTile>
                <div className="item-body">
                  <p className="item-title">{clase.className ?? 'Clase'}</p>
                  <p className="item-sub">{capital(dia(clase.startsAt, { weekday: 'long', day: 'numeric' }))} · {hora(clase.startsAt)}{clase.coachName ? ` · con ${clase.coachName}` : ''}{clase.room ? ` · ${clase.room}` : ''}</p>
                </div>
                <Badge tone="ok" dot>Reservada</Badge>
              </Link>
            ) : puedeEntrar ? (
              <div className="card card-pad between">
                <div className="row">
                  <span className="item-icon"><CalendarPlus /></span>
                  <div>
                    <p className="item-title">Sin clases reservadas</p>
                    <p className="item-sub">Aparta tu lugar desde aquí.</p>
                  </div>
                </div>
                <Link href="/clases" className="btn btn-secondary btn-sm">Reservar</Link>
              </div>
            ) : (
              /* A quien hoy no entra no se le invita a reservar (25-15): se le dice qué falta. */
              <div className="card card-pad between" data-testid="reservar-cuando-entres">
                <div className="row">
                  <span className="item-icon"><Lock /></span>
                  <div>
                    <p className="item-title">{debe ? 'Ponte al corriente para reservar' : 'Para reservar necesitas poder entrar'}</p>
                    <p className="item-sub">{debe ? (enLinea ? 'En cuanto pagues, apartas tu lugar.' : 'En cuanto pagues en recepción, apartas tu lugar.') : 'En recepción te dicen cómo.'}</p>
                  </div>
                </div>
                {debe && <Link href="/pagos" className="btn btn-secondary btn-sm">{enLinea ? 'Pagar' : 'Ver pagos'}</Link>}
              </div>
            )}
          </Section>}

          <Section title="Este mes" action={<Link href="/asistencia" className="link">Asistencia <ChevronRight size={15} /></Link>}>
            {asistencia.error ? <div className="card card-pad"><ErrorCarga titulo="No pudimos contar tus visitas" mensaje={asistencia.error} onReintentar={() => void asistencia.recargar()} /></div> : (
            <Link href="/asistencia" className="card card-pad between" data-testid="visitas-del-mes">
              <div>
                <div className="big-stat num">{visitasMes ?? '–'}</div>
                <p className="small muted mt-6">{visitasMes === 1 ? 'visita' : 'visitas'} en {mes} · cada día que vienes cuenta una</p>
              </div>
              <IconTile tone="volt" size="lg"><Flame /></IconTile>
            </Link>
            )}
          </Section>

          {/* Solo lo último: el saldo ya lo dicen la tarjeta y Pagos. */}
          <Section title="Último movimiento" action={<Link href="/pagos" className="link">Ver todo <ChevronRight size={15} /></Link>}>
            <div className="card">
              {saldo.error ? <div className="card-pad"><ErrorCarga titulo="No pudimos cargar tus movimientos" mensaje={saldo.error} onReintentar={() => void saldo.recargar()} /></div>
                : !st ? <div className="card-pad"><Skeleton h={56} /></div> : <Movimientos charges={st.charges} payments={st.payments} max={1} />}
            </div>
            {st && <p className="tiny muted mt-8 text-center">Saldo actualizado {hace(st.computedAt)}</p>}
          </Section>
        </div>
      </div>

      <InstalarApp />

      {/* Ya no se invita a domiciliar (25-02): nadie cobra solo el día de corte todavía. */}
    </>
  );
}
