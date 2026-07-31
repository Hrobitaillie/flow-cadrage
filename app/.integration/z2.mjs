import { chromium } from 'playwright'
const b = await chromium.launch()
const p = await b.newContext({ viewport: { width: 1600, height: 950 } }).then(c=>c.newPage())
p.on('dialog', d=>d.accept())
const R={}
await p.goto('http://localhost:5219/', { waitUntil:'networkidle' })
await p.waitForSelector('.app-shell')
const tp = async ()=> p.evaluate(()=>{ const e=document.querySelector('.vue-flow__transformationpane'); return e?getComputedStyle(e).transform:'noel' })
R.load = await tp()
await p.click('button[role="tab"]:has-text("Fonctionnalités")'); await p.waitForTimeout(600)
R.func = await tp()
console.log('Z2 '+JSON.stringify(R))
await b.close()
