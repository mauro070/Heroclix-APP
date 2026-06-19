# Heroclix Builder

Lista de figuras de Heroclix con buscador, armado de equipos (formato 300 pts),
guardado de equipos con nombre, e instalable como app en el celular (PWA).

## Estructura

```
index.html
manifest.json
sw.js
css/estilos.css
js/data.js        ← las figuras (editá acá para agregar/quitar)
js/app.js         ← lógica
icons/            ← íconos de la app
Images/Minis/     ← TUS imágenes de las figuras (poné acá los .jpg)
```

> Ojo: el repo NO incluye la carpeta `Images/Minis/`. Subí ahí tus imágenes con los
> mismos nombres que figuran en `js/data.js` (ej. `dofp005.jpg`).

## Agregar una figura

En `js/data.js`, copiá un objeto y editalo:

```js
{"name": "Nombre", "img": "Images/Minis/codigo.jpg", "alt": "Nombre codigo", "keywords": ["X-Men","Avengers"], "points": [50, 75]},
```

`points` va de menor a mayor. Solo se puede tildar un nivel por figura.

## Subir a GitHub Pages

1. Creá un repo (ej. `heroclix`) y subí todos estos archivos + tu carpeta `Images/`.
2. En el repo: **Settings → Pages → Branch: `main` / root → Save**.
3. A los minutos queda en `https://TUUSUARIO.github.io/heroclix/`.

GitHub Pages sirve por HTTPS, así que el service worker y la instalación funcionan solos.

## Instalar en el celular

- **Android (Chrome):** abrí la URL → menú **⋮** → **Instalar app** / **Agregar a pantalla de inicio**.
- **iPhone (Safari):** abrí la URL → botón **Compartir** → **Agregar a inicio**.

Una vez instalada, abre en pantalla completa y funciona sin conexión.

## Que Chrome no borre los datos

La app llama a `navigator.storage.persist()` al abrir, que le pide al navegador
marcar el almacenamiento como **persistente** (no se borra por limpieza automática).
El navegador suele concederlo cuando instalás la app o la usás seguido.

Además, **no borres los datos del sitio manualmente** ni uses "borrar datos de navegación"
incluyendo este sitio, porque eso sí elimina los equipos guardados.

> Los equipos se guardan en el navegador del dispositivo (localStorage). No se
> sincronizan entre dispositivos. Para eso haría falta un backend.

## Probar en la compu

El service worker no corre con doble clic (`file://`). Para probar local:

```bash
python -m http.server 8000
# abrí http://localhost:8000
```
