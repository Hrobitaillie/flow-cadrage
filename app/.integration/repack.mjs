import { chromium } from 'playwright'
import { readFileSync, writeFileSync } from 'fs'
const FIX = new URL('../fixtures/locasyst-project.flooow.json', import.meta.url).pathname
const GAP = 12
const b = await chromium.launch()
const p = await b.newContext({viewport:{width:1600,height:1000}}).then(c=>c.newPage())
await p.goto('http://localhost:5219/',{waitUntil:'networkidle'}); await p.waitForSelector('.app-shell')
await p.click('button[aria-label="Menu fichier"]'); await p.click('button[role="menuitem"]:has-text("Charger le cadrage locasyst")'); await p.waitForTimeout(1000)
const heights = await p.$$eval('.vue-flow__node-feature', els => els.map(el => ({ id: el.getAttribute('data-id'), h: parseFloat(el.style.height)||0 })))
await b.close()
const hMap = new Map(heights.map(x=>[x.id,x.h]))
const doc = JSON.parse(readFileSync(FIX,'utf8'))
const feats = doc.nodes.filter(n=>n.type==='feature')
const byParent = new Map()
for (const f of feats){ const k=f.parentId||'__root'; if(!byParent.has(k)) byParent.set(k,[]); byParent.get(k).push(f) }
let changed=0
for (const [,list] of byParent){
  list.sort((a,b)=>a.position.y-b.position.y)
  let y=0
  for (const f of list){ const h=hMap.get(f.id)||124; if(f.position.y!==y){f.position.y=y;changed++}; y+=Math.round(h)+GAP }
}
writeFileSync(FIX, JSON.stringify(doc,null,2)+'\n')
console.log('REPACK changed='+changed+' hMapSize='+hMap.size+' sampleH='+heights.slice(0,4).map(x=>Math.round(x.h)).join(','))
