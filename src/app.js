const $=s=>document.querySelector(s), days=['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
let books=[],book=null,lesson=null,selected=null,selection=null,saveChain=Promise.resolve();
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=d=>new Date(d+'T12:00:00').toLocaleDateString('es-AR',{day:'numeric',month:'long'});
const iso=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
function toast(t){$('#toast').textContent=t;$('#toast').style.display='block';setTimeout(()=>$('#toast').style.display='none',5000)}
function save(){const snapshot=JSON.parse(JSON.stringify(books));$('#status').textContent='Guardando…';saveChain=saveChain.catch(()=>{}).then(()=>api.save(snapshot)).then(()=>$('#status').textContent='✓ Guardado en tu notebook').catch(e=>{ $('#status').textContent='Error al guardar';toast(e.message) });return saveChain}
function nav(){document.querySelector('nav').innerHTML=books.map(b=>`<button data-id="${b.id}">▤ ${esc(b.name)}</button>`).join('');document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>openBook(books.find(x=>x.id===b.dataset.id)))}
async function modal(title,fields,submit,confirmLabel='Guardar'){$('#confirm').textContent=confirmLabel;$('#modal-title').textContent=title;$('#fields').innerHTML=fields;$('#modal').returnValue='';$('#modal').showModal();$('#modal').onclose=()=>{if($('#modal').returnValue==='ok')submit()}}
function home(){document.body.classList.remove('lesson-open');book=lesson=null;nav();$('#crumb').textContent='Mi espacio / Cuadernos';$('#content').innerHTML=`<span style="font-size:42px">▧</span><h1>Mis cuadernos</h1><p class="subtitle">Un lugar para lo que aprendés, clase a clase.</p><div class="row"><h2>Tus materias</h2><button id="add">＋ Nuevo cuaderno</button></div><div class="grid">${books.map((b,i)=>`<button class="card" data-id="${b.id}"><div class="cover" style="background:${['#e8eee6','#eee8e1','#e7eaf1'][i%3]}">${['∑','↗','▥'][i%3]}</div><div class="card-body"><h3>${esc(b.name)}</h3><span class="tag">${days[b.day]}${Number(b.day)===new Date().getDay()?' · Hoy':''}</span><p><small>${b.classes.length} clases</small></p></div></button>`).join('')}</div>${books.length?'':'<p class="subtitle">Creá tu primer cuaderno y elegí el día de cursada.</p>'}`;$('#add').onclick=newBook;document.querySelectorAll('.card').forEach(c=>c.onclick=()=>openBook(books.find(b=>b.id===c.dataset.id)))}
function newBook(){modal('Nuevo cuaderno','<label>Materia</label><input id="name" placeholder="Ej. Cálculo" required maxlength="80"><label>Día de cursada</label><select id="day">'+days.map((d,i)=>`<option value="${i}" ${i===1?'selected':''}>${d}</option>`).join('')+'</select>',()=>{if(!$('#name').value.trim())return toast('Escribí el nombre de la materia');books.push({id:crypto.randomUUID(),name:$('#name').value.trim(),day:Number($('#day').value),classes:[]});save();home()})}
function openBook(b){document.body.classList.remove('lesson-open');numberClasses(b);book=b;lesson=null;nav();$('#crumb').textContent='Cuadernos / '+b.name;$('#content').innerHTML=`<span style="font-size:40px">▤</span><h1>${esc(b.name)}</h1><p class="subtitle">Todos los ${days[b.day].toLowerCase()} · ${b.classes.length} clases</p><div class="row"><h2>Clases</h2><div>${downloadControl('book')} <button id="delete-book">Borrar cuaderno</button> <button id="edit">Editar materia</button> <button class="primary" id="newclass">＋ Nueva clase</button></div></div>${b.classes.slice().sort((a,b)=>b.date.localeCompare(a.date)).map(c=>`<div class="class-row"><button class="open-class" data-id="${c.id}">▱ &nbsp; ${esc(classLabel(c))}</button><small>${date(c.date)}</small><button class="delete-class" data-id="${c.id}" aria-label="Borrar ${esc(classLabel(c))}">Borrar</button></div>`).join('')||'<p class="subtitle">Tu próxima clase empieza con una hoja en blanco.</p>'}`;$('#newclass').onclick=()=>{const d=new Date();d.setDate(d.getDate()+((b.day-d.getDay()+7)%7));if(b.classes.length){const last=b.classes.reduce((a,c)=>a.date>c.date?a:c);const next=new Date(last.date+'T12:00:00');next.setDate(next.getDate()+7);if(next>d)d.setTime(next.getTime())}modal('Nueva clase',`<label>Fecha</label><input type="date" id="date" value="${iso(d)}"><label>Título</label><input id="name" value="Clase ${nextClassNumber(b)}">`,()=>{if(!$('#date').value)return toast('Elegí una fecha');const c={id:crypto.randomUUID(),number:nextClassNumber(b),date:$('#date').value,title:$('#name').value||'Clase',html:'',images:[],files:[]};b.classes.push(c);save();openLesson(c)})};$('#edit').onclick=()=>modal('Editar materia',`<label>Nombre</label><input id="name" value="${esc(b.name)}"><label>Día</label><select id="day">${days.map((d,i)=>`<option value="${i}" ${i===b.day?'selected':''}>${d}</option>`).join('')}</select>`,()=>{b.name=$('#name').value.trim()||b.name;b.day=Number($('#day').value);save();openBook(b)});bindDownload('book',b,null);$('#delete-book').onclick=()=>deleteBook(b);document.querySelectorAll('.delete-class').forEach(x=>x.onclick=()=>deleteLesson(b,b.classes.find(c=>c.id===x.dataset.id)));document.querySelectorAll('.open-class').forEach(x=>x.onclick=()=>openLesson(b.classes.find(c=>c.id===x.dataset.id)))}
function capture(){if(lesson&&$('.editor')){lesson.html=$('.editor').innerHTML;lesson.layoutWidth=$('.paper').clientWidth;save()}}
function openLesson(c){document.body.classList.add('lesson-open');clearTimeout(window.correctTimer);lesson=c;selected=null;selection=null;$('#crumb').textContent=book.name+' / '+date(c.date);$('#content').innerHTML=`<div class="lesson-actions"><button id="back">← Clases</button><div class="lesson-action-buttons">${downloadControl('lesson')}<button id="delete-lesson">Borrar clase</button></div></div><input class="title-input" value="${esc(c.title)}"><small>Clase ${c.number} · ${days[new Date(c.date+'T12:00:00').getDay()]} ${date(c.date)}</small><div class="attachments"></div><div class="toolbar" role="toolbar" aria-label="Herramientas de edición"><button data-cmd="bold"><b>N</b></button><button data-cmd="italic"><i>I</i></button><button data-cmd="insertUnorderedList">• Lista</button><button data-cmd="insertOrderedList">1. Lista</button><button id="heading">Subtítulo</button><button data-cmd="undo">↶</button><button data-cmd="redo">↷</button><button id="attach">＋ PDF / PPT</button><button id="explain" title="Explicá el texto o la captura seleccionada con Ctrl + E" aria-keyshortcuts="Control+E"><span>✧ Explicar</span><kbd>Ctrl + E</kbd></button><button id="remove">Quitar captura</button></div><div class="paper"><div class="editor" contenteditable="true" spellcheck="true"></div></div><div class="hint">Pegá capturas con Ctrl + V. Arrastralas y ajustá su tamaño desde la esquina inferior derecha. Ctrl + E: explicar texto o captura seleccionada. Backspace: borrar la captura seleccionada.</div>`;$('.editor').innerHTML=c.html;prepareEditor();$('#back').onclick=()=>openBook(book);$('#delete-lesson').onclick=()=>deleteLesson(book,c);$('.title-input').oninput=e=>{c.title=e.target.value;save()};document.querySelectorAll('[data-cmd]').forEach(b=>{b.onmousedown=e=>e.preventDefault();b.onclick=()=>{document.execCommand(b.dataset.cmd);capture()}});$('#heading').onmousedown=e=>e.preventDefault();$('#heading').onclick=()=>{document.execCommand('formatBlock',false,'h2');capture()};$('.editor').oninput=()=>{normalizeEditor();capture();clearTimeout(window.correctTimer);window.correctTimer=setTimeout(correct,650)};$('.editor').onkeyup=rememberSelection;$('.editor').onmouseup=rememberSelection;
 $('.editor').onpaste=e=>{const item=[...e.clipboardData.items].find(i=>i.type.startsWith('image/'));if(item){e.preventDefault();const r=new FileReader();r.onload=()=>{c.images.push({id:crypto.randomUUID(),src:r.result,x:40,y:80,w:350,h:220});if(lesson===c)renderImages();save()};r.readAsDataURL(item.getAsFile())}else{e.preventDefault();document.execCommand('insertText',false,e.clipboardData.getData('text/plain'));capture()}};
 $('#attach').onclick=async()=>{try{c.files.push(...await api.attach());files();save()}catch(e){toast(e.message)}};$('#remove').onclick=removeSelectedImage;$('#explain').onmousedown=e=>e.preventDefault();$('#explain').onclick=explain;bindDownload('lesson',book,c);files();renderImages()}
