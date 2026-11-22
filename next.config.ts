import path from 'node:path';
import type { NextConfig } from 'next';

/**
 * Cabeceras de seguridad (SEC-10). Nadie puede meter estas pantallas en un
 * iframe ajeno (clickjacking), no se filtra la ruta completa a otros sitios y
 * el navegador no adivina tipos de archivo. HSTS solo en producción: en local
 * se sirve por HTTP.
 */
const CABECERAS = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  ...(process.env.NODE_ENV === 'production'
    ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' }]
    : []),
];

/**
 * El portal habla con la API por un proxy del mismo origen.
 *
 * La sesión del socio viaja en una cookie HttpOnly, y una cookie de origen
 * distinto se pierde en cuanto el navegador endurece su política de terceros
 * — que es exactamente lo que ha venido pasando. Mismo origen, sin CORS.
 */
/**
 * Perfil de PRUEBAS (`gymflow.sh pruebas`: portal 4002, API 4001). Compila en
 * su propia carpeta y con su propio tsconfig para correr junto al uso real
 * (3002) sin pisar su compilación ni reescribir `tsconfig.json`. La carpeta va
 * dentro de `.next/` (ignorada por git) y empieza con `dev` porque la limpieza
 * de `next build` respeta esos nombres.
 */
const DIST_PRUEBAS = process.env.GYMFLOW_NEXT_DIST;
if (DIST_PRUEBAS && !/^\.next\/dev-[a-z]+$/.test(DIST_PRUEBAS)) {
  throw new Error(`GYMFLOW_NEXT_DIST debe ser una carpeta .next/dev-<nombre>; llegó «${DIST_PRUEBAS}»`);
}

/** Sin `API_URL`, la del uso real (3001); las pruebas la ponen en 4001. Con `next start` queda fija al compilar. */
const API = process.env.API_URL ?? 'http://127.0.0.1:3001';

/**
 * EL NÚCLEO POR `link:` (auditoría 8, 27-02): `@gymflow/core` es la carpeta
 * hermana `../gymflow-core`, enlazada en `node_modules` por pnpm. Turbopack no
 * resuelve archivos fuera de su raíz, así que la raíz es la carpeta que
 * contiene a los dos repositorios (solo vigila lo que de verdad lee). Sin
 * esto, importar `@gymflow/core/vocabulario` daría «Module not found».
 */
const RAIZ = path.resolve(process.cwd(), '..');

const nextConfig: NextConfig = {
  turbopack: { root: RAIZ },
  ...(DIST_PRUEBAS ? { distDir: DIST_PRUEBAS, typescript: { tsconfigPath: 'tsconfig.pruebas.json' } } : {}),
  // Next 16 escribe AGENTS.md y CLAUDE.md en la raíz al arrancar. Son
  // artefactos generados: el proyecto ya documenta sus convenciones, y dejar
  // que aparezcan sin control ensucia el repositorio en cada `next dev`.
  agentRules: false,
  // No anunciar el framework: es información gratis para quien busca fallas.
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: CABECERAS }];
  },
  // El botón flotante de Next tapa la barra de pestañas en cada demo.
  devIndicators: false,

  // Quien instaló la PWA antes de ADR-032 la abre en /credencial (era su
  // start_url). Se le manda a Inicio en vez de a un 404.
  async redirects() {
    return [{ source: '/credencial', destination: '/', permanent: true }];
  },

  async rewrites() {
    return [
      // SOLO las rutas del socio y del alta digital. Antes el proxy
      // reenviaba toda la API del personal: con una cookie de personal, el
      // portal —la app de menor confianza— servía de puerta a todo.
      { source: '/api/portal/:path*', destination: `${API}/portal/:path*` },
      { source: '/api/intake/:path*', destination: `${API}/intake/:path*` },
    ];
  },
};

export default nextConfig;
