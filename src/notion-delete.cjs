async function deleteItem(sync,{bookId,classId,location},writeBooks){
 if(!['local','both'].includes(location))throw Error('Elegí dónde borrar.');
 if(sync.busy||sync.configuring)throw Error('Esperá a que termine la sincronización con Notion.');
 if(sync.storageError)throw Error(sync.storageError);
 const book=sync.readBooks().find(b=>b.id===bookId);
 if(!book)throw Error('El cuaderno ya no existe.');
 const item=classId?book.classes.find(c=>c.id===classId):book;
 if(!item)throw Error('La clase ya no existe.');
 sync.stop();sync.busy=true;let completed=false;
 try{
  sync.restoreImportedMappings();
  const parentId=sync.state.config.parentId;
  const record=classId?sync.scope().classes[classId]:sync.scope().books[bookId];
  const pageId=(classId&&item.notionLocalOnly)?null:record?.id;
  const key=bookId+':'+(classId||'');
  sync.state.deletions??={};
  const existing=sync.state.deletions[key];
  if(location==='both'){
   if(!sync.state.config.encryptedToken)throw Error('Conectá Notion para borrar también allí.');
   if(!pageId&&!existing)throw Error('Este elemento no tiene una página vinculada en el destino actual de Notion. Usá Solo en esta PC.');
   if(existing&&existing.parentId!==parentId)throw Error('El borrado pendiente corresponde a otro destino de Notion. Reconectá ese destino para reintentarlo.');
   // Persist before the request: an uncertain response must never resurrect the page.
   sync.state.deletions[key]=existing||{pageId,parentId};sync.persist();
   const target=sync.state.deletions[key].pageId;
   let page=await sync.request('GET','/pages/'+target);
   if(!page.in_trash&&!page.archived)await sync.request('PATCH','/pages/'+target,{in_trash:true});
  }
  const latest=sync.readBooks();
  const current=latest.find(b=>b.id===bookId);
  if(classId){if(current)current.classes=current.classes.filter(c=>c.id!==classId);}
  await writeBooks(classId?latest:latest.filter(b=>b.id!==bookId));
  delete sync.state.deletions[key];
  if(!classId){for(const pending of Object.keys(sync.state.deletions))if(pending.startsWith(bookId+':'))delete sync.state.deletions[pending];}
  sync.state.error='';sync.persist();completed=true;
  return {books:sync.readBooks()};
 }catch(e){sync.state.error='No se completó el borrado: '+e.message;sync.persist();throw e;}
 finally{sync.busy=false;if(completed)sync.schedule();}
}
module.exports={deleteItem};
