const {_electron}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
(async()=>{
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'anotador-notion-ui-'));
 const parent='41b61d68-68aa-81b7-b3fd-ea75706dfa84';
 fs.writeFileSync(path.join(profile,'notion-sync.json'),JSON.stringify({config:{parentId:parent,automatic:true},scopes:{}}));
 fs.writeFileSync(path.join(profile,'notes.json'),JSON.stringify([{id:'b',name:'Prueba Notion',day:2,classes:[{id:'c',number:1,title:'Clase 1',date:'2026-11-17',html:'<p>Apunte de prueba.</p>',images:[],files:[]}]}]));
 const app=await _electron.launch(process.argv[2]?{executablePath:path.resolve(process.argv[2]),args:['--user-data-dir='+profile]}:{args:[path.resolve('.'),'--user-data-dir='+profile]});
 try{
  const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.locator('.card').waitFor();
  await page.locator('#notion-sync-now').click();await page.locator('#notion-dialog').waitFor({state:'visible'});
  assert.ok((await page.locator('#notion-parent').inputValue()).includes(parent.replaceAll('-','')));
  assert.equal(await page.locator('#notion-token').inputValue(),'');
  // Exercise the real UI without sending test data or a token to Notion.
  await app.evaluate(({ipcMain},parent)=>{
   globalThis.notionFixture={configured:false,parentId:parent,destinationUrl:'https://www.notion.so/'+parent.replaceAll('-',''),automatic:true,workspace:'Prueba',busy:false,pending:2,lastSuccess:null,error:'',warnings:[],retryAt:0};
   globalThis.syncCalls=0;globalThis.connectionForm=null;
   const handlers={notionStatus:()=>globalThis.notionFixture,notionConfigure:data=>{globalThis.connectionForm={parent:data.parent,automatic:data.automatic,hasToken:!!data.token};Object.assign(globalThis.notionFixture,{configured:true,automatic:data.automatic});return globalThis.notionFixture;},notionSync:async()=>{globalThis.syncCalls++;Object.assign(globalThis.notionFixture,{busy:true});await new Promise(r=>setTimeout(r,100));Object.assign(globalThis.notionFixture,{busy:false,pending:0,lastSuccess:new Date().toISOString()});return globalThis.notionFixture;},notionDisconnect:()=>{globalThis.notionFixture.configured=false;return globalThis.notionFixture;}};
   for(const [name,handler] of Object.entries(handlers)){ipcMain.removeHandler(name);ipcMain.handle(name,(_,data)=>handler(data));}
  },parent);
  await page.locator('#notion-token').fill('ui-test-only');await page.locator('#notion-automatic').uncheck();await page.locator('#notion-connect').click();
  await page.waitForFunction(()=>document.querySelector('#notion-token').value==='');
  assert.deepEqual(await app.evaluate(()=>globalThis.connectionForm),{parent:'https://www.notion.so/'+parent.replaceAll('-',''),automatic:false,hasToken:true});
  await app.evaluate(({ipcMain})=>{ipcMain.removeHandler('notionPull');ipcMain.handle('notionPull',async()=>{await new Promise(r=>setTimeout(r,150));return {books:[{id:'remote',name:'Recuperado',day:1,classes:[]}],report:{added:1,updated:0,copies:0,unchanged:0,warnings:[]}};});});
  await page.screenshot({path:'scripts/notion-settings-preview.png'});
  await page.locator('#notion-close').click();await page.locator('.card').click();await page.locator('.open-class').click();
  await page.locator('.editor').fill('Último cambio antes del envío manual.');
  await page.locator('#toggle-sidebar').click();await page.locator('#notion-sync-now').click();
  await page.waitForFunction(()=>document.querySelector('#notion-status').textContent==='Notion al día');
  assert.equal(await app.evaluate(()=>globalThis.syncCalls),1);
  assert.ok(fs.readFileSync(path.join(profile,'notes.json'),'utf8').includes('Último cambio'));
  await page.locator('#toggle-sidebar').click();await page.locator('#notion-settings').click();await page.locator('#notion-disconnect').click();
  await page.waitForFunction(()=>document.querySelector('#notion-status').textContent==='Notion sin conectar');
  await page.locator('#notion-close').click();assert.deepEqual(errors,[]);
  await app.evaluate(()=>{globalThis.notionFixture.configured=true;});await page.evaluate(()=>refreshNotion());
  await page.locator('#notion-pull').click();await page.locator('#modal-title').filter({hasText:'Clases recuperadas'}).waitFor();
  assert.equal(await page.locator('.card').innerText().then(t=>t.includes('Recuperado')),true);
  assert.equal(await page.locator('#content').evaluate(el=>el.inert),false);
  await page.locator('#confirm').click();
  console.log('PASS: destination prefill, masked/cleared token, automatic preference, status, manual sync with latest edits, collapsed sidebar and disconnect.');
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exit(1)});
