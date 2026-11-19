const {_electron}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const JSZip=require('jszip'),{convertDocx}=require('../src/docx-import.cjs');
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'anotador-word-')),file=path.join(dir,'Notas.docx');
 const zip=new JSZip();
 zip.file('[Content_Types].xml','<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>');
 zip.file('word/styles.xml',`<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri"/><w:sz w:val="24"/></w:rPr></w:rPrDefault></w:docDefaults><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:pPr><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:color w:val="185ABD"/><w:sz w:val="40"/></w:rPr></w:style></w:styles>`);
 zip.file('word/numbering.xml',`<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:start w:val="3"/><w:numFmt w:val="decimal"/></w:lvl><w:lvl w:ilvl="1"><w:numFmt w:val="bullet"/></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>`);
 zip.file('word/_rels/document.xml.rels','<Relationships><Relationship Id="image1" Target="media/picture.png"/><Relationship Id="danger" Target="javascript:alert(1)" TargetMode="External"/></Relationships>');
 zip.file('word/media/picture.png',fs.readFileSync('src/assets/anotador.png'));
 zip.file('word/document.xml',`<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="relationships" xmlns:a="drawing" xmlns:wp="worddrawing"><w:body>
 <w:p><w:pPr><w:pStyle w:val="Heading1"/><w:jc w:val="center"/></w:pPr><w:r><w:t>Notas de física</w:t></w:r></w:p>
 <w:p><w:r><w:rPr><w:b/><w:i/><w:u w:val="single"/><w:highlight w:val="yellow"/></w:rPr><w:t>Concepto destacado</w:t></w:r><w:r><w:t xml:space="preserve"> y texto normal.</w:t></w:r></w:p>
 <w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>Primer punto</w:t></w:r></w:p>
 <w:p><w:pPr><w:numPr><w:ilvl w:val="1"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>Detalle anidado</w:t></w:r></w:p>
 <w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>Segundo punto</w:t></w:r></w:p>
 <w:tbl><w:tr><w:tc><w:tcPr><w:gridSpan w:val="2"/><w:shd w:fill="EEEEEE"/></w:tcPr><w:p><w:r><w:t>Tabla combinada</w:t></w:r></w:p></w:tc></w:tr><w:tr><w:tc><w:p><w:r><w:t>Celda A</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Celda B</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
 <w:p><w:r><w:drawing><wp:inline><wp:extent cx="1905000" cy="1905000"/><a:blip r:embed="image1"/></wp:inline></w:drawing></w:r></w:p>
 <w:p><w:hyperlink r:id="danger"><w:r><w:t>Enlace seguro</w:t></w:r></w:hyperlink><w:r><w:t>&lt;script&gt;texto&lt;/script&gt;</w:t></w:r></w:p>
 </w:body></w:document>`);
 const buffer=await zip.generateAsync({type:'nodebuffer'});fs.writeFileSync(file,buffer);
 const result=await convertDocx(buffer);
 assert.match(result.html,/<h1/);assert.match(result.html,/text-align:center/);assert.match(result.html,/font-weight:700/);assert.match(result.html,/background-color:#ffff00/);assert.match(result.html,/<ol start="3"/);assert.match(result.html,/<ul/);assert.match(result.html,/colspan="2"/);assert.match(result.html,/data:image\/png;base64/);assert.ok(!result.html.includes('javascript:'));assert.ok(!result.html.includes('<script>'));
 await assert.rejects(convertDocx(Buffer.from('not a zip')),/Word/);
 fs.writeFileSync(path.join(dir,'notes.json'),JSON.stringify([{id:'b',name:'Materia',day:1,classes:[{id:'c',title:'Clase 1',number:1,date:'2026-11-19',html:'<p>Mis apuntes originales.</p>',images:[],files:[]}]}]));
 const app=await _electron.launch(process.argv[2]?{executablePath:path.resolve(process.argv[2]),args:['--user-data-dir='+dir]}:{args:[path.resolve('.'),'--user-data-dir='+dir]});
 try{
  await app.evaluate(({dialog},data)=>{globalThis.cancelImport=false;dialog.showOpenDialog=async()=>globalThis.cancelImport?{canceled:true,filePaths:[]}:{canceled:false,filePaths:[data.file]};dialog.showSaveDialog=async(_w,opts)=>({canceled:false,filePath:data.dir+'/export.'+opts.filters[0].extensions[0]});},{file,dir});
  const page=await app.firstWindow(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.locator('.card').click();await page.locator('.open-class').click();
  await page.locator('#import-word').click();await page.locator('.docx-import h1').waitFor();
  assert.match(await page.locator('.editor').innerText(),/^Mis apuntes originales/);assert.equal(await page.locator('.docx-import ol>li').count(),2);assert.equal(await page.locator('.docx-import table td').count(),3);assert.ok(await page.locator('.docx-import img').evaluate(img=>img.complete&&img.naturalWidth>0));
  await page.locator('.docx-import td').last().fill('Celda editada');await page.keyboard.press('End');await page.keyboard.type(' ahora');
  await page.locator('.editor > p').last().click();await page.keyboard.type('Sigo tomando notas.');
  await page.locator('.docx-import').screenshot({path:'tmp/import-word-preview.png'});
  await page.evaluate(()=>saveChain);
  await page.reload();await page.locator('.card').click();await page.locator('.open-class').click();
  assert.match(await page.locator('.editor').innerText(),/Celda editada ahora/);assert.match(await page.locator('.editor').innerText(),/Sigo tomando notas/);assert.equal(await page.locator('.docx-import h1').count(),1);
  const saved=JSON.parse(fs.readFileSync(path.join(dir,'notes.json')))[0].classes[0];assert.ok(fs.readFileSync(path.join(dir,'attachments',saved.files[0].id)).equals(buffer));
  await app.evaluate(()=>{globalThis.cancelImport=true;});await page.locator('#import-word').click();await page.waitForFunction(()=>!document.querySelector('#import-word').disabled);assert.equal(await page.locator('.docx-import').count(),1);
  for(const [suffix,extension] of [['','pdf'],['-docx','docx']]){await page.locator('#download-lesson').click();await page.locator('#export-lesson'+suffix).click();await page.waitForFunction(()=>!document.querySelector('#download-lesson').disabled);assert.ok(fs.statSync(path.join(dir,'export.'+extension)).size>1000);}
  const exported=await JSZip.loadAsync(fs.readFileSync(path.join(dir,'export.docx'))),exportXML=await exported.file('word/document.xml').async('string');assert.ok(exportXML.includes('Celda editada ahora'));assert.ok(exportXML.includes('<w:tbl'));assert.ok(Object.keys(exported.files).some(p=>p.startsWith('word/media/')&&!exported.files[p].dir));
  assert.deepEqual(errors,[]);console.log('PASS: DOCX formatting, nested lists, table, image, safe links, invalid file, import preserves notes, editing/reopen, original backup, cancel and PDF/DOCX re-export. '+dir);
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