function files(){$('.attachments').innerHTML=lesson.files.map(f=>`<button data-file="${f.id}">▱ ${esc(f.name)}</button>`).join('');document.querySelectorAll('[data-file]').forEach(b=>b.onclick=async()=>{const error=await api.open(b.dataset.file);if(error)toast(error)})}
function renderImages() {
  const current = lesson, paper = $('.paper');
  if (!current || !paper) return;
  const resizePaper = () => { if (lesson === current) paper.style.minHeight = Math.max(650,...current.images.map(im=>im.y+im.h+40))+'px'; };
  resizePaper();
  document.querySelectorAll('.shot').forEach(el=>el.remove());
  for (const im of current.images) {
    const el = document.createElement('div');
    el.className = 'shot'+(selected===im.id?' selected':'');
    el.tabIndex = 0;
    el.setAttribute('role','img');
    el.setAttribute('aria-label','Captura. Arrastrá para mover. Ctrl + E para explicar. Backspace para borrar.');
    el.style.cssText = `left:${im.x}px;top:${im.y}px;width:${im.w}px;height:${im.h}px`;
    el.innerHTML = `<img src="${im.src}">`;
    paper.append(el);
    const select = () => {
      selected=im.id; selection=null;
      getSelection().removeAllRanges();
      document.querySelectorAll('.shot').forEach(x=>x.classList.toggle('selected',x===el));
    };
    el.onfocus = select;
    el.onpointerdown = e => {
      if(e.button!==0)return;
      select(); el.focus({preventScroll:true});
      const r=el.getBoundingClientRect();
      if(e.clientX>r.right-22 && e.clientY>r.bottom-22)return;
      e.preventDefault();
      const x=e.clientX,y=e.clientY,ox=im.x,oy=im.y;
      el.setPointerCapture(e.pointerId);
      el.onpointermove=v=>{
        im.x=Math.max(0,Math.min(Math.max(0,paper.clientWidth-im.w),ox+v.clientX-x));
        im.y=Math.max(0,oy+v.clientY-y);
        el.style.left=im.x+'px';el.style.top=im.y+'px';
        resizePaper();
      };
    };
    const observer=new ResizeObserver(()=>{
      if(!el.isConnected || lesson!==current){observer.disconnect();return;}
      const w=el.offsetWidth,h=el.offsetHeight;
      if(w!==im.w || h!==im.h){im.w=w;im.h=h;resizePaper();save();}
    });
    observer.observe(el);
    el.onpointerup=el.onpointercancel=()=>{el.onpointermove=null;resizePaper();save();};
  }
}
const corrections={calculo:'cálculo',fisica:'física',tambien:'también',ademas:'además',funcion:'función',ecuacion:'ecuación',derivacion:'derivación',integracion:'integración',limite:'límite',limites:'límites',matematicas:'matemáticas',teoria:'teoría',energia:'energía',aceleracion:'aceleración',definicion:'definición',numero:'número',numeros:'números',analisis:'análisis',estadistica:'estadística',distribucion:'distribución',probavilidad:'probabilidad',resivir:'recibir',nesesario:'necesario',ejemlo:'ejemplo',porq:'porque'};
async function correct() {
  const ed=$('.editor');
  if(!ed || document.activeElement!==ed || !getSelection().isCollapsed)return;
  const snapshot=ed.innerHTML;
  const words=[...ed.textContent.matchAll(/[a-záéíóúüñ]{3,}/gi)].map(match=>match[0].toLowerCase());
  let suggested={};
  try { suggested=await api.spelling(words); } catch { /* Known corrections remain available offline. */ }
  if(!ed.isConnected || ed.innerHTML!==snapshot || document.activeElement!==ed || !getSelection().isCollapsed)return;
  const current=getSelection();
  if(!current.rangeCount || !ed.contains(current.anchorNode))return;
  const marker=document.createElement('span');
  marker.dataset.caret='true';
  current.getRangeAt(0).cloneRange().insertNode(marker);
  const walker=document.createTreeWalker(ed,NodeFilter.SHOW_TEXT);
  const nodes=[];
  while(walker.nextNode())nodes.push(walker.currentNode);
  for(const node of nodes){
    if(node.parentElement.closest('.correction,.ai-note,code,pre'))continue;
    const matches=[...node.data.matchAll(/[a-záéíóúüñ]+/gi)];
    for(const match of matches.reverse()){
      const original=match[0], end=match.index+original.length;
      // A word touching the caret is still being typed. Enter completes the previous block.
      if(end===node.length && (node.nextSibling===marker || node.nextSibling?.nodeType===3 && node.nextSibling.data))continue;
      const lower=original.toLowerCase();
      let replacement=corrections[lower] || suggested[lower];
      if(!replacement || replacement===lower)continue;
      if(original===original.toUpperCase())replacement=replacement.toUpperCase();
      else if(original[0]===original[0].toUpperCase())replacement=replacement[0].toUpperCase()+replacement.slice(1);
      const range=document.createRange();range.setStart(node,match.index);range.setEnd(node,end);
      const span=document.createElement('span');span.className='correction';span.title='Escribiste «'+original+'» → «'+replacement+'»';span.textContent=replacement;
      range.deleteContents();range.insertNode(span);
    }
  }
  for(const block of ed.querySelectorAll('div,p')){
    if(block.closest('.ai-note') || block.querySelector('div,p'))continue;
    const text=block.textContent.trim();
    if(text.length>3 && /[A-ZÁÉÍÓÚÑ]/.test(text) && text===text.toUpperCase()){
      const heading=document.createElement('h2');while(block.firstChild)heading.append(block.firstChild);block.replaceWith(heading);
    }
  }
  const range=document.createRange();range.setStartBefore(marker);range.collapse(true);marker.remove();
  current.removeAllRanges();current.addRange(range);rememberSelection();capture();showCompletion(ed);
}

