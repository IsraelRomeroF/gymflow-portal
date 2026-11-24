'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Bell, BellRing, CalendarCheck, CalendarX2, CircleAlert, FileText, Smartphone, Wallet } from 'lucide-react';
import type { PortalNotices } from '@gymflow/core/contracts';
import { api } from '@/lib/api';
import { concepto, dia, hace, hora } from '@/lib/format';
import { IconTile, Sheet, type Tono } from './ui';

type Aviso = PortalNotices['notices'][number];
/** Un renglón de la hoja: un aviso, o varios «Tu portal se activó» del mismo día juntos. */
type Renglon = { aviso: Aviso; ids: string[]; veces: Aviso[] };

/** Una acción por tipo de aviso (UX7 Portal 6): el aviso lleva a donde se resuelve. */
function accion(kind: string, enLinea: boolean): { href: string; label: string } | null {
  if (kind === 'PAYMENT_DUE_SOON' || kind === 'PAYMENT_OVERDUE' || kind === 'MEMBERSHIP_SUSPENDED') return enLinea ? { href: '/pagos', label: 'Pagar' } : { href: '/pagos', label: 'Ver mis pagos' };
  if (kind === 'CLASS_TOMORROW') return { href: '/clases', label: 'Ver clase' };
  // Se liberó su lugar apartado sin pagar (D-16, 3.16): lo lleva al horario, por si quiere otra.
  if (kind === 'CLASS_HOLD_RELEASED') return { href: '/clases', label: 'Ver clases' };
  return null;
}

/** El ícono dice de qué es el aviso antes de leerlo. */
function icono(kind: string): { tono: Tono; pieza: React.ReactNode } {
  if (kind === 'PAYMENT_DUE_SOON' || kind === 'PAYMENT_OVERDUE') return { tono: 'warn', pieza: <Wallet /> };
  if (kind === 'MEMBERSHIP_SUSPENDED') return { tono: 'danger', pieza: <CircleAlert /> };
  if (kind === 'CLASS_TOMORROW') return { tono: 'info', pieza: <CalendarCheck /> };
  if (kind === 'CLASS_HOLD_RELEASED') return { tono: 'warn', pieza: <CalendarX2 /> };
  if (kind === 'NEW_DEVICE') return { tono: 'neutral', pieza: <Smartphone /> };
  // Su celular o su correo cambió desde el portal (4.8, D-36): si no fue él, tiene que saltar a la vista.
  if (kind === 'CONTACT_CHANGED') return { tono: 'warn', pieza: <Smartphone /> };
  return { tono: 'neutral', pieza: <FileText /> };
}

/**
 * Los «Tu portal se activó en un teléfono» del mismo día van en UN renglón
 * (25-11): seis códigos seguidos empujaban la suspensión bajo el pliegue.
 * Lo demás, uno por renglón y en el orden que manda la API.
 */
function agrupar(avisos: Aviso[]): Renglon[] {
  const renglones: Renglon[] = [];
  const porDia = new Map<string, Renglon>();
  for (const a of avisos) {
    if (a.kind !== 'NEW_DEVICE') { renglones.push({ aviso: a, ids: [a.id], veces: [a] }); continue; }
    const clave = dia(a.createdAt, { day: 'numeric', month: 'numeric', year: 'numeric' });
    const ya = porDia.get(clave);
    if (ya) { ya.ids.push(a.id); ya.veces.push(a); continue; }
    const nuevo: Renglon = { aviso: a, ids: [a.id], veces: [a] };
    porDia.set(clave, nuevo); renglones.push(nuevo);
  }
  return renglones;
}

function lista(horas: string[]): string {
  return horas.length <= 1 ? horas.join('') : `${horas.slice(0, -1).join(', ')} y ${horas.at(-1)}`;
}

/**
 * CAMPANA (PS-03; bloque 2.8 · 25-11). Arriba, «Por resolver»: lo de dinero o
 * de acceso que HOY sigue pendiente (lo decide la API con el estado del
 * socio, `priority`). Debajo, lo reciente. Se marca leído lo que se vio —con
 * sus ids—, no todo; y al volver a la app se vuelve a pedir.
 */
