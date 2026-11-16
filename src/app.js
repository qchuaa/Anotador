const $=s=>document.querySelector(s), days=['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
let books=[],book=null,lesson=null,selected=null,selection=null,saveChain=Promise.resolve();
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=d=>new Date(d+'T12:00:00').toLocaleDateString('es-AR',{day:'numeric',month:'long'});
const iso=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
function toast(t){$('#toast').textContent=t;$('#toast').style.display='block';setTimeout(()=>$('#toast').style.display='none',5000)}
function save(){const snapshot=JSON.parse(JSON.stringify(books));$('#status').textContent='Guardando…';saveChain=saveChain.catch(()=>{}).then(()=>api.save(snapshot)).then(()=>$('#status').textContent='✓ Guardado en tu notebook').catch(e=>{ $('#status').textContent='Error al guardar';toast(e.message) });return saveChain}
function nav(){document.querySelector('nav').innerHTML=books.map(b=>`<button data-id="${b.id}">▤ ${esc(b.name)}</button>`).join('');document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>openBook(books.find(x=>x.id===b.dataset.id)))}
async function modal(title,fields,submit,confirmLabel='Guardar'){$('#confirm').textContent=confirmLabel;$('#modal-title').textContent=title;$('#fields').innerHTML=fields;$('#modal').showModal();$('#modal').onclose=()=>{if($('#modal').returnValue==='ok')submit()}}
function home(){book=lesson=null;nav();$('#crumb').textContent='Mi espacio / Cuadernos';$('#content').innerHTML=`<span style="font-size:42px">▧</span><h1>Mis cuadernos</h1><p class="subtitle">Un lugar para lo que aprendés, clase a clase.</p><div class="row"><h2>Tus materias</h2><button id="add">＋ Nuevo cuaderno</button></div><div class="grid">${books.map((b,i)=>`<button class="card" data-id="${b.id}"><div class="cover" style="background:${['#e8eee6','#eee8e1','#e7eaf1'][i%3]}">${['∑','↗','▥'][i%3]}</div><div class="card-body"><h3>${esc(b.name)}</h3><span class="tag">${days[b.day]}${Number(b.day)===new Date().getDay()?' · Hoy':''}</span><p><small>${b.classes.length} clases</small></p></div></button>`).join('')}</div>${books.length?'':'<p class="subtitle">Creá tu primer cuaderno y elegí el día de cursada.</p>'}`;$('#add').onclick=newBook;document.querySelectorAll('.card').forEach(c=>c.onclick=()=>openBook(books.find(b=>b.id===c.dataset.id)))}
function newBook(){modal('Nuevo cuaderno','<label>Materia</label><input id="name" placeholder="Ej. Cálculo" required maxlength="80"><label>Día de cursada</label><select id="day">'+days.map((d,i)=>`<option value="${i}" ${i===1?'selected':''}>${d}</option>`).join('')+'</select>',()=>{if(!$('#name').value.trim())return toast('Escribí el nombre de la materia');books.push({id:crypto.randomUUID(),name:$('#name').value.trim(),day:Number($('#day').value),classes:[]});save();home()})}
function openBook(b){numberClasses(b);book=b;lesson=null;nav();$('#crumb').textContent='Cuadernos / '+b.name;$('#content').innerHTML=`<span style="font-size:40px">▤</span><h1>${esc(b.name)}</h1><p class="subtitle">Todos los ${days[b.day].toLowerCase()} · ${b.classes.length} clases</p><div class="row"><h2>Clases</h2><div><button id="edit">Editar materia</button> <button class="primary" id="newclass">＋ Nueva clase</button></div></div>${b.classes.slice().sort((a,b)=>b.date.localeCompare(a.date)).map(c=>`<div class="class-row"><button data-id="${c.id}">▱ &nbsp; ${esc(classLabel(c))}</button><small>${date(c.date)}</small></div>`).join('')||'<p class="subtitle">Tu próxima clase empieza con una hoja en blanco.</p>'}`;$('#newclass').onclick=()=>{const d=new Date();d.setDate(d.getDate()+((b.day-d.getDay()+7)%7));if(b.classes.length){const last=b.classes.reduce((a,c)=>a.date>c.date?a:c);const next=new Date(last.date+'T12:00:00');next.setDate(next.getDate()+7);if(next>d)d.setTime(next.getTime())}modal('Nueva clase',`<label>Fecha</label><input type="date" id="date" value="${iso(d)}"><label>Título</label><input id="name" value="Clase ${nextClassNumber(b)}">`,()=>{if(!$('#date').value)return toast('Elegí una fecha');const c={id:crypto.randomUUID(),number:nextClassNumber(b),date:$('#date').value,title:$('#name').value||'Clase',html:'',images:[],files:[]};b.classes.push(c);save();openLesson(c)})};$('#edit').onclick=()=>modal('Editar materia',`<label>Nombre</label><input id="name" value="${esc(b.name)}"><label>Día</label><select id="day">${days.map((d,i)=>`<option value="${i}" ${i===b.day?'selected':''}>${d}</option>`).join('')}</select>`,()=>{b.name=$('#name').value.trim()||b.name;b.day=Number($('#day').value);save();openBook(b)});document.querySelectorAll('.class-row button').forEach(x=>x.onclick=()=>openLesson(b.classes.find(c=>c.id===x.dataset.id)))}
function capture(){if(lesson&&$('.editor')){lesson.html=$('.editor').innerHTML;save()}}
function openLesson(c){clearTimeout(window.correctTimer);lesson=c;selected=null;selection=null;$('#crumb').textContent=book.name+' / '+date(c.date);$('#content').innerHTML=`<button id="back">← Clases</button><input class="title-input" value="${esc(c.title)}"><small>Clase ${c.number} · ${days[new Date(c.date+'T12:00:00').getDay()]} ${date(c.date)}</small><div class="attachments"></div><div class="toolbar"><button data-cmd="bold"><b>N</b></button><button data-cmd="italic"><i>I</i></button><button data-cmd="insertUnorderedList">• Lista</button><button data-cmd="insertOrderedList">1. Lista</button><button id="heading">Subtítulo</button><button data-cmd="undo">↶</button><button data-cmd="redo">↷</button><button id="attach">＋ PDF / PPT</button><button id="explain">✧ Explicar selección</button><button id="remove">Quitar captura</button></div><div class="paper"><div class="editor" contenteditable="true" spellcheck="true"></div></div><div class="hint">Pegá capturas con Ctrl + V. Arrastralas y ajustá su tamaño desde la esquina inferior derecha. Seleccioná texto o una captura para explicarla.</div>`;$('.editor').innerHTML=c.html;$('#back').onclick=()=>openBook(book);$('.title-input').oninput=e=>{c.title=e.target.value;save()};document.querySelectorAll('[data-cmd]').forEach(b=>{b.onmousedown=e=>e.preventDefault();b.onclick=()=>{document.execCommand(b.dataset.cmd);capture()}});$('#heading').onmousedown=e=>e.preventDefault();$('#heading').onclick=()=>{document.execCommand('formatBlock',false,'h2');capture()};$('.editor').oninput=()=>{capture();clearTimeout(window.correctTimer);window.correctTimer=setTimeout(correct,650)};$('.editor').onkeyup=()=>{selected=null;document.querySelectorAll('.shot').forEach(el=>el.classList.remove('selected'));const s=getSelection();if(s.rangeCount)selection=s.getRangeAt(0).cloneRange()};$('.editor').onmouseup=$('.editor').onkeyup;
 $('.editor').onpaste=e=>{const item=[...e.clipboardData.items].find(i=>i.type.startsWith('image/'));if(item){e.preventDefault();const r=new FileReader();r.onload=()=>{c.images.push({id:crypto.randomUUID(),src:r.result,x:40,y:80,w:350,h:220});renderImages();save()};r.readAsDataURL(item.getAsFile())}else{e.preventDefault();document.execCommand('insertText',false,e.clipboardData.getData('text/plain'));capture()}};
 $('#attach').onclick=async()=>{try{c.files.push(...await api.attach());files();save()}catch(e){toast(e.message)}};$('#remove').onclick=()=>{if(selected){c.images=c.images.filter(i=>i.id!==selected);selected=null;renderImages();save()}};$('#explain').onmousedown=e=>e.preventDefault();$('#explain').onclick=explain;files();renderImages()}
