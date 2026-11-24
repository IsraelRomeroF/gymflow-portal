import type { PortalMe } from '@gymflow/core/contracts';

/*
 * «¿PUEDO ENTRAR HOY?» EN PALABRAS (fase 2, bloque 2.8 · 27-04, 25-04).
 *
 * El portal NO decide si el socio entra: lo dice la API con la misma regla
 * que la puerta (`canEnter`, `accessReason`, `accessBranchName`). Aquí solo
 * se le pone la frase a esa respuesta. Antes Inicio lo deducía del estado de
 * la membresía y decía «Hoy entras» a quien el mostrador le decía que no.
 *
 * Sin dependencias de la app (ni `@/…`): las fechas y los importes llegan ya
 * escritos, para poder probar las frases con `node --test`.
 */

export type EstadoDeHoy = { titulo: string; detalle: string; tono: 'ok' | 'warn' | 'danger' | 'info' };

export type Palabras = {
  /** «viernes 20 de noviembre». */
  fechaLarga: (iso: string) => string;
  /** «2 dic». */
  fechaCorta: (iso: string) => string;
  /** Lo que debe, ya escrito («$650.00»), o null si no debe. */
  deuda: string | null;
  /** ¿Se puede pagar desde el teléfono? Sin procesador, se paga en recepción. */
  enLinea: boolean;
};

type Socio = Pick<PortalMe,
  'canEnter' | 'accessReason' | 'accessBranchName' | 'accessUsesVisit' | 'visitPack' | 'dayPass' | 'planEnded'
  | 'membershipStatus' | 'planName' | 'currentPeriodEnd' | 'paidThrough' | 'graceUntil' | 'homeBranchName'>
  // Fase 3, bloque 3.10. Opcionales: la copia sin señal de un portal anterior no los trae.
  & Partial<Pick<PortalMe, 'trialPass' | 'faceMissing'>>;

/**
 * D-06 (fase 3, bloque 3.10): su plan o su paquete están en orden, pero el
 * gimnasio pide entrar con el rostro y no lo tiene registrado. No es «hoy no
 * puedes entrar»: entra si la gerencia autoriza la visita. Se le dice qué
 * falta y dónde se arregla, antes de que llegue al mostrador.
 */
export const FALTA_EL_ROSTRO: EstadoDeHoy = {
  titulo: 'Te falta registrar tu rostro',
  detalle: 'Tu gimnasio pide entrar con el rostro. Regístralo en recepción: toma un minuto. Mientras no lo tengas, la gerencia tiene que autorizar cada visita.',
  tono: 'warn',
};

/** El último día de un periodo cuyo fin es semiabierto («AAAA-MM-DD»). */
function diaAntes(iso: string): string {
  return new Date(Date.parse(`${iso.slice(0, 10)}T00:00:00.000Z`) - 86_400_000).toISOString().slice(0, 10);
}

