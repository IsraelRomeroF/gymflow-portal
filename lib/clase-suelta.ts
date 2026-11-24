/*
 * LA CLASE SUELTA EN PALABRAS (D-16; fase 3, bloque 3.16).
 *
 * El portal NO decide si una clase suelta se puede apartar sin pagar: lo dice
 * la API con la misma regla que la cotización del mostrador. `GET /portal/classes`
 * trae por clase `payNow` (desde el teléfono no se aparta: aquí todavía no se
 * paga) y `holdUntil` (hasta cuándo se le guardaría), y `GET /portal/bookings`
 * trae `holdUntil` de lo que ya apartó y sigue sin pagar. Aquí solo se le pone
 * la frase. Antes se deducía del estado de la membresía y de la hora.
 *
 * Sin dependencias de la app (ni `@/…`): las horas llegan ya escritas, para
 * poder probar las frases con `node --test`.
 */
export type PorQuePagando = 'OWES_MEMBERSHIP' | 'HOLD_CLOSED';

/** Por qué esta clase suelta no se aparta desde el teléfono, dicho ANTES de tocar. Null = sí se puede. */
export function soloPagando(c: { requiresPayment: boolean; payNow?: PorQuePagando | string | null }): string | null {
  if (!c.requiresPayment) return null;
  if (c.payNow === 'OWES_MEMBERSHIP') return 'Debes tu mensualidad: ponte al corriente para apartarla, o págala en recepción.';
  if (c.payNow === 'HOLD_CLOSED') return 'Falta menos de una hora: se paga en recepción al llegar.';
  return null;
}

/**
 * Hasta cuándo se le guarda un lugar apartado sin pagar. `hora` y `dia`
 * escriben un instante; el día solo se dice si no es el de la clase (una
 * clase de madrugada se guarda hasta la noche anterior).
 */
export function guardadoHasta(
  x: { holdUntil?: string | null; startsAt: string },
  palabras: { hora: (iso: string) => string; dia: (iso: string) => string },
): string | null {
  if (!x.holdUntil) return null;
  const otroDia = palabras.dia(x.holdUntil) !== palabras.dia(x.startsAt);
  return `Te guardamos el lugar hasta las ${palabras.hora(x.holdUntil)}${otroDia ? ` del ${palabras.dia(x.holdUntil)}` : ''}; después se libera.`;
}