const completionWords=['aceleración','aproximación','características','coeficiente','conclusión','conocimiento','consecuencia','definición','demostración','derivada','distribución','ecuación','estadística','experimento','frecuencia','función','hipótesis','integración','matemáticas','movimiento','probabilidad','procedimiento','propiedades','representación','resultado','sistema','transformación','velocidad'];
let completion=null;
function showCompletion(editor){
  document.querySelector('#word-completion')?.remove();completion=null;
  const selection=getSelection();
  if(document.activeElement!==editor || !selection.isCollapsed || selection.anchorNode?.nodeType!==3)return;
  const node=selection.anchorNode,offset=selection.anchorOffset;
  const prefix=node.data.slice(0,offset).match(/[a-záéíóúüñ]{4,}$/i)?.[0];
  if(!prefix || /[a-záéíóúüñ]/i.test(node.data[offset]||''))return;
  const normalize=text=>text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  let word=completionWords.find(word=>normalize(word).startsWith(normalize(prefix)) && word.length>prefix.length);
  if(!word)return;
  if(prefix===prefix.toUpperCase())word=word.toUpperCase();
  else if(prefix[0]===prefix[0].toUpperCase())word=word[0].toUpperCase()+word.slice(1);
  completion={node,offset,start:offset-prefix.length,word};
  const hint=document.createElement('div');hint.id='word-completion';hint.textContent=word+' · Tab para completar';hint.setAttribute('role','status');editor.after(hint);
}

