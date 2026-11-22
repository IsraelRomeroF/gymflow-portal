'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { api } from '@/lib/api';
import { AVISO_DE_SALIDA, esMotivoDeSalida, recordarHasta, volverSeguro, type MotivoDeSalida } from '@/lib/sesion';
import { Button, Callout } from '@/components/ui';
import { Marca } from '@/components/compartido';

/**
 * Activación del portal.
 *
 * El socio lo activa CON RECEPCIÓN DELANTE, que es como ocurre en el alta.
 * Evita depender de un proveedor de SMS y es más seguro: el canal es el
 * mostrador, no la red telefónica.
 *
 * Ya no guarda el secreto del QR: con ADR-032 el acceso es por rostro o
 * huella, y un secreto que nada usa es solo algo más que se puede filtrar.
 */
export default function ActivarPage() {
  const router = useRouter();
  const [codigo, setCodigo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enCurso, setEnCurso] = useState(false);

  // El QR del mostrador trae el código en el fragmento (#): se escribe solo
  // y se borra de la barra para que no quede en el historial.
  // Con sesión viva no se vuelve a pedir código: se va a Inicio (UX7 Portal).
  const [marca, setMarca] = useState<string | null>(null);
  // Por qué volvió aquí (el portal se cerró o venció en este teléfono) y a qué pantalla regresa al activar (24-06, 24-08).
  const [motivo, setMotivo] = useState<MotivoDeSalida | null>(null);
  const [volver, setVolver] = useState<string | null>(null);
  useEffect(() => {
    try { setMarca((JSON.parse(localStorage.getItem('gf-marca') ?? 'null') as { gym?: string } | null)?.gym ?? null); } catch { /* nada */ }
    const q = new URLSearchParams(window.location.search);
    const m = q.get('motivo');
    if (esMotivoDeSalida(m)) setMotivo(m);
    const v = volverSeguro(q.get('volver'));
    setVolver(v);
    if (window.location.hash) return; // Un QR nuevo manda: puede ser otra cuenta.
    api('/portal/me').then(() => router.replace(v ?? '/')).catch(() => undefined);
  }, [router]);

  useEffect(() => {
    const deQr = decodeURIComponent(window.location.hash.slice(1)).trim().toUpperCase();
    if (/^[A-Z0-9-]{6,20}$/.test(deQr)) setCodigo(deQr);
    if (window.location.hash) history.replaceState(null, '', window.location.pathname);
  }, []);

  const activar = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnCurso(true); setError(null);
    try {
      const r = await api<{ expiresAt?: string }>('/portal/enroll', { method: 'POST', body: JSON.stringify({ code: codigo.trim().toUpperCase() }) });
      // Hasta cuándo queda abierto en este teléfono: «Tu cuenta» lo dice (24-04).
      if (r.expiresAt) recordarHasta(r.expiresAt);
      router.replace(volver ?? '/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo activar');
    } finally { setEnCurso(false); }
  };

  return (
    <div className="app app-plain">
      <div className="hero">
        <div className="brand">
          <span className="brand-mark"><Marca size={18} /></span>
          <div>
            <div className="brand-name">{marca ?? 'GymFlow'}</div>
            <div className="brand-sub">Portal del socio</div>
          </div>
        </div>
        <h1 className="hero-title">Tu gimnasio, <em>en tu bolsillo</em>.</h1>
        <p className="hero-text">Reserva clases, revisa tu membresía y paga sin pasar por la fila.</p>
      </div>

      {motivo && (
        <div className="mt-28" data-testid="aviso-activar">
          <Callout tone="info" title={AVISO_DE_SALIDA[motivo].titulo}><p>{AVISO_DE_SALIDA[motivo].texto}</p></Callout>
        </div>
      )}
      <form onSubmit={activar} className={motivo ? 'mt-16' : 'mt-28'}>
        <label className="label" htmlFor="codigo">Código de activación</label>
        <input
          id="codigo" className="code-input" style={{ marginTop: 8 }}
          value={codigo} onChange={(e) => setCodigo(e.target.value.toUpperCase())}
          placeholder="ABCDE-FGHJK" autoCapitalize="characters" autoCorrect="off" autoComplete="one-time-code"
          spellCheck={false} maxLength={24}
        />
        {error && <div className="mt-12"><Callout tone="danger">{error}</Callout></div>}
        <Button type="submit" block loading={enCurso} disabled={codigo.trim().length < 6} style={{ marginTop: 14 }}>
          Activar <ArrowRight />
        </Button>
      </form>

      <div className="card card-pad" style={{ marginTop: 24 }}>
        <p className="strong mb-12">¿Cómo lo consigo?</p>
        <ol className="steps-list" style={{ margin: 0, padding: 0 }}>
          <li>Pídelo en recepción. Te lo dan en el momento.</li>
          <li>Escríbelo aquí. Sirve una sola vez y caduca en 30 minutos.</li>
          <li>Listo: tu teléfono queda vinculado a tu membresía.</li>
        </ol>
      </div>
    </div>
  );
}
