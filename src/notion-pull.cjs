const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const plain=parts=>(parts||[]).map(p=>p.plain_text??p.text?.content??p.equation?.expression??'').join('');
const digest=value=>crypto.createHash('sha256').update(JSON.stringify(value,(key,value)=>['url','expiry_time','request_id'].includes(key)?undefined:value)).digest('hex');
function rich(parts){return (parts||[]).map(p=>{let t=esc(p.plain_text??p.text?.content??p.equation?.expression??'').replace(/\n/g,'<br>');const a=p.annotations||{};for(const [flag,tag] of [['bold','b'],['italic','i'],['underline','u'],['strikethrough','s'],['code','code']])if(a[flag])t=`<${tag}>${t}</${tag}>`;const url=p.href||p.text?.link?.url;if(/^https?:\/\//i.test(url||''))t=`<a href="${esc(url)}">${t}</a>`;return t;}).join('');}
async function tree(sync,id,depth=0,budget={count:0}){
 if(depth>15)throw Error('Una clase tiene demasiados niveles de bloques.');
 const blocks=await sync.children(id);
 budget.count+=blocks.length;if(budget.count>10000)throw Error('La página tiene demasiados bloques para importar.');
 for(const b of blocks)if(b.has_children&&b.type!=='child_page'&&b.type!=='child_database')b.children=await tree(sync,b.id,depth+1,budget);
 return blocks;
}
async function download(sync,b,dir){
 const data=b[b.type],url=data?.file?.url||data?.external?.url;
 // Only Notion-hosted media is downloaded automatically; never send the token to file hosts.
 if(data?.type!=='file'||!url)throw Error('Archivo externo: descargalo desde Notion y adjuntalo manualmente.');
 const parsed=new URL(url);if(parsed.protocol!=='https:'||!/(^|\.)(amazonaws\.com|notion\.so|notion-static\.com|notionusercontent\.com)$/.test(parsed.hostname))throw Error('El archivo usa un servidor no reconocido de Notion.');
 const response=await sync.fetch(url,{signal:AbortSignal.timeout(45000),redirect:'error'});if(!response.ok)throw Error('No se pudo descargar un archivo de Notion.');
 const limit=60*1024*1024;if(Number(response.headers.get('content-length'))>limit)throw Error('El archivo supera los 60 MB.');
 const chunks=[];let size=0;for await(const chunk of response.body){size+=chunk.length;if(size>limit)throw Error('El archivo supera los 60 MB.');chunks.push(chunk);}
 const buffer=Buffer.concat(chunks),mime=(response.headers.get('content-type')||'').split(';')[0];
 if(b.type==='image'){
  if(!['image/png','image/jpeg','image/gif','image/webp'].includes(mime))throw Error('La imagen tiene un formato no compatible.');
  return {src:`data:${mime};base64,${buffer.toString('base64')}`};
 }
 const name=data.name||plain(data.caption)||path.posix.basename(parsed.pathname)||'Material';
 const ext=path.extname(name).toLowerCase()||(b.type==='pdf'?'.pdf':'');
 if(!['.pdf','.ppt','.pptx','.docx'].includes(ext))throw Error('El adjunto no es PDF, PowerPoint o Word.');
 const id=crypto.createHash('sha256').update(b.id).update(buffer).digest('hex')+ext;
 await fs.mkdir(path.join(dir,'attachments'),{recursive:true});await fs.writeFile(path.join(dir,'attachments',id),buffer);
 return {id,name};
}
async function convert(sync,blocks,warnings){
 const files=[];let mediaCount=0;
 async function render(items){let html='',list='';const end=()=>{if(list){html+=`</${list}>`;list='';}};
  for(const b of items){const t=b.type,d=b[t]||{},text=rich(d.rich_text);if(b.archived||b.in_trash)continue;
   if(['bulleted_list_item','numbered_list_item'].includes(t)){const type=t==='bulleted_list_item'?'ul':'ol';if(list!==type){end();html+=`<${type}>`;list=type;}html+=`<li>${text}${await render(b.children||[])}</li>`;continue;}end();
   if(['image','file','pdf'].includes(t)){
    try{if(++mediaCount>100)throw Error('Se alcanzó el límite de 100 archivos por clase.');const media=await download(sync,b,sync.dir);if(media.src)html+=`<p><img src="${media.src}" alt="Imagen de Notion" style="max-width:100%;height:auto"></p>`;else files.push(media);}
    catch(e){warnings.push((plain(d.caption)||d.name||'Archivo')+': '+e.message);html+='<p>[Archivo no descargado: '+esc(plain(d.caption)||d.name||t)+']</p>';}
   }else if(t==='table'){html+='<table style="border-collapse:collapse;width:100%"><tbody>';for(const row of b.children||[])html+='<tr>'+(row.table_row?.cells||[]).map(c=>'<td style="border:1px solid #888;padding:6px">'+rich(c)+'</td>').join('')+'</tr>';html+='</tbody></table>';}
   else if(t==='paragraph')html+=`<p>${text||'<br>'}</p>`;
   else if(/^heading_[123]$/.test(t)){const h='h'+t.slice(-1);html+=`<${h}>${text}</${h}>`;}
   else if(t==='callout')html+=`<div class="ai-note">${text}</div>`;
   else if(t==='quote')html+=`<blockquote>${text}</blockquote>`;
   else if(t==='code')html+='<pre><code>'+esc(plain(d.rich_text))+'</code></pre>';
   else if(t==='to_do')html+=`<p>${d.checked?'☑':'☐'} ${text}</p>`;
   else if(t==='divider')html+='<p>────</p>';
   else if(['toggle','column','column_list','synced_block'].includes(t)){if(text)html+=`<p><b>${text}</b></p>`;}
   else if(t==='equation')html+='<p>'+esc(d.expression)+'</p>';
   else if(!['child_page','child_database'].includes(t)){if(text)html+=`<p>${text}</p>`;warnings.push('Bloque '+t+': su formato puede simplificarse.');}
   if(b.children&&t!=='table')html+=await render(b.children);
  }end();return html;
 }
 return {html:'<div class="notion-import">'+await render(blocks)+'</div><p><br></p>',images:[],files};
}
async function pull(sync,writeBooks,lessonHash){
 sync.checkPendingDeletes();
 if(sync.busy||sync.configuring)throw Error('Esperá a que termine la sincronización.');
 if(!sync.state.config.encryptedToken)throw Error('Primero conectá Notion.');
 if(sync.storageError)throw Error(sync.storageError);
 sync.stop();sync.busy=true;sync.pulling=true;
 const original=JSON.stringify(sync.readBooks()),books=JSON.parse(original),scope=JSON.parse(JSON.stringify(sync.scope()));
 let completed=false;
 const report={added:0,updated:0,copies:0,unchanged:0,warnings:[]};
 try{
  const roots=(await sync.children(sync.state.config.parentId)).filter(b=>b.type==='child_page'&&!b.archived&&!b.in_trash);
  for(const remoteBook of roots){
   const classes=(await sync.children(remoteBook.id)).filter(b=>b.type==='child_page'&&!b.archived&&!b.in_trash);
   if(!classes.length)continue;
   let book=books.find(b=>scope.books[b.id]?.id===remoteBook.id||b.notionSource?.pageId===remoteBook.id&&b.notionSource.parentId===sync.state.config.parentId);
   for(const remoteClass of classes){
    const title=remoteClass.child_page.title,match=title.match(/^(\d{4}-\d{2}-\d{2})\s*·\s*Clase\s*(\d+)(?:\s*·\s*(.*))?$/);
    const all=await tree(sync,remoteClass.id),container=all.find(b=>b.type==='toggle'&&plain(b.toggle.rich_text)==='Apuntes sincronizados desde Anotador');
    if(!container&&!match){report.warnings.push('Se omitió una página que no parece una clase de Anotador: '+title);continue;}
    if(!container&&all.some(b=>b.type==='toggle'&&plain(b.toggle.rich_text).startsWith('Actualizando apuntes'))){report.warnings.push(title+': todavía se está sincronizando desde otra PC.');continue;}
    const content=container?container.children||[]:all;
    const fingerprint=digest({title,content});
    if(!book){book={id:crypto.randomUUID(),name:remoteBook.child_page.title,day:match?new Date(match[1]+'T12:00:00').getDay():1,classes:[],notionSource:{parentId:sync.state.config.parentId,pageId:remoteBook.id}};books.push(book);scope.books[book.id]={id:remoteBook.id,title:book.name};}
    const existing=book.classes.find(c=>!c.notionLocalOnly&&(scope.classes[c.id]?.id===remoteClass.id||c.notionSource?.pageId===remoteClass.id&&c.notionSource.parentId===sync.state.config.parentId));
    const record=existing&&scope.classes[existing.id];
    const baseline=record?record.remoteDigest:existing?.notionSource?.digest;
    if(baseline===fingerprint&&!record?.pullIncomplete){report.unchanged++;continue;}
    const lastEdit=Math.max(0,...content.map(b=>Date.parse(b.last_edited_time)||0),Date.parse(container?.last_edited_time)||0);
    if(existing&&record&&record.title===title&&!record.pullIncomplete&&!record.remoteDigest&&container?.id===record.containerId&&lastEdit<=Date.parse(sync.state.lastSuccess||0)){
     record.remoteDigest=fingerprint;report.unchanged++;continue;
    }
    const warnings=[],converted=await convert(sync,content.filter((b,i)=>!(container&&i===0&&b.type==='paragraph'&&/^Clase .* · \d{4}-\d{2}-\d{2}$/.test(plain(b.paragraph.rich_text)))),warnings);
    const item={id:existing?.id||crypto.randomUUID(),title:match?(match[3]||'Clase '+Number(match[2])):title,number:match?Number(match[2]):book.classes.length+1,date:match?.[1]||new Date().toISOString().slice(0,10),...converted,notionSource:{parentId:sync.state.config.parentId,pageId:remoteClass.id,digest:fingerprint}};
    item.notionSource={...item.notionSource,title,containerId:container?.id,baseline:lessonHash(item),incomplete:warnings.length>0};
    if(existing&&lessonHash(existing)===lessonHash(item)){report.unchanged++;}
    else if(existing){
     // Keep the previous local representation whenever replacing it, including free image layout.
     const backup={...JSON.parse(JSON.stringify(existing)),id:crypto.randomUUID(),title:existing.title+' (copia local)',notionLocalOnly:true};delete backup.notionSource;
     book.classes.push(backup);book.classes[book.classes.indexOf(existing)]=item;report.updated++;report.copies++;
    }else {book.classes.push(item);report.added++;}
    scope.classes[item.id]={id:remoteClass.id,title,containerId:container?.id,hash:lessonHash(item),remoteDigest:fingerprint,pulled:true,pullIncomplete:warnings.length>0,warnings};
    report.warnings.push(...warnings.map(w=>title+': '+w));
   }
  }
  if(JSON.stringify(sync.readBooks())!==original)throw Error('Tus notas cambiaron durante la descarga. Volvé a pulsar Traer de Notion; no se reemplazó ningún apunte.');
  await writeBooks(books);
  sync.state.scopes[sync.state.config.parentId]=scope;sync.state.lastPull=new Date().toISOString();sync.state.error='';sync.state.fatal=false;sync.persist();
  completed=true;return {books,report};
 }catch(e){sync.state.error='No se pudo traer de Notion: '+e.message;sync.persist();throw e;}finally{sync.pulling=false;sync.busy=false;if(completed)sync.schedule();}
}
module.exports={pull,rich,tree,convert};