async function explain() {
  const c=lesson, editor=$('.editor'), btn=$('#explain');
  if(!c || !editor || !btn || btn.disabled)return;
  const img=c.images.find(i=>i.id===selected);
  const range=selection && editor.contains(selection.commonAncestorContainer) ? selection.cloneRange() : null;
  const text=range?.toString().trim();
  if(!img && !text)return toast('Seleccioná texto o una captura primero');
  btn.disabled=true;btn.textContent='✧ Preparando explicación…';
  try {
    const result=await api.explain(img?{image:img.src}:{text});
    if(lesson!==c || $('.editor')!==editor)return;
    const el=document.createElement('div');
    el.className='ai-note';el.textContent=result;
    if(img){
      if(!c.images.includes(img))return toast('La captura ya no está en esta clase.');
      insertImageExplanation(editor,img,el);
    }else if(range && !range.collapsed && editor.contains(range.commonAncestorContainer)){
      insertTextExplanation(editor,range,el);
    }else return toast('La selección cambió. Seleccioná el texto y volvé a pedir la explicación.');
    // Keep the explanation in the normal document flow, then continue in plain text.
    continueAfterNote(el);
    capture();
  }catch(e){toast(e.message)}finally{btn.disabled=false;btn.innerHTML='<span>✧ Explicar</span><kbd>Ctrl + E</kbd>';}
}
$('#home').onclick=home;$('#new').onclick=newBook;$('#settings').onclick=()=>modal('IA para tus apuntes','<p>Conectá OpenAI para explicar texto y capturas. La selección se envía al servicio al pulsar Explicar. Requiere Internet y una clave de API con saldo.</p><label>Clave de API</label><input id="key" type="password" placeholder="sk-…"><p class="hint">La clave se guarda cifrada en Windows.</p>',async()=>{if($('#key').value.trim()){await api.key($('#key').value.trim());toast('IA configurada')}});
api.load().then(data=>{books=data;books.forEach(numberClasses);home()}).catch(e=>toast('No se pudieron cargar tus apuntes. '+e.message));


