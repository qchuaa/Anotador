const {_electron}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
(async()=>{
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'anotador-placement-test-'));
 const image='data:image/png;base64,'+fs.readFileSync('src/assets/anotador.png').toString('base64');
 const paragraphs=Array.from({length:25},(_,i)=>`<p>Párrafo posterior ${i} que debe conservarse.</p>`).join('');
 fs.writeFileSync(path.join(profile,'notes.json'),JSON.stringify([{id:'b',name:'Ubicación',day:1,classes:[{id:'c',number:1,title:'Clase 1',date:'2026-11-16',html:'<p>Antes <b>seleccionado</b> después del texto.</p>'+paragraphs,images:[{id:'img',src:image,x:40,y:90,w:180,h:120}],files:[]}]}]));
 const app=await _electron.launch(process.argv[2]?{executablePath:path.resolve(process.argv[2]),args:['--user-data-dir='+profile]}:{args:[path.resolve('.'),'--user-data-dir='+profile]});
 try{
  await app.evaluate(({ipcMain})=>{ipcMain.removeHandler('explain');ipcMain.handle('explain',async()=>{await new Promise(r=>setTimeout(r,150));return 'Explicación junto a la selección.';});});
  const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.locator('.card').click();await page.locator('.open-class').click();
  await page.locator('.editor b').evaluate(el=>{el.closest('.editor').focus();const r=document.createRange();r.selectNodeContents(el);const s=getSelection();s.removeAllRanges();s.addRange(r);el.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));});
  await page.locator('#explain').click();
  await page.locator('.ai-note').waitFor();
  assert.equal(await page.locator('.ai-note').evaluate(el=>el.previousElementSibling.textContent),'Antes seleccionado');
  assert.ok(await page.locator('.ai-note').evaluate(el=>el.nextElementSibling.nextElementSibling.textContent.includes('después del texto.')));
  assert.equal(await page.locator('.editor > p').filter({hasText:'Párrafo posterior'}).count(),25);
  // Select an image in the middle of a long page via its normal focus handler.
  await page.locator('.shot').focus();await page.keyboard.press('Control+e');
  await page.waitForFunction(()=>document.querySelectorAll('.ai-note').length===2);
  const imageNote=page.locator('.image-explanation .ai-note');
  const imgRect=await page.locator('.shot').boundingBox(),noteRect=await imageNote.boundingBox();
  assert.ok(Math.abs(noteRect.y-(imgRect.y+imgRect.height+12))<2,JSON.stringify({imgRect,noteRect}));
  const last=await page.getByText('Párrafo posterior 24 que debe conservarse.',{exact:true}).boundingBox();
  assert.ok(noteRect.y<last.y,'image explanation is not at end of page');
  await page.keyboard.type('Continuación normal');
  assert.equal(await imageNote.locator('..').locator('p').innerText(),'Continuación normal');
  await page.evaluate(()=>saveChain);
  await page.screenshot({path:'scripts/placement-preview.png'});
  await page.reload();await page.locator('.card').click();await page.locator('.open-class').click();
  const reImage=await page.locator('.shot').boundingBox(),reNote=await page.locator('.image-explanation .ai-note').boundingBox();
  assert.ok(Math.abs(reNote.y-(reImage.y+reImage.height+12))<2,'placement persists on reopen');
  assert.deepEqual(errors,[]);console.log('PASS: partial text selection, preserved trailing text/formatting, toolbar, image placement in long page, plain continuation and persisted position. '+profile);
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exit(1)});
