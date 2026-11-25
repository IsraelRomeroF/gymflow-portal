'use client';

import { use, useCallback } from 'react';
import Link from 'next/link';
import { ChevronLeft, Download } from 'lucide-react';
import type { PortalReceipt } from '@gymflow/core/contracts';
import { METODO_DE_PAGO, etiqueta } from '@gymflow/core/vocabulario';
import { api } from '@/lib/api';
import { concepto, fecha, fechaHora, pesos, telefono } from '@gymflow/ui/format';
import { EstadoCarga, useCarga } from '@gymflow/ui/carga';
import { Button, Skeleton } from '@/components/ui';

/**
 * COMPROBANTE DE UN PAGO, en el teléfono del socio (bloque 2.8 · 25-14).
 *
 * «¿Me das mi recibo?» era una pregunta diaria en el mostrador: el socio lo
 * pide para su empresa o para demostrar que pagó. Aquí lo abre, lo guarda
 * como PDF o lo imprime («Descargar» abre la impresión del teléfono, que
 * ofrece «Guardar como PDF») y lo manda por donde quiera. Lo mismo que el
 * comprobante del mostrador, con lo mínimo. No es un CFDI y lo dice.
 */
export default function ReciboPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const carga = useCarga(useCallback(() => api<PortalReceipt>(`/portal/payments/${encodeURIComponent(id)}/receipt`), [id]));

  return (
    <>
      <div className="between no-print mb-12">
        <Link href="/pagos" className="link"><ChevronLeft size={16} /> Pagos</Link>
      </div>
      <h1 className="title pagina-titulo no-print">Comprobante</h1>
      <EstadoCarga carga={carga} titulo="No pudimos cargar tu comprobante" esqueleto={<Skeleton h={360} r={16} />}>
        {(r) => {
          const devolucion = BigInt(r.amountCents) < 0n;
          const aFavor = BigInt(r.unappliedCents);
          // Lo mismo que imprime el recibo del mostrador (D-27; bloque 4.11): lo que no esté registrado, no sale.
          const contacto = [r.gym.phone ? `Tel. ${telefono(r.gym.phone)}` : null, r.gym.whatsapp ? `WhatsApp ${telefono(r.gym.whatsapp)}` : null, r.gym.rfc ? `RFC ${r.gym.rfc}` : null].filter(Boolean);
          return (
            <>
              <article className="recibo" data-testid="comprobante">
                <header>
                  {/* El logo viene como data: desde la API, no es una imagen del sitio. */}
                  {r.gym.logo && <img src={r.gym.logo} alt="" className="recibo-logo" data-testid="recibo-logo" />}
                  <p className="recibo-org">{r.gymName}</p>
                  {r.branchName && <p>Sucursal {r.branchName}</p>}
                  <p>{fechaHora(r.receivedAt)}</p>
                  {r.folio && <p className="recibo-folio mono">Folio {r.folio}</p>}
                </header>
                {r.reversal && <p className="recibo-aviso">Corrección de un pago anterior</p>}
                <p className="recibo-socio">{r.memberName}<br /><span className="mono">{r.memberCode}</span></p>
                <table>
                  <tbody>
                    {r.lines.map((l, i) => <tr key={i}><td>{concepto(l.concept)}</td><td className="num">{pesos(l.amountCents)}</td></tr>)}
                    {aFavor > 0n && <tr><td>Saldo a favor</td><td className="num">{pesos(aFavor)}</td></tr>}
                    <tr className="total"><td>{devolucion ? 'Total devuelto' : 'Total pagado'}</td><td className="num">{pesos(devolucion ? -BigInt(r.amountCents) : r.amountCents)}</td></tr>
                  </tbody>
                </table>
                <p>{etiqueta(METODO_DE_PAGO, r.method, r.method)}</p>
                {/* El aviso del cambio de precio de su plan (D-19), con las mismas palabras que el comprobante del mostrador. */}
                {r.priceNotice && (
                  <p className="recibo-precio" data-testid="aviso-de-precio">
                    {r.priceNotice.kind === 'UPCOMING'
                      ? <>{r.priceNotice.startsOn ? `A partir del ${fecha(r.priceNotice.startsOn)}` : 'A partir de tu siguiente pago'}, {r.priceNotice.planName ?? 'tu plan'} cuesta <strong>{pesos(r.priceNotice.toPriceCents)}</strong> (antes {pesos(r.priceNotice.fromPriceCents)}).</>
                      : <>{r.priceNotice.planName ?? 'Tu plan'} cambió de precio: de {pesos(r.priceNotice.fromPriceCents)} a <strong>{pesos(r.priceNotice.toPriceCents)}</strong> desde este pago.</>}
                  </p>
                )}
                {(r.gym.receiptLegend || contacto.length > 0) && (
                  <p className="recibo-pie" data-testid="recibo-pie">
                    {r.gym.receiptLegend}{r.gym.receiptLegend && contacto.length > 0 ? '\n' : ''}{contacto.join(' · ')}
                  </p>
                )}
                <footer>Comprobante de pago. No es un comprobante fiscal (CFDI); si necesitas factura, pídela en recepción.</footer>
              </article>
              <div className="no-print mt-16">
                <Button block icon={<Download />} onClick={() => window.print()}>Descargar o imprimir</Button>
                <p className="tiny muted mt-8 text-center">Se abre la impresión de tu teléfono: elige «Guardar como PDF» para descargarlo.</p>
              </div>
            </>
          );
        }}
      </EstadoCarga>
    </>
  );
}