function numberClasses(notebook) {
  const used = new Set(notebook.classes.map(item => item.number).filter(Number.isInteger));
  let candidate = 1;
  for (const item of notebook.classes) {
    if (Number.isInteger(item.number) && item.number > 0) continue;
    while (used.has(candidate)) candidate++;
    item.number = candidate;
    used.add(candidate++);
  }
}

function nextClassNumber(notebook) {
  numberClasses(notebook);
  return Math.max(0, ...notebook.classes.map(item => item.number)) + 1;
}

function classLabel(item) {
  const prefix = 'Clase ' + item.number;
  return item.title === prefix ? prefix : prefix + ' · ' + item.title;
}

function openToday(notebook, today) {
  capture();
  numberClasses(notebook);
  let current = notebook.classes.find(item => item.date === today);
  if (!current) {
    const number = nextClassNumber(notebook);
    current = {id:crypto.randomUUID(),number,date:today,title:'Clase '+number,html:'',images:[],files:[]};
    notebook.classes.push(current);
  }
  book = notebook;
  nav();
  save();
  openLesson(current);
  $('.editor').focus();
}

$('#today').onclick = () => {
  if (!books.length) {
    toast('Creá un cuaderno y elegí tu día de cursada para empezar.');
    newBook();
    return;
  }
  const now = new Date();
  const today = iso(now);
  const scheduled = books.filter(item => Number(item.day) === now.getDay());
  if (scheduled.length === 1) {
    openToday(scheduled[0], today);
    return;
  }
  const choices = scheduled.length ? scheduled : books;
  const message = scheduled.length ? 'Elegí la materia que estás cursando.' : 'Hoy no tenés materias programadas. Podés elegir un cuaderno para una clase extra.';
  modal('Clase de hoy · '+date(today), '<p>'+message+'</p><label>Materia</label><select id="today-subject">'+choices.map(item=>'<option value="'+item.id+'">'+esc(item.name)+'</option>').join('')+'</select>', () => {
    const notebook = choices.find(item => item.id === $('#today-subject').value);
    if (notebook) openToday(notebook, today);
  }, 'Abrir clase');
};

