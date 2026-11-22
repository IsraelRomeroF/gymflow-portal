// Las frases de «¿puedo entrar hoy?» (bloque 2.8): el portal le pone palabras a
// lo que contestó la puerta, y nunca dice «Hoy entras» si la puerta dijo que no.
// `node --test` con tipos borrados: el módulo se carga por su ruta (el `tsconfig`
// del portal no admite importar con extensión `.ts`).
import { test } from 'node:test';
import assert from 'node:assert/strict';

type Modulo = typeof import('./acceso');
const { estadoDeHoy, lineaDelPaquete, haceCuanto }: Modulo = await import(new URL('./acceso.ts', import.meta.url).href);

const palabras = { fechaLarga: (iso: string) => `<${iso}>`, fechaCorta: (iso: string) => `[${iso}]`, deuda: null as string | null, enLinea: false };
const base = {
  canEnter: false, accessReason: 'NO_MEMBERSHIP' as const, accessBranchName: 'Centro', accessUsesVisit: false,
  visitPack: null, dayPass: null, planEnded: null, membershipStatus: null, planName: null,
  currentPeriodEnd: null, paidThrough: null, graceUntil: null, homeBranchName: 'Centro',
};
type Socio = Parameters<Modulo['estadoDeHoy']>[0];
const socio = (cambios: Partial<Socio>): Socio => ({ ...base, ...cambios });

test('si la puerta dice que no, ninguna frase dice «Hoy entras»', () => {
  const motivos = ['NO_MEMBERSHIP', 'MEMBERSHIP_ENDED', 'MEMBERSHIP_PAST_DUE', 'MEMBERSHIP_SUSPENDED', 'MEMBERSHIP_FROZEN', 'BRANCH_NOT_ALLOWED',
    'OUTSIDE_TIME_WINDOW', 'NO_VISITS_LEFT', 'VISIT_PACK_EXPIRED', 'VISIT_PACK_UNPAID', 'MEMBER_ARCHIVED', 'CREDENTIAL_REVOKED'] as const;
  for (const accessReason of motivos) {
    // Aunque el estado de la membresía diga «activa»: manda la puerta (27-04).
    const e = estadoDeHoy(socio({ accessReason, membershipStatus: 'ACTIVE', planName: 'Mensual', currentPeriodEnd: '2026-12-19', paidThrough: '2026-12-18' }), palabras);
    assert.ok(!/entras/i.test(e.titulo) || /no entra/.test(e.titulo), `${accessReason}: ${e.titulo}`);
    assert.notEqual(e.tono, 'ok', accessReason);
    assert.ok(e.detalle.length > 0, accessReason);
  }
});

test('con membresía al corriente dice hasta cuándo cubre; con el periodo sin pagar, hasta cuándo pagó', () => {
  const alCorriente = estadoDeHoy(socio({ canEnter: true, accessReason: null, membershipStatus: 'ACTIVE', planName: 'Mensual', currentPeriodEnd: '2026-12-19', paidThrough: '2026-12-18' }), palabras);
  assert.deepEqual(alCorriente, { titulo: 'Hoy entras', detalle: 'Tu mensual cubre hasta el <2026-12-18>.', tono: 'ok' });
  const sinPagar = estadoDeHoy(socio({ canEnter: true, accessReason: null, membershipStatus: 'ACTIVE', planName: 'Mensual', currentPeriodEnd: '2026-12-19', paidThrough: '2026-11-18' }), { ...palabras, deuda: '$650.00' });
  assert.deepEqual(sinPagar, { titulo: 'Hoy entras', detalle: 'Tu mensual está pagada hasta el <2026-11-18>. Te toca pagar $650.00.', tono: 'warn' });
});

test('suspendido: sin procesador manda a recepción; con pase del día entra, y dice dónde vale', () => {
  const suspendido = socio({ accessReason: 'MEMBERSHIP_SUSPENDED', membershipStatus: 'SUSPENDED', planName: 'Mensual', paidThrough: '2026-10-18' });
  assert.match(estadoDeHoy(suspendido, { ...palabras, deuda: '$650.00' }).detalle, /Debes \$650\.00 · paga en recepción y entras al momento\./);
  assert.match(estadoDeHoy(suspendido, { ...palabras, deuda: '$650.00', enLinea: true }).detalle, /Debes \$650\.00 · paga y entras al momento\./);
  const conPase = estadoDeHoy({ ...suspendido, canEnter: true, accessReason: null, dayPass: { branchName: 'Centro', validOn: '2026-11-21' } }, palabras);
  assert.deepEqual(conPase, { titulo: 'Hoy entras', detalle: 'Con tu pase del día: vale solo hoy y solo en Centro.', tono: 'ok' });
  const enOtra = estadoDeHoy(socio({ canEnter: true, accessReason: null, accessBranchName: 'Norte', dayPass: { branchName: 'Norte', validOn: '2026-11-21' } }), palabras);
  assert.equal(enOtra.titulo, 'Hoy entras en Norte');
});

test('paquete de visitas: dice cuántas quedan y avisa de la última', () => {
  const pack = (visitsLeft: number) => ({ status: 'ACTIVE' as const, visitsLeft, visitsPurchased: 10, expiresOn: '2026-12-02' });
  const tres = socio({ canEnter: true, accessReason: null, accessUsesVisit: true, visitPack: pack(3) });
  assert.equal(estadoDeHoy(tres, palabras).detalle, 'Con tu paquete de visitas: esta entrada usa 1 de las 3 que te quedan.');
  assert.equal(lineaDelPaquete(tres, palabras), 'Te quedan 3 de 10 visitas · vence el [2026-12-02]');
  const una = socio({ canEnter: true, accessReason: null, accessUsesVisit: true, visitPack: pack(1) });
  assert.equal(estadoDeHoy(una, palabras).tono, 'warn');
  assert.equal(lineaDelPaquete(una, palabras), 'Te queda 1 de 10 visitas · vence el [2026-12-02]');
  assert.equal(lineaDelPaquete(socio({ visitPack: { ...pack(0), status: 'EXHAUSTED' } }), palabras), null);
  assert.equal(lineaDelPaquete(socio({}), palabras), null);
});

test('a quien se le terminó el plan no se le dice que «no tiene membresía» (25-04)', () => {
  const terminado = estadoDeHoy(socio({ planEnded: { planName: 'Mensual', how: 'EXPIRED', paidThrough: '2026-08-18', periodEnd: '2026-08-18' } }), palabras);
  assert.deepEqual(terminado, { titulo: 'Tu mensual terminó', detalle: 'Estuvo pagada hasta el <2026-08-18>. En recepción la renuevas.', tono: 'danger' });
  assert.equal(estadoDeHoy(socio({ planEnded: { planName: null, how: 'CANCELED', paidThrough: null, periodEnd: '2026-08-18' } }), palabras).titulo, 'Tu membresía se canceló');
  assert.equal(estadoDeHoy(socio({}), palabras).titulo, 'Todavía no tienes membresía');
});

test('sin señal se dice de cuándo son los datos (25-18)', () => {
  const ahora = Date.parse('2026-11-21T18:00:00Z');
  assert.equal(haceCuanto(ahora - 20_000, ahora), 'hace un momento');
  assert.equal(haceCuanto(ahora - 25 * 60_000, ahora), 'hace 25 min');
  assert.equal(haceCuanto(ahora - 2 * 3_600_000, ahora), 'hace 2 h');
  assert.equal(haceCuanto(ahora - 26 * 3_600_000, ahora), 'ayer');
  assert.equal(haceCuanto(ahora - 3 * 86_400_000, ahora), 'hace 3 días');
});