export function Avisos({ enLinea = false }: { enLinea?: boolean }) {
  const [datos, setDatos] = useState<PortalNotices | null>(null);
  const [abierta, setAbierta] = useState(false);
  const cargar = useCallback(() => { api<PortalNotices>('/portal/notices').then(setDatos).catch(() => undefined); }, []);
  useEffect(cargar, [cargar]);
  // Instalada, la app se queda abierta horas: al volver, la campana se pone al día (25-19).
  useEffect(() => {
    const alVolver = () => { if (document.visibilityState === 'visible') cargar(); };
    document.addEventListener('visibilitychange', alVolver);
    return () => document.removeEventListener('visibilitychange', alVolver);
  }, [cargar]);

  async function abrir() {
    setAbierta(true);
    if (!datos) return;
    const vistos = datos.notices.filter((n) => !n.readAt).map((n) => n.id);
    if (vistos.length === 0) return;
    // Solo los que se están viendo: uno que llegue mientras tanto sigue sin leer.
    await api('/portal/notices/read', { method: 'POST', body: JSON.stringify({ ids: vistos.slice(0, 100) }) }).catch(() => undefined);
    const ahora = new Date().toISOString();
    setDatos((d) => d && ({
      unread: Math.max(0, d.unread - vistos.length),
      notices: d.notices.map((n) => (vistos.includes(n.id) ? { ...n, readAt: n.readAt ?? ahora } : n)),
    }));
  }

  const sinLeer = datos?.unread ?? 0;
  const renglones = datos ? agrupar(datos.notices) : [];
  const porResolver = renglones.filter((r) => r.aviso.priority === 'RESOLVE');
  const recientes = renglones.filter((r) => r.aviso.priority !== 'RESOLVE');

  const renglon = (r: Renglon) => {
    const n = r.aviso;
    const a = accion(n.kind, enLinea);
    const i = icono(n.kind);
    const varios = r.veces.length > 1;
    return (
      <li key={n.id} className="aviso">
        <IconTile tone={i.tono} size="sm">{i.pieza}</IconTile>
        <div className="item-body">
          <p className="aviso-titulo">{varios ? `Tu portal se activó ${r.veces.length} veces` : n.title}</p>
          <p className="small mt-2">
            {n.kind === 'NEW_DEVICE'
              // La fecha y la hora salen de cuándo pasó, no del texto guardado (que decía «Hoy» para siempre).
              ? `El ${dia(n.createdAt)} a las ${lista(r.veces.map((v) => hora(v.createdAt)).reverse())}. Si no fuiste tú, cierra la sesión en todos tus teléfonos desde Cuenta y avisa en recepción.`
              : /* Fechas legibles, igual que Movimientos: "1 oct – 1 nov". */ concepto(n.body)}
          </p>
          <div className="aviso-pie">
            <p className="item-sub m-0">{dia(n.createdAt, { day: 'numeric', month: 'short' })} · {hace(n.createdAt)}</p>
            {a && <Link href={a.href} className="btn btn-secondary btn-sm" onClick={() => setAbierta(false)}>{a.label}</Link>}
          </div>
        </div>
      </li>
    );
  };

  return (
    <>
      <button className="icon-btn campana" onClick={() => void abrir()} aria-label={sinLeer > 0 ? `Avisos: ${sinLeer} sin leer` : 'Avisos'} title="Avisos" data-testid="campana">
        {sinLeer > 0 ? <BellRing /> : <Bell />}
        {sinLeer > 0 && <span aria-hidden className="campana-cuenta">{sinLeer > 9 ? '9+' : sinLeer}</span>}
      </button>
      <Sheet open={abierta} onClose={() => setAbierta(false)} title="Avisos">
        {!datos ? <p className="small muted">Cargando…</p> : datos.notices.length === 0 ? <p className="small muted">Sin avisos por ahora. Aquí te decimos cuando un pago esté por vencer, cuando tengas clase mañana y si tu portal se abre en otro teléfono.</p> : (
          <div className="stack gap-14">
            {porResolver.length > 0 && (
              <section data-testid="avisos-por-resolver">
                <h3 className="eyebrow mb-8">Por resolver</h3>
                <ul className="list avisos avisos-resolver">{porResolver.map(renglon)}</ul>
              </section>
            )}
            {recientes.length > 0 && (
              <section data-testid="avisos-recientes">
                {porResolver.length > 0 && <h3 className="eyebrow mb-8">Recientes</h3>}
                <ul className="list avisos">{recientes.map(renglon)}</ul>
              </section>
            )}
          </div>
        )}
      </Sheet>
    </>
  );
}