function confirmDelete(title, message, action) {
  modal(title, '<p>'+message+'</p><p>Esta acción no se puede deshacer.</p>', action, 'Borrar');
  $('#modal button[value="cancel"]').focus();
}

function deleteBook(notebook) {
  confirmDelete('Borrar cuaderno', '¿Querés borrar el cuaderno <strong>'+esc(notebook.name)+'</strong> y sus '+notebook.classes.length+' clases? Se eliminarán todos sus apuntes.', () => {
    clearTimeout(window.correctTimer);
    books = books.filter(item => item.id !== notebook.id);
    selected = selection = null;
    save();
    home();
  });
}

function deleteLesson(notebook, item) {
  confirmDelete('Borrar clase', '¿Querés borrar <strong>'+esc(classLabel(item))+'</strong> del cuaderno <strong>'+esc(notebook.name)+'</strong>? Se eliminarán sus apuntes y capturas.', () => {
    clearTimeout(window.correctTimer);
    notebook.classes = notebook.classes.filter(current => current.id !== item.id);
    selected = selection = null;
    save();
    openBook(notebook);
  });
}

function clearImageSelection() {
  selected=null;
  document.querySelectorAll('.shot').forEach(el=>el.classList.remove('selected'));
}

function rememberSelection() {
  const s=getSelection(), editor=$('.editor');
  if(!editor || !s.rangeCount || !editor.contains(s.anchorNode) || !editor.contains(s.focusNode))return;
  clearImageSelection();
  selection=s.getRangeAt(0).cloneRange();
}

function normalizeEditor() {
  const editor=$('.editor');
  if(!editor)return;
  const s=getSelection(), anchor=s.anchorNode, offset=s.anchorOffset;
  for(const node of [...editor.childNodes]) {
    if(node.nodeType===3 || (node.nodeType===1 && !/^(P|DIV|H[1-6]|UL|OL|BLOCKQUOTE)$/.test(node.tagName))) {
      const p=document.createElement('p');editor.insertBefore(p,node);p.append(node);
      if(node===anchor){s.collapse(node,Math.min(offset,node.textContent.length));}
    }
  }
}

function continueAfterNote(note) {
  let p=note.nextElementSibling;
  if(!p || p.tagName!=='P' || p.className || p.textContent.trim()) {
    p=document.createElement('p');p.append(document.createElement('br'));note.after(p);
  }
  clearImageSelection();
  const editor=$('.editor');editor.focus({preventScroll:true});
  const range=document.createRange();range.setStart(p,0);range.collapse(true);
  const s=getSelection();s.removeAllRanges();s.addRange(range);selection=range.cloneRange();
}

