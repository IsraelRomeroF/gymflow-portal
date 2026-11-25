'use client';

import { useCallback, useState } from 'react';
import type { MemberPrivacyRequests, PortalConsents, PrivacyRequest } from '@gymflow/core/contracts';
import { TIPO_DE_CONSENTIMIENTO_SOCIO } from '@gymflow/core/vocabulario';
import {
  CONSECUENCIA_DE_RETIRAR, ESTADO_DE_SOLICITUD_ARCO, PLAZOS_ARCO, RESULTADO_DE_SOLICITUD_ARCO, SOLICITUDES_DESDE_EL_PORTAL, TIPO_DE_SOLICITUD_ARCO_SOCIO,
  consecuenciaDeRetirarRostro,
} from '@gymflow/core/privacidad';
import { useSocio } from './socio';
import { api } from '@/lib/api';
import { dia } from '@gymflow/ui/format';
import { Button, Callout, ErrorCarga, Sheet } from './ui';
import { useCarga } from '@gymflow/ui/carga';

type Consentimiento = PortalConsents['consents'][number];

const NOMBRE = TIPO_DE_CONSENTIMIENTO_SOCIO;
const PEDIDO = TIPO_DE_SOLICITUD_ARCO_SOCIO;
const fechaCorta = (iso: string | null) => (iso ? dia(iso, { day: 'numeric', month: 'short', year: 'numeric' }) : '');

/** En qué va lo que pidió, dicho al socio. */
function estadoDe(r: PrivacyRequest): string {
  if (r.status === 'IDENTITY_PENDING') return ESTADO_DE_SOLICITUD_ARCO.IDENTITY_PENDING.socio;
  if (r.status === 'OPEN') return `${ESTADO_DE_SOLICITUD_ARCO.OPEN.socio}: te responden a más tardar el ${fechaCorta(r.dueAt)}`;
  if (r.status === 'EFFECT_PENDING') return `${RESULTADO_DE_SOLICITUD_ARCO.GRANTED.socio}: queda hecho a más tardar el ${fechaCorta(r.effectiveDueAt)}`;
  return r.outcome ? `${RESULTADO_DE_SOLICITUD_ARCO[r.outcome].socio} · ${fechaCorta(r.effectedAt ?? r.resolvedAt)}` : `${ESTADO_DE_SOLICITUD_ARCO.CLOSED.socio} · ${fechaCorta(r.resolvedAt)}`;
}

/**
 * TUS PERMISOS Y TUS SOLICITUDES (PS-07; auditoría 8, bloques 1.10 y 2.8). Lo
 * que firmaste y qué puedes retirar tú mismo; lo obligatorio (aviso,
 * reglamento) se retira dándote de baja en recepción. Lo que pidas queda con
 * folio y fecha, y aquí mismo ves en qué va y qué te respondieron (21-02).
 *
 * Cada acción que no se deshace desde el teléfono tiene SU hoja (25-21):
 * retirar un permiso dice lo que pasa antes de hacerlo, y pedir una
 * corrección ya no es un formulario que crece dentro de la misma pantalla.
 */
