import { chromium } from 'playwright'
const browser = await chromium.connectOverCDP('http://localhost:9222')
const ctx = browser.contexts()[0]
let p = ctx.pages().find(pg => pg.url().includes('localhost:5219')) || ctx.pages()[0]
await p.bringToFront()
const R={}
const errs=[]; p.on('console',m=>{ if(m.type()==='error') errs.push(m.text()) })
p.on('dialog',d=>d.accept())
// ensure functional layer + clean: reload
await p.goto('http://localhost:5219/', { waitUntil:'networkidle' })
await p.waitForSelector('.app-shell')
await p.click('button[role="tab"]:has-text("Fonctionnalités")'); await p.waitForTimeout(700)
const pane=await p.$('.vue-flow__pane'); const pb=await pane.boundingBox()
// place 3 root features
await p.click('button[aria-label^="Fonctionnalité"]', {modifiers:['Shift']})
await p.mouse.click(pb.x+560, pb.y+230); await p.waitForTimeout(300)
await p.mouse.click(pb.x+360, pb.y+560); await p.waitForTimeout(300)
await p.mouse.click(pb.x+760, pb.y+560); await p.waitForTimeout(300)
await p.keyboard.press('v'); await p.keyboard.press('Escape'); await p.waitForTimeout(300)
R.feats=await p.locator('.vue-flow__node-feature').count()
const N=i=>p.locator('.vue-flow__node-feature').nth(i)
// helper: list A's bottom source handles positions
async function portsOf(i){
  return await N(i).evaluate(el=>{
    const hs=[...el.querySelectorAll('.vue-flow__handle')]
    return hs.map(h=>({id:h.getAttribute('data-handleid'), type:h.classList.contains('source')?'src':'tgt', cls:[...h.classList].filter(c=>c.startsWith('dep')||c.includes('bottom')||c.includes('top')).join(','), r:h.getBoundingClientRect().left|0}))
  })
}
async function conn(si,ti){
  const s=N(si),t=N(ti); const sb=await s.boundingBox(), tb=await t.boundingBox()
  await s.hover(); await p.waitForTimeout(250)
  await p.mouse.move(sb.x+sb.width/2, sb.y+sb.height-2); await p.mouse.down()
  await p.mouse.move((sb.x+tb.x)/2+80, (sb.y+tb.y)/2, {steps:10}); await p.waitForTimeout(120)
  await p.mouse.move(tb.x+tb.width/2, tb.y+tb.height/2, {steps:12}); await p.waitForTimeout(150); await p.mouse.up()
  await p.waitForTimeout(700)
}
R.e0=await p.locator('.vue-flow__edge').count()
await conn(0,1); R.e1=await p.locator('.vue-flow__edge').count()
R.portsAfter1 = await portsOf(0)
await conn(0,2); R.e2=await p.locator('.vue-flow__edge').count()
R.portsAfter2 = await portsOf(0)
R.errs=errs
console.log(JSON.stringify(R,null,1))
await browser.close().catch(()=>{})
