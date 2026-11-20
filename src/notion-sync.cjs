const fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const {htmlBlocks,rich,block}=require('./notion-content.cjs');
const VERSION='2026-03-11';
const hash=value=>crypto.createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const lessonHash=c=>hash({title:c.title,number:c.number,date:c.date,html:c.html,images:c.images,files:c.files});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function parsePageId(value){const match=String(value||'').split('?')[0].match(/[a-f0-9]{8}-?[a-f0-9]{4}-?[a-f0-9]{4}-?[a-f0-9]{4}-?[a-f0-9]{12}/i);if(!match)throw Error('Pegá el enlace de una página de Notion válida.');const id=match[0].replaceAll('-','');return `${id.slice(0,8)}-${id.slice(8,12)}-${id.slice(12,16)}-${id.slice(16,20)}-${id.slice(20)}`.toLowerCase();}
class NotionSync {
 constructor({dir,readBooks,encrypt,decrypt,fetchImpl=globalThis.fetch,wait=delay,requestGap=350,debounceMs=15000,maxWaitMs=60000}){
  Object.assign(this,{dir,readBooks,encrypt,decrypt,fetch:fetchImpl,wait,requestGap,debounceMs,maxWaitMs});
  this.file=path.join(dir,'notion-sync.json');this.state={config:{automatic:true},scopes:{}};this.busy=false;this.timer=null;this.firstDirty=0;this.nextRequest=0;this.retryAt=0;
  try{this.state=JSON.parse(fs.readFileSync(this.file,'utf8'));}catch(e){if(e.code!=='ENOENT')this.storageError='No se pudo leer la configuración de Notion. Se conservó el archivo para recuperarlo.';}
 }
 persist(){if(this.storageError)throw Error(this.storageError);fs.writeFileSync(this.file+'.tmp',JSON.stringify(this.state));fs.renameSync(this.file+'.tmp',this.file);}
 scope(){const id=this.state.config.parentId;return this.state.scopes[id]||(this.state.scopes[id]={books:{},classes:{},uploads:{}});}
 status(){
  const config=this.state.config;let pending=0,warnings=[];
  if(config.parentId){const scope=this.scope();for(const b of this.readBooks()){if(scope.books[b.id]?.title!==b.name)pending++;for(const c of b.classes){if(c.notionLocalOnly)continue;const r=scope.classes[c.id];if(!r || r.hash!==lessonHash(c)||r.pending)pending++;if(r?.warnings)warnings.push(...r.warnings);}}}
  return {configured:!!config.encryptedToken,parentId:config.parentId||'',destinationUrl:config.parentId?'https://www.notion.so/'+config.parentId.replaceAll('-',''):'',automatic:config.automatic!==false,workspace:config.workspace||'',busy:this.busy,pulling:!!this.pulling,pending,lastPull:this.state.lastPull||null,lastSuccess:this.state.lastSuccess||null,error:this.storageError||this.state.error||'',warnings:[...new Set(warnings)],retryAt:this.retryAt};
 }
 token(){return this.decrypt(Buffer.from(this.state.config.encryptedToken,'base64'));}
 async request(method,route,body,token=this.token()){
  const form=body instanceof FormData;
  for(let attempt=0;attempt<4;attempt++){
   await this.wait(Math.max(0,this.nextRequest-Date.now()));this.nextRequest=Date.now()+this.requestGap;
   let response;
   try{response=await this.fetch('https://api.notion.com/v1'+route,{method,headers:{Authorization:'Bearer '+token,'Notion-Version':VERSION,...(!form&&body?{'Content-Type':'application/json'}:{})},body:body?(form?body:JSON.stringify(body)):undefined,signal:AbortSignal.timeout(45000)});}catch{const error=Error('Sin conexión con Notion. Tus cambios siguen guardados en esta PC.');error.retryable=true;throw error;}
   const data=await response.json().catch(()=>({}));
   if(response.ok)return data;
   const retryable=[429,529].includes(response.status)&&data.additional_data?.rate_limit_reason!=='public_api_request_blocked';
   if(retryable && attempt<3){const seconds=Number(response.headers.get('retry-after'));const waitMs=Math.max(Number.isFinite(seconds)?seconds*1000:0,1000*2**attempt);this.retryAt=Date.now()+waitMs;await this.wait(waitMs);continue;}
   const friendly=response.status===401?'La clave de Notion venció o no es válida. Actualizala en Conectar Notion.':response.status===403?'Notion no permite esta operación. Revisá los permisos de la conexión o los límites del espacio.':response.status===404?'No se encuentra una página de Notion. Revisá el destino, sus permisos y que no esté en la papelera.':data.message||'Notion no pudo completar la operación.';
   const error=Error(String(friendly).replaceAll(token,'[clave oculta]'));error.status=response.status;error.retryable=retryable||response.status>=500;error.data=data;throw error;
  }
 }
 async children(id,token){let result=[],cursor;do{const page=await this.request('GET',`/blocks/${id}/children?page_size=100${cursor?'&start_cursor='+encodeURIComponent(cursor):''}`,undefined,token);result.push(...page.results);cursor=page.has_more?page.next_cursor:null;}while(cursor);return result;}
 async configure({token,parent,automatic=true}){
  if(this.busy||this.configuring)throw Error('Esperá a que termine la sincronización antes de cambiar la conexión.');
  if(this.storageError)throw Error(this.storageError);
  const parentId=parsePageId(parent),key=String(token||'').trim()||(this.state.config.encryptedToken?this.token():'');
  if(!key)throw Error('Ingresá tu token de Notion en este campo.');
  this.configuring=true;
  try {
  const user=await this.request('GET','/users/me',undefined,key);
  const page=await this.request('GET','/pages/'+parentId,undefined,key);
  if(page.in_trash||page.archived)throw Error('La página de destino está en la papelera.');
  const sealed=this.encrypt(key).toString('base64');
  this.state.config={encryptedToken:sealed,parentId,automatic:!!automatic,workspace:user.bot?.workspace_name||user.name||'Notion',maxFileSize:user.bot?.workspace_limits?.max_file_upload_size_in_bytes||5*1024*1024};
  this.state.error='';this.state.fatal=false;this.persist();clearTimeout(this.timer);this.timer=null;
  if(automatic)this.schedule(1000);return this.status();
  }finally{this.configuring=false;}
 }
 setAutomatic(value){this.state.config.automatic=!!value;this.persist();clearTimeout(this.timer);this.timer=null;if(value)this.schedule(1000);return this.status();}
 disconnect(){if(this.busy||this.configuring)throw Error('Esperá a que termine la sincronización.');clearTimeout(this.timer);this.timer=null;delete this.state.config.encryptedToken;this.state.error='';this.persist();return this.status();}
 onSaved(){if(!this.firstDirty)this.firstDirty=Date.now();this.schedule();}
 start(){if(this.state.config.encryptedToken&&this.state.config.automatic!==false)this.schedule(3000);}
 schedule(ms){
  if(this.storageError||!this.state.config.encryptedToken||this.state.config.automatic===false||this.state.fatal)return;
  clearTimeout(this.timer);
  const waitMs=ms??Math.min(this.debounceMs,Math.max(0,this.maxWaitMs-(Date.now()-(this.firstDirty||Date.now()))));
  this.timer=setTimeout(()=>{this.timer=null;this.run().catch(()=>{});},Math.max(waitMs,this.retryAt-Date.now()));this.timer.unref?.();
 }
 async ensurePage(records,key,parent,title){
  let record=records[key];
  if(!record){record=records[key]={creationTitle:'Anotador · '+crypto.randomUUID()};this.persist();}
  if(!record.id){
   const children=await this.children(parent);
   const existing=children.find(c=>c.type==='child_page'&&c.child_page.title===record.creationTitle);
   if(existing)record.id=existing.id;
   else {
    try{const created=await this.request('POST','/pages',{parent:{type:'page_id',page_id:parent},properties:{title:{type:'title',title:rich(record.creationTitle)}},notifications:{mode:'silent'}});record.id=created.id;}
    catch(e){if(e.data?.additional_data?.committed_resource_id)record.id=e.data.additional_data.committed_resource_id;else throw e;}
   }
   this.persist();
  }
  if(record.title!==title){await this.request('PATCH','/pages/'+record.id,{properties:{title:{type:'title',title:rich(String(title).slice(0,1900))}},notifications:{mode:'silent'}});record.title=title;this.persist();}
  return record;
 }
 async archive(id){try{await this.request('DELETE','/blocks/'+id);}catch(e){if(e.status!==404)throw e;}}
 async getPending(record,digest){
  if(record.pending && record.pending.hash!==digest){
   const abandoned=record.pending.id||(await this.children(record.id)).find(b=>b.type==='toggle'&&b.toggle.rich_text.map(r=>r.plain_text??r.text?.content??'').join('')===record.pending.title)?.id;
   if(abandoned)await this.archive(abandoned);delete record.pending;this.persist();
  }
  if(!record.pending){record.pending={hash:digest,title:'Actualizando apuntes · '+crypto.randomUUID()};this.persist();}
  const pending=record.pending;
  if(!pending.id){
   const children=await this.children(record.id);
   pending.id=children.find(b=>b.type==='toggle'&&b.toggle.rich_text.map(r=>r.plain_text??r.text?.content??'').join('')===pending.title)?.id;
   if(!pending.id){const created=await this.request('PATCH',`/blocks/${record.id}/children`,{children:[block('toggle',pending.title)]});pending.id=created.results[0].id;}
   this.persist();
  }
  return pending;
 }
 async upload({buffer,filePath,name,mime},scope){
  const size=buffer?buffer.length:(await fsp.stat(filePath)).size;
  if(size>this.state.config.maxFileSize){const e=Error(`${name}: supera el límite de archivos de tu espacio de Notion.`);e.fileWarning=true;throw e;}
  const sha=crypto.createHash('sha256');if(buffer)sha.update(buffer);else for await(const chunk of fs.createReadStream(filePath))sha.update(chunk);
  const key=sha.digest('hex')+':'+mime;
  const existing=scope.uploads[key];if(existing&&(existing.attached||Date.now()-existing.createdAt<45*60000))return {id:existing.id,key};
  const partSize=10*1024*1024,multi=size>20*1024*1024;
  const created=await this.request('POST','/file_uploads',{mode:multi?'multi_part':'single_part',filename:name.slice(0,180),content_type:mime,...(multi?{number_of_parts:Math.ceil(size/partSize)}:{})});
  const handle=filePath?await fsp.open(filePath,'r'):null;
  try{
   const total=multi?Math.ceil(size/partSize):1;
   for(let i=0;i<total;i++){
    const start=multi?i*partSize:0,length=multi?Math.min(partSize,size-start):size;
    let data=buffer?.subarray(start,start+length);
    if(!data){data=Buffer.alloc(length);let read=0;while(read<length){const result=await handle.read(data,read,length-read,start+read);if(!result.bytesRead)throw Error('El archivo cambió durante la lectura.');read+=result.bytesRead;}}
    const form=new FormData();form.append('file',new Blob([data],{type:mime}),name.slice(0,180));if(multi)form.append('part_number',String(i+1));
    await this.request('POST',`/file_uploads/${created.id}/send`,form);
   }
   if(multi)await this.request('POST',`/file_uploads/${created.id}/complete`,{});
  }finally{await handle?.close();}
  scope.uploads[key]={id:created.id,createdAt:Date.now(),attached:false};this.persist();return {id:created.id,key};
 }
 async content(item,scope){
  const blocks=[block('paragraph',`Clase ${item.number||''} · ${item.date||''}`),...htmlBlocks(item.html)];const warnings=[],uploads=[];
  if(blocks.length===1)blocks.push(block('paragraph','Esta clase todavía no tiene apuntes.'));
  const media=[];
  const imported=[...require('linkedom').parseHTML('<html><body>'+String(item.html||'')+'</body></html>').document.querySelectorAll('.docx-import img,.notion-import img')].map((im,i)=>({id:'word-'+i,src:im.getAttribute('src'),x:0,y:i}));
  for(const im of [...(item.images||[]),...imported].sort((a,b)=>a.y-b.y||a.x-b.x)){
   const match=String(im.src).match(/^data:(image\/(?:png|jpeg|jpg|webp|gif));base64,([a-zA-Z0-9+/=\r\n]+)$/);
   if(!match){warnings.push('Una captura tiene un formato que no se pudo subir.');continue;}
   media.push({buffer:Buffer.from(match[2],'base64'),name:'Captura-'+im.id+'.'+match[1].split('/')[1],mime:match[1],type:'image'});
  }
  const mime={'.docx':'application/vnd.openxmlformats-officedocument.wordprocessingml.document','.pdf':'application/pdf','.ppt':'application/vnd.ms-powerpoint','.pptx':'application/vnd.openxmlformats-officedocument.presentationml.presentation'};
  for(const f of item.files||[]){if(typeof f.id!=='string'||path.basename(f.id)!==f.id){warnings.push('Un adjunto tiene un identificador inválido.');continue;}media.push({filePath:path.join(this.dir,'attachments',f.id),name:f.name,mime:mime[path.extname(f.id).toLowerCase()]||'application/octet-stream',type:path.extname(f.id).toLowerCase()==='.pdf'?'pdf':'file'});}
  if(media.length)blocks.push(block('heading_2','Capturas y material de clase'));
  for(const file of media){
   try{const uploaded=await this.upload(file,scope);uploads.push(uploaded.key);blocks.push({object:'block',type:file.type,[file.type]:{type:'file_upload',file_upload:{id:uploaded.id},caption:rich(file.name.slice(0,1000))}});}
   catch(e){if(e.fileWarning||e.code==='ENOENT'){const warning=e.fileWarning?e.message:file.name+': no se encontró el archivo en esta PC.';warnings.push(warning);blocks.push(block('paragraph',warning));}else throw e;}
  }
  return {blocks,warnings,uploads};
 }
 async syncClass(record,item,scope){
  const digest=lessonHash(item),pending=await this.getPending(record,digest);
  if(!pending.complete){
   const {blocks,warnings,uploads}=await this.content(item,scope);
   const existing=await this.children(pending.id);let offset=existing.length;
   if(offset>blocks.length)throw Error('La copia temporal de Notion cambió. Reintentá después de revisar esa página.');
   while(offset<blocks.length){
    let batch=[],bytes=0;while(offset+batch.length<blocks.length&&batch.length<80){const next=blocks[offset+batch.length],size=Buffer.byteLength(JSON.stringify(next));if(batch.length&&bytes+size>350000)break;batch.push(next);bytes+=size;}
    await this.request('PATCH',`/blocks/${pending.id}/children`,{children:batch});offset+=batch.length;
   }
   for(const key of uploads)scope.uploads[key].attached=true;
   pending.complete=true;pending.warnings=warnings;this.persist();
  }
  await this.request('PATCH','/blocks/'+pending.id,{toggle:{rich_text:rich('Apuntes sincronizados desde Anotador')}});
  if(record.containerId && record.containerId!==pending.id)await this.archive(record.containerId);
  record.remoteDigest=null;record.pulled=false;record.containerId=pending.id;record.hash=digest;record.warnings=pending.warnings||[];delete record.pending;this.persist();
 }
 async run({force=false}={}){
  if(this.busy||this.configuring)return this.status();
  if(!this.state.config.encryptedToken)throw Error('Primero conectá Notion.');
  clearTimeout(this.timer);this.timer=null;this.busy=true;this.firstDirty=0;this.retryAt=0;this.state.error='';this.state.fatal=false;
  try{
   this.checkPendingDeletes();await require('./notion-dictionary.cjs').syncDictionary(this);
   this.restoreImportedMappings();const books=JSON.parse(JSON.stringify(this.readBooks())),scope=this.scope();
   for(const b of books){
    const notebook=await this.ensurePage(scope.books,b.id,this.state.config.parentId,b.name);
    if(force){const page=await this.request('GET','/pages/'+notebook.id);if(page.archived||page.in_trash)throw Error('Un cuaderno está en la papelera de Notion. Restauralo para sincronizar.');}
    for(const item of [...b.classes].filter(c=>!c.notionLocalOnly).sort((a,b)=>String(a.date).localeCompare(String(b.date))||(a.number||0)-(b.number||0))){
     const title=`${item.date||''} · Clase ${item.number||''}${item.title && item.title!=='Clase '+item.number?' · '+item.title:''}`;
     const record=await this.ensurePage(scope.classes,item.id,notebook.id,title);
     if(record.pullIncomplete){continue;}
     if(force){const page=await this.request('GET','/pages/'+record.id);if(page.archived||page.in_trash)throw Error('Una clase está en la papelera de Notion. Restaurala para sincronizar.');}
     if(record.hash!==lessonHash(item)||record.pending||(force&&!record.pulled))await this.syncClass(record,item,scope);
    }
   }
   this.state.lastSuccess=new Date().toISOString();this.state.failures=0;this.state.error='';this.persist();
  }catch(e){
   this.state.error=e.message;this.state.failures=(this.state.failures||0)+1;this.state.fatal=!e.retryable;this.persist();
   if(e.retryable){const ms=Math.min(300000,30000*2**Math.min(4,this.state.failures-1));this.retryAt=Date.now()+ms;this.schedule(ms);}
  }finally{this.busy=false;}
  const status=this.status();if(!status.error)this.schedule(status.pending?1000:60000);return status;
 }
 checkPendingDeletes(){if(Object.keys(this.state.deletions||{}).length)throw Error('Hay un borrado sin completar. Volvé a borrar ese elemento para reintentarlo o elegí Solo en esta PC.');}
 async deleteItem(data,writeBooks){return require('./notion-delete.cjs').deleteItem(this,data,writeBooks);}
 restoreImportedMappings(){
  if(!this.state.config.parentId)return;
  const scope=this.scope(),parent=this.state.config.parentId;
  for(const b of this.readBooks()){
   if(b.notionSource?.parentId===parent&&!scope.books[b.id])scope.books[b.id]={id:b.notionSource.pageId,title:b.name};
   for(const c of b.classes)if(!c.notionLocalOnly&&c.notionSource?.parentId===parent&&!scope.classes[c.id])scope.classes[c.id]={id:c.notionSource.pageId,title:c.notionSource.title,containerId:c.notionSource.containerId,hash:c.notionSource.baseline,remoteDigest:c.notionSource.digest,pulled:true,pullIncomplete:!!c.notionSource.incomplete};
  }
 }
 async pull(writeBooks){this.restoreImportedMappings();return require('./notion-pull.cjs').pull(this,writeBooks,lessonHash);}
 stop(){clearTimeout(this.timer);this.timer=null;}
}
module.exports={NotionSync,parsePageId,lessonHash};
