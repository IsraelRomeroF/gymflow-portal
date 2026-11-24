/*
 * NOTIFICACIONES EN ESTE TELÉFONO (fase 3, bloque 3.10; D-34 opción c).
 *
 * Son las del navegador (Web Push): gratis y sin proveedor. Aquí está lo que
 * solo el teléfono sabe: si su navegador las admite, si ya dio permiso y cuál
 * es su suscripción. Qué se avisa y a quién lo decide el servidor.
 */

/** El navegador quiere la llave en bytes; el servidor la da en base64url. */
function aBytes(b64: string): Uint8Array<ArrayBuffer> {
  const relleno = '='.repeat((4 - (b64.length % 4)) % 4);
  const crudo = atob((b64 + relleno).replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(new ArrayBuffer(crudo.length));
  for (let i = 0; i < crudo.length; i++) bytes[i] = crudo.charCodeAt(i);
  return bytes;
}

/** ¿Este navegador puede recibir notificaciones? En iPhone, solo con el portal instalado en la pantalla de inicio. */
export function admiteNotificaciones(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

/** El permiso que el socio le dio (o le negó) a este sitio en su teléfono. */
export function permisoDeNotificaciones(): NotificationPermission | null {
  return admiteNotificaciones() ? Notification.permission : null;
}

async function registro(): Promise<ServiceWorkerRegistration | undefined> {
  return navigator.serviceWorker.getRegistration('/sw.js').catch(() => undefined);
}

/** La suscripción de ESTE teléfono, si las tiene encendidas. */
export async function suscripcionDeEsteTelefono(): Promise<PushSubscription | null> {
  if (!admiteNotificaciones() || Notification.permission !== 'granted') return null;
  return (await registro())?.pushManager.getSubscription().catch(() => null) ?? null;
}

export type ResultadoDeEncender = { ok: true; suscripcion: PushSubscriptionJSON } | { ok: false; porque: 'sin-permiso' | 'sin-soporte' };

/** Pide permiso (el teléfono pregunta una vez) y suscribe este navegador con la llave del servidor. */
export async function encenderEnEsteTelefono(llavePublica: string): Promise<ResultadoDeEncender> {
  if (!admiteNotificaciones()) return { ok: false, porque: 'sin-soporte' };
  if ((await Notification.requestPermission()) !== 'granted') return { ok: false, porque: 'sin-permiso' };
  await navigator.serviceWorker.register('/sw.js');
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: aBytes(llavePublica) });
  return { ok: true, suscripcion: sub.toJSON() };
}

/** Da de baja la suscripción de este navegador. Devuelve su `endpoint` para avisarle al servidor, o null si no había. */
export async function apagarEnEsteTelefono(): Promise<string | null> {
  if (!admiteNotificaciones()) return null;
  const sub = await (await registro())?.pushManager.getSubscription().catch(() => null);
  if (!sub) return null;
  await sub.unsubscribe().catch(() => undefined);
  return sub.endpoint;
}
