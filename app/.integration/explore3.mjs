import { chromium } from 'playwright'
const b = await chromium.launch()
const p = await (await b.newContext()).newPage()
await p.goto('http://localhost:5173/', { waitUntil: 'networkidle' })
await p.waitForSelector('.app-shell')
await p.click('button[aria-label="Menu fichier"]')
await p.click('button[role="menuitem"]:has-text("Charger la démo")')
await p.waitForSelector('.vue-flow__node-page'); await p.waitForTimeout(600)
const dbg = await p.evaluate(()=>{
  const vp = document.querySelector('.vue-flow__viewport')
  const m = new DOMMatrix(getComputedStyle(vp).transform)
  const flowRect = document.querySelector('.vue-flow').getBoundingClientRect()
  const paneRect = document.querySelector('.vue-flow__pane').getBoundingClientRect()
  // accueil node is at graph 0,0
  const accueil = document.querySelector('.vue-flow__node-page')
  const nb = accueil.getBoundingClientRect()
  // predicted screen for graph (0,0)
  const pred = { x: flowRect.left + m.e, y: flowRect.top + m.f }
  return { matrix:{a:m.a,d:m.d,e:m.e,f:m.f}, flowRect:{l:flowRect.left,t:flowRect.top}, paneRect:{l:paneRect.left,t:paneRect.top}, accueilBox:{x:nb.x,y:nb.y}, predForOrigin:pred }
})
console.log(JSON.stringify(dbg,null,2))
await b.close()
