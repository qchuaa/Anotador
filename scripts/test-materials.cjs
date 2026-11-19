const {_electron}=require('playwright'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const HTMLtoDOCX=require('html-to-docx'),JSZip=require('jszip'),{normalizeDocx}=require('../src/docx-package.cjs');
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'anotador-materials-'));
 const raw=await HTMLtoDOCX('<h1>Título de Word</h1><p style="color:#000000;background-color:#ffffff">Contenido importado</p>',null,{margins:{top:1134,bottom:1134,left:1134,right:1134}});
 const repaired=await normalizeDocx(raw),zip=await JSZip.loadAsync(repaired),xml=await zip.file('word/document.xml').async('string');
 assert.ok(!xml.includes('="undefined"'));assert.match(xml,/<w:sectPr[\s\S]*<\/w:sectPr>\s*<\/w:body>/);
 const names=['Notas.docx','Material.pdf','Diapositivas.pptx','No permitido.exe'];
 for(const name of names)fs.writeFileSync(path.join(dir,name),name.endsWith('.docx')?repaired:Buffer.from('Test fixture '+name));
 fs.writeFileSync(path.join(dir,'notes.json'),JSON.stringify([{id:'b',name:'Materia',day:1,classes:[{id:'c',title:'Clase',number:1,date:'2026-11-19',html:'<p>Texto previo.</p>',images:[],files:[]}]}]));
 const app=await _electron.launch(process.argv[2]?{executablePath:path.resolve(process.argv[2]),args:['--user-data-dir='+dir]}:{args:[path.resolve('.'),'--user-data-dir='+dir]});
 try{
  await app.evaluate(({shell})=>{globalThis.openedMaterials=[];shell.openPath=async p=>{globalThis.openedMaterials.push(p);return '';};});
  const page=await app.firstWindow();await page.locator('.card').click();await page.locator('.open-class').click();
  const drop=async files=>{
   await page.evaluate(()=>{const i=document.createElement('input');i.type='file';i.multiple=true;i.id='test-drop-input';document.body.append(i);});
   await page.locator('#test-drop-input').setInputFiles(files);
   await page.evaluate(()=>{const input=document.querySelector('#test-drop-input'),dt=new DataTransfer();for(const file of input.files)dt.items.add(file);const paper=document.querySelector('.paper');paper.dispatchEvent(new DragEvent('dragover',{dataTransfer:dt,bubbles:true,cancelable:true}));paper.dispatchEvent(new DragEvent('drop',{dataTransfer:dt,bubbles:true,cancelable:true}));input.remove();});
   await page.waitForFunction(()=>!receivingFiles);await page.evaluate(()=>saveChain);
  };
  await drop(names.slice(0,3).map(n=>path.join(dir,n)));
  assert.equal(await page.locator('.attachment-chip').count(),3);assert.match(await page.locator('.editor').innerText(),/Texto previo[\s\S]*Contenido importado/);
  assert.equal((await app.evaluate(()=>globalThis.openedMaterials)).length,2);
  const style=await page.locator('.docx-import p').evaluate(el=>({bg:getComputedStyle(el).backgroundColor,color:getComputedStyle(el).color,outer:getComputedStyle(el.closest('.docx-import')).backgroundColor}));
  assert.equal(style.bg,'rgba(0, 0, 0, 0)');assert.equal(style.outer,'rgba(0, 0, 0, 0)');assert.notEqual(style.color,'rgb(0, 0, 0)');
  await page.locator('.attachment-chip').filter({hasText:'Material.pdf'}).locator('[data-remove-file]').click();await page.locator('#modal button[value="cancel"]').click();assert.equal(await page.locator('.attachment-chip').count(),3);
  await page.locator('.attachment-chip').filter({hasText:'Material.pdf'}).locator('[data-remove-file]').click();await page.locator('#confirm').click();await page.waitForFunction(()=>document.querySelectorAll('.attachment-chip').length===2);await page.evaluate(()=>saveChain);assert.equal(await page.locator('.attachment-chip').count(),2);assert.ok(fs.existsSync(path.join(dir,'Material.pdf')));
  await page.reload();await page.locator('.card').click();await page.locator('.open-class').click();assert.equal(await page.locator('.attachment-chip').count(),2);
  await drop([path.join(dir,names[3])]);assert.equal(await page.locator('.attachment-chip').count(),2);assert.match(await page.locator('#fields').innerText(),/DOCX, PDF, PPT o PPTX/);await page.locator('#confirm').click();
  await page.screenshot({path:'tmp/materials-preview.png'});
  console.log('PASS: real disk file drop through preload, DOCX inline, PDF/PPT open, dark background/ink, removal/cancel/persistence, unsupported file and valid Word section/margins. '+dir);
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
