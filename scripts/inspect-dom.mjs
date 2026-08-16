import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(ROOT, 'app', 'dist');
const MIME = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon','.woff':'font/woff','.woff2':'font/woff2','.ttf':'font/ttf','.map':'application/json','.webp':'image/webp' };
const server = createServer(async (req,res)=>{try{const u=decodeURIComponent((req.url||'/').split('?')[0]);let f=join(DIST,u);if(u==='/'||!existsSync(f)||u.endsWith('/')){if(!extname(u)||!existsSync(f))f=join(DIST,'index.html');}const d=await readFile(f);res.writeHead(200,{'Content-Type':MIME[extname(f)]||'application/octet-stream'});res.end(d);}catch{res.writeHead(404);res.end('x');}});
await new Promise(r=>server.listen(8942,r));
const SEED={state:{onboardingComplete:true,theme:'vibespace',density:'cozy',navOpen:true,inspectorOpen:false,route:'chat',lastSeenWhatsNewVersion:'99.99.99',productTutorialStatus:'done'},version:4};
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
const ctx=await browser.newContext({viewport:{width:1440,height:900}});
const page=await ctx.newPage();
await page.addInitScript((s)=>{localStorage.setItem('jarvis-ui',JSON.stringify(s));},SEED);
await page.goto('http://127.0.0.1:8942/',{waitUntil:'networkidle'});
await page.waitForTimeout(1500);
try{const g=page.getByRole('button',{name:/got it/i}).first();if(await g.isVisible({timeout:2000}))await g.click({force:true});}catch{}
await page.waitForTimeout(800);
const info = await page.evaluate(()=>{
  const main=document.querySelector("main[aria-label='Workspace']");
  function desc(el){if(!el)return null;const cs=getComputedStyle(el);const r=el.getBoundingClientRect();return {tag:el.tagName,cls:(el.className||'').toString().slice(0,90),bg:cs.backgroundColor,pos:cs.position,z:cs.zIndex,ovf:cs.overflow,rect:[Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height)]};}
  const composer=document.querySelector("[data-tour='chat-composer']");
  const composerInMain = main && composer ? main.contains(composer) : null;
  const children=main?[...main.children].map(desc):[];
  // find the empty-state / scroll container holding "No messages yet"
  let empty=null; const all=[...document.querySelectorAll('*')];
  for(const el of all){if(el.children.length===0 && /No messages yet/.test(el.textContent||'')){empty=el;break;}}
  const emptyChain=[];let cur=empty;for(let i=0;i<6&&cur;i++){emptyChain.push(desc(cur));cur=cur.parentElement;}
  return {main:desc(main),composerInMain,children,emptyChain};
});
console.log(JSON.stringify(info,null,2));
await browser.close();server.close();
