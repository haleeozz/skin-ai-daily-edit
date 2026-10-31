// Records one actual authorized task. Never rerun a failed submission blindly.
import { chromium, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const base=process.env.APP_URL || 'http://127.0.0.1:3000';
if(!process.argv.includes('--approved-one-analysis'))throw new Error('Explicit owner approval for one live analysis is required.');
if(existsSync('qa/demo-attempt.json'))throw new Error('A demo submission was already attempted. Inspect its stored session before considering another task.');
const script=JSON.parse(await fs.readFile('submission/demo-script.json','utf8'));
await fs.mkdir('submission/video/raw',{recursive:true});await fs.mkdir('submission/screenshots',{recursive:true});await fs.mkdir('qa',{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const context=await browser.newContext({viewport:{width:1600,height:800},deviceScaleFactor:1,recordVideo:{dir:'submission/video/raw',size:{width:1600,height:800}}});
const page=await context.newPage(),video=page.video(),started=Date.now(),scenes=[],errors=[];let submissions=0,completed;
page.on('pageerror',e=>errors.push(e.message));
page.setDefaultTimeout(20_000);
page.on('response',r=>{if(new URL(r.url()).pathname==='/api/analysis' && r.request().method()==='POST')console.log('Analysis submission HTTP',r.status());});
page.on('request',r=>{if(r.method()==='POST' && new URL(r.url()).pathname==='/api/analysis')submissions++;});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function scene(id,action=async()=>{}){
 const segment=script.find(s=>s.id===id),start=(Date.now()-started)/1000;
 const duration=Number(execFileSync('ffprobe',['-v','error','-show_entries','format=duration','-of','default=nw=1:nk=1',`submission/video/${id}.wav`],{encoding:'utf8',windowsHide:true}).trim());
 console.log('Recording scene:',id);await action();await sleep(Math.max(700,(duration+1-(Date.now()-started)/1000+start)*1000));
 scenes.push({...segment,start,end:(Date.now()-started)/1000,voiceDuration:duration});
}
try {
 await page.goto(base,{waitUntil:'networkidle'});
 // Recording-only redaction of third-party product names for the event's video rule.
 // Label records and actual filtering remain unchanged; the caption discloses this.
 await page.addStyleTag({content:'.product-brand{font-size:0!important}.product-brand::after{content:"MANUFACTURER REFERENCE";font-size:11px}.product-info h4{font-size:0!important}.product-info h4::after{content:"Label-matched basic product";font-size:15px}'});
 const session=await context.request.get(base+'/api/session');expect(session.ok()).toBe(true);expect((await session.json()).liveEnabled).toBe(true);
 await scene('intro',async()=>{await expect(page.getByRole('heading',{name:/Less guesswork/})).toBeVisible();await page.screenshot({path:'submission/screenshots/01-home.png'});});
 await scene('answers',async()=>{
  await page.getByRole('button',{name:'Find my routine'}).click();await page.getByRole('button',{name:'Dry / tight'}).click();
  await page.getByRole('button',{name:'Visible redness',exact:true}).click();await page.getByLabel('Does your skin react easily?').selectOption('yes');
 });
 await scene('consent',async()=>{
  await page.getByRole('button',{name:'Continue to photo'}).click();await page.getByRole('button',{name:'Use the fictional demo photo'}).click();
  await expect(page.getByAltText('Your selected photo, not yet submitted')).toBeVisible();
  await page.getByRole('checkbox',{name:/I’m 18 or older/}).check();await page.getByRole('checkbox',{name:/I agree to send this photo/}).check();
  await expect(page.getByRole('button',{name:'Understand my skin'})).toBeEnabled();await context.storageState({path:'qa/demo-session.json'});
 });
 await scene('analysis',async()=>{
  await fs.writeFile('qa/demo-attempt.json',JSON.stringify({attemptedAt:new Date().toISOString(),base}));
  await page.getByRole('button',{name:'Understand my skin'}).click();
  await Promise.race([
   expect(page.getByRole('heading',{name:'Your daily edit.'})).toBeVisible({timeout:300000}),
   page.locator('.error-bar').waitFor({state:'visible',timeout:300000}).then(async()=>{throw new Error(await page.locator('.error-bar').innerText());}),
  ]);
  expect(submissions).toBe(1);
  const r=await context.request.get(base+'/api/analysis/status');expect(r.ok()).toBe(true);completed=(await r.json()).analysis;
  expect(completed.source).toBe('youcam');expect(completed.findings.length).toBe(6);
 });
 await scene('results',async()=>{
  await expect(page.locator('.example-banner')).toHaveCount(0);await expect(page.locator('.observations button')).toHaveCount(6);
  await page.screenshot({path:'submission/screenshots/02-live-routine.png',fullPage:true});
  await page.locator('.observations button').filter({hasText:'Hydration'}).click();await sleep(1800);
  await page.locator('.observations button').filter({hasText:'Hydration'}).click();
 });
 await scene('sources',async()=>{
  const source=page.locator('.product-step').first().getByText('Sources & label checks',{exact:false});await source.click();await source.scrollIntoViewIfNeeded();
  await page.screenshot({path:'submission/screenshots/03-label-evidence.png'});
 });
 await scene('filters',async()=>{
  await page.getByRole('button',{name:'Edit answers'}).click();await page.getByRole('textbox',{name:/Any ingredients/}).fill('niacinamide');
  await page.getByRole('button',{name:'Update my routine'}).click();await expect(page.getByRole('heading',{name:'Your daily edit.'})).toBeVisible();
  expect(submissions).toBe(1);
 });
 await scene('evening',async()=>{
  await page.getByRole('tab',{name:/Evening/}).click();await expect(page.locator('.product-step')).toHaveCount(2);
  await page.locator('.period-tabs').scrollIntoViewIfNeeded();await page.screenshot({path:'submission/screenshots/04-filtered-evening.png'});
 });
 await scene('finish',async()=>{await page.evaluate(()=>scrollTo({top:0,behavior:'smooth'}));});
 const masks=[];
 for(const f of completed.findings)if(f.maskUrl){const r=await context.request.get(new URL(f.maskUrl,base).href);expect(r.ok()).toBe(true);masks.push({key:f.key,status:r.status(),contentType:r.headers()['content-type']});}
 expect(errors).toEqual([]);
 await fs.writeFile('qa/demo-live-result.json',JSON.stringify({source:completed.source,createdAt:completed.createdAt,findings:completed.findings.map(({maskUrl,...f})=>({...f,hasMask:!!maskUrl})),submissions,masks},null,2));
 console.log('PASS one real task, six observations, maps, source evidence, ingredient editing without another submission.');
} finally {
 await context.storageState({path:'qa/demo-session.json'});await context.close();
 await fs.writeFile('qa/demo-recording.json',JSON.stringify({base,rawVideo:await video.path(),scenes,submissions,complete:scenes.length===script.length},null,2));
 await browser.close();
}
