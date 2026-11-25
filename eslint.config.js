import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

const nodeGlobals = {
  process: "readonly", console: "readonly", Buffer: "readonly",
  __dirname: "readonly", setTimeout: "readonly", clearTimeout: "readonly",
  setInterval: "readonly", clearInterval: "readonly", URL: "readonly",
  URLSearchParams: "readonly", TextEncoder: "readonly", TextDecoder: "readonly",
  fetch: "readonly", NodeJS: "readonly", crypto: "readonly",
};

// Los `catch` que esconden un error como un vacío: `.catch(() => setX([]))`,
// `.catch(() => { setX({}); })`, `.catch(() => setX(0))` y `.catch(() => [])`.
// Con algo más dentro (guardar el error, avisar) ya no son silenciosos.
const MENSAJE_CATCH = "Un error de carga no se muestra como «no hay nada» (26-01): usa useCarga/EstadoCarga (@gymflow/ui/carga) o guarda el error y dilo.";
const VACIO = (ruta) => [
  `[${ruta}.type='ArrayExpression'][${ruta}.elements.length=0]`,
  `[${ruta}.type='ObjectExpression'][${ruta}.properties.length=0]`,
  `[${ruta}.type='Literal'][${ruta}.value=0]`,
];
const MANEJADOR = "CallExpression[callee.property.name='catch'] > ArrowFunctionExpression";
const CATCH_SILENCIOSO = [
  // .catch(() => setX([]))
  ...VACIO("body.arguments.0").map((v) => `${MANEJADOR}[body.type='CallExpression'][body.callee.name=/^set[A-Z]/][body.arguments.length=1]${v}`),
  // .catch(() => { setX([]); })
  ...VACIO("body.body.0.expression.arguments.0").map((v) => `${MANEJADOR}[body.type='BlockStatement'][body.body.length=1][body.body.0.expression.callee.name=/^set[A-Z]/]${v}`),
  // .catch(() => []) y .catch(() => 0)
  `${MANEJADOR}[body.type='ArrayExpression'][body.elements.length=0]`,
  `${MANEJADOR}[body.type='Literal'][body.value=0]`,
].map((selector) => ({ selector, message: MENSAJE_CATCH }));

export default tseslint.config(
  { ignores: [".next/**", "node_modules/**", "next-env.d.ts"] },
  { languageOptions: { globals: { ...nodeGlobals, window: "readonly", document: "readonly", localStorage: "readonly", HTMLInputElement: "readonly", AbortController: "readonly" } } },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts", "**/*.tsx"],
    // Las reglas de los hooks: un efecto con dependencias de más o de menos
    // es de los errores que no avisan (OPT-09).
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      // UN ERROR DE CARGA NO ES «NO HAY NADA» (26-01, fase 1.5): un `catch` que
      // solo deja la lista vacía (o el objeto vacío, o el cero) hace que «sin
      // red» se lea «sin planes», «sin personal», «0 días que viniste». Con la
      // red caída, recepción concluía que el plan no existía. Se usa `useCarga`
      // y `EstadoCarga` (`@gymflow/ui/carga`), o se guarda el error y se dice.
      "no-restricted-syntax": ["error", ...CATCH_SILENCIOSO],
    },
  },
);
