import { chromium } from 'playwright'
const b = await chromium.launch()
const p = await b.newContext({viewport:{width:1600,height:1000},deviceScaleFactor:1}).then(c=>c.newPage())
const errs=[]; p.on('console',m=>{if(m.type()==='error')errs.push(m.text())}); p.on('pageerror',e=>errs.push(String(e))); p.on('dialog',d=>d.accept())
const R={}
await p.goto('http://localhost:5219/',{waitUntil:'networkidle'}); await p.waitForSelector('.app-shell')
await p.click('button[aria-label="Menu fichier"]'); await p.click('button[role="menuitem"]:has-text("Charger le cadrage locasyst")'); await p.waitForTimeout(1000)
const m0=await p.locator('.vue-flow__node-module').first().boundingBox()
const f=p.locator('.vue-flow__node-feature')
async function column(){ const n=await f.count(); const col=[]; for(let i=0;i<n;i++){const bx=await f.nth(i).boundingBox(); if(Math.abs(bx.x-(m0.x+11))<25) col.push({i,...bx})} col.sort((a,b)=>a.y-b.y); return col }
let col=await column()
const gapsBefore = col.slice(1).map((c,i)=>Math.round(c.y-(col[i].y+col[i].height)))
R.gapsBefore = gapsBefore.slice(0,5)
// grab 2nd card, drag it down to boundary between card 3 and 4
const c1=col[1], c3=col[3], c4=col[4]
await p.mouse.move(c1.x+c1.width/2, c1.y+c1.height/2); await p.mouse.down()
await p.mouse.move(c3.x+c3.width/2, (c3.y+c3.height+c4.y)/2, {steps:25}); await p.waitForTimeout(200); await p.mouse.up(); await p.waitForTimeout(600)
col=await column()
const gapsAfter = col.slice(1).map((c,i)=>Math.round(c.y-(col[i].y+col[i].height)))
R.gapsAfter = gapsAfter.slice(0,8)
R.maxGap = Math.max(...gapsAfter)
R.minGap = Math.min(...gapsAfter)
R.noOverlap = gapsAfter.every(g=>g>=-3)
R.noBigHole = gapsAfter.every(g=>g<30)
R.count = col.length
R.errs=errs.slice(0,3)
console.log('COLUMN '+JSON.stringify(R))
await b.close()
