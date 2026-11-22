'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, CalendarDays, Wallet, CircleCheck, UserRound, ListChecks } from 'lucide-react';
import type { PortalMe } from '@gymflow/core/contracts';
import { api, apiConOrigen, ApiError, alPerderSesion } from '@/lib/api';
import { fijarZona } from '@/lib/format';
import { irAActivar } from '@/lib/sesion';
import { Callout, ErrorCarga, Skeleton } from './ui';
import { Avisos } from './avisos';
import { useServiceWorker } from './instalar';
import { Marca } from '@/components/compartido';

/** El socio como lo manda `GET /portal/me`: contrato del núcleo, ya no un tipo a mano. */
export type Me = PortalMe;

type Ctx = {
  me: Me;
  reload: () => Promise<void>;
  toast: (text: string) => void;
  ofreceClases: boolean;
  /**
   * Cuándo se guardó lo que se está viendo, si salió de la copia del teléfono
   * porque no hay señal (25-18); null si viene de la red.
   */
  guardadoEn: number | null;
};
const SocioCtx = createContext<Ctx | null>(null);

export function useSocio(): Ctx {
  const c = useContext(SocioCtx);
  if (!c) throw new Error('useSocio fuera de SocioShell');
  return c;
}

/**
 * Las pestañas (bloque 2.8): Inicio · Clases · Rutina · Pagos · Cuenta.
 * «Cuenta» estaba escondida en un ícono del encabezado; Asistencia dejó de
 * ser pestaña y se llega desde «Este mes» de Inicio.
 */
const TABS = [
  { href: '/', label: 'Inicio', icon: Home },
  { href: '/clases', label: 'Clases', icon: CalendarDays },
  { href: '/rutina', label: 'Rutina', icon: ListChecks },
  { href: '/pagos', label: 'Pagos', icon: Wallet },
  { href: '/cuenta', label: 'Cuenta', icon: UserRound },
] as const;

/** Pantallas que no son pestaña: su título y la pestaña que queda marcada. */
const OTRAS: ReadonlyArray<{ prefijo: string; titulo: string; pestana: string }> = [
  { prefijo: '/asistencia', titulo: 'Asistencia', pestana: '/' },
  { prefijo: '/pagos/recibo', titulo: 'Comprobante', pestana: '/pagos' },
];

/**
 * Marco del portal: carga al socio una vez y pone la barra de pestañas.
 *
 * Abajo, al alcance del pulgar: es un teléfono y se usa con una mano, muchas
 * veces con la otra ocupada con la mochila.
 */
