'use client';

import { useEffect, useRef, useState } from 'react';
import { CircleCheck, ConciergeBell, FileSignature } from 'lucide-react';
import { api } from '@/lib/api';
import { Button, Callout, Skeleton } from '@/components/ui';
import { IconTile, Marca } from '@/components/compartido';
import { CampoFecha } from '@/components/campos';

type Documento = { consentType: string; version: string; title: string; bodyText: string; required: boolean };
type Formulario = { gymName: string; branchName: string; documents: Documento[]; blockedBy: Array<{ kind: string; consentType: string }> };

/** Los campos que el servidor puede señalar, con el `id` de su control. */
const CONTROL: Record<string, string> = {
  firstName: 'fn', lastName: 'ln', birthDate: 'bd', phone: 'ph', email: 'em', memberSince: 'ms',
  emergencyContactName: 'en', emergencyContactPhone: 'ep', healthNotes: 'hn',
  // D-10 (fase 3, bloque 3.4): mayoría de edad y tutor.
  adult: 'ad-si', guardianName: 'tn', guardianPhone: 'tp',
};
const SALUD_MAXIMO = 1000;

/** El error de un envío: el mensaje para arriba y, si la API lo dice, a qué campo corresponde cada uno. */
class ErrorDeEnvio extends Error {
  constructor(message: string, readonly porCampo: Record<string, string>) { super(message); }
}

/**
 * El envío, con sus errores POR CAMPO (9-10). La API ya decía qué campo
 * falló (`issues` de la validación de forma, `detail` de la del alta) y el
 * portal lo pegaba todo en un aviso al final, a mil píxeles del campo.
 */
