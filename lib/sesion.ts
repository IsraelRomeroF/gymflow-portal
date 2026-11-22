/**
 * EL PORTAL EN ESTE TELÉFONO (bloque 1.12 · 24-06, 24-08, 24-15).
 *
 * - Si el portal se cierra a media pantalla (recepción lo cerró en todos los
 *   teléfonos, el socio lo cerró desde otro, o pasaron días sin abrirlo), se
 *   va a «Activar» diciendo qué pasó y con la pantalla a la que volver tras
 *   poner el código nuevo.
 * - Al cerrarse, por la razón que sea, se borra lo que el portal guardó en el
 *   teléfono: su copia sin señal de la cuenta (con datos del socio) incluida.
 *   Se quedan el tema y el «Instala GymFlow» descartado, que son del teléfono.
 */
import { borrarCacheDelPortal } from '../components/instalar';

export type MotivoDeSalida = 'cerrada' | 'vencida' | 'inactiva' | 'baja';

/** Lo que dice «Activar», arriba del código. */
export const AVISO_DE_SALIDA: Record<MotivoDeSalida, { titulo: string; texto: string }> = {
  cerrada: { titulo: 'Tu sesión en este teléfono se cerró', texto: 'Pide en recepción un código nuevo para volver a entrar.' },
  vencida: { titulo: 'Tu acceso en este teléfono venció', texto: 'Cada teléfono queda abierto un tiempo. Pide en recepción un código nuevo para volver a entrar.' },
  inactiva: { titulo: 'El portal se cerró por falta de uso', texto: 'Pasaron varios días sin abrirlo en este teléfono. Pide en recepción un código nuevo para volver a entrar.' },
  baja: { titulo: 'Tu cuenta ya no está activa en este gimnasio', texto: 'Si crees que es un error, pregunta en recepción.' },
};

export function esMotivoDeSalida(m: string | null | undefined): m is MotivoDeSalida {
  return m === 'cerrada' || m === 'vencida' || m === 'inactiva' || m === 'baja';
}

/** Hasta cuándo queda abierto el portal en este teléfono, como máximo (lo dice la API al activar). */
const CLAVE_HASTA = 'gf-portal-hasta';
/** El gimnasio de este teléfono, para que el marco lo diga sin señal (lo guarda `socio.tsx`). */
const CLAVE_MARCA = 'gf-marca';

export function recordarHasta(expiresAt: string): void {
  try { localStorage.setItem(CLAVE_HASTA, String(new Date(expiresAt).getTime())); } catch { /* sin almacenamiento: no se mostrará la fecha */ }
}

export function hastaRecordado(): number | null {
  try { const n = Number(localStorage.getItem(CLAVE_HASTA)); return Number.isFinite(n) && n > 0 ? n : null; } catch { return null; }
}

/** Qué pasó, si este teléfono tenía el portal abierto: si ya era la fecha, venció; si no, se cerró. */
function motivoDeSalida(): MotivoDeSalida | null {
  let tenia = false;
  try { tenia = localStorage.getItem(CLAVE_MARCA) !== null || localStorage.getItem(CLAVE_HASTA) !== null; } catch { /* sin almacenamiento */ }
  if (!tenia) return null;
  const hasta = hastaRecordado();
  return hasta !== null && Date.now() >= hasta - 60_000 ? 'vencida' : 'cerrada';
}

/**
 * Lo que dijo la API en el 401 (`reason`, bloque 1.6): con eso «Activar» dice
 * exactamente qué pasó. Sin `reason` (una API anterior, o sin cookie) se
 * deduce como antes, con lo que guardó el teléfono.
 */
const POR_MOTIVO_DE_LA_API: Record<string, MotivoDeSalida> = {
  SESSION_EXPIRED: 'vencida',
  SESSION_IDLE: 'inactiva',
  SESSION_LOGGED_OUT: 'cerrada',
  SESSION_CLOSED_EVERYWHERE: 'cerrada',
  ACCOUNT_DEACTIVATED: 'baja',
};

/** Solo pantallas del portal: una sola «/» al inicio, sin otro servidor, y nunca «Activar», el alta ni la API. */
export function volverSeguro(ruta: string | null | undefined): string | null {
  if (!ruta || ruta.length > 512 || !ruta.startsWith('/') || ruta.startsWith('//')) return null;
  // Ni caracteres de control ni «\»: el navegador los convierte en «/» y la ruta saldría del sitio.
  if ([...ruta].some((c) => c.charCodeAt(0) < 32 || c === '\\')) return null;
  let u: URL;
  try { u = new URL(ruta, 'http://gymflow.invalid'); } catch { return null; }
  if (u.origin !== 'http://gymflow.invalid') return null;
  if (/^\/(activar|alta|api)(\/|$)/.test(u.pathname)) return null;
  return `${u.pathname}${u.search}`;
}

const SE_QUEDAN: ReadonlySet<string> = new Set(['gf-tema', 'gf-instalar-oculto']);

/**
 * Borra lo que el portal guardó en este teléfono (24-15). `conservarMarca`:
 * cuando se cerró solo (no lo cerró el socio), «Activar» sigue diciendo de
 * qué gimnasio es; el nombre del gimnasio no es un dato del socio.
 */
export async function limpiarPortal(opciones: { conservarMarca?: boolean } = {}): Promise<void> {
  await borrarCacheDelPortal();
  try { sessionStorage.clear(); } catch { /* sin almacenamiento de pestaña */ }
  try {
    for (const k of Object.keys(localStorage)) {
      if (SE_QUEDAN.has(k) || (opciones.conservarMarca && k === CLAVE_MARCA)) continue;
      localStorage.removeItem(k);
    }
  } catch { /* sin almacenamiento */ }
}

/**
 * El portal se cerró a media pantalla: se limpia el teléfono y se va a
 * «Activar» con lo que pasó y la pantalla donde estaba. Carga completa: no
 * queda nada de la cuenta a la vista. Solo la primera vez cuenta.
 */
let yendo = false;
export function irAActivar(reason?: string): void {
  if (yendo || typeof window === 'undefined') return;
  yendo = true;
  const motivo = (reason ? POR_MOTIVO_DE_LA_API[reason] : undefined) ?? motivoDeSalida();
  const q = new URLSearchParams();
  if (motivo) q.set('motivo', motivo);
  const volver = volverSeguro(`${window.location.pathname}${window.location.search}`);
  if (volver && volver !== '/') q.set('volver', volver);
  const destino = q.toString() ? `/activar?${q.toString()}` : '/activar';
  void limpiarPortal({ conservarMarca: true }).finally(() => window.location.replace(destino));
}
