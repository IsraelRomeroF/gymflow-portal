// Las frases de la clase suelta (D-16, bloque 3.16): el portal le pone palabras
// a lo que contestó la API (`payNow`, `holdUntil`) y ya no lo deduce.
// `node --test` con tipos borrados: el módulo se carga por su ruta.
import { test } from 'node:test';
import assert from 'node:assert/strict';

type Modulo = typeof import('./clase-suelta');
const { soloPagando, guardadoHasta }: Modulo = await import(new URL('./clase-suelta.ts', import.meta.url).href);

const palabras = { hora: (iso: string) => iso.slice(11, 16), dia: (iso: string) => iso.slice(0, 10) };

test('solo pagando: lo dice la API, no el estado de la membresía', () => {
  assert.equal(soloPagando({ requiresPayment: true, payNow: 'OWES_MEMBERSHIP' }), 'Debes tu mensualidad: ponte al corriente para apartarla, o págala en recepción.');
  assert.equal(soloPagando({ requiresPayment: true, payNow: 'HOLD_CLOSED' }), 'Falta menos de una hora: se paga en recepción al llegar.');
  // Se puede apartar sin pagar: no hay frase, sale el botón.
  assert.equal(soloPagando({ requiresPayment: true, payNow: null }), null);
  // Una API anterior que aún no manda el dato: se ofrece el botón y la respuesta al reservar manda.
  assert.equal(soloPagando({ requiresPayment: true }), null);
  // Incluida en su plan: nunca.
  assert.equal(soloPagando({ requiresPayment: false, payNow: 'OWES_MEMBERSHIP' }), null);
});

test('hasta cuándo se guarda el lugar', () => {
  assert.equal(
    guardadoHasta({ holdUntil: '2026-11-25T17:00:00', startsAt: '2026-11-25T18:00:00' }, palabras),
    'Te guardamos el lugar hasta las 17:00; después se libera.',
  );
  // Clase de madrugada: se guarda hasta la noche anterior, y se dice el día.
  assert.equal(
    guardadoHasta({ holdUntil: '2026-11-24T23:30:00', startsAt: '2026-11-25T00:30:00' }, palabras),
    'Te guardamos el lugar hasta las 23:30 del 2026-11-24; después se libera.',
  );
  // Pagada, incluida o ya sin apartado: nada que decir.
  assert.equal(guardadoHasta({ holdUntil: null, startsAt: '2026-11-25T18:00:00' }, palabras), null);
  assert.equal(guardadoHasta({ startsAt: '2026-11-25T18:00:00' }, palabras), null);
});
