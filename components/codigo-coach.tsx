'use client';

import { useEffect, useState } from 'react';
import { KeyRound } from 'lucide-react';
import { COACH_CODE, type PortalCoach } from '@gymflow/core/contracts';
import { api } from '@/lib/api';
import { hora } from '@gymflow/ui/format';
import { Button } from '@/components/ui';

/**
 * «¿YA TIENES COACH?» (D-29, fase 3, bloque 3.8).
 *
 * El socio que no tiene coach genera aquí un código y se lo DICTA en persona
 * a su coach; con él, el coach se suma como su coach y puede darle su rutina.
 * El código sirve una sola vez y dura diez minutos; pedir otro anula el
 * anterior. Si ya tiene coach, o su gimnasio no tiene coaches, no se pinta nada.
 */
export function CodigoParaCoach() {
  const [estado, setEstado] = useState<PortalCoach | null>(null);
  const [pidiendo, setPidiendo] = useState(false);
  const [falla, setFalla] = useState<string | null>(null);
  // Si no se puede consultar, no estorba: la rutina es lo importante de la pantalla.
  useEffect(() => { void api<PortalCoach>('/portal/coach').then(setEstado).catch(() => undefined); }, []);
  if (!estado || !estado.canAskCode) return null;

  async function generar() {
    setPidiendo(true); setFalla(null);
    try { setEstado(await api<PortalCoach>('/portal/coach/code', { method: 'POST', body: '{}' })); }
    catch (e) { setFalla(e instanceof Error && e.message ? e.message : 'No se pudo generar el código. Revisa tu conexión e inténtalo otra vez.'); }
    finally { setPidiendo(false); }
  }

  const mitad = Math.ceil(COACH_CODE.digits / 2);
  return (
    <div className="card card-pad stack" data-testid="codigo-coach">
      <p className="row gap-8 strong"><KeyRound size={18} />¿Ya tienes coach?</p>
      {estado.code && estado.expiresAt ? (
        <>
          <p className="small muted">Díctale este código a tu coach, en persona:</p>
          <p className="codigo-coach num" aria-label={`Código: ${estado.code.split('').join(' ')}`}>{estado.code.slice(0, mitad)} {estado.code.slice(mitad)}</p>
          <p className="small muted">Sirve una sola vez y hasta las {hora(estado.expiresAt)}. No lo mandes por mensaje: quien lo teclee se vuelve tu coach.</p>
          <div><Button variant="ghost" size="sm" loading={pidiendo} onClick={() => void generar()}>Generar otro</Button></div>
        </>
      ) : (
        <>
          <p className="small muted">Si un coach del gimnasio va a entrenarte, genera un código y díctaselo: con él se suma como tu coach y puede darte tu rutina.</p>
          <div><Button variant="secondary" loading={pidiendo} onClick={() => void generar()}>Generar código para mi coach</Button></div>
        </>
      )}
      {falla && <p className="small text-danger" role="alert">{falla}</p>}
    </div>
  );
}
