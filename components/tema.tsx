'use client';

import { useEffect, useState } from 'react';

type Tema = 'system' | 'light' | 'dark';
const CLAVE = 'gf-tema';

/** Fija el tema antes de pintar, para que no parpadee (UI2-10). Va en el `<head>`. */
export const SCRIPT_TEMA = `try{var t=localStorage.getItem('${CLAVE}');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t;}catch(e){}`;

const OPCIONES: ReadonlyArray<{ value: Tema; label: string }> = [
  { value: 'system', label: 'Automático' }, { value: 'light', label: 'Claro' }, { value: 'dark', label: 'Oscuro' },
];

/** Apariencia del portal en este teléfono. */
export function ElegirTema() {
  const [tema, setTema] = useState<Tema>('system');
  useEffect(() => {
    const t = document.documentElement.dataset.theme;
    setTema(t === 'light' || t === 'dark' ? t : 'system');
  }, []);
  function elegir(t: Tema) {
    if (t === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = t;
    try { if (t === 'system') localStorage.removeItem(CLAVE); else localStorage.setItem(CLAVE, t); } catch { /* solo esta visita */ }
    setTema(t);
  }
  return (
    <div role="radiogroup" aria-label="Apariencia" className="tema-grupo">
      {OPCIONES.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={tema === o.value} className="tema-opcion" onClick={() => elegir(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}
