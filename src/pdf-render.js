const allowed=new Set(['P','DIV','SPAN','BR','B','STRONG','I','EM','U','S','UL','OL','LI','H1','H2','H3','H4','BLOCKQUOTE','SUB','SUP','PRE','CODE','TABLE','TBODY','THEAD','TFOOT','TR','TD','TH','IMG','A','H5','H6']);
function cleanContent(html) {
  const source=new DOMParser().parseFromString(String(html||''),'text/html');
  const out=document.createElement('div');
  const copy=(node,parent)=>{
    if(node.nodeType===3){parent.append(document.createTextNode(node.textContent));return;}
    if(node.nodeType!==1)return;
    if(!allowed.has(node.tagName))return;
    const el=document.createElement(node.tagName.toLowerCase());
    for(const name of ['ai-note','image-explanation','docx-import','notion-import'])if(node.classList.contains(name))el.classList.add(name);
    if(el.classList.contains('image-explanation')){
      const gap=parseFloat(node.style.paddingTop);if(Number.isFinite(gap))el.style.setProperty('--source-gap',Math.max(0,gap)+'px');
    }
    if(['left','right','center','justify'].includes(node.style.textAlign))el.style.textAlign=node.style.textAlign;
    if(node.tagName==='OL' && /^\d+$/.test(node.getAttribute('start')||''))el.start=Number(node.getAttribute('start'));
    if(node.closest('.docx-import,.notion-import')){
      for(const name of ['font-weight','font-style','font-size','font-family','text-decoration','color','background-color','text-align','text-indent','margin-left','margin-right','margin-top','margin-bottom','line-height','vertical-align','border','border-collapse','padding','width','max-width','height','table-layout','list-style-type']){
        const value=node.style.getPropertyValue(name);if(value&&!/url\s*\(|expression|var\s*\(/i.test(value))el.style.setProperty(name,value);
      }
      for(const name of ['colspan','rowspan','start'])if(/^\d+$/.test(node.getAttribute(name)||''))el.setAttribute(name,node.getAttribute(name));
    }
    if(node.tagName==='IMG'){
      if(!/^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=\r\n]+$/i.test(node.getAttribute('src')||''))return;
      el.src=node.getAttribute('src');el.alt=node.getAttribute('alt')||'Imagen';
    }
    if(node.tagName==='A'&&/^https?:\/\//i.test(node.getAttribute('href')||''))el.href=node.getAttribute('href');
    for(const child of node.childNodes)copy(child,el);
    parent.append(el);
  };
  for(const child of source.body.childNodes)copy(child,out);
  return out;
}
function element(tag,text,className){const el=document.createElement(tag);el.textContent=text;if(className)el.className=className;return el;}
window.renderExport=async payload=>{
  document.title=payload.name;
  const root=document.querySelector('#document');root.replaceChildren();
  await document.fonts.ready;
  const classes=[...payload.classes].sort((a,b)=>String(a.date).localeCompare(String(b.date))||(a.number||0)-(b.number||0));
  for(const item of classes){
    const section=element('section','','lesson'),heading=element('div','','lesson-heading');
    heading.append(element('p',payload.name,'book-name'));
    const number='Clase '+(item.number||'');
    heading.append(element('h1',item.title===number?number:number+' · '+(item.title||'Sin título')));
    const d=new Date(item.date+'T12:00:00');
    heading.append(element('div',Number.isNaN(d.getTime())?String(item.date||''):d.toLocaleDateString('es-AR',{weekday:'long',day:'numeric',month:'long',year:'numeric'}),'date'));
    section.append(heading);
    const content=cleanContent(item.html),measure=element('div','','measure');
    measure.style.width=Math.max(300,Math.min(4000,Number(item.layoutWidth||payload.layoutWidth)||900))+'px';
    measure.append(...content.childNodes);document.body.append(measure);
    await document.fonts.ready;
    const top=measure.getBoundingClientRect().top;
    const blocks=[...measure.childNodes];
    const ends=blocks.map(node=>node.nodeType===1?node.getBoundingClientRect().bottom-top:0);
    const groups=new Map();
    for(const image of [...(item.images||[])].sort((a,b)=>a.y-b.y||a.x-b.x)){
      if(!/^data:image\/(png|jpeg|jpg|webp|gif);base64,/i.test(image.src||''))continue;
      let index=ends.findIndex(y=>y>=Math.max(0,Number(image.y)||0));if(index<0)index=blocks.length;
      if(!groups.has(index))groups.set(index,[]);groups.get(index).push(image);
    }
    const notes=element('div','','notes');
    for(let i=0;i<=blocks.length;i++){
      for(const image of groups.get(i)||[]){
        const figure=element('figure','','capture'),img=document.createElement('img');img.src=image.src;img.alt='Captura de la clase';
        img.style.maxWidth=Math.max(100,Math.min(670,Number(image.w)||350))+'px';
        figure.append(img);notes.append(figure);
      }
      if(blocks[i])notes.append(blocks[i]);
    }
    measure.remove();
    if(!notes.textContent.trim() && !notes.querySelector('img'))notes.append(element('p','Esta clase todavía no tiene apuntes.','empty'));
    section.append(notes);
    if(item.files?.length){
      const attached=element('div','','attachments');attached.append(element('h2','Archivos adjuntos (referencias)'));
      const list=document.createElement('ul');for(const file of item.files)list.append(element('li',file.name));attached.append(list);section.append(attached);
    }
    root.append(section);
  }
  await Promise.all([...document.images].map(img=>img.decode().catch(()=>{throw new Error('No se pudo cargar una captura para el PDF.')})));
  await document.fonts.ready;
  return {classes:classes.length};
};

// Use the same sanitized content and image order as PDF, with editable Word blocks.
window.wordExportHTML=()=>{
  const sections=[...document.querySelectorAll('#document .lesson')];
  return '<!doctype html><html><body>'+sections.map(section=>{
    const clone=section.cloneNode(true);
    for(const image of clone.querySelectorAll('img')){
      const original=[...section.querySelectorAll('img')][[...clone.querySelectorAll('img')].indexOf(image)];
      const width=Math.min(560,parseFloat(image.style.width)||parseFloat(image.style.maxWidth)||350,760*original.naturalWidth/original.naturalHeight);
      const canvas=document.createElement('canvas');canvas.width=original.naturalWidth;canvas.height=original.naturalHeight;canvas.getContext('2d').drawImage(original,0,0);image.src=canvas.toDataURL('image/png');
      image.setAttribute('width',String(width));image.setAttribute('height',String(Math.round(width*original.naturalHeight/original.naturalWidth)));
      image.style.cssText=`width:${width}px;height:${image.getAttribute('height')}px`;
    }
    // The Word converter ignores pictures nested inside inline formatting spans.
    for(const image of clone.querySelectorAll('img'))while(/^(SPAN|B|STRONG|I|EM|U|A)$/.test(image.parentElement?.tagName||'')){
      const parent=image.parentElement,before=parent.cloneNode(false),after=parent.cloneNode(false);
      while(parent.firstChild!==image)before.append(parent.firstChild);
      while(image.nextSibling)after.append(image.nextSibling);
      parent.replaceWith(before,image,after);
    }
    for(const note of clone.querySelectorAll('.ai-note'))note.style.cssText='background-color:#e6eee6;padding:10px';
    for(const wrapper of clone.querySelectorAll('.image-explanation'))wrapper.removeAttribute('style');
    return clone.innerHTML;
  }).join('<div class="page-break"></div>')+'</body></html>';
};
