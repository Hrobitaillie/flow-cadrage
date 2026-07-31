// Point d'entrée du serveur Flooow (Node sur l'hôte, façon site `facturation`).
// Hono : /api/health (sans auth) + routes fichiers/dossiers (routes.ts).
// Temps réel Yjs (Hocuspocus) embarqué sur /collab (partage le même port).
import type { Server as HttpServer } from 'node:http'
import { existsSync } from 'node:fs'
import { join, relative } from 'node:path'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { config } from './config.js'
import { identityFromRequest } from './auth.js'
import { api } from './routes.js'
import { mountDocs } from './openapi.js'
import { seedIfEmpty } from './seed.js'
import { attachCollab } from './collab.js'

const app = new Hono()

// Log léger : méthode + chemin + user + statut + durée.
app.use('*', async (c, next) => {
  const started = Date.now()
  await next()
  const who = identityFromRequest(c)
  console.log(`${c.req.method} ${c.req.path} → ${c.res.status} [${who.id}] ${Date.now() - started}ms`)
})

// Santé : sonde de vie, sans auth.
app.get('/api/health', (c) => c.json({ ok: true, service: 'flooow-server', version: '0.1.0' }))

// Fichiers / dossiers / session (identité + droits gérés dans routes.ts).
app.route('/api', api)

// Doc interactive auto-générée : /api/docs (UI Scalar) + /api/openapi.json (spec).
mountDocs(app)

// Statique : l'app buildée (mode solo — un seul process, même origin pour /api et
// /collab, donc zéro config côté front). serveStatic résout `root` depuis le cwd,
// d'où le chemin relatif. Absent (dev via Vite) → le serveur reste API-seulement.
const appDistAvailable = existsSync(join(config.appDist, 'index.html'))
if (appDistAvailable) {
  const root = relative(process.cwd(), config.appDist)
  app.use('*', serveStatic({ root }))
  // Fallback SPA : le router front (history mode) prend le relais sur /p/… et /.
  // Jamais pour /api ni /collab : une route API inconnue doit rester un 404, pas du HTML.
  app.get(
    '*',
    (c, next) => (c.req.path.startsWith('/api/') || c.req.path.startsWith('/collab') ? c.notFound() : next()),
    serveStatic({ root, rewriteRequestPath: () => '/index.html' }),
  )
}

await seedIfEmpty()

const server = serve({ fetch: app.fetch, port: config.port, hostname: config.host }, (info) => {
  console.log(`[flooow-server] écoute sur http://${config.host}:${info.port}`)
  console.log(`[flooow-server] dataDir = ${config.dataDir}`)
  console.log(`[flooow-server] doc API sur ${config.appUrl}/api/docs`)
  console.log(
    appDistAvailable
      ? `[flooow-server] app servie depuis ${config.appDist} → ${config.appUrl}/`
      : `[flooow-server] app/dist absent : API seulement (dev via Vite, ou lancer « npm run build » dans app/)`,
  )
})

// Temps réel Yjs sur /collab (même port, upgrade WebSocket).
attachCollab(server as unknown as HttpServer)
