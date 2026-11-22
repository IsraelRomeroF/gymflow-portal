import type { Metadata } from 'next';
import { FormularioAlta } from './formulario-alta';

/** La misma API que usa el proxy del portal (`next.config.ts`). */
const API = process.env.API_URL ?? 'http://127.0.0.1:3001';

/**
 * Lo que dice el enlace cuando se manda por WhatsApp (auditoría 8, bloque 2.4;
 * 9-16). El propio panel dice «compártelo por WhatsApp», y la vista previa
 * decía «GymFlow · Tu membresía, tus clases y tus pagos»: ni el gimnasio ni
 * «inscríbete». Ahora dice a dónde y a qué. Si la API no contesta, o el
 * enlace no es de ninguna sucursal, queda un título que no promete nada.
 */
export async function generateMetadata({ params }: { params: Promise<{ sucursal: string }> }): Promise<Metadata> {
  const { sucursal } = await params;
  let gimnasio = '';
  let sede = '';
  try {
    const r = await fetch(`${API}/intake/${encodeURIComponent(sucursal)}/form`, { cache: 'no-store', signal: AbortSignal.timeout(3000) });
    if (r.ok) {
      const f = await r.json() as { gymName?: string; branchName?: string };
      gimnasio = f.gymName ?? '';
      sede = f.branchName ?? '';
    }
  } catch { /* sin API: el título genérico */ }
  const titulo = gimnasio ? `Inscríbete en ${gimnasio}${sede ? ` · ${sede}` : ''}` : 'Inscripción en línea';
  const descripcion = 'Deja tus datos desde tu celular en 2 minutos; en recepción solo los confirman y eliges tu plan.';
  return {
    // Sin «· GymFlow» detrás: quien lo recibe se inscribe en su gimnasio.
    title: { absolute: titulo },
    description: descripcion,
    openGraph: { title: titulo, description: descripcion, type: 'website' },
    // El formulario no es para buscadores.
    robots: { index: false, follow: false },
  };
}

export default async function AltaPage({ params }: { params: Promise<{ sucursal: string }> }) {
  const { sucursal } = await params;
  return <FormularioAlta sucursal={sucursal} />;
}
