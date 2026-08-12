# TallerYa

Sitio para encontrar talleres mecánicos en Encarnación (Itapúa), Paraguay. Backend con
funciones serverless de **Vercel** y base de datos **Postgres en Neon**.

## Estructura del proyecto

```
public/index.html         → todo el frontend (HTML + CSS + JS en un solo archivo)
api/_db.js                 → conexión a Neon + creación de tablas + datos de ejemplo
api/_auth.js                 → login del administrador (cookie firmada)
api/login.js                   → POST /api/login
api/logout.js                    → POST /api/logout
api/talleres/index.js            → GET (listar) y POST (postular) talleres
api/talleres/[id].js              → PATCH (editar/aprobar/rechazar/destacar) y DELETE
api/auspicios/index.js           → GET (listar) y POST (crear) auspicios
api/auspicios/[id].js             → PATCH y DELETE
```

No hay `vercel.json`: el proyecto usa la detección automática de Vercel ("zero-config").
`public/index.html` se sirve como página principal, y cualquier archivo `.js` dentro de
`/api` (menos los que empiezan con `_`, que son helpers compartidos) se convierte solo
en una función serverless. No hace falta build command ni configurar nada en Vercel
más allá de las variables de entorno.

> **Importante:** el archivo `index.html` va **dentro de la carpeta `public/`**, no en
> la raíz del proyecto. Es la estructura con la que este proyecto quedó funcionando
> en Vercel — si en algún momento lo movés a la raíz, el sitio va a dar error 404.

## ¿Ya habías desplegado la versión anterior y te daba error 404 en /api/login?

Esa versión tenía un `vercel.json` con configuración "clásica" que no reconocía bien
las funciones de `/api`. Esta versión ya no usa `vercel.json` — para actualizarla:

1. En tu repositorio de GitHub, asegurate de que **no** exista ningún archivo
   `vercel.json` (ni en la raíz, ni dentro de `api/`). Si aparece, borralo.
2. Confirmá que `index.html` esté dentro de la carpeta `public/` (no suelto en la raíz).
3. Subí estos archivos nuevos tal cual (reemplazando lo que ya tenías).
4. Hacé commit y push — Vercel va a desplegar automáticamente. Si no lo hace solo,
   andá a **Deployments → (tres puntos) → Redeploy**.
5. Probá de nuevo `https://tu-proyecto.vercel.app` y el login del administrador.

## 1. Creá la base de datos en Neon

1. Entrá a [neon.tech](https://neon.tech) y creá un proyecto gratuito.
2. En el dashboard del proyecto, copiá el **Connection string** (elegí la versión
   "pooled connection", termina en `-pooler...`). Se ve así:
   ```
   postgresql://usuario:password@ep-xxxxx-pooler.region.aws.neon.tech/neondb?sslmode=require
   ```
3. Guardalo, lo vas a necesitar en el paso 3. No hace falta crear tablas a mano:
   la app las crea sola la primera vez que recibe una petición (y carga los talleres
   de ejemplo si la tabla está vacía).

## 2. Subí el proyecto a GitHub

```bash
cd tallerya-app
git init
git add .
git commit -m "TallerYa"
gh repo create tallerya --private --source=. --push
```
(o subilo a mano desde github.com si no usás la CLI de GitHub)

> El archivo `.gitignore` ya excluye `node_modules` y `.env`, así que tus credenciales
> no se suben al repositorio.

## 3. Desplegá en Vercel

1. Entrá a [vercel.com](https://vercel.com) → **Add New → Project** → importá el
   repositorio de GitHub que acabás de crear.
2. Antes de darle a "Deploy", abrí **Environment Variables** y cargá:

   | Variable | Valor |
   |---|---|
   | `DATABASE_URL` | el connection string de Neon del paso 1 |
   | `ADMIN_USER` | `Mangucho` |
   | `ADMIN_PIN` | `Cajiri120588#` |
   | `ADMIN_TOKEN_SECRET` | cualquier texto largo y aleatorio (ej: generalo en [1password.com/password-generator](https://1password.com/password-generator/)) |
   | `ANTHROPIC_API_KEY` | (opcional) tu API key de [console.anthropic.com](https://console.anthropic.com), para activar el Asistente Mecánico. Si no la cargás, el sitio funciona igual y el asistente solo muestra un aviso. |

3. Hacé clic en **Deploy**. En 1-2 minutos vas a tener tu URL pública
   (`https://tallerya-tuusuario.vercel.app`).

Listo — desde ese momento, todo lo que se postule o edite (talleres, auspicios,
imágenes, ubicación en el mapa) queda guardado en la base de datos de Neon y es
visible para **cualquiera** que entre al link, no solo en tu navegador.

## Actualizar el sitio más adelante

Cualquier cambio que quieras (diseño, textos, nuevas funciones) se hace editando los
archivos y hacés `git push`; Vercel vuelve a desplegar automáticamente en cada push.

## Notas

- El panel de Administrador usa **un solo usuario** (definido por las variables
  `ADMIN_USER` / `ADMIN_PIN`). Si querés cambiar la contraseña, solo actualizá esas
  variables de entorno en Vercel y volvé a desplegar (Vercel → Settings →
  Environment Variables → Redeploy).
- Las imágenes que se suben desde el formulario se comprimen en el navegador y se
  guardan como texto (base64) directamente en la base de datos — no necesitás un
  servicio de almacenamiento de archivos aparte. Para un uso normal de un taller
  esto funciona perfecto; si en el futuro cargás cientos de fotos en alta resolución,
  se puede migrar a un almacenamiento de archivos (ej. Vercel Blob) sin tocar el resto
  de la app.
- El mapa usa OpenStreetMap (gratuito, sin API key) y necesita conexión a internet
  para mostrar las calles — igual que Google Maps.
