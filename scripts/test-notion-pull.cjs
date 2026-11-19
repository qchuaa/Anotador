const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {NotionSync,lessonHash}=require('../src/notion-sync.cjs');
const rt=t=>[{type:'text',text:{content:t},plain_text:t}];
const paragraph=t=>({id:'text',type:'paragraph',last_edited_time:'2026-11-19T10:00:00Z',paragraph:{rich_text:rt(t)}});
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'notion-pull-'));let notes=[],failure=false,mediaFail=false,mutate=false;
 const graph={root:[{id:'book-page',type:'child_page',child_page:{title:'Física'}}],'book-page':[{id:'class-page',type:'child_page',child_page:{title:'2026-11-19 · Clase 1 · Energía'}}],'class-page':[{id:'managed',type:'toggle',has_children:true,toggle:{rich_text:rt('Apuntes sincronizados desde Anotador')}}],managed:[paragraph('Apuntes desde otra PC'),{id:'image',type:'image',image:{type:'file',file:{url:'https://secure.notion-static.com/image.png?first'},caption:rt('Imagen')}},{id:'file',type:'file',file:{type:'file',file:{url:'https://secure.notion-static.com/material.pdf'},caption:rt('Material.pdf')}}]};
 const sync=new NotionSync({dir,readBooks:()=>notes,encrypt:s=>Buffer.from(s),decrypt:b=>b.toString(),fetchImpl:async()=>{if(mediaFail)throw Error('offline media');return new Response(Buffer.from('test-media'),{headers:{'content-type':'image/png'}});}});
 sync.state.config={parentId:'root',encryptedToken:Buffer.from('test').toString('base64'),automatic:false};
 sync.children=async id=>{if(failure&&id==='managed')throw Error('offline');if(mutate&&id==='managed'){notes[0].classes[0].html+='live edit';mutate=false;}return JSON.parse(JSON.stringify(graph[id]||[]));};
 const save=async data=>{notes=data;fs.writeFileSync(path.join(dir,'notes.json'),JSON.stringify(notes));};
 let r=await sync.pull(save);assert.equal(r.report.added,1);assert.equal(notes.length,1);assert.match(notes[0].classes[0].html,/Apuntes desde otra PC/);assert.match(notes[0].classes[0].html,/data:image\/png;base64/);assert.ok(fs.existsSync(path.join(dir,'attachments',notes[0].classes[0].files[0].id)));assert.equal(sync.status().pending,0);
 graph.managed[1].image.file.url='https://secure.notion-static.com/image.png?renewed';r=await sync.pull(save);assert.equal(r.report.unchanged,1);assert.equal(notes[0].classes.length,1);
 const id=notes[0].classes[0].id;notes[0].classes[0].html+='<p>Cambio local</p>';graph.managed[0]=paragraph('Nueva versión remota');r=await sync.pull(save);assert.equal(r.report.copies,1);assert.equal(notes[0].classes[0].id,id);assert.ok(notes[0].classes.some(c=>c.notionLocalOnly&&c.html.includes('Cambio local')));assert.equal(sync.status().pending,0);
 await sync.pull(save);assert.equal(notes[0].classes.length,2);
 const before=JSON.stringify(notes);failure=true;await assert.rejects(sync.pull(save),/offline/);assert.equal(JSON.stringify(notes),before);assert.equal(sync.busy,false);failure=false;
 graph.managed[0]=paragraph('Tercera versión');mutate=true;await assert.rejects(sync.pull(save),/cambiaron/);assert.ok(notes[0].classes[0].html.endsWith('live edit'));assert.equal(notes[0].classes.length,2);
 mediaFail=true;r=await sync.pull(save);assert.ok(r.report.warnings.length);assert.ok(sync.scope().classes[id].pullIncomplete);mediaFail=false;r=await sync.pull(save);assert.equal(sync.scope().classes[id].pullIncomplete,false);assert.match(notes[0].classes[0].html,/data:image/);
 // Losing state after the atomic notes write must not create duplicate remote pages on restart.
 sync.state.scopes={};sync.restoreImportedMappings();assert.equal(sync.scope().classes[id].id,'class-page');assert.equal(sync.scope().classes[id].hash,lessonHash(notes[0].classes[0]));
 let pushes=0;sync.ensurePage=async(records,key,parent,title)=>{assert.ok(!notes[0].classes.find(c=>c.id===key)?.notionLocalOnly);return records[key];};sync.request=async()=>({});sync.syncClass=async()=>{pushes++;};await sync.run({force:true});assert.equal(pushes,0);
 notes[0].classes[0].html+='<p>Continuar clase</p>';await sync.run();assert.equal(pushes,1);
 sync.stop();console.log('PASS: pull classes/media, stable IDs, expired URL deduplication, local backup, offline atomicity, concurrent edit protection, media retry, state recovery and no re-upload of unchanged imports/backups.');
})().catch(e=>{console.error(e);process.exitCode=1;});