function prepareEditor() {
  const editor=$('.editor');
  // Older explanations saved image coordinates as huge margins. Remove those
  // margins and empty green blocks without changing the explanation text.
  editor.querySelectorAll('.ai-note').forEach(note=>{
    note.style.removeProperty('margin-top');
    if(!note.textContent.trim())note.remove();
  });
  normalizeEditor();
  if(!editor.childNodes.length)editor.innerHTML='<p><br></p>';
  $('.paper').onpointerdown=e=>{
    if(e.target!==e.currentTarget)return;
    e.preventDefault();clearImageSelection();editor.focus({preventScroll:true});
    const range=document.createRange();range.selectNodeContents(editor);range.collapse(false);
    const s=getSelection();s.removeAllRanges();s.addRange(range);rememberSelection();
  };
  editor.addEventListener('keyup',()=>showCompletion(editor));
  editor.addEventListener('blur',()=>{document.querySelector('#word-completion')?.remove();completion=null;});
  editor.onkeydown=e=>{
    if(e.key==='Tab' && completion && !e.shiftKey && !e.ctrlKey && !e.altKey){
      const current=getSelection(), item=completion;
      if(current.isCollapsed && current.anchorNode===item.node && current.anchorOffset===item.offset){
        e.preventDefault();const range=document.createRange();range.setStart(item.node,item.start);range.setEnd(item.node,item.offset);current.removeAllRanges();current.addRange(range);document.execCommand('insertText',false,item.word);capture();
      }
      document.querySelector('#word-completion')?.remove();completion=null;return;
    }
    document.querySelector('#word-completion')?.remove();completion=null;
    if(e.key!=='Enter' || e.shiftKey || e.ctrlKey || e.altKey || e.metaKey || e.isComposing)return;
    const s=getSelection();
    const node=s.anchorNode?.nodeType===3?s.anchorNode.parentElement:s.anchorNode;
    const note=node?.closest?.('.ai-note');
    if(note && editor.contains(note)){
      e.preventDefault();continueAfterNote(note);capture();
    }
  };
}

function removeSelectedImage() {
  if(!lesson || !selected)return;
  lesson.images=lesson.images.filter(im=>im.id!==selected);
  clearImageSelection();renderImages();save();
  $('.editor')?.focus({preventScroll:true});
}

document.addEventListener('pointerdown',e=>{
  if(!e.target.closest('.shot,.toolbar'))clearImageSelection();
});

document.addEventListener('keydown',e=>{
  if(!lesson || !$('.editor') || document.querySelector('dialog[open]') || e.isComposing)return;
  if(e.target.closest('input,textarea,select'))return;
  if(e.ctrlKey && !e.altKey && !e.shiftKey && e.key.toLowerCase()==='e'){
    e.preventDefault();
    if(!e.repeat){if(!selected)rememberSelection();explain();}
  }else if((e.key==='Backspace' || e.key==='Delete') && selected && !e.ctrlKey && !e.altKey && !e.metaKey){
    e.preventDefault();removeSelectedImage();
  }
});

function insertTextExplanation(editor, range, note) {
  // Split at the END of the selection, preserving the remaining text and markup.
  // A Range ending on the editor itself already represents a block boundary.
  if(range.endContainer===editor){
    const insertion=range.cloneRange();insertion.collapse(false);insertion.insertNode(note);
    return;
  }
  let block=range.endContainer.nodeType===3?range.endContainer.parentElement:range.endContainer;
  while(block.parentElement!==editor)block=block.parentElement;
  const tail=document.createRange();
  tail.setStart(range.endContainer,range.endOffset);tail.setEndAfter(block);
  const remaining=tail.extractContents();
  block.after(note);
  if(remaining.textContent.trim() || remaining.querySelector('img'))note.after(remaining);
}

