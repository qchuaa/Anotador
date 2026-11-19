let notionState=null,notionPollBusy=false,notionPullBusy=false;
function showNotionState(state){
 notionState=state;
 const label=!state.configured?'Notion sin conectar':state.pulling?'Trayendo de Notion…':state.busy?'Sincronizando…':state.error?'Notion: pendiente':state.pending?`${state.pending} cambios pendientes`:state.warnings.length?'Sincronizado con avisos':state.lastSuccess?'Notion al día':'Notion conectado';
 $('#notion-status').textContent=label;
 $('#notion-status').title=state.error||state.warnings.join('\n')||(state.lastSuccess?'Última sincronización: '+new Date(state.lastSuccess).toLocaleString('es-AR'):'');
 $('#notion-status').classList.toggle('sync-error',!!state.error);
 $('#notion-sync-now').disabled=state.busy||notionPullBusy;
 $('#notion-pull').disabled=state.busy||notionPullBusy;
 $('#notion-pull').textContent=notionPullBusy||state.pulling?'↓ Trayendo…':'↓ Traer de Notion';
 $('#notion-sync-now').textContent=state.busy?'↥ Sincronizando…':'↥ Sincronizar ahora';
 $('#notion-settings').textContent=state.configured?'↥ Notion · Ajustes':'↥ Conectar Notion';
 if($('#notion-dialog').open){
  $('#notion-detail').textContent=[state.workspace,label,state.lastSuccess?'Último envío: '+new Date(state.lastSuccess).toLocaleString('es-AR'):'',state.lastPull?'Última descarga: '+new Date(state.lastPull).toLocaleString('es-AR'):'',state.error,...state.warnings].filter(Boolean).join('\n');
  $('#notion-open').hidden=!state.parentId;
  $('#notion-disconnect').hidden=!state.configured;
 }
}
async function refreshNotion(){if(notionPollBusy)return;notionPollBusy=true;try{showNotionState(await api.notionStatus());}catch(e){$('#notion-status').textContent='Notion: '+e.message;}finally{notionPollBusy=false;}}
async function openNotionSettings(){
 await refreshNotion();const state=notionState;if(!state)return;
 $('#notion-parent').value=state.destinationUrl;
 $('#notion-token').value='';$('#notion-token').placeholder=state.configured?'Clave guardada. Dejá vacío para conservarla.':'Pegá tu token aquí';
 $('#notion-automatic').checked=state.automatic;
 $('#notion-form-error').textContent='';$('.notion-setup-steps').open=!state.configured;$('#notion-dialog').showModal();$('#notion-dialog').scrollTop=0;showNotionState(state);
}
$('#notion-settings').onclick=openNotionSettings;
$('#notion-close').onclick=()=>$('#notion-dialog').close();
$('#notion-dialog').addEventListener('close',()=>{$('#notion-token').value='';});
$('#notion-token-page').onclick=()=>api.notionOpen('tokens').catch(e=>toast(e.message));
$('#notion-guide').onclick=()=>api.notionOpen('guide').catch(e=>toast(e.message));
$('#notion-open').onclick=()=>api.notionOpen('destination').catch(e=>toast(e.message));
$('#notion-form').onsubmit=async e=>{
 e.preventDefault();const button=$('#notion-connect');button.disabled=true;button.textContent='Comprobando conexión…';$('#notion-form-error').textContent='';
 try{const state=await api.notionConfigure({token:$('#notion-token').value,parent:$('#notion-parent').value,automatic:$('#notion-automatic').checked});$('#notion-token').value='';$('.notion-setup-steps').open=false;$('#notion-dialog').scrollTop=0;showNotionState(state);toast('Notion conectado. Podés sincronizar todos tus cuadernos cuando quieras.');}
 catch(error){$('#notion-form-error').textContent=error.message;}finally{button.disabled=false;button.textContent='Guardar conexión';}
};
$('#notion-disconnect').onclick=async()=>{try{showNotionState(await api.notionDisconnect());$('#notion-token').value='';toast('Notion desconectado. Tus copias se conservan.');}catch(e){$('#notion-form-error').textContent=e.message;}};
$('#notion-sync-now').onclick=async()=>{
 if(!notionState?.configured)return openNotionSettings();
 capture();await saveChain;
 $('#notion-sync-now').disabled=true;
 try{const state=await api.notionSync();showNotionState(state);toast(state.error|| (state.pending?'Quedan cambios pendientes; se enviarán en el próximo intento.':state.warnings.length?'Sincronizado con avisos. Revisalos en Notion · Ajustes.':'Todos tus cuadernos están sincronizados con Notion.'));}catch(e){toast(e.message);}finally{refreshNotion();}
};
window.addEventListener('online',()=>{if(notionState?.configured&&notionState.automatic)api.notionSync().then(showNotionState).catch(()=>{});});
refreshNotion();setInterval(refreshNotion,2500);

$('#notion-pull').onclick=async()=>{
 if(notionPullBusy)return;
 if(!notionState?.configured)return openNotionSettings();
 if(importingWord||receivingFiles){toast('Esperá a que termine la importación de archivos.');return;}
 notionPullBusy=true;capture();clearTimeout(window.correctTimer);
 $('#content').inert=true;$('#sidebar').inert=true;$('#toggle-sidebar').disabled=true;
 try{
  await saveChain;showNotionState(notionState);
  const result=await api.notionPull();books=result.books;home();
  const r=result.report;
  modal('Clases recuperadas',`<p>${r.added} clases nuevas · ${r.updated} actualizadas · ${r.unchanged} sin cambios.</p>`+(r.copies?`<p>Se conservaron ${r.copies} versiones anteriores como «copia local». Esas copias no se envían a Notion.</p>`:'')+(r.warnings.length?'<ul>'+r.warnings.map(w=>'<li>'+esc(w)+'</li>').join('')+'</ul>':''),()=>{},'Entendido');
 }catch(e){toast('No se pudo traer de Notion: '+e.message);}finally{notionPullBusy=false;$('#content').inert=false;$('#sidebar').inert=document.body.classList.contains('sidebar-collapsed');$('#toggle-sidebar').disabled=false;refreshNotion();}
};