export function Permisos({ onAviso }: { onAviso: (texto: string) => void }) {
  // La regla del rostro de su gimnasio (D-06) cambia lo que pasa al retirarlo, y al retirarlo cambia «Cómo entras».
  const { me, reload } = useSocio();
  const [ocupado, setOcupado] = useState(false);
  const [porRetirar, setPorRetirar] = useState<Consentimiento | null>(null);
  const [fallo, setFallo] = useState<string | null>(null);
  const [pedir, setPedir] = useState(false);
  const [f, setF] = useState({ kind: 'RECTIFICATION', note: '' });
  const [enviando, setEnviando] = useState(false);
  // Sin red no es «No tienes permisos registrados» (26-01): se dice y se reintenta.
  const carga = useCarga(useCallback(() => api<PortalConsents>('/portal/consents').then((r) => r.consents), []));
  const lista = carga.datos ?? null;
  const cargar = carga.recargar;
  const solicitudes = useCarga(useCallback(() => api<MemberPrivacyRequests>('/portal/privacy-requests').then((r) => r.requests), []));

  async function retirar(c: Consentimiento) {
    setOcupado(true); setFallo(null);
    try {
      await api(`/portal/consents/${c.consentType}/revoke`, { method: 'POST', body: '{}' });
      onAviso(c.consentType === 'BIOMETRIC' ? 'Listo: tu rostro ya no se reconoce y su plantilla se borró.' : `Listo: ya no usamos «${NOMBRE[c.consentType] ?? c.consentType}».`);
      setPorRetirar(null);
      await Promise.all([cargar(), c.consentType === 'BIOMETRIC' ? reload() : Promise.resolve()]);
    } catch { setFallo('No se pudo retirar. Inténtalo de nuevo o avisa en recepción.'); } finally { setOcupado(false); }
  }
  async function enviarPedido() {
    setEnviando(true); setFallo(null);
    try {
      const r = await api<PrivacyRequest>('/portal/privacy-requests', { method: 'POST', body: JSON.stringify({ kind: f.kind, note: f.note.trim() }) });
      onAviso(`Recibido, folio ${r.folio}. El gimnasio tiene ${PLAZOS_ARCO.responder.habiles} días hábiles para responderte.`);
      setPedir(false); setF({ kind: 'RECTIFICATION', note: '' });
      await solicitudes.recargar();
    } catch { setFallo('No se pudo enviar. Inténtalo de nuevo o avisa en recepción.'); } finally { setEnviando(false); }
  }

  const vigentes = (lista ?? []).filter((c) => c.granted && !c.revokedAt);
  const mias = solicitudes.datos ?? [];
  const nombreDe = (c: Consentimiento) => NOMBRE[c.consentType] ?? c.consentType;
  return (
    <>
      <div className="card" data-testid="tus-permisos">
        {carga.error ? <div className="card-pad"><ErrorCarga titulo="No pudimos cargar tus permisos" mensaje={carga.error} onReintentar={() => void cargar()} /></div>
          : lista === null ? <p className="card-pad small muted">Cargando…</p> : vigentes.length === 0 ? <p className="card-pad small muted">No tienes permisos registrados.</p> : (
          <ul className="list">
            {vigentes.map((c) => (
              <li key={c.id} className="item">
                <div className="item-body">
                  <p className="item-title">{nombreDe(c)}</p>
                  <p className="item-sub">Aceptado el {fechaCorta(c.grantedAt)} · versión {c.documentVersion}</p>
                  {c.needsResign && (
                    <p className="item-sub text-warn" data-testid="permiso-por-firmar">
                      Cambió el texto{c.currentVersion ? ` (versión ${c.currentVersion})` : ''}: fírmalo de nuevo en recepción. Mientras tanto sigues entrando igual.
                    </p>
                  )}
                  {!c.revocable && <p className="tiny muted mt-2">Es obligatorio: se retira dándote de baja en recepción</p>}
                </div>
                {c.revocable && <Button variant="secondary" size="sm" onClick={() => { setFallo(null); setPorRetirar(c); }}>Retirar</Button>}
              </li>
            ))}
          </ul>
        )}
      </div>

      {(solicitudes.error || mias.length > 0) && (
        <>
          <h3 className="eyebrow cuenta-sub">Lo que has pedido</h3>
          <div className="card" data-testid="tus-solicitudes">
            {solicitudes.error ? <div className="card-pad"><ErrorCarga titulo="No pudimos cargar tus solicitudes" mensaje={solicitudes.error} onReintentar={() => void solicitudes.recargar()} /></div> : (
              <ul className="list">
                {mias.map((r) => (
                  <li key={r.id} className="item">
                    <div className="item-body">
                      <p className="item-title">{PEDIDO[r.kind] ?? r.kind}</p>
                      <p className="item-sub">Folio {r.folio} · la pediste el {fechaCorta(r.receivedAt)}</p>
                      <p className={`item-sub${r.overdue ? ' text-warn' : ''}`}>{estadoDe(r)}</p>
                      {r.resolution && <p className="item-sub">Respuesta: {r.resolution}</p>}
                      {r.effectNote && <p className="item-sub">{r.effectNote}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      <div className="mt-12">
        <Button variant="secondary" block onClick={() => { setFallo(null); setPedir(true); }}>Pedir que corrijan o borren mis datos</Button>
      </div>

      {/* Antes de retirar se dice lo que pasa (21-12), en su propia hoja (25-21). */}
      <Sheet open={!!porRetirar} onClose={() => setPorRetirar(null)} title={porRetirar ? `¿Retirar «${nombreDe(porRetirar)}»?` : 'Retirar'} error={porRetirar ? fallo : null}
        footer={porRetirar && <>
          <Button variant="secondary" block onClick={() => setPorRetirar(null)}>No, dejarlo</Button>
          <Button variant="danger" block loading={ocupado} onClick={() => void retirar(porRetirar)}>Sí, retirar</Button>
        </>}>
        {porRetirar && (
          <div data-testid="confirmar-retiro">
            <Callout tone="warn" title="Esto es lo que pasa">{CONSECUENCIA_DE_RETIRAR[porRetirar.consentType]?.socio ?? 'El gimnasio deja de usar ese permiso desde hoy.'}</Callout>
            {/* El rostro (D-32): además de lo que se borra, CÓMO va a entrar desde hoy, que depende de la regla de su gimnasio (D-06). */}
            {porRetirar.consentType === 'BIOMETRIC' && (
              <div className="mt-10" data-testid="como-entras-sin-rostro">
                <Callout tone={me.faceRule ? 'danger' : 'info'} title="Cómo vas a entrar">{consecuenciaDeRetirarRostro(!!me.faceRule).comoEntras}</Callout>
              </div>
            )}
            <p className="tiny muted mt-10">{porRetirar.consentType === 'BIOMETRIC' ? 'Para volver a entrar con tu rostro hay que registrarlo y firmarlo otra vez en recepción.' : 'Para volver a darlo hay que firmarlo otra vez en recepción.'}</p>
          </div>
        )}
      </Sheet>

      <Sheet open={pedir} onClose={() => setPedir(false)} title="Pedir algo sobre mis datos" error={pedir ? fallo : null}
        footer={<>
          <Button variant="secondary" block onClick={() => setPedir(false)}>Cancelar</Button>
          <Button block loading={enviando} disabled={f.note.trim().length < 3} onClick={() => void enviarPedido()}>Enviar</Button>
        </>}>
        <div className="stack gap-8">
          <Callout tone="info" title="Tu solicitud queda con folio y fecha">El gimnasio tiene {PLAZOS_ARCO.responder.habiles} días hábiles para responderte y, si procede, {PLAZOS_ARCO.hacerEfectiva.habiles} más para hacerlo. En Cuenta verás la respuesta.</Callout>
          <select className="select" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })} aria-label="Qué pides">
            {/* Corregir va primero: es lo que más se pide. */}
            {['RECTIFICATION', ...SOLICITUDES_DESDE_EL_PORTAL.filter((k) => k !== 'RECTIFICATION')].map((k) => <option key={k} value={k}>{PEDIDO[k] ?? k}</option>)}
          </select>
          <textarea className="input textarea" rows={3} maxLength={500} placeholder="Cuéntanos qué dato hay que corregir o por qué" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} aria-label="Detalle" />
          {f.note.trim().length < 3 && <p className="tiny muted">Escribe qué necesitas para poder enviarlo.</p>}
        </div>
      </Sheet>
    </>
  );
}
