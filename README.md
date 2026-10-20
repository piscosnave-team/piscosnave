# NAVE | Pisco Premium de Ica, Perú

Sitio estático de una sola página para presentar las ediciones Donaire, Sunqu y Nii y dirigir los pedidos a WhatsApp. Está pensado para Kike, quien administra el sitio, y para futuras personas colaboradoras.

## Sitio en producción y publicación

- URL pública: <https://omnix-afk.github.io/piscosnave/>.
- GitHub Pages usa el build legacy desde la rama `main`, en la raíz del repositorio. `.nojekyll` evita el procesamiento de Jekyll.
- Esta configuración de Pages es la actual; el workflow no publica el sitio. Ver [CI](#ci).
- `robots.txt` y `sitemap.xml` están incluidos, pero los crawlers ignoran `robots.txt` en la ruta de proyecto `/piscosnave/`. Solo se aplicará como se espera cuando exista un dominio propio.

## Stack y estructura

No hay build de producción: el navegador sirve HTML, CSS y JavaScript estáticos.

| Ruta | Propósito |
| --- | --- |
| `index.html` | Página, CSS, configuración editable, datos JSON, metadatos y enlaces por defecto sin JavaScript. |
| `js/app.js` | Configuración de región, traducciones, precios, pedidos por WhatsApp y comportamiento estático. |
| `js/escena.js` | Mejora opcional de la escena 3D y la animación de scroll. |
| `vendor/three/` | Build minificado vendorizado de three.js y su aviso MIT. |
| `assets/img/` | Hero, imágenes de las botellas y texturas WebP. |
| `assets/og/` | Imagen para compartir en redes. |
| `assets/icons/` | Favicon y Apple touch icon. |
| `tools/` | Utilidades de CSP, extracción de assets y vendorización opcional de GSAP. |
| `tests/` | Pruebas estáticas, end-to-end, accesibilidad y regresión visual. |

Las dependencias runtime son three.js 0.160.0, local en `vendor/three/`, y GSAP/ScrollTrigger 3.12.5 desde cdnjs. Los scripts de GSAP usan SRI y `crossorigin`; si no cargan, la página conserva su versión estática y el pedido sigue disponible.

## Ejecutar localmente

Se requiere Node.js `>=24.8.0` para las herramientas de desarrollo. Instala las dependencias y sirve el directorio por HTTP; no abras `index.html` mediante `file://`.

```bash
npm ci
python3 -m http.server 8000
```

Abre <http://localhost:8000/>. Cualquier servidor HTTP estático equivalente sirve; el servidor de las pruebas se configura en `playwright.config.js`.

## Dónde editar

### Copy, traducciones y regiones

El HTML base está en español. En `js/app.js`, los diccionarios `PE`, `EU` y `JS` usan el texto español exacto como clave. Si se cambia un texto visible, hay que actualizar la clave correspondiente y su traducción en los diccionarios aplicables. La prueba de paridad i18n detecta claves huérfanas, texto sin traducción y diferencias entre `JS.pe` y `JS.eu`.

La región puede forzarse para probarla con `?region=pe` o `?region=eu`. La selección se guarda en `localStorage` como `nave-region`; la confirmación de edad usa `nave-edad`.

### Precios y pedidos

Los precios se definen una sola vez en `PRECIOS`, dentro del bloque JSON `#nave-config` de `index.html`. `js/app.js` los usa para construir los textos dinámicos. Las copias de precio necesarias para el HTML sin JavaScript están comprobadas por pruebas: no las cambies sin actualizar `PRECIOS`.

El mismo bloque `#nave-config` contiene las entradas de WhatsApp. Al cambiar el número, actualiza también los cinco `href` por defecto de `wa.me` en `index.html`: son la ruta de pedido cuando JavaScript está desactivado. `tests/static/whatsapp-defaults.spec.js` compara esos enlaces con lo que genera `NAVE_WA` para PE y falla si se desincronizan. El número no debe copiarse a ningún otro archivo.

### Imágenes y assets

Los assets de página están en `assets/img/`; no edites WebP ni los bloques JSON de modelos y texturas a mano. La procedencia, tamaños y transformaciones se documentan en [assets/PROVENANCE.md](assets/PROVENANCE.md).

`tools/extract-assets.mjs` conserva el proceso reproducible de extracción desde la revisión original. Para verificar que los assets originales siguen siendo byte-identical y que los derivados existen:

```bash
node tools/extract-assets.mjs --verify
```

La utilidad usa `sharp`; sin `--verify` puede escribir assets, por lo que debe usarse deliberadamente.

### Marca y scroll

Los tokens principales de marca viven en `:root` de `index.html` (`--granate`, `--granate-hondo`, `--blanco`, `--rosa`, `--rosa-claro` y `--tinta-2`). Los colores de las ilustraciones de cada edición también están definidos directamente en `js/app.js` y `js/escena.js`; no los confundas con los tokens globales.

En 3D, `FIN = 5` divide el scroll en cinco tramos: 0–1 presencia, 1–2 Donaire, 2–3 Sunqu, 3–4 Nii y 4–5 las tres ediciones. El pin `end: '+=470%'` fija la duración del recorrido. Los enlaces `data-ir` usan `0`, `1` y `4.75`; tienen un `href` real para no-JS y un único listener delegado protegido para no instalar enlaces duplicados.

## Mejora progresiva y comportamiento responsive

La página se entrega primero como layout estático; la escena 3D es una mejora que solo se activa tras inicializar correctamente. Si WebGL, three.js o GSAP no están disponibles, las ediciones, precios y CTA de pedido siguen visibles y operables.

La consulta `(max-height:500px) and (orientation:landscape)` usa el layout estático. Abarca teléfonos en horizontal y también ventanas de escritorio bajas, por ejemplo con DevTools acopladas. Al volver a vertical, la página se mantiene estática hasta recargar.

Sin JavaScript, la puerta de edad sigue visible y ofrece una confirmación CSS basada en `:target`; no se recuerda. Advertencia: un deep link con fragmento, por ejemplo `/#marca`, también oculta la puerta cuando JavaScript está desactivado. La puerta es una declaración; su suficiencia legal sigue siendo una decisión del propietario.

## CSP y dependencias externas

La Content Security Policy es un meta tag. Tiene hashes para dos bloques ejecutables inline: el boot script de edad y el import map. Después de **cualquier** edición de cualquiera de esos bloques, ejecuta:

```bash
npm run csp
npm run csp -- --check
```

El primer comando regenera hashes si hace falta; el segundo comprueba que ya estén vigentes. Si una actualización de three.js modifica el import map, aplica el mismo flujo. Si se omite este paso, el navegador bloqueará scripts. El bloque JSON-LD es solo datos y no necesita hash.

GSAP y ScrollTrigger permanecen en CDN. Su licencia para este uso y su redistribución son preguntas pendientes para el propietario; este README no concluye nada legal. No se deben incorporar bytes de GSAP al repositorio. Tras una aprobación explícita del propietario, `node tools/vendor-gsap.mjs --write` puede descargar una copia gitignored, verificar SRI e indicar los cambios manuales de etiquetas y CSP. No se ejecuta en CI.

En GitHub Pages puede haber un breve cache skew: HTML nuevo con un `js/app.js` anterior durante hasta unos 10 minutos (`max-age=600`).

## Depuración rápida

El elemento `html` expone el estado de ejecución:

| Hook | Significado |
| --- | --- |
| `html.js` | JavaScript se ejecutó. |
| `html.edad-ok` | Existe consentimiento de edad válido para la visita. |
| `data-modo` | Modo actual: `3d` o `estatica`. |
| `data-motivo` | Por qué se eligió el modo estático, por ejemplo `sin-gsap`, `sin-webgl`, `sin-modulo`, `apaisado` o `tiempo`. |
| `data-ready` | El primer modo ya quedó decidido; se escribe una vez. |
| `data-bucle` | Estado del render loop 3D: `activo` o `pausado`. |

## Pruebas

Para ejecutar `npm test` o `npm run test:visual` por primera vez, instala Chromium de Playwright después de `npm ci`:

```bash
npx playwright install chromium
```

Como alternativa, usa la imagen Docker fijada `mcr.microsoft.com/playwright:v1.63.0-noble` con `docker create --init --ipc=host`, como se muestra para las baselines visuales más abajo.

```bash
npm run validate      # Solo pruebas estáticas
npm test              # Capa estática y pruebas end-to-end
npm run test:visual   # Regresión visual local; no se ejecuta en CI
```

La guarda de placeholders legales está en modo `warn`: informa los campos pendientes sin fallar. Cuando el propietario entregue los datos legales, el único cambio para bloquearlos es `PLACEHOLDER_GUARD=block`.

Las pruebas que aún deben fallar intencionalmente se marcan con `test.fail()` y explican el paso que las eliminará; no conviertas una prueba esperada-roja en verde sin implementar el contrato.

Las pruebas 3D aíslan cada prueba en su propio browser para reducir interferencias de SwiftShader; no se añadió una agrupación serial especial. CI usa `PW_WORKERS=1`; el valor local por defecto es `2`, y puede ajustarse como `PW_WORKERS=1 npm test` si el equipo tiene pocos recursos. La referencia de una ejecución limpia con dos workers fue aproximadamente 190–197 segundos; la duración puede variar con la carga de CPU.

Las baselines visuales son Linux y solo deben regenerarse en la imagen Docker fijada de Playwright. Ejemplo local:

```bash
docker create --init --ipc=host --name piscosnave-playwright mcr.microsoft.com/playwright:v1.63.0-noble
```

También se puede sustituir `--ipc=host` por `--shm-size=1g`. Estos ajustes evitan presión de memoria compartida y procesos Chromium sin recolectar. Sigue el flujo de contenedor del proyecto antes de actualizar baselines.

## CI

[`.github/workflows/validate.yml`](.github/workflows/validate.yml) ejecuta `npm test` en pull requests y pushes a `main`, con `contents: read`. Es validate-only: no despliega Pages, no usa secretos y no cambia ajustes del repositorio. La regresión visual no forma parte de CI.

## Créditos y licencias

- three.js 0.160.0 está vendorizado bajo MIT; el archivo de licencia y checksums se registran en [vendor/README.md](vendor/README.md).
- GSAP/ScrollTrigger 3.12.5 se cargan desde CDN con SRI. La confirmación de licencia y redistribución corresponde al propietario.
- La procedencia de imágenes, iconos y derivados está en [assets/PROVENANCE.md](assets/PROVENANCE.md).
- El repositorio no tiene una licencia decidida. No se crea ni se infiere una licencia hasta que el propietario la elija.

## Glosario

- **etapa**: sección principal que puede fijarse durante el recorrido 3D.
- **hornacina / nicho**: arco que enmarca una edición.
- **presencia**: primera vista o hero de la colección.
- **luz**: transición visual desde el hero hacia las ediciones.
- **slot**: botón para seleccionar una edición en el trío.
- **rótulo**: etiqueta tipográfica en mayúsculas.
- **edad**: puerta de confirmación de mayoría de edad.
- **trío**: vista conjunta de Donaire, Sunqu y Nii.

## Seguimiento del propietario (admin; no realizado por este PR)

Revisar las preguntas del PR antes de hacer merge. En especial, faltan decisiones sobre placeholders legales, advertencia peruana de alcohol, precios, licencia de GSAP, licencia del repositorio y número de WhatsApp Business.

- [ ] Confirmar el texto, tamaño y ubicación del aviso peruano sobre alcohol.
- [ ] Completar los placeholders legales (`[Nombre o razón social]`, `[NIF]`/`[RUC]`, `[Dirección]` y `[correo electrónico]`) con datos del negocio, no personales.
- [ ] Confirmar precios y números de WhatsApp Business por mercado.
- [ ] Decidir la licencia de GSAP, su posible self-hosting y la licencia del repositorio.
- [ ] Configurar un dominio propio; entonces actualizar la URL base y revisar robots/sitemap/canonical/OG.
- [ ] Cambiar Pages a GitHub Actions si se desea publicar solo después de validar.
- [ ] Crear una ruleset o protección para `main` que requiera `validate`.
- [ ] Activar secret scanning y push protection.
- [ ] Establecer el campo `homepage` del repositorio.
- [ ] Elegir si futuros commits usarán correo noreply de GitHub y registrar la llave de firma para que GitHub la verifique.
- [ ] Definir un canal de contacto para vulnerabilidades antes de crear `SECURITY.md`.
