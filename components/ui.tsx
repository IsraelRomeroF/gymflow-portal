'use client';

import type { ReactNode } from 'react';
import { Dialog } from '@gymflow/ui/dialogo';

// Lo que el portal comparte con el panel vive en compartido.tsx (idéntico en los dos repos).
export { Badge, Button, Callout, Empty, ErrorCarga, IconButton, IconTile, Skeleton, type ButtonProps, type Tono } from '@gymflow/ui/compartido';

export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="section">
      <div className="section-head">
        <h2 className="section-title eyebrow">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/**
 * Hoja que sube desde abajo: el patrón del teléfono para una decisión
 * pequeña sin salir de la pantalla. Es el mismo `Dialog` del panel en su
 * variante `hoja` (`dialogo.tsx`, idéntico en los dos repos, 26-14): se pinta
 * en `document.body`, Escape cierra solo la de arriba, Tab no se escapa a la
 * pantalla de atrás, el foco vuelve a donde estaba y se cierra con la X.
 */
export function Sheet({ open, onClose, title, children, footer, error }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; /** El error de la acción de la hoja: sale en su pie. */ error?: ReactNode }) {
  return <Dialog hoja open={open} onClose={onClose} title={title} footer={footer} error={error}>{children}</Dialog>;
}

export { Dialog, type DialogProps } from '@gymflow/ui/dialogo';
