import { chromium } from 'playwright'
const b = await chromium.launch()
const p = await b.newContext({viewport:{width:1500,height:1000},deviceScaleFactor:1}).then(c=>c.newPage())
const errs=[]; p.on('console',m=>{if(m.type()==='error')errs.push(m.text())}); p.on('pageerror',e=>errs.push(String(e))); p.on('dialog',d=>d.accept())
const R={}
await p.goto('http://localhost:5219/',{waitUntil:'networkidle'}); await p.waitForSelector('.app-shell')
await p.click('button[aria-label="Menu fichier"]'); await p.click('button[role="menuitem"]:has-text("Charger le cadrage locasyst")'); await p.waitForTimeout(1000)
// measure vertical gap between first two cards of leftmost column
const feats=p.locator('.vue-flow__node-feature'); const n=await feats.count()
const m0=await p.locator('.vue-flow__node-module').first().boundingBox()
const col=[]; for(let i=0;i<n;i++){const bx=await feats.nth(i).boundingBox(); if(Math.abs(bx.x-(m0.x+11))<20) col.push(bx)}
col.sort((a,b)=>a.y-b.y)
R.gap01 = Math.round(col[1].y-(col[0].y+col[0].height))
R.gap12 = Math.round(col[2].y-(col[1].y+col[1].height))
R.errs=errs.slice(0,3)
await p.screenshot({path:new URL('./tight.png',import.meta.url).pathname, clip:{x:Math.max(0,m0.x-20),y:Math.max(0,m0.y-20),width:420,height:700}})
console.log('TIGHT '+JSON.stringify(R))
await b.close()