function files(){$('.attachments').innerHTML=lesson.files.map(f=>`<button data-file="${f.id}">▱ ${esc(f.name)}</button>`).join('');document.querySelectorAll('[data-file]').forEach(b=>b.onclick=async()=>{const error=await api.open(b.dataset.file);if(error)toast(error)})}
function renderImages(){$('.paper').style.minHeight=Math.max(650,...lesson.images.map(im=>im.y+im.h+40))+'px';document.querySelectorAll('.shot').forEach(x=>x.remove());for(const im of lesson.images){const el=document.createElement('div');el.className='shot'+(selected===im.id?' selected':'');el.style.cssText=`left:${im.x}px;top:${im.y}px;width:${im.w}px;height:${im.h}px`;el.innerHTML=`<img src="${im.src}">`;$('.paper').append(el);el.onpointerdown=e=>{selected=im.id;document.querySelectorAll('.shot').forEach(x=>x.classList.toggle('selected',x===el));const r=el.getBoundingClientRect();if(e.clientX>r.right-22&&e.clientY>r.bottom-22)return;const x=e.clientX,y=e.clientY,ox=im.x,oy=im.y;el.setPointerCapture(e.pointerId);el.onpointermove=v=>{im.x=Math.max(0,Math.min($('.paper').clientWidth-im.w,ox+v.clientX-x));im.y=Math.max(0,oy+v.clientY-y);el.style.left=im.x+'px';el.style.top=im.y+'px'}};const observer=new ResizeObserver(()=>{if(!el.isConnected){observer.disconnect();return}const w=el.offsetWidth,h=el.offsetHeight;if(w!==im.w||h!==im.h){im.w=w;im.h=h;$('.paper').style.minHeight=Math.max(650,...lesson.images.map(image=>image.y+image.h+40))+'px';save()}});observer.observe(el);el.onpointerup=()=>{el.onpointermove=null;im.w=el.offsetWidth;im.h=el.offsetHeight;$('.paper').style.minHeight=Math.max(650,im.y+im.h+40)+'px';save()}}}
const corrections={calculo:'cálculo',fisica:'física',tambien:'también',ademas:'además',funcion:'función',ecuacion:'ecuación',derivacion:'derivación',integracion:'integración',limite:'límite',limites:'límites',matematicas:'matemáticas',teoria:'teoría',energia:'energía',aceleracion:'aceleración',definicion:'definición',numero:'número',numeros:'números',analisis:'análisis',estadistica:'estadística',distribucion:'distribución',probavilidad:'probabilidad',resivir:'recibir',nesesario:'necesario',ejemlo:'ejemplo',porq:'porque'};
function correct(){const ed=$('.editor');if(!ed)return;
 const currentSelection=getSelection();
 let caretOffset=null;
 if(currentSelection.isCollapsed&&currentSelection.rangeCount&&ed.contains(currentSelection.anchorNode)){
  const prefix=currentSelection.getRangeAt(0).cloneRange();prefix.selectNodeContents(ed);prefix.setEnd(currentSelection.anchorNode,currentSelection.anchorOffset);caretOffset=prefix.toString().length;
 }
 if(!ed.querySelector('div,p,h2,ul,ol')&&ed.textContent.trim().length>3&&/[A-ZÁÉÍÓÚÑ]/.test(ed.textContent)&&ed.textContent.trim()===ed.textContent.trim().toUpperCase()){
  const heading=document.createElement('h2');while(ed.firstChild)heading.append(ed.firstChild);ed.append(heading);
 }
const walker=document.createTreeWalker(ed,NodeFilter.SHOW_TEXT);const nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);for(const n of nodes){if(n.parentElement.closest('.correction,.ai-note'))continue;const re=/\b([a-záéíóúñ]+)(?=[\s.,;:!?])/gi;let m;const matches=[];while((m=re.exec(n.data)))if(corrections[m[1].toLowerCase()])matches.push({index:m.index,old:m[1],value:m[1]===m[1].toUpperCase()?corrections[m[1].toLowerCase()].toUpperCase():m[1][0]===m[1][0].toUpperCase()?corrections[m[1].toLowerCase()][0].toUpperCase()+corrections[m[1].toLowerCase()].slice(1):corrections[m[1].toLowerCase()]});for(const m of matches.reverse()){const range=document.createRange();range.setStart(n,m.index);range.setEnd(n,m.index+m.old.length);const span=document.createElement('span');span.className='correction';span.title=`Escribiste «${m.old}» → «${m.value}»`;span.textContent=m.value;range.deleteContents();range.insertNode(span)}}for(const p of ed.querySelectorAll('div,p')){const t=p.textContent.trim();if(t.length>3&&/[A-ZÁÉÍÓÚÑ]/.test(t)&&t===t.toUpperCase()&&!p.querySelector('div,p')){const h=document.createElement('h2');h.innerHTML=p.innerHTML;p.replaceWith(h)}}
 if(caretOffset!==null){const walker=document.createTreeWalker(ed,NodeFilter.SHOW_TEXT);let node;while(node=walker.nextNode()){if(caretOffset<=node.length){const range=document.createRange();range.setStart(node,caretOffset);range.collapse(true);currentSelection.removeAllRanges();currentSelection.addRange(range);break}caretOffset-=node.length}}
 capture()}
async function explain(){const c=lesson,img=c.images.find(i=>i.id===selected),text=selection?.toString();if(!img&&!text)return toast('Seleccioná texto o una captura primero');const btn=$('#explain');btn.disabled=true;btn.textContent='✧ Preparando explicación…';const range=selection?.cloneRange();try{const result=await api.explain(img?{image:img.src}:{text});if(lesson!==c){toast('Volvé a la clase para generar la explicación');return}const el=document.createElement('div');el.className='ai-note';el.textContent=result;if(img){el.style.marginTop=Math.max(20,img.y+img.h)+'px';$('.editor').append(el)}else if(range&&$('.editor').contains(range.commonAncestorContainer)){let block=range.endContainer.nodeType===3?range.endContainer.parentElement:range.endContainer;while(block.parentElement!==$('.editor')&&block.parentElement)block=block.parentElement;if(block===$('.editor'))$('.editor').append(el);else block.after(el)}else $('.editor').append(el);capture()}catch(e){toast(e.message)}finally{btn.disabled=false;btn.textContent='✧ Explicar selección'}}
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
