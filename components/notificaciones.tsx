'use client';

import { useCallback, useEffect, useState } from 'react';
import { BellOff, BellRing } from 'lucide-react';
import type { PortalNotificationTopic, PortalNotifications } from '@gymflow/core/contracts';
import { api } from '@/lib/api';
import { mensajeDeError, useCarga } from '@/lib/carga';
import { admiteNotificaciones, apagarEnEsteTelefono, encenderEnEsteTelefono, permisoDeNotificaciones, suscripcionDeEsteTelefono } from '@/lib/push';
import { Button, ErrorCarga, IconTile, Skeleton } from './ui';

const TEMAS: ReadonlyArray<{ clave: PortalNotificationTopic; titulo: string; detalle: string }> = [
  { clave: 'payments', titulo: 'Pagos', detalle: 'Cuando un pago está por vencer o ya venció.' },
  { clave: 'classes', titulo: 'Clases', detalle: 'Tu clase de mañana.' },
];

/**
 * NOTIFICACIONES (fase 3, bloque 3.10; D-34 opción c). El socio las enciende
 * y las apaga: en ESTE teléfono (el permiso es del navegador) y por tema.
 * Son gratis y no pasan por ningún servicio contratado. Si el gimnasio no las
 * tiene, o el navegador no las admite, se dice por qué y dónde están sus
 * avisos mientras tanto: en la campana.
 */
export function Notificaciones({ onAviso }: { onAviso: (texto: string) => void }) {
  const carga = useCarga(useCallback(() => api<PortalNotifications>('/portal/notifications'), []));
  const [estado, setEstado] = useState<PortalNotifications | null>(null);
  // `null` mientras se averigua: no se pinta «apagadas» y luego «encendidas».
  const [aqui, setAqui] = useState<boolean | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [fallo, setFallo] = useState<string | null>(null);
  const datos = estado ?? carga.datos ?? null;

  useEffect(() => { void suscripcionDeEsteTelefono().then((s) => setAqui(s !== null)).catch(() => setAqui(false)); }, []);

  async function encender() {
    if (!datos?.publicKey) return;
    setOcupado('telefono'); setFallo(null);
    try {
      const r = await encenderEnEsteTelefono(datos.publicKey);
      if (!r.ok) {
        setFallo(r.porque === 'sin-permiso'
          ? 'Tu teléfono no dio permiso. Actívalo en los ajustes de notificaciones de este sitio y vuelve a intentarlo.'
          : 'Este navegador no recibe notificaciones.');
        return;
      }
      setEstado(await api<PortalNotifications>('/portal/push-subscriptions', { method: 'POST', body: JSON.stringify(r.suscripcion) }));
      setAqui(true);
      onAviso('Listo: tus avisos te llegan a este teléfono.');
    } catch (e) { setFallo(mensajeDeError(e, 'No se pudieron encender. Inténtalo de nuevo.')); } finally { setOcupado(null); }
  }

  async function apagar() {
    setOcupado('telefono'); setFallo(null);
    try {
      const endpoint = await apagarEnEsteTelefono();
      if (endpoint) setEstado(await api<PortalNotifications>('/portal/push-subscriptions', { method: 'DELETE', body: JSON.stringify({ endpoint }) }));
      setAqui(false);
      onAviso('Notificaciones apagadas en este teléfono. Tus avisos siguen en la campana.');
    } catch (e) { setFallo(mensajeDeError(e, 'No se pudieron apagar. Inténtalo de nuevo.')); } finally { setOcupado(null); }
  }

  async function cambiarTema(clave: PortalNotificationTopic, encendido: boolean) {
    setOcupado(clave); setFallo(null);
    try {
      setEstado(await api<PortalNotifications>('/portal/notifications/preferences', { method: 'PUT', body: JSON.stringify({ [clave]: encendido }) }));
    } catch (e) { setFallo(mensajeDeError(e, 'No se pudo guardar. Inténtalo de nuevo.')); } finally { setOcupado(null); }
  }

  if (carga.error) return <div className="card card-pad"><ErrorCarga titulo="No pudimos cargar tus notificaciones" mensaje={carga.error} onReintentar={() => void carga.recargar()} /></div>;
  if (!datos || aqui === null) return <Skeleton h={120} />;

  const puede = admiteNotificaciones();
  const negado = permisoDeNotificaciones() === 'denied';

  return (
    <div data-testid="notificaciones">
      <div className="card">
        <div className="item">
          <IconTile tone={aqui ? 'ok' : 'neutral'}>{aqui ? <BellRing /> : <BellOff />}</IconTile>
          <div className="item-body">
            <p className="item-title" data-testid="notificaciones-estado">
              {!datos.available ? 'Tus avisos están en la campana' : aqui ? 'Encendidas en este teléfono' : 'Apagadas en este teléfono'}
            </p>
            <p className="item-sub">
              {!datos.available
                ? 'Tu gimnasio todavía no manda notificaciones al teléfono. Abre la campana de arriba para ver tus avisos.'
                : !puede
                  ? 'Este navegador no recibe notificaciones. En iPhone, primero agrega el portal a tu pantalla de inicio y ábrelo desde ahí.'
                  : aqui
                    ? 'Te avisamos aunque el portal esté cerrado. No tiene costo.'
                    : negado
                      ? 'Tu teléfono tiene bloqueadas las notificaciones de este sitio. Actívalas en sus ajustes para poder encenderlas.'
                      : 'Enciéndelas para enterarte aunque el portal esté cerrado. No tiene costo y las apagas cuando quieras.'}
            </p>
          </div>
        </div>
      </div>
      {datos.available && puede && (
        <div className="mt-12">
          {aqui
            ? <Button variant="secondary" block icon={<BellOff />} loading={ocupado === 'telefono'} onClick={() => void apagar()} data-testid="notificaciones-apagar">Apagar en este teléfono</Button>
            : <Button block icon={<BellRing />} loading={ocupado === 'telefono'} disabled={negado} onClick={() => void encender()} data-testid="notificaciones-encender">Encender en este teléfono</Button>}
        </div>
      )}
      {fallo && <p className="small text-danger mt-8" role="alert">{fallo}</p>}

      {datos.available && (
        <>
          <h3 className="eyebrow cuenta-sub">De qué te avisamos</h3>
          <div className="card">
            <ul className="list">
              {TEMAS.map((t) => (
                <li key={t.clave} className="item">
                  <label className="tema-aviso">
                    <span className="item-body">
                      <span className="item-title">{t.titulo}</span>
                      <span className="item-sub">{t.detalle}</span>
                    </span>
                    <input type="checkbox" role="switch" className="interruptor" checked={datos.preferences[t.clave]} disabled={ocupado !== null}
                      onChange={(e) => void cambiarTema(t.clave, e.target.checked)} data-testid={`tema-${t.clave}`} />
                  </label>
                </li>
              ))}
            </ul>
          </div>
          <p className="tiny muted mt-8">
            Siempre te avisamos si tu portal se abre en otro teléfono, si tu membresía se suspende y lo que tenga que ver con tus datos.
            {datos.devices > 0 ? ` Encendidas en ${datos.devices === 1 ? '1 teléfono' : `${datos.devices} teléfonos`}.` : ''}
          </p>
        </>
      )}
    </div>
  );
}
