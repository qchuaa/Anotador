const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {NotionSync,parsePageId}=require('../src/notion-sync.cjs');
const {htmlBlocks}=require('../src/notion-content.cjs');
const parent=crypto.randomUUID();
class FakeNotion {
 constructor(){this.pages=new Map([[parent,{id:parent,properties:{},archived:false}]]);this.blocks=new Map();this.lists=new Map([[parent,[]]]);this.uploads=new Map();this.requests=[];this.fail=null;this.offline=false;this.rateLimit=false;}
 json(data,status=200,headers={}){return new Response(JSON.stringify(data),{status,headers});}
 async fetch(url,options){
  if(this.offline)throw Error('Network unavailable');
  if(this.unauthorized)return this.json({message:'unauthorized'},401);
  const u=new URL(url),route=u.pathname.replace('/v1',''),method=options.method,body=typeof options.body==='string'?JSON.parse(options.body):options.body;
  this.requests.push({route,method,body});
  if(this.rateLimit){this.rateLimit=false;return this.json({message:'rate limit'},429,{'retry-after':'2'});}
  let result;
  if(route==='/users/me')result={bot:{workspace_name:'Prueba',workspace_limits:{max_file_upload_size_in_bytes:50*1024*1024}}};
  else if(route==='/pages'&&method==='POST'){
   const id=crypto.randomUUID(),p={id,properties:body.properties,archived:false};this.pages.set(id,p);this.lists.set(id,[]);
   this.lists.get(body.parent.page_id).push({id,type:'child_page',child_page:{title:body.properties.title.title.map(r=>r.text.content).join('')}});result=p;
  }else if(/^\/pages\/[^/]+$/.test(route)){
   const id=route.split('/')[2],p=this.pages.get(id);if(!p)return this.json({message:'not found'},404);
   if(method==='PATCH'){p.properties=body.properties;for(const list of this.lists.values()){const child=list.find(b=>b.id===id);if(child)child.child_page.title=body.properties.title.title.map(r=>r.text.content).join('');}}
   result=p;
  }else if(/^\/blocks\/[^/]+\/children$/.test(route)){
   const id=route.split('/')[2],list=this.lists.get(id);if(!list)return this.json({},404);
   if(method==='GET'){const start=Number(u.searchParams.get('start_cursor')||0),size=100;result={results:list.slice(start,start+size),has_more:list.length>start+size,next_cursor:list.length>start+size?String(start+size):null};}
   else {assert.ok(body.children.length<=100);assert.ok(Buffer.byteLength(JSON.stringify(body))<500000);const created=body.children.map(b=>{const id=crypto.randomUUID(),value={...b,id};this.blocks.set(id,value);this.lists.set(id,[]);return value;});list.push(...created);result={results:created};}
  }else if(/^\/blocks\/[^/]+$/.test(route)){
   const id=route.split('/')[2],b=this.blocks.get(id);if(!b)return this.json({},404);
   if(method==='DELETE'){this.blocks.delete(id);for(const list of this.lists.values()){const i=list.findIndex(b=>b.id===id);if(i>=0)list.splice(i,1);}result={id,archived:true};}
   else{Object.assign(b,body);result=b;}
  }else if(route==='/file_uploads'){
   const id=crypto.randomUUID();result={id,status:'pending'};this.uploads.set(id,{...body,parts:[]});
  }else if(/^\/file_uploads\/[^/]+\/send$/.test(route)){
   const id=route.split('/')[2];assert.ok(body instanceof FormData);const file=body.get('file');assert.ok(file.size>0);this.uploads.get(id).parts.push({size:file.size,number:body.get('part_number')});result={id,status:'uploaded'};
  }else if(route.endsWith('/complete'))result={id:route.split('/')[2],status:'uploaded'};
  else throw Error('Unhandled mock route '+method+' '+route);
  this.onRequest?.({method,route,body,result});
  if(this.fail?.({method,route,body,result})){this.fail=null;throw Error('Response lost after commit');}
  return this.json(result);
 }
}
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'anotador-notion-test-'));fs.mkdirSync(path.join(dir,'attachments'));
 const encryptionKey=crypto.randomBytes(32);
 const encrypt=text=>{const iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',encryptionKey,iv);return Buffer.concat([iv,c.update(text),c.final(),c.getAuthTag()]);};
 const decrypt=buf=>{const c=crypto.createDecipheriv('aes-256-gcm',encryptionKey,buf.subarray(0,12));c.setAuthTag(buf.subarray(-16));return Buffer.concat([c.update(buf.subarray(12,-16)),c.final()]).toString();};
 const remote=new FakeNotion(),waits=[];
 let books=[{id:'book-a',name:'Materia A',classes:[{id:'lesson-a',title:'Clase 1',number:1,date:'2026-11-17',html:'<h2>Tema</h2><p>Texto <b>importante</b></p><div class="ai-note">Explicación</div>',images:[{id:'i',src:'data:image/png;base64,'+Buffer.from('image').toString('base64'),x:0,y:0}],files:[]}]}];
 const make=()=>new NotionSync({dir,readBooks:()=>books,encrypt,decrypt,fetchImpl:remote.fetch.bind(remote),requestGap:0,wait:async ms=>{waits.push(ms);}});
 let sync=make();
 assert.equal(parsePageId('https://www.notion.so/Page-'+parent.replaceAll('-','')+'?v=anything'),parent);
 const converted=htmlBlocks('<p><b>Hola</b> <i>mundo</i></p><ul><li>Uno</li><li>Dos</li></ul><div class="ai-note">IA</div><script>secret</script><p>'+ 'x'.repeat(90000)+'</p>');
 assert.ok(converted.some(b=>b.type==='callout'));assert.ok(!JSON.stringify(converted).includes('secret'));
 for(const b of converted)for(const r of b[b.type].rich_text)assert.ok(r.text.content.length<=2000);
 await sync.configure({token:'test-private-token',parent,automatic:false});
 assert.ok(!fs.readFileSync(sync.file,'utf8').includes('test-private-token'));
 let state=await sync.run();assert.equal(state.error,'');assert.equal(state.pending,0);assert.equal(remote.pages.size,3);
 const firstId=sync.scope().classes['lesson-a'].id,oldContainer=sync.scope().classes['lesson-a'].containerId,uploads=remote.uploads.size;
 await sync.run();assert.equal(remote.pages.size,3);assert.equal(remote.uploads.size,uploads);
 // Keep user-authored content outside the managed block.
 remote.lists.get(firstId).push({id:'personal-note',type:'paragraph',paragraph:{rich_text:[{text:{content:'Personal'}}]}});
 books[0].classes[0].html=Array.from({length:160},(_,i)=>'<p>Apunte '+i+'</p>').join('');
 remote.fail=({route,body})=>route.endsWith('/children')&&body?.children?.length===80;
 state=await sync.run();assert.ok(state.error);assert.equal(sync.scope().classes['lesson-a'].containerId,oldContainer);assert.ok(remote.blocks.has(oldContainer));
 sync.stop();sync=make();state=await sync.run();assert.equal(state.error,'');assert.equal(remote.pages.size,3);assert.ok(!remote.blocks.has(oldContainer));assert.ok(remote.lists.get(firstId).some(b=>b.id==='personal-note'));
 assert.equal(remote.lists.get(sync.scope().classes['lesson-a'].containerId).length,163); // date + 160 paragraphs + heading + image
 assert.equal(remote.uploads.size,uploads);
 // Lost page creation response: discover the already-created child, never create twice.
 books.push({id:'book-b',name:'Materia B',classes:[]});remote.fail=({method,route})=>method==='POST'&&route==='/pages';
 state=await sync.run();assert.ok(state.error);const count=remote.pages.size;
 sync.stop();sync=make();state=await sync.run();assert.equal(state.error,'');assert.equal(remote.pages.size,count);
 // Offline edits survive restart, using the newest local version.
 remote.offline=true;books[0].classes[0].html='<p>Versión sin conexión</p>';state=await sync.run();assert.ok(state.error);assert.ok(state.pending);
 books[0].classes[0].html='<p>Versión más reciente</p>';remote.offline=false;sync.stop();sync=make();state=await sync.run();assert.equal(state.pending,0);assert.equal(state.error,'');
 // A newer local edit during an in-flight request stays pending, then replaces the older snapshot.
 books[0].classes[0].html='<p>Versión al iniciar envío</p>';
 remote.onRequest=({method,route,body})=>{if(method==='PATCH'&&route.endsWith('/children')&&body.children?.some(b=>b.type==='paragraph')){books[0].classes[0].html='<p>Edición mientras se enviaba</p>';remote.onRequest=null;}};
 state=await sync.run();assert.equal(state.pending,1);state=await sync.run();assert.equal(state.pending,0);
 // Rate-limit Retry-After is honored.
 remote.rateLimit=true;await sync.run({force:true});assert.ok(waits.includes(2000));
 // Multipart attachment upload and warning for missing file.
 fs.writeFileSync(path.join(dir,'attachments','large.pdf'),Buffer.alloc(21*1024*1024,1));
 books[0].classes[0].files=[{id:'large.pdf',name:'Material grande.pdf'},{id:'missing.pdf',name:'Faltante.pdf'}];
 state=await sync.run();assert.equal(state.error,'');assert.equal(state.warnings.length,1);assert.ok([...remote.uploads.values()].some(u=>u.mode==='multi_part'&&u.parts.length===3));
 // Invalid credentials never erase the previous successful local configuration.
 const previous=sync.state.config.encryptedToken;remote.unauthorized=true;
 await assert.rejects(()=>sync.configure({token:'wrong',parent,automatic:false}));assert.equal(sync.state.config.encryptedToken,previous);
 books[0].classes[0].html='<p>Pendiente de autorización</p>';state=await sync.run();assert.ok(state.error.includes('clave'));assert.ok(state.pending);assert.equal(sync.state.fatal,true);
 remote.unauthorized=false;await sync.configure({token:'test-private-token',parent,automatic:false});await sync.run();
 // Debounced automatic save, including a newer edit while a previous send runs.
 sync.debounceMs=20;sync.maxWaitMs=80;sync.setAutomatic(true);
 books[0].classes[0].html='<p>Envío automático</p>';sync.onSaved();
 const deadline=Date.now()+4000;while((sync.status().pending||sync.busy)&&Date.now()<deadline)await new Promise(r=>setTimeout(r,20));
 assert.equal(sync.status().pending,0);assert.ok(sync.state.lastSuccess);sync.setAutomatic(false);
 // Local deletion keeps Notion backup; manual sync checks remote pages.
 books=[];state=await sync.run();assert.equal(state.pending,0);assert.equal(remote.pages.size,count);
 sync.stop();console.log('PASS: encrypted config, conversion/limits, no duplicate pages, staged recovery, preserved personal notes, offline/restart/latest edit, upload cache/multipart, warnings, Retry-After and retained backups.');
})().catch(e=>{console.error(e);process.exit(1)});
