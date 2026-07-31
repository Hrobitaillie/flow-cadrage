import { chromium } from 'playwright'
const b = await chromium.launch()
const p = await b.newContext({viewport:{width:1400,height:900}}).then(c=>c.newPage())
const errs=[]; p.on('console',m=>{if(m.type()==='error')errs.push(m.text())}); p.on('pageerror',e=>errs.push(String(e)))
await p.goto('http://localhost:5219/',{waitUntil:'networkidle'}); await p.waitForTimeout(1500)
const shell=await p.locator('.app-shell').count()
let loaded=false
try{ await p.click('button[aria-label="Menu fichier"]',{timeout:3000}); await p.click('button[role="menuitem"]:has-text("Charger le cadrage locasyst")',{timeout:3000}); await p.waitForTimeout(1200); loaded=true}catch(e){}
const mods=await p.locator('.vue-flow__node-module').count()
const feats=await p.locator('.vue-flow__node-feature').count()
console.log('PROBE '+JSON.stringify({shell,loaded,mods,feats,errs:errs.slice(0,4)}))
await b.close()
