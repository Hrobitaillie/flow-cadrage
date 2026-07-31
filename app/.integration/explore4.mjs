import { chromium } from 'playwright'
const b = await chromium.launch()
const ctx = await b.newContext()
const p = await ctx.newPage()
p.on('dialog', d => d.accept())
await p.goto('http://localhost:5173/', { waitUntil: 'networkidle' })
await p.waitForSelector('.app-shell')
await p.click('button[aria-label="Menu fichier"]')
await p.click('button[role="menuitem"]:has-text("Charger la démo")')
await p.waitForSelector('.vue-flow__node-page'); await p.waitForTimeout(600)

// screen point at fraction f along the visible path of an edge (by data-id)
async function edgePoint(dataId, f){
  return await p.evaluate(({dataId,f})=>{
    const g = document.querySelector(`.vue-flow__edge[data-id="${dataId}"]`)
    if(!g) return null
    const path = g.querySelector('.vue-flow__edge-path') || g.querySelector('path')
    if(!path) return null
    const L = path.getTotalLength()
    const pt = path.getPointAtLength(L*f)
    const ctm = path.getScreenCTM()
    return { x: ctm.a*pt.x + ctm.c*pt.y + ctm.e, y: ctm.b*pt.x + ctm.d*pt.y + ctm.f }
  }, {dataId,f})
}
const R = {}
// click detour edge at ~mid (bottom segment)
let pt = await edgePoint('edge-nav-accueil-compte', 0.5)
R.detourMidScreen = pt
await p.mouse.click(pt.x, pt.y)
await p.waitForTimeout(300)
R.afterClick = {
  wpHandles: await p.locator('.wp-handle').count(),
  popover: await p.locator('.edge-popover').count(),
  popoverText: (await p.locator('.edge-popover').first().textContent().catch(()=>'')).replace(/\s+/g,' ').trim().slice(0,140),
}
await b.close()
console.log(JSON.stringify(R,null,2))
