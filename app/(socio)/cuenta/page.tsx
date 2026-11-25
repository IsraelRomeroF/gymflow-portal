'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Download, LogOut, Smartphone } from 'lucide-react';
import type { PortalSessions } from '@gymflow/core/contracts';
import { api } from '@/lib/api';
import { dia } from '@gymflow/ui/format';
import { hastaRecordado, limpiarPortal } from '@/lib/sesion';
import { useCarga } from '@gymflow/ui/carga';
import { useSocio } from '@/components/socio';
import { Permisos } from '@/components/permisos';
import { TusDatos } from '@/components/tus-datos';
import { Notificaciones } from '@/components/notificaciones';
import { apagarEnEsteTelefono } from '@/lib/push';
import { ElegirTema } from '@/components/tema';
import { Button, IconTile, Section, Sheet } from '@/components/ui';

/**
 * CUENTA (bloque 2.8 · 25-21). Era una hoja larga escondida detrás de un
 * ícono, que crecía hasta tener que desplazarse dentro de ella. Ahora es una
 * pantalla con cinco secciones —tus datos, tus permisos, tus notificaciones
 * (fase 3, bloque 3.10), los teléfonos con el portal abierto y la apariencia— y cada acción que no se deshace desde el
 * teléfono (cerrar sesión, retirar un permiso, pedir una corrección) abre su
 * propia hoja corta.
 *
 * Tus datos de CONTACTO (celular, correo, contacto de emergencia) se cambian
 * aquí, directo (D-36; fase 4, bloque 4.8: `components/tus-datos.tsx`). Lo
 * demás (nombre, nacimiento, CURP, plan, coach) sigue en recepción o por
 * solicitud de corrección, que queda con folio.
 */
export default function CuentaPage() {
  const router = useRouter();
  const { toast } = useSocio();
  const [cerrar, setCerrar] = useState<'este' | 'todos' | null>(null);
  const [saliendo, setSaliendo] = useState(false);
  // Hasta cuándo queda abierto ESTE teléfono lo dice la API (pendiente de 1.12): antes solo lo sabía el teléfono que lo guardó al activar.
  const sesiones = useCarga(useCallback(() => api<PortalSessions>('/portal/sessions'), []));
  const telefonos = sesiones.datos?.active ?? null;
  const recordado = hastaRecordado();
  const hasta = sesiones.datos ? new Date(sesiones.datos.current.expiresAt).getTime() : recordado !== null && recordado > Date.now() ? recordado : null;
  const sinUso = sesiones.datos?.current.idleDays ?? null;

  async function salir(todos: boolean) {
    setSaliendo(true);
    // Este teléfono deja de recibir notificaciones (3.10); el servidor borra la suscripción al cerrar la sesión.
    await apagarEnEsteTelefono().catch(() => null);
    // "En todos" es para el teléfono perdido (PS-02): también muere la sesión de ese aparato.
    await api(todos ? '/portal/logout-all' : '/portal/logout', { method: 'POST', body: '{}' }).catch(() => undefined);
    // Nada del socio se queda en el teléfono: la copia sin señal, el gimnasio y lo demás que guardó el portal (24-15).
    await limpiarPortal();
    router.replace('/activar');
  }

  return (
    <>
      <h1 className="title pagina-titulo">Cuenta</h1>

      <Section title="Tus datos">
        {/* Fase 4, bloque 4.8 (D-36): su celular, su correo y su contacto de emergencia los cambia él aquí, directo. */}
        <TusDatos />
        {/* Derecho de acceso (ARCO): sin pedírselo a nadie. */}
        <a className="btn btn-secondary btn-block mt-12" href="/api/portal/me/export" download="mis-datos.json">
          <Download /> Descargar mis datos
        </a>
        <p className="tiny muted mt-8">
          Tus datos, firmas, membresías, pagos, visitas, clases y rutina, en un archivo de datos (JSON). Tus notas de salud no vienen: pídelas en recepción.
        </p>
      </Section>

      {/* Tus permisos y tus solicitudes (PS-07): ya no hace falta "avisar en recepción". */}
      <Section title="Tus permisos">
        <Permisos onAviso={toast} />
      </Section>

      {/* Notificaciones gratis, que el socio enciende y apaga (D-34). */}
      <Section title="Notificaciones">
        <Notificaciones onAviso={toast} />
      </Section>

      <Section title="Teléfonos con el portal abierto">
        <div className="card">
          <div className="item">
            <IconTile><Smartphone /></IconTile>
            <div className="item-body">
              <p className="item-title" data-testid="telefonos-abiertos">
                {telefonos === null ? 'Este teléfono' : telefonos === 1 ? 'Solo este teléfono' : `Abierto en ${telefonos} teléfonos`}
              </p>
              {hasta !== null && (
                <p className="item-sub" data-testid="abierto-hasta">
                  {/* D-04 (bloque 4.1): ya no hay fecha tope; se cierra solo tras `idleDays` días sin abrirlo. */}
                  Este teléfono queda abierto mientras uses el portal. Si pasan {sinUso ? `${sinUso} días` : 'varios días'} sin abrirlo, se cierra (hoy, eso sería el {dia(new Date(hasta))}).
                </p>
              )}
            </div>
          </div>
        </div>
        <div className="stack gap-8 mt-12">
          <Button variant="secondary" block icon={<LogOut />} onClick={() => setCerrar('este')}>Cerrar sesión en este teléfono</Button>
          {telefonos !== null && telefonos > 1 && (
            <>
              <Button variant="secondary" block onClick={() => setCerrar('todos')}>Cerrar sesión en todos mis teléfonos</Button>
              <p className="tiny muted">Si perdiste un teléfono, ciérralo en todos: nadie más ve tu cuenta.</p>
            </>
          )}
        </div>
      </Section>

      <Section title="Apariencia">
        <ElegirTema />
      </Section>

      {/* Un toque ya no cierra la sesión: volver a entrar exige un código nuevo de recepción (UX-06). */}
      <Sheet open={cerrar === 'este'} onClose={() => setCerrar(null)} title="¿Cerrar sesión?"
        footer={<>
          <Button variant="secondary" block onClick={() => setCerrar(null)}>No, seguir aquí</Button>
          <Button variant="danger" block loading={saliendo} onClick={() => void salir(false)}>Sí, cerrar sesión</Button>
        </>}>
        <p className="small">Para volver a entrar en este teléfono vas a necesitar un código nuevo que te da recepción.</p>
      </Sheet>
      <Sheet open={cerrar === 'todos'} onClose={() => setCerrar(null)} title="¿Cerrar en todos tus teléfonos?"
        footer={<>
          <Button variant="secondary" block onClick={() => setCerrar(null)}>No, dejarlos abiertos</Button>
          <Button variant="danger" block loading={saliendo} onClick={() => void salir(true)}>Sí, cerrar en todos</Button>
        </>}>
        <p className="small">El portal se cierra en {telefonos ?? 'todos'} teléfonos, este incluido. Para volver a entrar en cualquiera hace falta un código nuevo de recepción.</p>
      </Sheet>
    </>
  );
}
