import { chromium } from 'playwright'
const b = await chromium.launch()
const p = await b.newContext({ viewport:{width:1700,height:1000}, deviceScaleFactor:1 }).then(c=>c.newPage())
const errs=[]; p.on('console',m=>{if(m.type()==='error')errs.push(m.text())}); p.on('pageerror',e=>errs.push(String(e))); p.on('dialog',d=>d.accept())
const R={}
await p.goto('http://localhost:5219/',{waitUntil:'networkidle'}); await p.waitForSelector('.app-shell')
await p.click('button[aria-label="Menu fichier"]'); await p.click('button[role="menuitem"]:has-text("Charger le cadrage locasyst")'); await p.waitForTimeout(900)
const mods = p.locator('.vue-flow__node-module')
const m0=await mods.nth(0).boundingBox(), m1=await mods.nth(1).boundingBox()
// top-left feature of module 0
const feats=p.locator('.vue-flow__node-feature'); const n=await feats.count()
let f0=null
for(let i=0;i<n;i++){const bx=await feats.nth(i).boundingBox(); if(Math.abs(bx.x-(m0.x+11))<20 && bx.y<m0.y+120){f0={i,...bx};break}}
R.m0w0=Math.round(m0.width); R.m1w0=Math.round(m1.width)
// REPARENT: drag f0 into module 1's body
const tx=m1.x+m1.width/2, ty=m1.y+140
await p.mouse.move(f0.x+f0.width/2,f0.y+f0.height/2); await p.mouse.down(); await p.mouse.move(tx,ty,{steps:20}); await p.waitForTimeout(150); await p.mouse.up(); await p.waitForTimeout(500)
const bf=await feats.nth(f0.i).boundingBox()
R.f0_landed_in_m1 = bf.x > m1.x-30 && bf.x < m1.x+m1.width
// DETACH: drag some feature far into empty space below everything
const anyf=await feats.nth(0).boundingBox()
await p.mouse.move(anyf.x+anyf.width/2,anyf.y+anyf.height/2); await p.mouse.down(); await p.mouse.move(anyf.x+anyf.width/2, 960,{steps:20}); await p.waitForTimeout(150); await p.mouse.up(); await p.waitForTimeout(400)
R.errs=errs.slice(0,3)
console.log('REPARENT '+JSON.stringify(R))
await b.close()
