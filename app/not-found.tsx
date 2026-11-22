import Link from 'next/link';

/** Una dirección escrita a mano que no existe: en español y con salida (UX4-24). */
export default function NoEncontrada() {
  return (
    <main className="shell" style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 24 }}>
      <div className="card" style={{ padding: 28, maxWidth: 360, textAlign: 'center' }}>
        <p className="title" style={{ fontSize: 22, marginBottom: 8 }}>Esta página no existe</p>
        <p className="small muted" style={{ marginBottom: 18 }}>Puede que el enlace esté incompleto. Desde Inicio ves tu membresía, tus pagos y tus clases.</p>
        <Link href="/" className="btn btn-primary btn-block">Ir a Inicio</Link>
      </div>
    </main>
  );
}