function insertImageExplanation(editor, img, note) {
  const paper=$('.paper');
  const bottom=paper.getBoundingClientRect().top+paper.clientTop+img.y+img.h;
  // Use the nearby document block, not the end of the document. Reserve only
  // the missing vertical space between that block and the bottom of the image.
  const next=[...editor.children].find(child=>child.getBoundingClientRect().bottom>=bottom);
  const anchor=document.createElement('div');anchor.className='image-explanation';
  anchor.append(note);editor.insertBefore(anchor,next||null);
  while(note.getBoundingClientRect().top>bottom+12 && anchor.previousElementSibling){
    editor.insertBefore(anchor,anchor.previousElementSibling);
  }
  const gap=Math.max(0,bottom+12-note.getBoundingClientRect().top);
  if(gap)anchor.style.paddingTop=gap+'px';
}

function setSidebarCollapsed(collapsed) {
  document.body.classList.toggle('sidebar-collapsed',collapsed);
  $('#sidebar').inert=collapsed;
  const button=$('#toggle-sidebar');
  button.setAttribute('aria-expanded',String(!collapsed));
  button.title=collapsed?'Mostrar panel lateral':'Ocultar panel lateral';
  button.setAttribute('aria-label',button.title);
  localStorage.setItem('sidebar-collapsed',String(collapsed));
}
$('#toggle-sidebar').onclick=()=>setSidebarCollapsed(!document.body.classList.contains('sidebar-collapsed'));
setSidebarCollapsed(localStorage.getItem('sidebar-collapsed')==='true');

let exportingPDF=false;
async function exportPDF(notebook, current, button, format='pdf') {
  const formatLabel=format==='docx'?'Word / Docs':'PDF';
  if(exportingPDF)return;
  capture();
  const payload=JSON.parse(JSON.stringify({name:notebook.name,classes:current?[current]:notebook.classes,wholeBook:!current,layoutWidth:$('.paper')?.clientWidth||900}));
  if(!payload.classes.length)return toast('Este cuaderno todavía no tiene clases para exportar.');
  exportingPDF=true;
  const label=button.innerHTML;button.disabled=true;button.textContent='Preparando '+formatLabel+'…';
  try {
    const result=await api.exportPDF({...payload,format});
    if(!result.canceled)toast(formatLabel+' guardado: '+result.filePath);
  }catch(e){toast('No se pudo exportar el documento. '+e.message)}finally{
    exportingPDF=false;button.disabled=false;button.innerHTML=label;
  }
}

function downloadControl(scope) {
  return `<span class="download-control"><button id="download-${scope}" type="button" aria-expanded="false" aria-controls="download-${scope}-options">↓ Descargar</button><span id="download-${scope}-options" class="download-options" hidden><button id="export-${scope}" type="button">PDF</button><button id="export-${scope}-docx" type="button">Word / Docs (.docx)</button></span></span>`;
}
function closeDownload(control,restoreFocus=false) {
  const button=control.querySelector(':scope > button');
  control.querySelector('.download-options').hidden=true;
  button.setAttribute('aria-expanded','false');
  if(restoreFocus)button.focus();
}
function bindDownload(scope,notebook,current) {
  const button=$('#download-'+scope),control=button.parentElement,options=control.querySelector('.download-options');
  button.onclick=()=>{options.hidden=!options.hidden;button.setAttribute('aria-expanded',String(!options.hidden));};
  for(const [suffix,format] of [['','pdf'],['-docx','docx']])$('#export-'+scope+suffix).onclick=()=>{
    closeDownload(control,true);exportPDF(notebook,current,button,format);
  };
  control.addEventListener('keydown',event=>{if(event.key==='Escape'){closeDownload(control,true);event.stopPropagation();}});
  control.addEventListener('focusout',event=>{if(!control.contains(event.relatedTarget))closeDownload(control);});
}
document.addEventListener('click',event=>{for(const control of document.querySelectorAll('.download-control'))if(!control.contains(event.target))closeDownload(control);});