async function enviarAlta(sucursal: string, cuerpo: unknown): Promise<{ id: string; folio: string }> {
  let res: Response;
  try {
    res = await fetch(`/api/intake/${encodeURIComponent(sucursal)}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(cuerpo) });
  } catch { throw new ErrorDeEnvio('No hay conexión. Revisa tu internet y vuelve a intentar: lo que escribiste sigue aquí.', {}); }
  if (res.status >= 500) throw new ErrorDeEnvio('Algo falló de nuestro lado. Vuelve a intentar en un momento: lo que escribiste sigue aquí.', {});
  const b = await res.json().catch(() => ({})) as { message?: string; detail?: string; issues?: Array<{ path?: string; message?: string }>; id?: string; folio?: string };
  if (res.ok && b.id) return { id: b.id, folio: b.folio ?? b.id.replace(/-/g, '').slice(-6).toUpperCase() };
  const porCampo: Record<string, string> = {};
  for (const i of b.issues ?? []) {
    const campo = (i.path ?? '').split('.').filter((x) => !/^\d+$/.test(x)).at(-1) ?? '';
    if (campo && i.message && CONTROL[campo] && !porCampo[campo]) porCampo[campo] = i.message;
  }
  try {
    for (const e of JSON.parse(b.detail ?? '[]') as Array<{ field?: string; message?: string }>) {
      if (e.field && e.message && CONTROL[e.field] && !porCampo[e.field]) porCampo[e.field] = e.message;
    }
  } catch { /* `detail` no era una lista de campos */ }
  throw new ErrorDeEnvio(b.message ?? 'No se pudo enviar. Revisa tus datos y vuelve a intentar.', porCampo);
}

/**
 * ALTA DIGITAL — el formulario que abre el socio al escanear el QR.
 *
 * Es la única pantalla del portal SIN sesión, y lo que manda no es un socio:
 * es un borrador que recepción confirma. Por eso pide poco y perdona mucho —
 * un campo que rebota es un socio que abandona y acaba en el mostrador, que
 * es exactamente lo que el alta digital existe para evitar.
 *
 * Bloque 2.4 (auditoría 8): la antigüedad se pregunta SIEMPRE, con sí o no
 * (9-07: ningún QR ni cartel llevaba `?antiguedad=1`, y quien arrancaba en
 * blanco registraba a sus socios de siempre como nuevos); el error va en su
 * campo (9-10); y al terminar hay un folio que dictar en recepción (9-06).
 *
 * Fase 3, bloque 3.4 (D-10): se pregunta si tiene 18 años o más. De 15 a 17
 * escribe el nombre y el celular de su papá, mamá o tutor; su alta queda
 * «falta su tutor» y se aprueba cuando el tutor firma en el mostrador. A un
 * menor NO se le pregunta nada de salud: eso lo autoriza y lo dice su tutor.
 */

/** Años cumplidos hoy, con la fecha `AAAA-MM-DD` del campo (el servidor decide con el día de la sucursal). */
function edad(nacimiento: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(nacimiento)) return null;
  const hoy = new Date();
  const mesDia = `${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
  return hoy.getFullYear() - Number(nacimiento.slice(0, 4)) - (mesDia < nacimiento.slice(5) ? 1 : 0);
}

export function FormularioAlta({ sucursal }: { sucursal: string }) {
  const [form, setForm] = useState<Formulario | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  const [folio, setFolio] = useState<string | null>(null);
  const [aceptado, setAceptado] = useState<Record<string, boolean>>({});
  // Las fechas se escriben día/mes/año en cualquier teléfono (D26-02); el formulario las lee de su campo oculto.
  const [nacimiento, setNacimiento] = useState('');
  const [socioDesde, setSocioDesde] = useState('');
  // «¿Ya venías a este gimnasio?»: nada viene marcado; sin respuesta cuenta como nuevo.
  const [yaVenia, setYaVenia] = useState<boolean | null>(null);
  // «¿Tienes 18 años o más?» (D-10): nada viene marcado. Si ya escribió su nacimiento, manda la fecha.
  const [adulto, setAdulto] = useState<boolean | null>(null);
  const [esperaTutor, setEsperaTutor] = useState(false);
  const [salud, setSalud] = useState('');
  // El botón de abajo se queda pegado a la pantalla solo después de pasar por «Contacto» (9-10):
  // antes tapaba «con uno de los dos basta…» justo cuando se estaba leyendo.
  const [pasoContacto, setPasoContacto] = useState(false);
  const finDeContacto = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    api<Formulario>(`/intake/${sucursal}/form`)
      .then(setForm)
      .catch((e) => setError(e instanceof Error ? e.message : 'No se pudo cargar el formulario'));
  }, [sucursal]);

  const visible = !!form && form.blockedBy.length === 0 && !folio;
  useEffect(() => {
    const marca = finDeContacto.current;
    if (!visible || !marca || pasoContacto) return;
    if (typeof IntersectionObserver === 'undefined') { setPasoContacto(true); return; }
    // Ya quedó arriba de la pantalla (o entera a la vista y con espacio debajo): el botón ya no le estorba.
    const o = new IntersectionObserver(([e]) => {
      if (e && (e.boundingClientRect.bottom < 0 || (e.isIntersecting && e.boundingClientRect.bottom < window.innerHeight - 120))) setPasoContacto(true);
    }, { threshold: [0, 1] });
    o.observe(marca);
    return () => o.disconnect();
  }, [visible, pasoContacto]);

  const quitar = (campo: string) => setErrores(({ [campo]: _, ...resto }) => resto);
  const anios = edad(nacimiento);
  const esMenor = anios !== null ? anios < 18 : adulto === false;

  async function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!form) return;
    const datos = new FormData(e.currentTarget);
    setError(null); setErrores({});
    // Sin fecha de nacimiento hay que contestar la pregunta; quien dice no tener 18 da su fecha.
    const faltaEdad: Record<string, string> | null = anios === null && adulto === null ? { adult: 'Dinos si tienes 18 años o más' }
      : anios === null && adulto === false ? { birthDate: 'Si tienes menos de 18 años, escribe tu fecha de nacimiento' } : null;
    if (faltaEdad) {
      setErrores(faltaEdad);
      const el = document.getElementById(CONTROL[Object.keys(faltaEdad)[0]!]!);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' }); el?.focus({ preventScroll: true });
      return;
    }
    setEnviando(true);
    try {
      const r = await enviarAlta(sucursal, {
        firstName: datos.get('firstName'),
        lastName: datos.get('lastName'),
        phone: datos.get('phone') || null,
        email: datos.get('email') || null,
        birthDate: datos.get('birthDate') || null,
        emergencyContactName: datos.get('emergencyContactName') || null,
        emergencyContactPhone: datos.get('emergencyContactPhone') || null,
        memberSince: yaVenia ? datos.get('memberSince') || null : null,
        // A un menor no se le pregunta nada de salud: lo autoriza su tutor en el mostrador.
        healthNotes: esMenor ? null : datos.get('healthNotes') || null,
        adult: !esMenor,
        guardianName: esMenor ? datos.get('guardianName') || null : null,
        guardianPhone: esMenor ? datos.get('guardianPhone') || null : null,
        consents: form.documents.map((d) => ({
          consentType: d.consentType,
          version: d.version,
          granted: esMenor && d.consentType === 'HEALTH_DATA' ? false : aceptado[d.consentType] ?? false,
        })),
      });
      setEsperaTutor(esMenor);
      setFolio(r.folio);
      window.scrollTo({ top: 0 });
    } catch (err) {
      const porCampo = err instanceof ErrorDeEnvio ? err.porCampo : {};
      setErrores(porCampo);
      const primero = Object.keys(CONTROL).find((k) => porCampo[k]);
      // Con un campo señalado, el aviso general sobra: se lleva a la persona al campo.
      if (primero) requestAnimationFrame(() => { const el = document.getElementById(CONTROL[primero]!); el?.scrollIntoView({ behavior: 'smooth', block: 'center' }); el?.focus({ preventScroll: true }); });
      else setError(err instanceof Error ? err.message : 'No se pudo enviar');
    } finally {
      setEnviando(false);
    }
  }

  const cabecera = (titulo: React.ReactNode, texto: string) => (
    <div className="hero">
      <div className="brand">
        <span className="brand-mark"><Marca size={18} /></span>
        <div>
          <div className="brand-name">{form?.gymName || 'Alta en línea'}</div>
          <div className="brand-sub">{form ? `Sucursal ${form.branchName}` : ' '}</div>
        </div>
      </div>
      <h1 className="hero-title">{titulo}</h1>
      <p className="hero-text">{texto}</p>
    </div>
  );

  if (error && !form) {
    return <div className="app app-plain">{cabecera('Alta en línea', 'Algo no salió bien.')}<div className="mt-20"><Callout tone="danger">{error}</Callout></div></div>;
  }
  if (!form) {
    return <div className="app app-plain"><div className="stack mt-20"><Skeleton h={200} r={24} /><Skeleton h={50} /><Skeleton h={50} /><Skeleton h={50} /></div></div>;
  }

  if (form.blockedBy.length > 0) {
    // Los textos todavía no están publicados: vale más decirlo que recoger
    // firmas sobre un borrador, que no servirían como evidencia.
    return (
      <div className="app app-plain">
        {cabecera('Alta en línea', `Sucursal ${form.branchName}`)}
        <div className="mt-20">
          <Callout tone="info" title="Todavía no disponible aquí">
            <p className="small">El alta en línea aún no está abierta en esta sucursal. Pasa al mostrador y con gusto te registramos.</p>
          </Callout>
        </div>
      </div>
    );
  }

  if (folio) {
    return (
      <div className="app app-plain">
        {cabecera(<>¡Listo, <em>ya casi</em>!</>, `Tus datos llegaron a ${form.branchName}.`)}
        <div className="card card-pad mt-20 folio-alta" data-testid="folio-alta">
          <p className="eyebrow">Tu folio</p>
          <p className="folio-alta-codigo" aria-label={`Folio ${folio.split('').join(' ')}`}>{folio}</p>
          <p className="item-sub">Dilo en recepción y te encuentran al momento. Tómale captura por si pasas otro día.</p>
        </div>
        <div className="card card-pad mt-12">
          <div className="row items-start">
            <IconTile tone="ok"><CircleCheck /></IconTile>
            <div>
              <p className="item-title">{esperaTutor ? 'Falta que venga tu papá, mamá o tutor' : 'Solo falta pasar a recepción'}</p>
              <p className="item-sub" data-testid={esperaTutor ? 'falta-tu-tutor' : undefined}>{esperaTutor
                ? 'Como tienes menos de 18 años, tu alta se aprueba cuando tu papá, mamá o tutor firma en recepción. Ven con él o ella: ya no hay que capturar nada.'
                : 'Ya no hay que capturar nada: confirman tus datos, eliges tu plan y te dan tu código para entrar a este portal desde tu celular.'}</p>
            </div>
          </div>
        </div>
        <div className="card card-pad mt-12">
          <div className="row items-start">
            <span className="item-icon"><ConciergeBell /></span>
            <p className="item-sub">Si quieres entrar con tu rostro o tu huella, pídelo ahí mismo. Es opcional.</p>
          </div>
        </div>
      </div>
    );
  }

  // A un menor no se le enseña el permiso de datos de salud: no es suyo para darlo (D-10).
  const documentos = form.documents.filter((d) => !(esMenor && d.consentType === 'HEALTH_DATA'));
  const faltan = documentos.filter((d) => d.required && !aceptado[d.consentType]).length;
  /** El error de un campo, debajo de él. */
  const err = (campo: string) => (errores[campo] ? <span className="campo-error" role="alert" id={`${CONTROL[campo]}-error`}>{errores[campo]}</span> : null);
  const marca = (campo: string) => (errores[campo] ? { 'aria-invalid': true as const, 'aria-describedby': `${CONTROL[campo]}-error` } : {});

  return (
    <div className="app app-plain">
      {cabecera(<>Regístrate en <em>2 minutos</em></>, 'Llénalo desde tu teléfono y en recepción solo lo confirman.')}

      <form onSubmit={enviar} className="mt-8 form-alta" noValidate>
        <p className="section-title eyebrow form-alta-inicio">Tus datos</p>
        <div className="field"><label className="label" htmlFor="fn">Nombre(s)</label><input id="fn" name="firstName" required autoComplete="given-name" className="input" onChange={() => quitar('firstName')} {...marca('firstName')} />{err('firstName')}</div>
        <div className="field"><label className="label" htmlFor="ln">Apellidos</label><input id="ln" name="lastName" required autoComplete="family-name" className="input" onChange={() => quitar('lastName')} {...marca('lastName')} />{err('lastName')}</div>
        <div className="field"><label className="label" htmlFor="bd">Fecha de nacimiento</label><CampoFecha id="bd" name="birthDate" value={nacimiento} onChange={(v) => { setNacimiento(v); quitar('birthDate'); quitar('adult'); }} {...marca('birthDate')} />{err('birthDate')}</div>
        {/* D-10: sin fecha, se pregunta. Con fecha, la respuesta ya se sabe y la pregunta sobra. */}
        {anios === null && (
          <fieldset className="field pregunta-si-no">
            <legend className="label">¿Tienes 18 años o más?</legend>
            <div className="row gap-8">
              <button type="button" id="ad-si" className="chip" aria-pressed={adulto === true} onClick={() => { setAdulto(true); quitar('adult'); quitar('birthDate'); }}>Sí</button>
              <button type="button" className="chip" aria-pressed={adulto === false} onClick={() => { setAdulto(false); quitar('adult'); }}>No, tengo de 15 a 17</button>
            </div>
            {err('adult')}
          </fieldset>
        )}
        {esMenor && (
          <div data-testid="datos-del-tutor">
            <p className="section-title eyebrow mt-28">Tu papá, mamá o tutor</p>
            <p className="hint">Como tienes menos de 18 años, tu alta se aprueba cuando él o ella firma en recepción. Dinos a quién llamamos.</p>
            <div className="field"><label className="label" htmlFor="tn">Su nombre completo</label><input id="tn" name="guardianName" className="input" autoComplete="off" onChange={() => quitar('guardianName')} {...marca('guardianName')} />{err('guardianName')}</div>
            <div className="field"><label className="label" htmlFor="tp">Su celular</label><input id="tp" name="guardianPhone" type="tel" inputMode="numeric" placeholder="10 dígitos" className="input" autoComplete="off" onChange={() => quitar('guardianPhone')} {...marca('guardianPhone')} />{err('guardianPhone')}</div>
          </div>
        )}

        <p className="section-title eyebrow mt-28">Contacto</p>
        <div className="field"><label className="label" htmlFor="ph">Celular</label><input id="ph" name="phone" type="tel" inputMode="numeric" autoComplete="tel" placeholder="10 dígitos" className="input" onChange={() => quitar('phone')} {...marca('phone')} />{err('phone')}</div>
        <div className="field"><label className="label" htmlFor="em">Correo</label><input id="em" name="email" type="email" autoComplete="email" className="input" onChange={() => { quitar('email'); quitar('phone'); }} {...marca('email')} />{err('email')}</div>
        <p className="hint mt-8" ref={finDeContacto}>Con uno de los dos basta, pero necesitamos al menos uno para contactarte.</p>

        {/* Se pregunta siempre, con sí o no (9-07). Lo contesta el socio, que lo recuerda mejor que
            recepción: es el dato que sostiene la antigüedad cuando el gimnasio arranca en blanco. */}
        <fieldset className="field pregunta-si-no">
          <legend className="label">¿Ya venías a este gimnasio?</legend>
          <div className="row gap-8">
            <button type="button" className="chip" aria-pressed={yaVenia === false} onClick={() => { setYaVenia(false); quitar('memberSince'); }}>No, soy nuevo</button>
            <button type="button" className="chip" aria-pressed={yaVenia === true} onClick={() => setYaVenia(true)}>Sí, ya venía</button>
          </div>
        </fieldset>
        {yaVenia && (
          <div className="field">
            <label className="label" htmlFor="ms">¿Desde cuándo vienes al gimnasio?</label>
            <CampoFecha id="ms" name="memberSince" value={socioDesde} onChange={(v) => { setSocioDesde(v); quitar('memberSince'); }} {...marca('memberSince')} />
            {err('memberSince') ?? <span className="hint">Aproximado está bien: con el mes y el año basta. Nos sirve para reconocer tu antigüedad.</span>}
          </div>
        )}

        <p className="section-title eyebrow mt-28">En caso de emergencia</p>
        <div className="field"><label className="label" htmlFor="en">Nombre</label><input id="en" name="emergencyContactName" className="input" onChange={() => quitar('emergencyContactName')} {...marca('emergencyContactName')} />{err('emergencyContactName')}</div>
        <div className="field"><label className="label" htmlFor="ep">Teléfono</label><input id="ep" name="emergencyContactPhone" type="tel" inputMode="numeric" className="input" onChange={() => quitar('emergencyContactPhone')} {...marca('emergencyContactPhone')} />{err('emergencyContactPhone')}</div>

        <p className="section-title eyebrow mt-28">Documentos</p>
        {esMenor && <p className="hint">Lo que aceptes aquí lo confirma tu papá, mamá o tutor al firmar en recepción. Si tienes alguna lesión o padecimiento, lo dirá él o ella ahí.</p>}
        {documentos.map((d) => (
          <div key={d.consentType} className="card card-pad mt-12">
            <div className="row gap-10">
              <FileSignature size={18} className="muted" />
              <p className="strong">{d.title}</p>
              {!d.required && <span className="tiny muted">Opcional</span>}
            </div>
            {/* El texto COMPLETO, no un enlace: hay que poder demostrar que se
                le enseñó, y un enlace que nadie abre no demuestra nada. */}
            <div className="doc">{d.bodyText}</div>
            <label className="check">
              <input type="checkbox" checked={aceptado[d.consentType] ?? false}
                onChange={(ev) => setAceptado((a) => ({ ...a, [d.consentType]: ev.target.checked }))} />
              {/* Con nombre: tres casillas "Leí y acepto" no se distinguían en un lector de pantalla. */}
              <span>Leí y acepto: {d.title.toLowerCase()}</span>
            </label>
            {/* La pregunta de salud vive DENTRO de su consentimiento: sin
                aceptarlo no se pregunta, y el servidor tampoco la guardaría. */}
            {d.consentType === 'HEALTH_DATA' && aceptado.HEALTH_DATA && (
              <div className="field">
                <label className="label" htmlFor="hn">¿Algo que debamos saber? <span className="muted">(lesiones, condiciones)</span></label>
                <textarea id="hn" name="healthNotes" rows={3} className="textarea" maxLength={SALUD_MAXIMO} placeholder="Lo verá solo tu coach y la gerencia"
                  value={salud} onChange={(ev) => { setSalud(ev.target.value); quitar('healthNotes'); }} {...marca('healthNotes')} />
                {err('healthNotes') ?? <span className="hint">{salud.length === 0 ? `Hasta ${SALUD_MAXIMO.toLocaleString('es-MX')} caracteres.` : `${salud.length.toLocaleString('es-MX')} de ${SALUD_MAXIMO.toLocaleString('es-MX')} caracteres.`}</span>}
              </div>
            )}
          </div>
        ))}

        {error && <div className="mt-14"><Callout tone="danger">{error}</Callout></div>}

        <div className={`${pasoContacto ? 'sticky-foot' : 'pie-alta'} mt-20`}>
          {faltan > 0
            // Aún faltan documentos: el botón lleva a ellos en vez de quedarse apagado dando órdenes.
            ? <Button type="button" block variant="secondary" onClick={() => document.querySelector('.doc')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>
                Continuar: {faltan === 1 ? 'falta aceptar un documento' : `faltan ${faltan} documentos por aceptar`}
              </Button>
            : <Button type="submit" block loading={enviando}>Enviar mis datos</Button>}
        </div>
      </form>
    </div>
  );
}
