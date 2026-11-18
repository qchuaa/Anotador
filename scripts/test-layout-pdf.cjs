const {_electron}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
(async()=>{
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'anotador-layout-test-'));
 const out=path.resolve('tmp/pdfs');fs.mkdirSync(out,{recursive:true});
 const image='data:image/png;base64,'+fs.readFileSync('src/assets/anotador.png').toString('base64');
 const long=Array.from({length:65},(_,i)=>`<p>Apunte ${i+1}: La derivada representa la tasa de cambio de una función. Este párrafo permite comprobar el salto de página y la continuidad de los apuntes.</p>`).join('');
 fs.writeFileSync(path.join(profile,'notes.json'),JSON.stringify([{id:'book',name:'Cálculo y física',day:1,classes:[
  {id:'later',number:2,title:'Derivadas y energía',date:'2026-11-23',html:'<h2>Conceptos principales</h2><p>Texto con <b>negrita</b>, <i>cursiva</i> y acentos: integración, energía, función.</p><ul><li>Primer concepto</li><li>Segundo concepto</li></ul><div class="image-explanation" style="padding-top:100px"><div class="ai-note">Una explicación breve y clara, con fondo verde suave.</div><p><br></p></div>'+long,images:[{id:'shot',src:image,x:40,y:190,w:220,h:220}],files:[{id:'attachment.pdf',name:'Material de clase.pdf'}],layoutWidth:900},
  {id:'first',number:1,title:'Introducción',date:'2026-11-16',html:'<p>Primera clase del cuaderno.</p>',images:[],files:[]}
 ]}]));
 const app=await _electron.launch(process.argv[2]?{executablePath:path.resolve(process.argv[2]),args:['--user-data-dir='+profile]}:{args:[path.resolve('.'),'--user-data-dir='+profile]});
 try{
  assert.equal(await app.evaluate(({app})=>app.getPath('userData')),profile);
  await app.evaluate(({dialog},out)=>{
   globalThis.pdfDialogs=[];globalThis.cancelExport=false;
   dialog.showSaveDialog=async(_parent,options)=>{globalThis.pdfDialogs.push(options);return globalThis.cancelExport?{canceled:true}:{canceled:false,filePath:out+'/'+(options.title.includes('cuaderno')?'notebook':'lesson')+'.'+options.filters[0].extensions[0]};};
  },out);
  const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.locator('.card').click();await page.locator('.open-class[data-id="later"]').click();
  assert.equal(await page.locator('.toolbar .download-control, .toolbar [id^="export-"]').count(),0);
  assert.equal(await page.locator('.lesson-actions #download-lesson').count(),1);
  await page.locator('#download-lesson').click();
  await page.locator('#export-lesson').waitFor({state:'visible'});
  await page.screenshot({path:'tmp/download-menu-preview.png'});
  await page.locator('#download-lesson').press('Escape');
  assert.ok(await page.locator('#export-lesson').isHidden());
  const original=await page.locator('.paper').boundingBox();
  await page.locator('#toggle-sidebar').click();
  assert.equal(await page.locator('#toggle-sidebar').getAttribute('aria-expanded'),'false');
  const expanded=await page.locator('.paper').boundingBox();assert.ok(expanded.width>original.width+200);assert.ok(expanded.x<30);
  await page.locator('.editor p').last().scrollIntoViewIfNeeded();
  const toolbar=await page.locator('.toolbar').boundingBox(),header=await page.locator('header').boundingBox();
  assert.ok(toolbar.y>=header.y+header.height && toolbar.y<100,'toolbar stays below header while scrolling');
  assert.ok(await page.locator('#explain kbd').isVisible());assert.equal(await page.locator('#explain kbd').innerText(),'Ctrl + E');
  // Formatting still applies to the selected text while the floating bar is clicked.
  await page.locator('.editor p').last().evaluate(el=>{el.closest('.editor').focus({preventScroll:true});const r=document.createRange();r.selectNodeContents(el);const s=getSelection();s.removeAllRanges();s.addRange(r);el.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));});
  await page.locator('[data-cmd="bold"]').click();
  assert.ok(await page.locator('.editor p').last().locator('b,strong').count());
  assert.ok(await page.evaluate(()=>scrollY>1000),'formatting keeps the writing position');
  await page.screenshot({path:'scripts/remodel-preview.png'});
  await page.locator('#download-lesson').click();await page.locator('#export-lesson').click();
  await page.waitForFunction(()=>!document.querySelector('#download-lesson').disabled,{},{timeout:60000});
  assert.ok(fs.readFileSync(path.join(out,'lesson.pdf')).subarray(0,4).toString()==='%PDF');
  await page.locator('#download-lesson').click();await page.locator('#export-lesson-docx').click();
  await page.waitForFunction(()=>!document.querySelector('#download-lesson').disabled,{},{timeout:60000});
  const JSZip=require('jszip');
  const single=await JSZip.loadAsync(fs.readFileSync(path.join(out,'lesson.docx')));
  const singleXML=await single.file('word/document.xml').async('string');
  assert.ok(singleXML.includes('Derivadas y energía') && singleXML.includes('Apunte 65'));
  assert.ok(Object.keys(single.files).some(n=>n.startsWith('word/media/')&&!single.files[n].dir));
  assert.ok(!singleXML.includes('Primera clase del cuaderno'));
  await page.reload();await page.locator('.card').waitFor();
  assert.equal(await page.locator('#toggle-sidebar').getAttribute('aria-expanded'),'false');
  await page.locator('.card').click();await page.locator('#download-book').click();await page.locator('#export-book').click();
  await page.waitForFunction(()=>!document.querySelector('#download-book').disabled,{},{timeout:60000});
  assert.ok(fs.readFileSync(path.join(out,'notebook.pdf')).subarray(0,4).toString()==='%PDF');
  await page.locator('#download-book').click();await page.locator('#export-book-docx').click();
  await page.waitForFunction(()=>!document.querySelector('#download-book').disabled,{},{timeout:60000});
  const notebook=await JSZip.loadAsync(fs.readFileSync(path.join(out,'notebook.docx')));
  const xml=await notebook.file('word/document.xml').async('string');
  assert.ok(xml.indexOf('Primera clase del cuaderno')<xml.indexOf('Derivadas y energía'));
  assert.ok(xml.includes('Apunte 65') && xml.includes('w:type="page"'));
  await app.evaluate(()=>{globalThis.cancelExport=true;});
  await page.locator('#download-book').click();await page.locator('#export-book').click();await page.waitForFunction(()=>!document.querySelector('#download-book').disabled);
  assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().length),1);
  await page.locator('#toggle-sidebar').click();
  assert.equal(await page.locator('#toggle-sidebar').getAttribute('aria-expanded'),'true');
  // Compact window must keep every floating tool within the viewport.
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(850,600));
  await page.locator('.open-class[data-id="later"]').click();await page.locator('.editor p').last().scrollIntoViewIfNeeded();
  const compact=await page.locator('.toolbar').boundingBox();const viewport=await page.evaluate(()=>({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth}));
  assert.ok(compact.x>=0 && compact.x+compact.width<=viewport.width+1 && compact.y+compact.height<viewport.height);
  assert.ok(viewport.scrollWidth<=viewport.width+1,'no horizontal overflow');
  assert.deepEqual(errors,[]);console.log('PASS: sidebar width/persistence, floating tools/formatting, visible shortcut, compact window, lesson/book PDF, cancel and cleanup. '+out);
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exit(1)});
