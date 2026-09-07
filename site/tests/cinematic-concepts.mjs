import {chromium} from '@playwright/test';
import {AxeBuilder} from '@axe-core/playwright';
import fs from 'node:fs/promises';
const browser=await chromium.launch();const context=await browser.newContext();const page=await context.newPage();
const results=[];
for(const theme of ['copper','ivory','signal'])for(const width of [390,1440]){
 await page.setViewportSize({width,height:900});await page.goto(`http://127.0.0.1:8765/concepts/${theme}/`);await page.waitForTimeout(1200);
 await page.screenshot({path:`evidence/cinematic-product-world/study-${theme}-${width}.png`});
 await page.locator('#one-space').scrollIntoViewIfNeeded();await page.locator('#assembly-range').fill('100');await page.waitForTimeout(100);
 await page.locator('#one-space').screenshot({path:`evidence/cinematic-product-world/study-${theme}-${width}-reveal.png`});
 const axe=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
 results.push({theme,width,violations:axe.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,data:n.any.map(x=>x.data)}))}))});
}
await fs.writeFile('evidence/cinematic-product-world/concept-accessibility.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));await browser.close();if(results.some(r=>r.violations.length))process.exitCode=1;
