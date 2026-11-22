# @gymflow/portal

Portal del socio. PWA instalable, con la credencial funcionando **sin red**.

## La decisión que define este repositorio

La ruta `/credencial` **no usa React ni el enrutador de Next**. Es una página
autónoma de 24 KB.

No es una optimización prematura: es una medición. Con el framework eran
**576 KB** antes de escribir nada útil —React 224, enrutador 163, polyfills
110— y el criterio de aceptación del sprint son **menos de 200 KB**. Esa ruta
es la única que tiene que abrir con el socio delante del torniquete y su
teléfono sin señal dentro del gimnasio; si no carga, el QR no existe.

El resto del portal sí usa React. Solo paga el coste de prescindir de él la
pantalla que no puede fallar.

`pnpm budget` lo comprueba en cada build, porque un presupuesto que no se mide
se pierde en tres semanas.

## Cómo entra el socio

Con **recepción delante**, que es como ocurre en el alta. Recepción emite un
código de un solo uso, el socio lo teclea y el dispositivo queda activado.

Evita depender de un proveedor de SMS y es más seguro que un código de seis
dígitos por mensaje: el canal es el mostrador, no la red telefónica.

Al activarse, el servidor entrega **una sola vez** el secreto del QR. Vive en
ese dispositivo y no se vuelve a poder pedir: es lo que permite generar la
credencial sin red. Si el socio cambia de teléfono, se revoca y se emite otra
— un secreto reenviable deja de ser secreto.

## Dos implementaciones del mismo TOTP

El navegador genera el código con **Web Crypto** y el gateway lo valida con
`node:crypto`. No es duplicación por descuido: importar el dominio del servidor
metería `node:crypto` en el paquete del cliente.

Que coincidan **no se asume**: `test/credential-cross-runtime.test.ts` compara
ambas sobre mil contadores consecutivos, veinte secretos y los límites de
desbordamiento de 32 bits. Si divergieran, el socio se quedaría fuera del
torniquete viendo un QR perfecto que el lector rechaza, y nadie sabría por qué.

## Uso

```bash
pnpm install
pnpm dev        # http://localhost:3002
pnpm verify     # typecheck + lint + build + presupuesto
```

Habla con `gymflow-backend` por un proxy del **mismo origen**: la sesión va en
cookie HttpOnly, y una cookie de tercero se pierde en cuanto el navegador
endurece su política.