export function SocioShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [me, setMe] = useState<Me | null>(null);
  const [guardadoEn, setGuardadoEn] = useState<number | null>(null);
  const otra = OTRAS.find((x) => pathname.startsWith(x.prefijo)) ?? null;
  // Título de la pestaña o del selector de apps (UX7): la sección y el gimnasio.
  useEffect(() => {
    const t = TABS.find((x) => (x.href === '/' ? pathname === '/' : pathname.startsWith(x.href)));
    document.title = `${otra?.titulo ?? t?.label ?? 'Portal'} · ${me?.gymName || 'GymFlow'}`;
  }, [pathname, me?.gymName, otra?.titulo]);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  // Si el gimnasio no da clases, la pestaña sobra: siempre diría "no hay".
  // Mientras se sabe, se muestra, para no hacer brincar la barra.
  const [ofreceClases, setOfreceClases] = useState(true);
  // El portal que se cierra a media pantalla lleva a «Activar» con lo que pasó y limpia el teléfono (24-06).
  useEffect(() => alPerderSesion((reason) => irAActivar(reason)), []);

  const reload = useCallback(async () => {
    try {
      const { datos, guardadoEn: copia } = await apiConOrigen<Me>('/portal/me');
      // Fechas y horas con la zona de su sede o del gimnasio, no con la del teléfono (1.5; la manda `/portal/me` desde 1.6).
      fijarZona(datos.timezone);
      setMe(datos); setGuardadoEn(copia); setError(null);
      // Se recuerda la marca para que sin señal el marco siga diciendo de qué gimnasio es (UX7 Portal 5).
      try { localStorage.setItem('gf-marca', JSON.stringify({ gym: datos.gymName, sede: datos.homeBranchName })); } catch { /* sin almacenamiento */ }
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) irAActivar(e.reason);
      // El gimnasio apagó el portal (ADR-036): se dice claro, no "sin señal".
      else if (e instanceof ApiError && e.status === 403) setError('El portal del socio no está disponible en este gimnasio. Pregunta en recepción.');
      else setError('No pudimos conectar. Revisa tu señal e inténtalo de nuevo.');
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);
  useServiceWorker();
  // La marca recordada, para el marco sin señal.
  const [marca, setMarca] = useState<{ gym?: string; sede?: string | null } | null>(null);
  useEffect(() => { try { setMarca(JSON.parse(localStorage.getItem('gf-marca') ?? 'null')); } catch { /* nada */ } }, []);
  // Al volver a la app (instalada, se queda abierta horas) se refresca lo del socio.
  useEffect(() => {
    const alVolver = () => { if (document.visibilityState === 'visible') void reload(); };
    document.addEventListener('visibilitychange', alVolver);
    return () => document.removeEventListener('visibilitychange', alVolver);
  }, [reload]);
  useEffect(() => {
    api<{ offered: boolean }>('/portal/classes/offered').then((r) => setOfreceClases(r.offered)).catch(() => undefined);
  }, []);

  const toast = useCallback((text: string) => {
    setAviso(text);
    setTimeout(() => setAviso((a) => (a === text ? null : a)), 4200);
  }, []);

  const debe = me?.membershipStatus === 'PAST_DUE' || me?.membershipStatus === 'SUSPENDED';
  // Las pestañas siguen a lo que el gimnasio ofrece (`features`): sin Clases o
  // sin Rutinas, su pestaña no existe (una que siempre dice "no hay" es ruido).
  const conClases = ofreceClases && (!me || me.features.classes);
  const conRutinas = !me || me.features.routines;
  const pestanas = TABS.filter((t) => (t.href !== '/clases' || conClases) && (t.href !== '/rutina' || conRutinas));

  return (
    <>
      <div className="app" data-pantalla={pathname === '/' ? 'inicio' : undefined}>
        <header className="top no-print">
          <div className="brand">
            <span className="brand-mark"><Marca size={18} /></span>
            <div>
              <div className="brand-name">{me?.gymName || marca?.gym || 'GymFlow'}</div>
              <div className="brand-sub">{(me?.homeBranchName ?? marca?.sede) ? `Sucursal ${me?.homeBranchName ?? marca?.sede}` : 'Portal del socio'}</div>
            </div>
          </div>
          {me && <Avisos enLinea={me.features.onlinePayments} />}
        </header>

        {/* Sin señal: con salida (UX7 Portal 5). El portal apagado no se reintenta: se explica. */}
        {error && !me && (error.startsWith('El portal del socio no está disponible')
          ? <Callout tone="warn" title="Portal no disponible"><p className="small">{error}</p></Callout>
          : <div data-testid="sin-senal"><ErrorCarga titulo="No pudimos cargar tu cuenta" mensaje={error} onReintentar={() => { setError(null); void reload(); }} /></div>)}
        {!me && !error && (
          <div className="stack mt-8">
            <Skeleton h={22} r={8} />
            <Skeleton h={196} r={22} />
            <Skeleton h={90} />
            <Skeleton h={90} />
          </div>
        )}
        {me && <SocioCtx.Provider value={{ me, reload, toast, ofreceClases: conClases, guardadoEn }}>{children}</SocioCtx.Provider>}
      </div>

      <nav className="tabbar no-print" aria-label="Secciones">
        <div className="tabbar-inner">
          {pestanas.map(({ href, label, icon: Icono }) => {
            const activo = otra ? otra.pestana === href : href === '/' ? pathname === '/' : pathname.startsWith(href);
            return (
              <Link key={href} href={href} className="tab" aria-current={activo ? 'page' : undefined}>
                <span className="tab-icon"><Icono /></span>
                {label}
                {href === '/pagos' && debe && <span className="tab-dot" aria-label="Tienes un pago pendiente" />}
              </Link>
            );
          })}
        </div>
      </nav>

      {aviso && <div className="toast no-print" role="status"><CircleCheck />{aviso}</div>}
    </>
  );
}
