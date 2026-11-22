/**
 * EL PORTAL LEE EL NÚCLEO (fase 1.1, 27-02 y 27-07).
 *
 * Se corre con `pnpm test` (node --test, sin dependencias nuevas). Comprueba
 * que `@gymflow/core` llega por el enlace `link:` y que lo que el portal le
 * dice al socio sale del mismo vocabulario que ve recepción.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { METODO_DE_PAGO, etiqueta } from '@gymflow/core/vocabulario';
import { PAYMENT_METHODS, PortalStatement } from '@gymflow/core/contracts';

test('el núcleo llega por el enlace, sin copiar nada al portal', () => {
  assert.equal(typeof METODO_DE_PAGO, 'object');
  assert.equal(typeof PortalStatement.safeParse, 'function');
});

test('cada forma de pago que puede llegar en el estado de cuenta tiene su palabra, la misma del panel', () => {
  for (const m of PAYMENT_METHODS) assert.ok(METODO_DE_PAGO[m], m);
  // Antes el portal decía «OXXO» y «Nota de crédito», y el panel otra cosa (27-07).
  assert.equal(METODO_DE_PAGO.CARD_TERMINAL, 'Tarjeta en mostrador');
  assert.equal(etiqueta(METODO_DE_PAGO, 'CRIPTO'), 'CRIPTO');
});

test('el estado de cuenta del socio se lee con su contrato', () => {
  const r = PortalStatement.safeParse({
    computedAt: '2026-11-19T18:20:00.000Z', outstandingCents: '0', creditCents: '0', netBalanceCents: '0', netBalanceLabel: '$0.00',
    charges: [], payments: [{ id: '0193aaaa-7c1a-7000-8000-000000000001', method: 'CASH', amountCents: '65000', amountLabel: '$650.00', folio: null, businessDate: '2026-11-19', hasReceipt: true }],
    // Por páginas (bloque 1.6): cuántos hay y cómo pedir los demás.
    pages: { charges: { total: 0, nextCursor: null, hasMore: false }, payments: { total: 1, nextCursor: null, hasMore: false } },
  });
  assert.equal(r.success, true);
});
