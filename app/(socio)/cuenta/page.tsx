'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Download, LogOut, Smartphone } from 'lucide-react';
import type { PortalSessions } from '@gymflow/core/contracts';
import { api } from '@/lib/api';
import { antiguedad, dia } from '@/lib/format';
import { hastaRecordado, limpiarPortal } from '@/lib/sesion';
import { useCarga } from '@/lib/carga';
import { useSocio } from '@/components/socio';
import { Permisos } from '@/components/permisos';
import { ElegirTema } from '@/components/tema';
import { Button, IconTile, Section, Sheet } from '@/components/ui';

/**
 * CUENTA (bloque 2.8 · 25-21). Era una hoja larga escondida detrás de un
 * ícono, que crecía hasta tener que desplazarse dentro de ella. Ahora es una
 * pantalla con cuatro secciones —tus datos, tus permisos, los teléfonos con
 * el portal abierto y la apariencia— y cada acción que no se deshace desde el
 * teléfono (cerrar sesión, retirar un permiso, pedir una corrección) abre su
 * propia hoja corta.
 *
 * Tus datos se LEEN aquí; cambiarlos directo desde el teléfono (D-36) llega
 * en la fase 4. Mientras, se pide la corrección y queda con folio.
 */
export default function CuentaPage() {
  const router = useRouter();
  const { me, toast } = useSocio();
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
        <div className="card">
          <dl className="datos">
            <div className="dato"><dt>Nombre</dt><dd>{me.fullName}</dd></div>
            <div className="dato"><dt>Número de socio</dt><dd className="mono">{me.memberCode}</dd></div>
            {me.homeBranchName && <div className="dato"><dt>Sucursal</dt><dd>{me.homeBranchName}</dd></div>}
            <div className="dato"><dt>Socio desde</dt><dd>{dia(me.joinedAt, { day: 'numeric', month: 'long', year: 'numeric' })} · hace {antiguedad(me.tenureDays)}</dd></div>
          </dl>
        </div>
        <p className="tiny muted mt-8">¿Algo está mal o cambió tu celular? Dilo en recepción o pide la corrección aquí abajo, en «Tus permisos».</p>
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
                  Este teléfono queda abierto hasta el {dia(new Date(hasta))} como máximo; si dejas de usar el portal {sinUso ? `${sinUso} días` : 'unos días'}, se cierra antes.
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
