const {_electron}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
(async()=>{
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'anotador-editor-test-'));
 const image='data:image/png;base64,'+fs.readFileSync('src/assets/anotador.png').toString('base64');
 fs.writeFileSync(path.join(profile,'notes.json'),JSON.stringify([{id:'book',name:'Prueba editor',day:1,classes:[{id:'class',number:1,title:'Clase 1',date:'2026-11-16',html:'<p>Texto para explicar y mantener visible.</p><div class="ai-note" style="margin-top:450px">Explicación anterior.</div><div class="ai-note"><br></div>',images:[],files:[]}]}]));
 const app=await _electron.launch(process.argv[2]?{executablePath:path.resolve(process.argv[2]),args:['--user-data-dir='+profile]}:{args:[path.resolve('.'),'--user-data-dir='+profile]});
 try{
  assert.equal(await app.evaluate(({app})=>app.getPath('userData')),profile);
  await app.evaluate(({ipcMain})=>{
   globalThis.testRequests=[];ipcMain.removeHandler('explain');
   ipcMain.handle('explain',async(_,content)=>{globalThis.testRequests.push(content);await new Promise(r=>setTimeout(r,150));return 'Una explicación de prueba clara y breve.';});
  });
  const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.locator('.card').click();await page.locator('.open-class').click();
  assert.equal(await page.locator('.ai-note').count(),1);
  assert.equal(await page.locator('.ai-note').evaluate(el=>el.style.marginTop),'');
  await page.locator('.editor').evaluate(ed=>{
   ed.focus();const range=document.createRange();range.selectNodeContents(ed.querySelector('p'));
   const s=getSelection();s.removeAllRanges();s.addRange(range);
  });
  await page.keyboard.press('Control+e');
  await page.waitForFunction(()=>document.querySelectorAll('.ai-note').length===2);
  assert.deepEqual(await app.evaluate(()=>globalThis.testRequests),[{text:'Texto para explicar y mantener visible.'}]);
  await page.keyboard.type('Sigo escribiendo');
  assert.equal(await page.locator('.ai-note').filter({hasText:'Sigo escribiendo'}).count(),0);
  // Enter inside a green explanation must exit to plain text, even on old notes.
  await page.locator('.ai-note').first().evaluate(el=>{
   el.parentElement.focus();const r=document.createRange();r.selectNodeContents(el);r.collapse(false);
   const s=getSelection();s.removeAllRanges();s.addRange(r);
  });
  await page.keyboard.press('Enter');await page.keyboard.type('Texto normal');
  assert.equal(await page.locator('.ai-note').count(),2);
  assert.equal(await page.locator('.ai-note').filter({hasText:'Texto normal'}).count(),0);
  // Exercise the image paste handler without modifying the system clipboard.
  await page.locator('.editor').evaluate((ed,src)=>{const bytes=Uint8Array.from(atob(src.split(',')[1]),c=>c.charCodeAt(0));const dt=new DataTransfer();dt.items.add(new File([bytes],'capture.png',{type:'image/png'}));ed.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true}));},image);
  await page.locator('.shot').waitFor();
  const shot=page.locator('.shot');
  const before=await shot.boundingBox();
  await page.mouse.move(before.x+before.width-8,before.y+before.height-35);
  await page.mouse.down();await page.mouse.move(before.x+before.width+32,before.y+before.height+25,{steps:8});await page.mouse.up();
  const after=await shot.boundingBox();assert.ok(after.x>before.x+30 && after.y>before.y+50,'free dragging');
  // Resize from the existing lower-right grip before adding more text.
  await page.mouse.move(after.x+after.width-4,after.y+after.height-4);
  await page.mouse.down();await page.mouse.move(after.x+after.width+36,after.y+after.height+26,{steps:8});await page.mouse.up();
  const resized=await shot.boundingBox();assert.ok(resized.width>after.width+25 && resized.height>after.height+15,'free resize');
  const state=await page.evaluate(()=>({imageZ:getComputedStyle(document.querySelector('.shot')).zIndex,textZ:getComputedStyle(document.querySelector('.editor')).zIndex}));
  assert.ok(Number(state.textZ)>Number(state.imageZ),'text is above images');
  // Image remains selected while Ctrl+E requests its explanation, with no coordinate-based margin.
  await page.keyboard.press('Control+e');await page.keyboard.press('Control+e');
  await page.waitForFunction(()=>document.querySelectorAll('.ai-note').length===3);
  const requests=await app.evaluate(()=>globalThis.testRequests);assert.equal(requests.length,2);assert.equal(requests[1].image,image);
  assert.equal(await page.locator('.ai-note').last().evaluate(el=>el.style.marginTop),'');
  const bounds=await shot.boundingBox();
  const hit=await shot.evaluate(el=>{const r=el.getBoundingClientRect();for(let y=r.top+4;y<r.bottom-24;y+=8)for(let x=r.left+4;x<r.right-4;x+=8)if(document.elementFromPoint(x,y)?.closest('.shot')===el)return {x,y};});
  assert.ok(hit,'image remains clickable in exposed areas');await page.mouse.click(hit.x,hit.y);
  await page.keyboard.press('Backspace');assert.equal(await page.locator('.shot').count(),0);
  // Backspace on ordinary text must retain its normal meaning.
  await page.locator('.editor').evaluate(ed=>{ed.focus();const p=document.createElement('p');p.textContent='abc';ed.append(p);const r=document.createRange();r.selectNodeContents(p);r.collapse(false);const s=getSelection();s.removeAllRanges();s.addRange(r);});
  await page.keyboard.press('Backspace');assert.equal(await page.locator('.editor p').last().innerText(),'ab');
  await page.evaluate(()=>saveChain);
  const saved=JSON.parse(fs.readFileSync(path.join(profile,'notes.json'),'utf8'))[0].classes[0];assert.equal(saved.images.length,0);assert.ok(saved.html.includes('Texto normal'));assert.ok(!saved.html.includes('450px'));
  await page.screenshot({path:'scripts/editor-preview.png',fullPage:true});
  await page.reload();await page.locator('.card').click();await page.locator('.open-class').click();
  assert.equal(await page.locator('.ai-note').count(),3);assert.equal(await page.locator('.shot').count(),0);
  assert.deepEqual(errors,[]);console.log('PASS: legacy formatting, Ctrl+E text/image, duplicate request prevention, Enter to plain text, paste/drag/layers, Backspace, persistence. '+profile);
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exit(1)});
