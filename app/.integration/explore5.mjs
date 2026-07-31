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
async function edgePoint(dataId, f){
  return await p.evaluate(({dataId,f})=>{
    const g = document.querySelector(`.vue-flow__edge[data-id="${dataId}"]`)
    if(!g) return null
    const path = g.querySelector('.vue-flow__edge-path') || g.querySelector('path')
    if(!path) return null
    const L = path.getTotalLength(); const pt = path.getPointAtLength(L*f); const c = path.getScreenCTM()
    return { x: c.a*pt.x + c.c*pt.y + c.e, y: c.b*pt.x + c.d*pt.y + c.f }
  }, {dataId,f})
}
const pills = () => p.locator('.portal-pill').count()
const R = {}

// --- CONVERT line->portal via popover (edge-nav-accueil-catalogue is straight line)
R.pillsStart = await pills()
let pt = await edgePoint('edge-nav-accueil-catalogue', 0.5)
await p.mouse.click(pt.x, pt.y); await p.waitForTimeout(200)
await p.locator('.edge-popover button:has-text("Convertir en portail")').click(); await p.waitForTimeout(300)
R.pillsAfterConvertToPortal = await pills()
R.catalogueNowPortal = (await p.locator('.vue-flow__edge[data-id="edge-nav-accueil-catalogue"] .vue-flow__edge-path').count()) === 0

// --- RECONVERT portal->line via right-click a pill
// right-click one of the newly created pills (the "→ Catalogue" pill). Just right-click first pill of that edge.
const pillLoc = p.locator('.portal-pill').first()
await pillLoc.click({ button: 'right' }); await p.waitForTimeout(250)
R.popoverAfterPillRight = await p.locator('.edge-popover').count()
const backBtn = p.locator('.edge-popover button:has-text("Convertir en ligne")')
R.hasConvertToLine = await backBtn.count()
if(await backBtn.count()){ await backBtn.click(); await p.waitForTimeout(300) }
R.pillsAfterReconvert = await pills()

// --- DOUBLE-CLICK to add waypoint on a straight line edge (edge-dep-commande-compte)
async function qCount(dataId){ return await p.evaluate((id)=>{const g=document.querySelector(`.vue-flow__edge[data-id="${id}"]`);const pa=g&&g.querySelector('.vue-flow__edge-path');return pa?(pa.getAttribute('d').match(/Q/g)||[]).length:-1},dataId) }
R.depQBefore = await qCount('edge-dep-commande-compte')
let dp = await edgePoint('edge-dep-commande-compte', 0.5)
await p.mouse.dblclick(dp.x, dp.y); await p.waitForTimeout(300)
R.depQAfter = await qCount('edge-dep-commande-compte')

// --- DRAG the new waypoint handle: select edge then drag its wp-handle
let dp2 = await edgePoint('edge-dep-commande-compte', 0.5)
await p.mouse.click(dp2.x, dp2.y); await p.waitForTimeout(200)
R.wpHandlesOnDep = await p.locator('.wp-handle').count()
const h = p.locator('.wp-handle').first()
const hb = await h.boundingBox()
if(hb){
  const cx = hb.x+hb.width/2, cy=hb.y+hb.height/2
  await p.mouse.move(cx,cy); await p.mouse.down()
  await p.mouse.move(cx+40, cy+60,{steps:6}); await p.mouse.move(cx+60,cy+90,{steps:6})
  await p.mouse.up(); await p.waitForTimeout(300)
  const hb2 = await p.locator('.wp-handle').first().boundingBox()
  R.handleMoved = hb2 ? (Math.abs(hb2.y-hb.y)>10) : false
}

// --- AUTO PORTAL: connect commande(source, right) -> accueil(target, left) : recede
await p.locator('.vue-flow__pane').click({position:{x:5,y:5}}) // clear selection/popover
await p.waitForTimeout(200)
R.pillsBeforeAuto = await pills()
const srcH = p.locator('.vue-flow__node[data-id="page-commande"] .vue-flow__handle.source').first()
const tgtH = p.locator('.vue-flow__node[data-id="page-accueil"] .vue-flow__handle.target').first()
const sb = await srcH.boundingBox(); const tb = await tgtH.boundingBox()
R.haveHandles = !!(sb&&tb)
if(sb&&tb){
  await p.mouse.move(sb.x+sb.width/2, sb.y+sb.height/2)
  await p.mouse.down()
  await p.mouse.move(sb.x-40, sb.y+20,{steps:4})
  await p.mouse.move(tb.x+tb.width/2, tb.y+tb.height/2,{steps:20})
  await p.mouse.up(); await p.waitForTimeout(400)
}
R.pillsAfterAuto = await pills()
await b.close()
console.log(JSON.stringify(R,null,2))
