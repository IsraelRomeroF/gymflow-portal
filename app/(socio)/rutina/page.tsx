'use client';

import { useEffect, useState } from 'react';
import { Check, CircleCheck, Timer, MessageSquareText, ListChecks } from 'lucide-react';
import type { PortalRoutine, PortalRoutineProgress, RoutineProgress } from '@gymflow/core/contracts';
import { api } from '@/lib/api';
import { useSocio } from '@/components/socio';
import { Badge, Button, Empty, ErrorCarga, Skeleton } from '@/components/ui';
import { CodigoParaCoach } from '@/components/codigo-coach';

const GRUPO: Record<string, string> = {
  CHEST: 'Pecho', BACK: 'Espalda', SHOULDERS: 'Hombro', BICEPS: 'Bíceps', TRICEPS: 'Tríceps', LEGS: 'Pierna', GLUTES: 'Glúteo', ABS: 'Abdomen',
};
const OBJETIVO: Record<string, string> = {
  HIPERTROFIA: 'Masa muscular', FUERZA: 'Fuerza', RESISTENCIA: 'Resistencia', PERDIDA_PESO: 'Pérdida de peso', GENERAL: 'Acondicionamiento',
};
const NIVEL: Record<string, string> = { PRINCIPIANTE: 'Principiante', INTERMEDIO: 'Intermedio', AVANZADO: 'Avanzado' };
const descanso = (s: number | null) => (s === null ? null : s < 60 ? `${s} s` : s % 60 === 0 ? `${s / 60} min` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} min`);
/** «Día 2 · Pierna»; si el coach no le puso nombre al día, solo «Día 2». */
const nombreDelDia = (i: number, nombre: string) => (nombre.trim().toLowerCase() === `día ${i + 1}` ? `Día ${i + 1}` : `Día ${i + 1} · ${nombre}`);

/**
 * TU RUTINA — la que te armó tu coach, en el teléfono.
 *
 * Se usa en el piso, entre serie y serie: letra grande en lo que importa
 * (series × repeticiones), el descanso a la vista y la técnica en una frase.
 *
 * «Hoy toca» (auditoría 8, bloque 2.6; 12-02): se abre en el día que sigue al
 * último que marcaste (antes recordaba el último que abriste, que era el que
 * ya habías hecho). Al terminar, «Marcar día hecho»: tu coach lo ve en tu
 * ficha y mañana te toca el siguiente. Se puede deshacer el mismo día.
 */
export default function RutinaPage() {
  const { toast } = useSocio();
  const [v, setV] = useState<PortalRoutine | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);
  const [dia, setDia] = useState(0);
  const [marcando, setMarcando] = useState(false);
  const [falla, setFalla] = useState<string | null>(null);

  useEffect(() => {
    api<PortalRoutine>('/portal/routine').then((r) => {
      setV(r);
      if (r.routine && r.progress) setDia(Math.min(r.progress.nextDay, r.routine.days.length) - 1);
    }).catch((e) => setError(e instanceof Error ? e.message : null));
  }, [intento]);

  async function marcar(hecho: boolean, dayIndex: number) {
    setMarcando(true);
    setFalla(null);
    try {
      const r = await api<PortalRoutineProgress>(hecho ? '/portal/routine/done' : '/portal/routine/undo', { method: 'POST', body: JSON.stringify({ dayIndex }) });
      setV((x) => (x ? { ...x, progress: r.progress } : x));
      toast(hecho ? 'Día hecho. Mañana te toca el siguiente.' : 'Listo: ya no cuenta como hecho.');
    } catch (e) { setFalla(e instanceof Error && e.message ? e.message : 'No se pudo guardar. Revisa tu conexión e inténtalo otra vez.'); } finally { setMarcando(false); }
  }

  if (error !== null) return <ErrorCarga titulo="No pudimos cargar tu rutina" mensaje={error || null} onReintentar={() => { setError(null); setIntento((i) => i + 1); }} />;
  if (!v) return <div className="stack mt-8"><Skeleton h={120} /><Skeleton h={60} /><Skeleton h={220} /></div>;
  if (!v.routine) {
    return (
      <div className="mt-8">
        {/* Con título, para que no parezca una pantalla vacía (UX7 Portal). */}
        <h1 className="title mb-12">Tu rutina</h1>
        <Empty icon={<ListChecks />} title="Aún no tienes rutina" text="Pídesela a tu coach en el gimnasio: en cuanto te la asigne, aparece aquí." />
        {/* D-29 (bloque 3.8): sin coach, el socio genera el código que le dicta al suyo. */}
        <div className="mt-12"><CodigoParaCoach /></div>
      </div>
    );
  }

  const r = v.routine;
  const p: RoutineProgress | null = v.progress ?? null;
  const d = r.days[dia] ?? r.days[0]!;
  const numero = dia + 1;
  const toca = p ? r.days[p.nextDay - 1] : undefined;
  const hechoHoy = p?.doneToday ?? null;
  return (
    <div className="stack mt-8">
      <div className="card card-pad">
        <div className="row wrap gap-6">
          {r.goal && <Badge tone="volt">{OBJETIVO[r.goal] ?? r.goal}</Badge>}
          {r.level && <Badge>{NIVEL[r.level] ?? r.level}</Badge>}
        </div>
        <h1 className="rt-titulo">{r.name}</h1>
        {v.coach && <p className="small muted">Tu coach: {v.coach}</p>}
        {p && toca && (
          <p className="rt-hoy" data-testid="hoy-toca" data-hecho={hechoHoy ? 'true' : undefined}>
            <span className="rt-hoy-punto" aria-hidden />
            <span><strong>{hechoHoy ? 'Hoy hiciste' : 'Hoy toca'}</strong> · {nombreDelDia(p.nextDay - 1, toca.name)}</span>
          </p>
        )}
        {p && <p className="small muted rt-semana">Esta semana: {p.doneThisWeek.length} de {r.days.length} {r.days.length === 1 ? 'día' : 'días'}</p>}
        {v.reviewDue && <p className="small muted mt-8">Ya toca revisar tu rutina: dile a tu coach la próxima vez que lo veas.</p>}
        {(v.notes || r.notes) && (
          <div className="rt-nota">
            <MessageSquareText size={16} />
            <div className="rt-nota-lineas">
              {v.notes && <p className="small"><strong>Para ti:</strong> {v.notes}</p>}
              {r.notes && <p className="small"><strong>Indicaciones:</strong> {r.notes}</p>}
            </div>
          </div>
        )}
      </div>

      <div className="rt-dias" role="tablist" aria-label="Días de la rutina">
        {r.days.map((x, i) => {
          const hecho = p?.doneThisWeek.includes(i + 1) ?? false;
          return (
            <button key={i} role="tab" aria-selected={i === dia} className="rt-dia" onClick={() => { setDia(i); setFalla(null); }}>
              <span className="rt-dia-num">Día {i + 1}{hecho && <><Check size={12} className="rt-dia-hecho" aria-hidden /><span className="rt-solo-lector"> (hecho esta semana)</span></>}</span>
              <span className="rt-dia-nombre">{x.name}</span>
            </button>
          );
        })}
      </div>

      <ol className="rt-ejercicios">
        {d.items.map((it, i) => (
          <li key={i} className="card card-pad rt-ejercicio">
            <p className="tiny muted">{i + 1} · {GRUPO[it.exercise.muscleGroup] ?? it.exercise.muscleGroup}{it.exercise.equipment ? ` · ${it.exercise.equipment}` : ''}</p>
            <p className="rt-ej-nombre">{it.exercise.name}</p>
            <div className="rt-series" aria-label={`${it.sets} series de ${it.reps}`}>
              <strong>{it.sets} × {it.reps}</strong>
              {descanso(it.restSeconds) && <span className="rt-descanso"><Timer size={13} />{descanso(it.restSeconds)} de descanso</span>}
            </div>
            {it.exercise.instructions && <p className="small muted mt-8">{it.exercise.instructions}</p>}
            {it.notes && <p className="small rt-ej-nota">{it.notes}</p>}
          </li>
        ))}
      </ol>

      {/* Al final del día, donde termina de entrenar (12-02). */}
      {p && (
        <div className="rt-pie" data-testid="dia-hecho">
          {hechoHoy === numero ? (
            <div className="rt-hecho" role="status">
              <span className="row gap-8"><CircleCheck size={18} /><strong>Hecho hoy</strong></span>
              <Button variant="ghost" size="sm" loading={marcando} onClick={() => void marcar(false, numero)}>Deshacer</Button>
            </div>
          ) : hechoHoy !== null ? (
            <p className="small muted text-center">Hoy ya marcaste el día {hechoHoy}. Mañana te toca el siguiente.</p>
          ) : (
            <Button variant="volt" size="lg" block loading={marcando} icon={<Check />} onClick={() => void marcar(true, numero)}>Marcar día hecho</Button>
          )}
          {falla && <p className="small rt-falla" role="alert">{falla}</p>}
        </div>
      )}
    </div>
  );
}