export function estadoDeHoy(me: Socio, p: Palabras): EstadoDeHoy {
  const plan = me.planName?.toLowerCase() ?? 'membresía';
  const comoPagar = p.enLinea ? 'paga y entras al momento' : 'paga en recepción y entras al momento';
  const deuda = p.deuda ? `Debes ${p.deuda} · ${comoPagar}.` : null;
  const pagada = me.paidThrough ? `Tu ${plan} está pagada hasta el ${p.fechaLarga(me.paidThrough)}.` : null;
  const conPagado = (texto: string | null, otro: string) => [pagada, texto ?? otro].filter(Boolean).join(' ');
  const enOtraSede = !!me.accessBranchName && !!me.homeBranchName && me.accessBranchName !== me.homeBranchName;
  const status = me.membershipStatus;

  if (me.canEnter) {
    // Lo primero que tiene que saber: en la puerta lo van a detener por el rostro (D-06).
    if (me.faceMissing) return FALTA_EL_ROSTRO;
    const viva = status === 'ACTIVE' || status === 'TRIALING';
    const conElPase = !!me.dayPass && me.dayPass.branchName === me.accessBranchName;
    const deCortesia = !!me.trialPass && me.trialPass.branchName === me.accessBranchName;
    if (me.accessUsesVisit) {
      const quedan = me.visitPack?.visitsLeft ?? 0;
      return {
        titulo: 'Hoy entras',
        detalle: quedan === 1 ? 'Con tu paquete de visitas: esta entrada es la última que te queda.' : `Con tu paquete de visitas: esta entrada usa 1 de las ${quedan} que te quedan.`,
        tono: quedan === 1 ? 'warn' : 'ok',
      };
    }
    if (viva && !enOtraSede) {
      const sinPagar = !!me.paidThrough && !!me.currentPeriodEnd && me.paidThrough < diaAntes(me.currentPeriodEnd);
      return {
        titulo: 'Hoy entras',
        detalle: sinPagar
          ? conPagado(p.deuda ? `Te toca pagar ${p.deuda}.` : null, 'Tienes un pago pendiente.')
          : me.currentPeriodEnd ? `Tu ${plan} cubre hasta el ${p.fechaLarga(diaAntes(me.currentPeriodEnd))}.` : 'Tu membresía está al corriente.',
        tono: sinPagar ? 'warn' : 'ok',
      };
    }
    if (conElPase) {
      return { titulo: enOtraSede ? `Hoy entras en ${me.accessBranchName}` : 'Hoy entras', detalle: `Con tu pase del día: vale solo hoy y solo en ${me.dayPass!.branchName}.`, tono: 'ok' };
    }
    // Su pase de prueba (D-08): gratis, una vez, el día y la sede donde se lo dieron.
    if (deCortesia && !viva) {
      return { titulo: enOtraSede ? `Hoy entras en ${me.accessBranchName}` : 'Hoy entras', detalle: `Con tu pase de prueba: es gratis, vale solo hoy y solo en ${me.trialPass!.branchName}.`, tono: 'ok' };
    }
    if (status === 'PAST_DUE') {
      return { titulo: me.graceUntil ? `Entras hasta el ${p.fechaLarga(me.graceUntil)}` : 'Hoy entras', detalle: conPagado(deuda, 'Tienes un pago pendiente.'), tono: 'warn' };
    }
    // Lo que queda es su clase suelta pagada: entra a esa clase, en su sede.
    return { titulo: enOtraSede ? `Hoy entras a tu clase en ${me.accessBranchName}` : 'Hoy entras a tu clase', detalle: 'Tienes una clase suelta pagada: entras desde una hora antes de que empiece.', tono: 'ok' };
  }

  switch (me.accessReason) {
    case 'MEMBERSHIP_FROZEN':
      return { titulo: 'Tu membresía está congelada', detalle: 'Cuando la reactives en recepción, vuelves a entrar.', tono: 'info' };
    case 'MEMBERSHIP_PAST_DUE':
    case 'MEMBERSHIP_SUSPENDED':
      return { titulo: 'Hoy no puedes entrar', detalle: conPagado(deuda, 'Tienes un pago pendiente: paga en recepción y vuelves a entrar.'), tono: 'danger' };
    case 'BRANCH_NOT_ALLOWED':
      return { titulo: me.accessBranchName ? `Tu plan no entra en ${me.accessBranchName}` : 'Tu plan no entra en esta sucursal', detalle: 'Pregunta en recepción en qué sucursal entras con tu plan.', tono: 'warn' };
    case 'OUTSIDE_TIME_WINDOW':
      return { titulo: 'A esta hora tu plan no entra', detalle: 'Tu plan tiene horario. Pregunta en recepción cuál es.', tono: 'warn' };
    case 'NO_VISITS_LEFT':
      return { titulo: 'Se acabaron las visitas de tu paquete', detalle: 'En recepción compras otro paquete o un plan.', tono: 'danger' };
    case 'VISIT_PACK_EXPIRED':
      return { titulo: 'Tu paquete de visitas venció', detalle: me.visitPack?.expiresOn ? `Venció el ${p.fechaLarga(me.visitPack.expiresOn)}. En recepción compras otro.` : 'En recepción compras otro.', tono: 'danger' };
    case 'VISIT_PACK_UNPAID':
      return { titulo: 'Tu paquete está por pagarse', detalle: deuda ?? 'En cuanto se registre tu pago en recepción, entras.', tono: 'warn' };
    case 'MEMBER_ARCHIVED':
      return { titulo: 'Hoy no puedes entrar', detalle: 'Tu cuenta está dada de baja. Pregunta en recepción.', tono: 'danger' };
    // La puerta lo dice así cuando solo le falta el rostro (D-06): no es «pregunta en recepción».
    case 'BIOMETRIC_REQUIRED':
      return FALTA_EL_ROSTRO;
    case 'NO_MEMBERSHIP':
    case 'MEMBERSHIP_ENDED':
      break;
    default:
      if (me.accessReason) return { titulo: 'Hoy no puedes entrar', detalle: 'Pregunta en recepción.', tono: 'danger' };
  }

  // Sin nada que le abra: por activarse, terminada o nunca tuvo.
  if (status === 'PENDING') return { titulo: 'Tu membresía está por activarse', detalle: deuda ?? 'Se activa en cuanto se registre el pago.', tono: 'warn' };
  if (status === 'SUSPENDED' || status === 'PAST_DUE') return { titulo: 'Hoy no puedes entrar', detalle: conPagado(deuda, 'Pregunta en recepción cómo reactivar tu membresía.'), tono: 'danger' };
  if (me.planEnded) {
    const cual = me.planEnded.planName?.toLowerCase() ?? 'membresía';
    const como = me.planEnded.how === 'CANCELED' ? 'se canceló' : 'terminó';
    const hasta = me.planEnded.paidThrough ? ` Estuvo pagada hasta el ${p.fechaLarga(me.planEnded.paidThrough)}.` : '';
    return { titulo: `Tu ${cual} ${como}`, detalle: `${hasta} En recepción la renuevas.`.trim(), tono: 'danger' };
  }
  return { titulo: 'Todavía no tienes membresía', detalle: 'En recepción te ayudan a elegir un plan.', tono: 'danger' };
}

/** «Te quedan 3 de 10 visitas · vence el 2 dic», o null si no trae un paquete que sirva. */
export function lineaDelPaquete(me: Pick<PortalMe, 'visitPack'>, p: Pick<Palabras, 'fechaCorta'>): string | null {
  const v = me.visitPack;
  if (!v || v.status !== 'ACTIVE' || v.visitsLeft <= 0) return null;
  const quedan = v.visitsLeft === 1 ? 'Te queda 1' : `Te quedan ${v.visitsLeft}`;
  return `${quedan} de ${v.visitsPurchased} visitas${v.expiresOn ? ` · vence el ${p.fechaCorta(v.expiresOn)}` : ''}`;
}

/** Para «Datos de hace 2 h · sin señal» (o «de ayer»): lo que se ve salió de la copia del teléfono (25-18). */
export function haceCuanto(guardadoEn: number, ahora = Date.now()): string {
  const min = Math.max(0, Math.round((ahora - guardadoEn) / 60_000));
  if (min < 1) return 'hace un momento';
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? 'ayer' : `hace ${d} días`;
}
