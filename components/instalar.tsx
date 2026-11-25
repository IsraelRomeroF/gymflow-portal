'use client';

import { useEffect, useState } from 'react';
import { Download, Share, X } from 'lucide-react';
import { Button } from './ui';
import { IconButton, IconTile } from '@gymflow/ui/compartido';

type Aviso = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
const CLAVE = 'gf-instalar-oculto';

/** Registra el service worker: sin señal, el ícono abre el portal y no el error del navegador. */
export function useServiceWorker() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  }, []);
}

/** Al cerrar sesión no queda nada del socio en el teléfono. */
export async function borrarCacheDelPortal() {
  try { for (const k of await caches.keys()) await caches.delete(k); } catch { /* sin caché */ }
}

/**
 * "Instala GymFlow" (UX7 Portal 10): nadie le decía al socio que el portal
 * se instala. En Android se usa el aviso del navegador; en iPhone se explica
 * "Compartir → Agregar a inicio". Ya instalada, o descartada, no aparece.
 */
export function InstalarApp() {
  const [evento, setEvento] = useState<Aviso | null>(null);
  const [ios, setIos] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const instalada = window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
    let oculto = false;
    try { oculto = localStorage.getItem(CLAVE) === '1'; } catch { /* nada */ }
    if (instalada || oculto) return;
    const esIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    setIos(esIos); if (esIos) setVisible(true);
    const alAvisar = (e: Event) => { e.preventDefault(); setEvento(e as Aviso); setVisible(true); };
    window.addEventListener('beforeinstallprompt', alAvisar);
    return () => window.removeEventListener('beforeinstallprompt', alAvisar);
  }, []);

  const ocultar = () => { setVisible(false); try { localStorage.setItem(CLAVE, '1'); } catch { /* nada */ } };
  if (!visible) return null;
  return (
    <div className="card card-pad instalar" data-testid="instalar" style={{ marginTop: 22 }}>
      <div className="row items-start gap-12">
        <IconTile tone="volt"><Download /></IconTile>
        <div className="flex-1 min-w-0">
          <p className="item-title">Instala GymFlow en tu teléfono</p>
          <p className="item-sub">{ios
            ? <>Toca <Share size={13} style={{ verticalAlign: '-2px' }} aria-label="Compartir" /> y luego «Agregar a inicio». Abre como app, aun con poca señal.</>
            : 'Ábrelo como app desde tu pantalla de inicio, aun con poca señal.'}</p>
          {evento && (
            <Button size="sm" style={{ marginTop: 10 }} onClick={async () => { await evento.prompt(); await evento.userChoice; ocultar(); }}>Instalar</Button>
          )}
        </div>
        <IconButton label="Ahora no" onClick={ocultar}><X size={18} /></IconButton>
      </div>
    </div>
  );
}
