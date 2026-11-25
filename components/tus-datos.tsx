'use client';

import { useCallback, useState } from 'react';
import type { PortalContact } from '@gymflow/core/contracts';
import { useSocio } from './socio';
import { ApiError, api } from '@/lib/api';
import { dia, haceTanto, telefono } from '@gymflow/ui/format';
import { useCarga } from '@gymflow/ui/carga';
import { useFormulario } from '@gymflow/ui/formulario';
import { Button, Callout, ErrorCarga, Sheet } from './ui';

/**
 * «TUS DATOS» (auditoría 8, fase 4, bloque 4.8; D-36 opción c). El socio
 * cambia aquí su celular, su correo y su contacto de emergencia: directo, sin
 * esperar a nadie. Cada cambio abre SU hoja (25-21).
 *
 * El celular y el correo se ven a medias (`•• •••• 5678`): para cambiarlos se
 * escribe completo el celular registrado, y eso no confirmaría nada si la
 * pantalla lo dictara. El portal no tiene contraseña ni manda códigos (D-34).
 *
 * Lo que NO se cambia aquí se dice: nombre, fecha de nacimiento, CURP, plan y
 * coach siguen en recepción o por solicitud de corrección.
 */

type Hoja = 'celular' | 'correo' | 'emergencia' | null;
type Quien = 'SELF' | 'HOLDER' | 'ADULT';

