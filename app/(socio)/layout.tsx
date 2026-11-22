'use client';

import { SocioShell } from '@/components/socio';

/** Todo lo que requiere sesión de socio comparte marco y barra de pestañas. */
export default function SocioLayout({ children }: { children: React.ReactNode }) {
  return <SocioShell>{children}</SocioShell>;
}
