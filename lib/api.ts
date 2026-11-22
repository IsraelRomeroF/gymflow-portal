import { isErrorReason, type ErrorReason } from '@gymflow/core/errors';
import { CAMPO } from '@gymflow/core/vocabulario';

/**
 * Cliente de la API del portal.
 *
 * La sesión viaja en cookie HttpOnly del MISMO ORIGEN (ver `next.config.ts`):
 * una cookie de tercero se pierde en cuanto el navegador endurece su política,
 * y eso ya ha pasado varias veces.
 */
export class ApiError extends Error {
  /** `reason`: el porqué estable que manda la API, si lo manda (bloque 1.12). */
  constructor(readonly status: number, message: string, readonly reason?: string) { super(message); }
}

/**
 * El porqué de NEGOCIO de un error (catálogo `ERROR_REASONS` del núcleo,
 * bloque 1.2), o null: para ofrecer lo que toca sin leer el texto. Los
 * porqués de un 401 (la sesión del teléfono terminó) no salen por aquí.
 */
export function motivoDe(e: unknown): ErrorReason | null {
  return e instanceof ApiError && isErrorReason(e.reason) ? e.reason : null;
}

/**
 * UN solo lugar para el portal que se cierra a media pantalla (bloque 1.12,
 * 24-06): recepción lo cerró en todos los teléfonos, el socio lo cerró desde
 * otro o pasaron días sin abrirlo. El marco del socio se registra aquí y, con
 * el primer 401, lleva a «Activar» diciendo qué pasó y a qué pantalla volver,
 * y borra lo que el portal guardó en el teléfono. Activar con un código malo
 * también da 401: esa no cuenta.
 */
let alPerder: ((reason: string | undefined) => void) | null = null;
export function alPerderSesion(fn: ((reason: string | undefined) => void) | null): () => void {
  alPerder = fn;
  return () => { if (alPerder === fn) alPerder = null; };
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  return (await apiConOrigen<T>(path, init)).datos;
}

/**
 * Como `api`, y además dice si la respuesta salió de la copia que el
 * teléfono guarda para cuando no hay señal (`public/sw.js`) y de cuándo es
 * (bloque 2.8 · 25-18): «Hoy entras» con datos de hace dos días se dice.
 * `guardadoEn` es null cuando la respuesta viene de la red.
 */
export async function apiConOrigen<T>(path: string, init: RequestInit = {}): Promise<{ datos: T; guardadoEn: number | null }> {
  try {
    return await apiUnaVez<T>(path, init);
  } catch (e) {
    if (e instanceof ApiError && e.status === 401 && path !== '/portal/enroll' && alPerder) alPerder(e.reason);
    throw e;
  }
}

async function apiUnaVez<T>(path: string, init: RequestInit = {}): Promise<{ datos: T; guardadoEn: number | null }> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      ...init,
      credentials: 'include',
      // Solo con cuerpo: un POST sin cuerpo pero con este encabezado lo rechaza
      // la API con 400 ("el cuerpo no puede estar vacío").
      headers: { ...(init.body ? { 'content-type': 'application/json' } : {}), ...(init.headers ?? {}) },
    });
  } catch {
    throw new ApiError(0, 'No hay conexión. Revisa tu internet y vuelve a intentar.');
  }
  // Un 5xx no le dice nada al socio ("Error interno"): se le dice qué hacer.
  if (res.status >= 500) throw new ApiError(res.status, 'Algo falló de nuestro lado. Vuelve a intentar en un momento.');
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const b = body as { message?: string; reason?: unknown; issues?: Array<{ path?: string; message?: string }> };
    throw new ApiError(res.status, mensaje(b), typeof b.reason === 'string' ? b.reason : undefined);
  }
  // La marca la pone el service worker al guardar la copia; por la red no viene.
  const marca = Number(res.headers.get('x-gf-guardado'));
  return { datos: body as T, guardadoEn: Number.isFinite(marca) && marca > 0 ? marca : null };
}

// `CAMPO`: los nombres de campo del vocabulario del núcleo, los mismos que ve recepción (27-07).

/** Con `issues`, qué campo corregir; si no, el mensaje de la API (UXA-12). */
function mensaje(body: { message?: string; issues?: Array<{ path?: string; message?: string }> }): string {
  if (Array.isArray(body.issues) && body.issues.length > 0) {
    return body.issues.slice(0, 3).map((i) => {
      const campo = (i.path ?? '').split('.').at(-1) ?? '';
      return CAMPO[campo] ? `${CAMPO[campo]}: ${i.message}` : i.message ?? '';
    }).filter(Boolean).join(' · ');
  }
  return body.message ?? 'No se pudo completar. Vuelve a intentar.';
}