const diezDigitos = (texto: string) => texto.replace(/\D/g, '').replace(/^52(?=\d{10}$)/, '');
const esCelular = (texto: string) => diezDigitos(texto).length === 10;
const esCorreo = (texto: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(texto.trim());
const esNombre = (texto: string) => /^[\p{L}\p{M}][\p{L}\p{M} '’.-]*$/u.test(texto.trim());
const fechaCorta = (iso: string) => dia(iso, { day: 'numeric', month: 'long' });

/** «Te quedan 2 cambios en estos 30 días», o desde cuándo puede otra vez. */
function cupo(l: PortalContact['limits']['phone'], dias: number, que: string): string {
  if (l.left === 0) return `Ya cambiaste ${que} ${l.max} veces en ${dias} días.${l.nextAt ? ` Podrás cambiarlo otra vez el ${fechaCorta(l.nextAt)}; antes, en recepción.` : ' Para cambiarlo antes, pasa a recepción.'}`;
  return l.left === 1 ? `Te queda 1 cambio en estos ${dias} días.` : `Te quedan ${l.left} cambios en estos ${dias} días.`;
}

export function TusDatos() {
  const { me, toast } = useSocio();
  const carga = useCarga(useCallback(() => api<PortalContact>('/portal/me/contact'), []));
  const c = carga.datos ?? null;
  const [hoja, setHoja] = useState<Hoja>(null);

  function listo(texto: string) {
    setHoja(null);
    toast(texto);
    void carga.recargar();
  }

  return (
    <>
      <div className="card" data-testid="tus-datos">
        <dl className="datos">
          <div className="dato"><dt>Nombre</dt><dd>{me.fullName}</dd></div>
          <div className="dato"><dt>Número de socio</dt><dd className="mono">{me.memberCode}</dd></div>
          {me.homeBranchName && <div className="dato"><dt>Sucursal</dt><dd>{me.homeBranchName}</dd></div>}
          <div className="dato"><dt>Socio desde</dt><dd>{dia(me.joinedAt, { day: 'numeric', month: 'long', year: 'numeric' })} · {haceTanto(me.tenureDays)}</dd></div>
          {c && (
            <>
              <div className="dato dato-editable" data-testid="dato-celular">
                <dt>Celular</dt>
                <dd>
                  <span className="mono">{c.phoneMasked ?? 'Sin celular'}</span>
                  <Button variant="secondary" size="sm" onClick={() => setHoja('celular')}>{c.hasPhone ? 'Cambiar' : 'Agregar'}</Button>
                </dd>
              </div>
              <div className="dato dato-editable" data-testid="dato-correo">
                <dt>Correo</dt>
                <dd>
                  <span>{c.emailMasked ?? 'Sin correo'}</span>
                  <Button variant="secondary" size="sm" onClick={() => setHoja('correo')}>{c.hasEmail ? 'Cambiar' : 'Agregar'}</Button>
                </dd>
              </div>
              <div className="dato dato-editable dato-largo" data-testid="dato-emergencia">
                <dt>Contacto de emergencia</dt>
                <dd>
                  <span>{c.emergencyContactName ? `${c.emergencyContactName}${c.emergencyContactPhone ? ` · ${telefono(c.emergencyContactPhone)}` : ''}` : c.emergencyContactPhone ? telefono(c.emergencyContactPhone) : 'Sin contacto'}</span>
                  <Button variant="secondary" size="sm" onClick={() => setHoja('emergencia')}>{c.emergencyContactName || c.emergencyContactPhone ? 'Cambiar' : 'Agregar'}</Button>
                </dd>
              </div>
            </>
          )}
        </dl>
        {carga.error && <div className="card-pad"><ErrorCarga titulo="No pudimos cargar tu celular y tu correo" mensaje={carga.error} onReintentar={() => void carga.recargar()} /></div>}
        {!c && !carga.error && <p className="card-pad small muted">Cargando tus datos de contacto…</p>}
      </div>
      {c?.sharedPhone && <p className="tiny muted mt-8" data-testid="celular-compartido">Tu celular también lo tiene registrado otro socio de este gimnasio.</p>}
      <p className="tiny muted mt-8" data-testid="lo-que-no-cambias">
        Tu celular, tu correo y tu contacto de emergencia los cambias tú aquí, y recepción recibe el aviso. Tu nombre, tu fecha de nacimiento, tu CURP, tu plan y tu coach no se cambian desde el teléfono: dilo en recepción o pide la corrección abajo, en «Tus permisos».
      </p>

      {c && hoja === 'celular' && <CambiarCelular c={c} onClose={() => setHoja(null)} onListo={listo} />}
      {c && hoja === 'correo' && <CambiarCorreo c={c} onClose={() => setHoja(null)} onListo={listo} />}
      {c && hoja === 'emergencia' && <CambiarEmergencia c={c} onClose={() => setHoja(null)} onListo={listo} />}
    </>
  );
}

/** El campo donde escribe completo su dato actual. Sin celular ni correo registrados no hay con qué confirmar. */
function Confirmacion({ c, valor, onChange, error }: { c: PortalContact; valor: string; onChange: (v: string) => void; error: string | null }) {
  if (!c.confirmWith) return null;
  const conCelular = c.confirmWith === 'PHONE';
  return (
    <div className="field" data-error={error ? 'true' : undefined}>
      <label className="label" htmlFor="td-confirma">{conCelular ? 'Tu celular actual, completo' : 'Tu correo actual, completo'}</label>
      <input id="td-confirma" className="input" value={valor} onChange={(e) => onChange(e.target.value)} autoComplete="off"
        {...(conCelular ? { type: 'tel', inputMode: 'numeric' as const, placeholder: '10 dígitos' } : { type: 'email', inputMode: 'email' as const })}
        aria-invalid={error ? true : undefined} aria-describedby={error ? 'td-confirma-error' : 'td-confirma-ayuda'} />
      {error ? <span className="campo-error" role="alert" id="td-confirma-error">{error}</span>
        : <span className="hint" id="td-confirma-ayuda">Para confirmar que eres tú: el que tenemos registrado {conCelular ? `termina en ${c.phoneMasked?.slice(-4) ?? '····'}` : `es ${c.emailMasked ?? ''}`}. Si ya no lo recuerdas, pasa a recepción.</span>}
    </div>
  );
}

function faltaConfirmar(c: PortalContact, escrito: string): string | false {
  if (!c.confirmWith) return false;
  if (c.confirmWith === 'PHONE') return !esCelular(escrito) && 'Escribe los 10 dígitos del celular que tienes registrado.';
  return !esCorreo(escrito) && 'Escribe completo el correo que tienes registrado.';
}

/** Lo que dijo la API, puesto donde toca: la confirmación en su campo, lo demás en el pie de la hoja. */
function leerError(e: unknown): { confirma: string | null; enUso: boolean; pie: string | null } {
  const texto = e instanceof ApiError ? e.message : 'No se pudo guardar. Vuelve a intentar.';
  const motivo = e instanceof ApiError ? e.reason : undefined;
  if (motivo === 'CONTACT_CONFIRMATION_FAILED') return { confirma: texto, enUso: false, pie: null };
  if (motivo === 'PHONE_IN_USE') return { confirma: null, enUso: true, pie: null };
  return { confirma: null, enUso: false, pie: texto };
}

function CambiarCelular({ c, onClose, onListo }: { c: PortalContact; onClose: () => void; onListo: (texto: string) => void }) {
  const [nuevo, setNuevo] = useState('');
  const [confirma, setConfirma] = useState('');
  // Solo aparece si la API dice que ese celular ya es de otro socio (D-09). Nunca se dice de quién.
  const [enUso, setEnUso] = useState(false);
  const [quien, setQuien] = useState<Quien | null>(null);
  const [adulto, setAdulto] = useState('');
  const [pie, setPie] = useState<string | null>(null);
  const agotado = c.limits.phone.left === 0;
  const f = useFormulario({
    nuevo: !esCelular(nuevo) && 'Escribe los 10 dígitos de tu celular nuevo.',
    confirma: faltaConfirmar(c, confirma),
    quien: enUso && !quien && 'Dinos quién responde por ese número.',
    adulto: enUso && quien === 'ADULT' && !esNombre(adulto) && 'Escribe su nombre completo.',
  });

  async function guardar() {
    setPie(null);
    try {
      const r = await api<PortalContact>('/portal/me/contact', {
        method: 'PATCH',
        body: JSON.stringify({
          phoneE164: diezDigitos(nuevo), ...(c.confirmWith ? { confirm: confirma.trim() } : {}),
          ...(enUso && quien ? { responsible: quien === 'ADULT' ? { kind: 'ADULT', name: adulto.trim() } : { kind: quien } } : {}),
        }),
      });
      onListo(r.sharedPhone ? 'Listo: tu celular ya cambió y quedó anotado que lo compartes. Recepción recibió el aviso.' : 'Listo: tu celular ya cambió. Recepción recibió el aviso.');
    } catch (e) {
      const leido = leerError(e);
      if (leido.enUso) setEnUso(true);
      if (leido.confirma) f.marcar({ confirma: leido.confirma });
      setPie(leido.pie);
    }
  }

  return (
    <Sheet open onClose={onClose} title={c.hasPhone ? 'Cambiar tu celular' : 'Agregar tu celular'} error={pie}
      footer={<>
        <Button variant="secondary" block onClick={onClose}>Cancelar</Button>
        {!agotado && <Button block loading={f.enviando} onClick={() => void f.enviar(guardar)}>Guardar</Button>}
      </>}>
      <div data-testid="hoja-celular">
        {agotado ? <Callout tone="warn" title="Por ahora, en recepción">{cupo(c.limits.phone, c.windowDays, 'tu celular')}</Callout> : (
          <>
            <Callout tone="info" title="Queda cambiado al guardar">Con tu celular el gimnasio te reconoce y te escribe. Recepción recibe el aviso y te avisamos también en tu campana.</Callout>
            <div className="field" data-error={f.error('nuevo') ? 'true' : undefined}>
              <label className="label" htmlFor="td-celular">Tu celular nuevo</label>
              <input id="td-celular" className="input" type="tel" inputMode="numeric" autoComplete="tel" placeholder="10 dígitos" value={nuevo}
                onChange={(e) => { setNuevo(e.target.value); setEnUso(false); setQuien(null); }}
                aria-invalid={f.error('nuevo') ? true : undefined} aria-describedby={f.error('nuevo') ? 'td-celular-error' : undefined} />
              {f.error('nuevo') && <span className="campo-error" role="alert" id="td-celular-error">{f.error('nuevo')}</span>}
            </div>
            <Confirmacion c={c} valor={confirma} onChange={(v) => { setConfirma(v); f.limpiar('confirma'); }} error={f.error('confirma')} />
            {enUso && (
              <fieldset className="field pregunta-si-no" data-testid="celular-en-uso" data-error={f.error('quien') ? 'true' : undefined}>
                <legend className="label">Ese celular ya lo tiene registrado otro socio de este gimnasio. Si lo comparten, ¿quién responde por ese número?</legend>
                <div className="stack gap-8">
                  <button type="button" className="chip" aria-pressed={quien === 'SELF'} onClick={() => setQuien('SELF')}>Yo: es mi número</button>
                  <button type="button" className="chip" aria-pressed={quien === 'HOLDER'} onClick={() => setQuien('HOLDER')}>Mi familiar, que ya es socio aquí</button>
                  <button type="button" className="chip" aria-pressed={quien === 'ADULT'} onClick={() => setQuien('ADULT')}>Otro adulto, que no es socio</button>
                </div>
                {f.error('quien') && <span className="campo-error" role="alert">{f.error('quien')}</span>}
                {quien === 'ADULT' && (
                  <div className="field" data-error={f.error('adulto') ? 'true' : undefined}>
                    <label className="label" htmlFor="td-adulto">Su nombre completo</label>
                    <input id="td-adulto" className="input" autoComplete="off" value={adulto} onChange={(e) => setAdulto(e.target.value)} aria-invalid={f.error('adulto') ? true : undefined} />
                    {f.error('adulto') && <span className="campo-error" role="alert">{f.error('adulto')}</span>}
                  </div>
                )}
                <span className="hint">Si no lo comparten, revisa el número. Recepción lo confirmará contigo cuando vengas.</span>
              </fieldset>
            )}
            <p className="tiny muted mt-10">{cupo(c.limits.phone, c.windowDays, 'tu celular')}</p>
          </>
        )}
      </div>
    </Sheet>
  );
}

function CambiarCorreo({ c, onClose, onListo }: { c: PortalContact; onClose: () => void; onListo: (texto: string) => void }) {
  const [nuevo, setNuevo] = useState('');
  const [confirma, setConfirma] = useState('');
  const [pie, setPie] = useState<string | null>(null);
  const [quitando, setQuitando] = useState(false);
  const agotado = c.limits.email.left === 0;
  const f = useFormulario({
    nuevo: !esCorreo(nuevo) && 'Escribe tu correo completo, con su @.',
    confirma: faltaConfirmar(c, confirma),
  });

  async function mandar(email: string | null) {
    setPie(null);
    try {
      await api<PortalContact>('/portal/me/contact', { method: 'PATCH', body: JSON.stringify({ email, ...(c.confirmWith ? { confirm: confirma.trim() } : {}) }) });
      onListo(email ? 'Listo: tu correo ya cambió. Recepción recibió el aviso.' : 'Listo: ya no tenemos tu correo. Recepción recibió el aviso.');
    } catch (e) {
      const leido = leerError(e);
      if (leido.confirma) f.marcar({ confirma: leido.confirma });
      setPie(leido.pie);
    }
  }
  /** Quitarlo solo pide la confirmación: no hay correo nuevo que validar. */
  async function quitar() {
    const falta = faltaConfirmar(c, confirma);
    if (falta) { f.marcar({ confirma: falta }); return; }
    setQuitando(true);
    try { await mandar(null); } finally { setQuitando(false); }
  }

  return (
    <Sheet open onClose={onClose} title={c.hasEmail ? 'Cambiar tu correo' : 'Agregar tu correo'} error={pie}
      footer={<>
        <Button variant="secondary" block onClick={onClose}>Cancelar</Button>
        {!agotado && <Button block loading={f.enviando} disabled={quitando} onClick={() => void f.enviar(() => mandar(nuevo.trim()))}>Guardar</Button>}
      </>}>
      <div data-testid="hoja-correo">
        {agotado ? <Callout tone="warn" title="Por ahora, en recepción">{cupo(c.limits.email, c.windowDays, 'tu correo')}</Callout> : (
          <>
            <div className="field" data-error={f.error('nuevo') ? 'true' : undefined}>
              <label className="label" htmlFor="td-correo">Tu correo nuevo</label>
              <input id="td-correo" className="input" type="email" inputMode="email" autoComplete="email" value={nuevo} onChange={(e) => setNuevo(e.target.value)}
                aria-invalid={f.error('nuevo') ? true : undefined} aria-describedby={f.error('nuevo') ? 'td-correo-error' : undefined} />
              {f.error('nuevo') && <span className="campo-error" role="alert" id="td-correo-error">{f.error('nuevo')}</span>}
            </div>
            <Confirmacion c={c} valor={confirma} onChange={(v) => { setConfirma(v); f.limpiar('confirma'); }} error={f.error('confirma')} />
            <p className="tiny muted mt-10">{cupo(c.limits.email, c.windowDays, 'tu correo')} Queda cambiado al guardar y recepción recibe el aviso.</p>
            {/* Sin celular, el correo es lo único con que el gimnasio lo localiza: no se quita desde aquí. */}
            {c.hasEmail && c.hasPhone && (
              <div className="mt-12"><Button variant="secondary" size="sm" loading={quitando} disabled={f.enviando} onClick={() => void quitar()}>Quitar mi correo</Button></div>
            )}
          </>
        )}
      </div>
    </Sheet>
  );
}

function CambiarEmergencia({ c, onClose, onListo }: { c: PortalContact; onClose: () => void; onListo: (texto: string) => void }) {
  const [nombre, setNombre] = useState(c.emergencyContactName ?? '');
  const [tel, setTel] = useState(c.emergencyContactPhone ? telefono(c.emergencyContactPhone) : '');
  const [pie, setPie] = useState<string | null>(null);
  const agotado = c.limits.emergency.left === 0;
  const f = useFormulario({
    nombre: nombre.trim() !== '' && !esNombre(nombre) && 'Solo letras, espacios, apóstrofo, guion y punto.',
    tel: tel.trim() !== '' && !esCelular(tel) && 'Escribe los 10 dígitos de su teléfono.',
  });

  async function guardar() {
    setPie(null);
    try {
      await api<PortalContact>('/portal/me/contact', {
        method: 'PATCH', body: JSON.stringify({ emergencyContactName: nombre.trim(), emergencyContactPhone: tel.trim() ? diezDigitos(tel) : null }),
      });
      onListo('Listo: tu contacto de emergencia quedó guardado.');
    } catch (e) { setPie(leerError(e).pie ?? 'No se pudo guardar. Vuelve a intentar.'); }
  }

  return (
    <Sheet open onClose={onClose} title="Tu contacto de emergencia" error={pie}
      footer={<>
        <Button variant="secondary" block onClick={onClose}>Cancelar</Button>
        {!agotado && <Button block loading={f.enviando} onClick={() => void f.enviar(guardar)}>Guardar</Button>}
      </>}>
      <div data-testid="hoja-emergencia">
        {agotado ? <Callout tone="warn" title="Por ahora, en recepción">{cupo(c.limits.emergency, c.windowDays, 'tu contacto de emergencia')}</Callout> : (
          <>
            <p className="small">A quién llamamos si te pasa algo en el gimnasio.</p>
            <div className="field" data-error={f.error('nombre') ? 'true' : undefined}>
              <label className="label" htmlFor="td-en">Su nombre</label>
              <input id="td-en" className="input" autoComplete="off" value={nombre} onChange={(e) => setNombre(e.target.value)} aria-invalid={f.error('nombre') ? true : undefined} />
              {f.error('nombre') && <span className="campo-error" role="alert">{f.error('nombre')}</span>}
            </div>
            <div className="field" data-error={f.error('tel') ? 'true' : undefined}>
              <label className="label" htmlFor="td-et">Su teléfono</label>
              <input id="td-et" className="input" type="tel" inputMode="numeric" autoComplete="off" placeholder="10 dígitos" value={tel} onChange={(e) => setTel(e.target.value)} aria-invalid={f.error('tel') ? true : undefined} />
              {f.error('tel') && <span className="campo-error" role="alert">{f.error('tel')}</span>}
            </div>
            <p className="tiny muted mt-10">Déjalos vacíos para quitarlo. Queda guardado al momento.</p>
          </>
        )}
      </div>
    </Sheet>
  );
}
