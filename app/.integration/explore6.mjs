import { chromium } from 'playwright'
const b = await chromium.launch()
const p = await (await b.newContext()).newPage()
p.on('dialog', d => d.accept())
await p.goto('http://localhost:5173/', { waitUntil: 'networkidle' })
await p.waitForSelector('.app-shell')
await p.click('button[aria-label="Menu fichier"]')
await p.click('button[role="menuitem"]:has-text("Charger la démo")')
await p.waitForSelector('.vue-flow__node-page'); await p.waitForTimeout(600)
async function edgePoint(dataId, f){
  return await p.evaluate(({dataId,f})=>{
    const g = document.querySelector(`.vue-flow__edge[data-id="${dataId}"]`); if(!g) return null
    const path = g.querySelector('.vue-flow__edge-path')||g.querySelector('path'); if(!path) return null
    const L=path.getTotalLength(); const pt=path.getPointAtLength(L*f); const c=path.getScreenCTM()
    return { x:c.a*pt.x+c.c*pt.y+c.e, y:c.b*pt.x+c.d*pt.y+c.f }
  },{dataId,f})
}
const pills=()=>p.locator('.portal-pill').count()
const qCount=(id)=>p.evaluate((id)=>{const g=document.querySelector(`.vue-flow__edge[data-id="${id}"]`);const pa=g&&g.querySelector('.vue-flow__edge-path');return pa?(pa.getAttribute('d').match(/Q/g)||[]).length:-1},id)
const R={}; const step=async(n,f)=>{try{R[n]=await f()}catch(e){R[n]={err:String(e).slice(0,120)}}}

await step('convertLineToPortal', async()=>{
  const before=await pills()
  const pt=await edgePoint('edge-nav-accueil-catalogue',0.5)
  await p.mouse.click(pt.x,pt.y); await p.waitForTimeout(200)
  await p.locator('.edge-popover button:has-text("Convertir en portail")').click(); await p.waitForTimeout(300)
  const after=await pills()
  const noPath=(await p.locator('.vue-flow__edge[data-id="edge-nav-accueil-catalogue"] .vue-flow__edge-path').count())===0
  return {before,after,noPath,ok:after===before+2&&noPath}
})

await step('reconvertPortalToLine', async()=>{
  const before=await pills()
  const pill=p.locator('.portal-pill[title="Revenir de Accueil"]').first()
  const bb=await pill.boundingBox()
  await pill.dispatchEvent('contextmenu',{clientX:Math.round(bb.x+bb.width/2),clientY:Math.round(bb.y+bb.height/2),bubbles:true})
  await p.waitForTimeout(250)
  const pop=await p.locator('.edge-popover').count()
  const toLine=p.locator('.edge-popover button:has-text("Convertir en ligne")')
  const has=await toLine.count()
  if(has) await toLine.click()
  await p.waitForTimeout(300)
  const after=await pills()
  return {before,pop,hasConvertToLine:has,after,ok:pop>0&&has>0&&after===before-2}
})

await step('dblclickAddWaypoint', async()=>{
  await p.locator('.vue-flow__pane').click({position:{x:5,y:5}}); await p.waitForTimeout(150)
  const qb=await qCount('edge-dep-commande-compte')
  const pt=await edgePoint('edge-dep-commande-compte',0.5)
  await p.mouse.dblclick(pt.x,pt.y); await p.waitForTimeout(300)
  const qa=await qCount('edge-dep-commande-compte')
  return {qBefore:qb,qAfter:qa,ok:qa>qb}
})

await step('dragWaypoint', async()=>{
  const pt=await edgePoint('edge-dep-commande-compte',0.5)
  await p.mouse.click(pt.x,pt.y); await p.waitForTimeout(200)
  const nH=await p.locator('.wp-handle').count()
  const h=p.locator('.wp-handle').first(); const hb=await h.boundingBox()
  if(!hb) return {nH,ok:false,reason:'no handle'}
  const cx=hb.x+hb.width/2, cy=hb.y+hb.height/2
  await p.mouse.move(cx,cy); await p.mouse.down()
  await p.mouse.move(cx+50,cy+70,{steps:8}); await p.mouse.move(cx+70,cy+100,{steps:8})
  await p.mouse.up(); await p.waitForTimeout(300)
  const hb2=await p.locator('.wp-handle').first().boundingBox()
  return {nH,moved:hb2?Math.round(hb2.y-hb.y):null,ok:!!hb2&&Math.abs(hb2.y-hb.y)>15}
})

await step('autoPortalOnRecede', async()=>{
  await p.locator('.vue-flow__pane').click({position:{x:5,y:5}}); await p.waitForTimeout(200)
  const before=await pills()
  const srcH=p.locator('.vue-flow__node[data-id="page-commande"] .vue-flow__handle.source').first()
  const tgtH=p.locator('.vue-flow__node[data-id="page-accueil"] .vue-flow__handle.target').first()
  const sb=await srcH.boundingBox(), tb=await tgtH.boundingBox()
  if(!sb||!tb) return {ok:false,reason:'no handles'}
  await p.mouse.move(sb.x+sb.width/2,sb.y+sb.height/2); await p.mouse.down()
  await p.mouse.move(sb.x+sb.width/2-30,sb.y+20,{steps:4})
  await p.mouse.move(tb.x+tb.width/2,tb.y+tb.height/2,{steps:25})
  await p.mouse.up(); await p.waitForTimeout(400)
  const after=await pills()
  return {before,after,ok:after===before+2}
})

await b.close()
console.log(JSON.stringify(R,null,2))
