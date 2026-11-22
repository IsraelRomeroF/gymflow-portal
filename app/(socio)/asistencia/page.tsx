'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Activity } from 'lucide-react';
import type { PortalAttendance, PortalAttendanceSummary } from '@gymflow/core/contracts';
import { api } from '@/lib/api';
import { capital, dia, hora, nombreMes } from '@/lib/format';
import { EstadoCarga, useCarga } from '@/lib/carga';
import { Empty, Section, Skeleton } from '@/components/ui';
import { IconButton } from '@/components/compartido';

const SEMANA = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const dos = (n: number) => String(n).padStart(2, '0');

/** El mes «AAAA-MM» movido `n` meses. */
function mesMas(mes: string, n: number): string {
  const d = new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)) - 1 + n, 1));
  return `${d.getUTCFullYear()}-${dos(d.getUTCMonth() + 1)}`;
}

/**
 * Tu asistencia: un calendario del mes con los días que viniste.
 *
 * Es lo que el socio quiere ver de verdad —¿estoy siendo constante?— y un
 * calendario lo contesta de un vistazo, mejor que una lista de fechas.
 *
 * Los días y las cifras vienen de la API (bloque 2.8 · 27-05, 25-16): son
 * los días de operación del gimnasio, no los que saldrían con la hora del
 * teléfono, y dos entradas el mismo día son una visita. Una sola palabra en
 * Inicio y aquí: «visitas». Ya no es pestaña: se llega desde «Este mes».
 */
export default function AsistenciaPage() {
  const carga = useCarga(useCallback(async () => {
    const [lista, resumen] = await Promise.all([
      api<PortalAttendance>('/portal/attendance'),
      api<PortalAttendanceSummary>('/portal/attendance/summary'),
    ]);
    return { lista, resumen };
  }, []));
  const [offset, setOffset] = useState(0);
  const dias = useMemo(() => new Set(carga.datos?.lista.days ?? []), [carga.datos]);

  return (
    <>
      <div className="between mb-12">
        <Link href="/" className="link"><ChevronLeft size={16} /> Inicio</Link>
      </div>
      <h1 className="title pagina-titulo">Asistencia</h1>

      <EstadoCarga carga={carga} titulo="No pudimos cargar tu asistencia" esqueleto={<div className="stack"><Skeleton h={110} /><Skeleton h={320} /></div>}>
        {({ lista, resumen }) => {
          if (lista.days.length === 0) return <div className="card"><Empty icon={<Activity />} title="Aún no hay visitas" text="Cada día que entres al gimnasio aparecerá aquí." /></div>;
          const hoy = resumen.today;
          const mes = mesMas(hoy.slice(0, 7), offset);
          const anio = Number(mes.slice(0, 4));
          const numero = Number(mes.slice(5, 7));
          const diasDelMes = new Date(Date.UTC(anio, numero, 0)).getUTCDate();
          const huecos = (new Date(Date.UTC(anio, numero - 1, 1)).getUTCDay() + 6) % 7; // semana que empieza en lunes
          const enMes = offset === 0 ? resumen.daysThisMonth : lista.days.filter((d) => d.startsWith(mes)).length;
          const nombre = nombreMes(mes);
          // Sucursal junto a la hora solo si usa más de una.
          const variasSedes = new Set(lista.visits.map((v) => v.branchId)).size > 1;
          return (
            <>
              <div className="dos-cifras">
                <div className="card card-pad">
                  <p className="big-stat num" data-testid="visitas-del-mes">{enMes}</p>
                  <p className="small muted mt-6">{enMes === 1 ? 'visita' : 'visitas'} en {nombre.split(' ')[0]}</p>
                </div>
                <div className="card card-pad">
                  {/* Días distintos de las últimas cuatro semanas entre cuatro: lo que dice si el hábito se sostiene. */}
                  <p className="big-stat num">{(resumen.daysLast28 / 4).toFixed(1)}</p>
                  <p className="small muted mt-6 cifra-pie">visitas por semana</p>
                </div>
              </div>
              <p className="tiny muted mt-8">Cada día que vienes cuenta una visita, entres las veces que entres. «Por semana» es el promedio de tus últimas 4 semanas.</p>

              <Section title="Calendario">
                <div className="card card-pad">
                  <div className="between mb-14">
                    <IconButton label="Mes anterior" onClick={() => setOffset(offset - 1)} disabled={offset <= -2}><ChevronLeft /></IconButton>
                    <p className="strong">{capital(nombre)}</p>
                    <IconButton label="Mes siguiente" onClick={() => setOffset(offset + 1)} disabled={offset >= 0}><ChevronRight /></IconButton>
                  </div>
                  <div className="cal">
                    {SEMANA.map((d, i) => <div key={i} className="cal-head">{d}</div>)}
                    {Array.from({ length: huecos }, (_, i) => <div key={`h${i}`} className="cal-day is-empty" />)}
                    {Array.from({ length: diasDelMes }, (_, i) => {
                      const k = `${mes}-${dos(i + 1)}`;
                      const cls = ['cal-day', dias.has(k) ? 'is-in' : '', k === hoy ? 'is-today' : '', k > hoy ? 'is-future' : ''].filter(Boolean).join(' ');
                      return <div key={k} className={cls} aria-label={dias.has(k) ? `Viniste el ${i + 1}` : undefined}>{i + 1}</div>;
                    })}
                  </div>
                  <div className="row tiny muted gap-14 mt-14">
                    <span className="row gap-6"><span className="cal-day is-in cal-muestra" />Viniste</span>
                    <span className="row gap-6"><span className="cal-day is-today cal-muestra" />Hoy</span>
                  </div>
                </div>
              </Section>

              <Section title="Últimas entradas">
                <div className="card">
                  <ul className="list">
                    {lista.visits.slice(0, 8).map((v) => (
                      <li key={v.at} className="item">
                        <div className="item-body">
                          <p className="item-title item-title-base">{capital(dia(v.day, { weekday: 'long', day: 'numeric', month: 'short' }))}</p>
                          {variasSedes && v.branchName && <p className="item-sub">{v.branchName}</p>}
                        </div>
                        <span className="small muted num">{hora(v.at)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </Section>
            </>
          );
        }}
      </EstadoCarga>
    </>
  );
}
