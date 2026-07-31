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

// helper: graph->screen
async function g2s(gx, gy){
  return await p.evaluate(({gx,gy})=>{
    const vp = document.querySelector('.vue-flow__viewport')
    const t = getComputedStyle(vp).transform // matrix(a,b,c,d,e,f)
    const m = new DOMMatrix(t)
    const rect = document.querySelector('.vue-flow').getBoundingClientRect()
    return { x: rect.left + m.a*gx + m.e, y: rect.top + m.d*gy + m.f }
  }, {gx,gy})
}
const R = {}
// 1. select detour edge by clicking a point on its bottom segment (graph ~ (700,720))
let pt = await g2s(700, 720)
await p.mouse.click(pt.x, pt.y)
await p.waitForTimeout(300)
R.afterEdgeClick = {
  wpHandles: await p.locator('.wp-handle').count(),
  popover: await p.locator('.edge-popover').count(),
  popoverText: (await p.locator('.edge-popover').first().textContent().catch(()=>'')) .replace(/\s+/g,' ').trim().slice(0,120),
}
await b.close()
console.log(JSON.stringify(R,null,2))
