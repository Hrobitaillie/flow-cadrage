import { chromium } from 'playwright'
const b = await chromium.launch()
const p = await (await b.newContext()).newPage()
await p.goto('http://localhost:5173/', { waitUntil: 'networkidle' })
await p.waitForSelector('.app-shell', { timeout: 10000 })
await p.click('button[aria-label="Menu fichier"]')
await p.click('button[role="menuitem"]:has-text("Charger la démo")')
await p.waitForSelector('.vue-flow__node-page', { timeout: 8000 })
await p.waitForTimeout(600)
const info = await p.evaluate(() => {
  const edges = [...document.querySelectorAll('.vue-flow__edge')].map(e => ({
    cls: e.getAttribute('class'),
    dataId: e.getAttribute('data-id'),
  }))
  const paths = [...document.querySelectorAll('.vue-flow__edge-path')].map(pa => (pa.getAttribute('d')||'').slice(0,60))
  const pills = document.querySelectorAll('.portal-pill').length
  const wpseg = document.querySelectorAll('.wp-segment').length
  const interaction = document.querySelectorAll('.vue-flow__edge-interaction').length
  return { edgeCount: edges.length, sampleEdges: edges.slice(0,8), pathsWithQ: paths.filter(d=>d.includes('Q')).length, samplePaths: paths.slice(0,6), pills, wpseg, interaction }
})
console.log(JSON.stringify(info, null, 2))
await b.close()
