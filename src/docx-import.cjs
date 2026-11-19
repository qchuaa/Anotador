const JSZip=require('jszip');
const {DOMParser}=require('linkedom');
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const children=n=>Array.from(n?.children||[]);
const tag=n=>(n?.tagName||'').split(':').pop();
const child=(n,name)=>children(n).find(x=>tag(x)===name);
const attr=(n,name='val')=>n?.getAttribute('w:'+name)??n?.getAttribute(name);
const val=(n,name)=>attr(child(n,name));
const num=(s,factor=1)=>Number.isFinite(Number(s))?Number(s)*factor:0;
const on=n=>n&&!['0','false','off'].includes(attr(n));
const color=s=>/^[0-9a-f]{6}$/i.test(s||'')?'#'+s:null;
const xml=s=>new DOMParser().parseFromString(s,'text/xml');

async function convertDocx(buffer){
 if(buffer.length>40*1024*1024)throw Error('El documento supera los 40 MB. Dividilo en archivos más pequeños.');
 let zip;try{zip=await JSZip.loadAsync(buffer);}catch{throw Error('No se pudo abrir el Word. Usá un archivo .docx sin contraseña.');}
 let expanded=0;
 for(const entry of Object.values(zip.files)){expanded+=entry._data?.uncompressedSize||0;if(expanded>160*1024*1024)throw Error('El documento es demasiado grande para importarlo.');}
 const read=async name=>zip.file(name)?xml(await zip.file(name).async('string')):null;
 const document=await read('word/document.xml');
 if(!document)throw Error('El archivo no es un documento Word .docx válido.');
 const stylesDoc=await read('word/styles.xml'),numbering=await read('word/numbering.xml'),relsDoc=await read('word/_rels/document.xml.rels');
 const findAll=(root,name)=>Array.from(root?.querySelectorAll('*')||[]).filter(n=>tag(n)===name);
 const styles=new Map(findAll(stylesDoc,'style').map(n=>[attr(n,'styleId'),n]));
 const rels=new Map(findAll(relsDoc,'Relationship').map(n=>[n.getAttribute('Id'),n]));
 const defaults=findAll(stylesDoc,'docDefaults')[0];
 const defaultP=child(child(defaults,'pPrDefault'),'pPr'),defaultR=child(child(defaults,'rPrDefault'),'rPr');
 const warnings=new Set();let imageBytes=0;
 const inherit=(id,seen=new Set())=>{if(!id||seen.has(id)||!styles.has(id))return [];seen.add(id);const s=styles.get(id);return [...inherit(val(s,'basedOn'),seen),s];};
 const props=(nodes,kind)=>{const map=new Map();for(const n of nodes)for(const p of children(kind?child(n,kind):n))map.set(tag(p),p);return map;};
 const styleString=map=>Object.entries(map).map(([k,v])=>k+':'+v).join(';');
 function runStyle(nodes){
  const p=props(nodes),s={};
  if(p.has('b'))s['font-weight']=on(p.get('b'))?'700':'400';
  if(p.has('i'))s['font-style']=on(p.get('i'))?'italic':'normal';
  const decorations=[];if(p.has('u')&&!['none','0','false'].includes(attr(p.get('u'))))decorations.push('underline');if(on(p.get('strike'))||on(p.get('dstrike')))decorations.push('line-through');if(decorations.length)s['text-decoration']=decorations.join(' ');
  const c=color(attr(p.get('color')));if(c)s.color=c;
  const bg=color(attr(p.get('shd'),'fill'));if(bg)s['background-color']=bg;
  const highlights={yellow:'#ffff00',green:'#00ff00',cyan:'#00ffff',magenta:'#ff00ff',blue:'#0000ff',red:'#ff0000',darkBlue:'#000080',darkCyan:'#008080',darkGreen:'#008000',darkMagenta:'#800080',darkRed:'#800000',darkYellow:'#808000',darkGray:'#808080',lightGray:'#c0c0c0',black:'#000000',white:'#ffffff'};
  if(highlights[attr(p.get('highlight'))])s['background-color']=highlights[attr(p.get('highlight'))];
  if(p.has('sz'))s['font-size']=Math.max(6,Math.min(96,num(attr(p.get('sz')),0.5)))+'pt';
  const font=attr(p.get('rFonts'),'ascii')||attr(p.get('rFonts'),'hAnsi');if(font&&/^[\p{L}\p{N} _-]{1,80}$/u.test(font))s['font-family']=font;
  return s;
 }
 function paragraphStyle(nodes){
  const p=props(nodes),s={};const align=attr(p.get('jc'));if(['left','right','center','both','justify','start','end'].includes(align))s['text-align']=align==='both'?'justify':align;
  const spacing=p.get('spacing');for(const [name,key] of [['before','margin-top'],['after','margin-bottom']])if(attr(spacing,name)!=null)s[key]=Math.max(0,num(attr(spacing,name),0.05))+'pt';
  if(attr(spacing,'line'))s['line-height']=attr(spacing,'lineRule')==='exact'?num(attr(spacing,'line'),0.05)+'pt':Math.max(1,num(attr(spacing,'line'),1/240));
  const ind=p.get('ind');for(const [name,key] of [['left','margin-left'],['right','margin-right']])if(attr(ind,name)!=null)s[key]=Math.max(0,Math.min(150,num(attr(ind,name),0.05)))+'pt';
  if(attr(ind,'firstLine'))s['text-indent']=num(attr(ind,'firstLine'),0.05)+'pt';
  if(attr(ind,'hanging'))s['text-indent']=-num(attr(ind,'hanging'),0.05)+'pt';
  const bg=color(attr(p.get('shd'),'fill'));if(bg)s['background-color']=bg;
  return s;
 }
 async function image(node){
  const blip=findAll(node,'blip')[0],rid=blip?.getAttribute('r:embed');
  const legacy=findAll(node,'imagedata')[0];const rel=rels.get(rid||legacy?.getAttribute('r:id'));
  if(!rel||rel.getAttribute('TargetMode')==='External'){warnings.add('Alguna imagen externa o dibujo no se pudo incorporar.');return '';}
  const target=path.posix.normalize('word/'+rel.getAttribute('Target')).replace(/^word\//,'word/');
  if(!target.startsWith('word/media/')){warnings.add('Alguna imagen no se pudo incorporar.');return '';}
  const extension=path.posix.extname(target).toLowerCase(),mime={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.webp':'image/webp'}[extension];
  if(!mime||!zip.file(target)){warnings.add('Alguna imagen usa un formato que no se puede editar aquí.');return '';}
  const data=await zip.file(target).async('nodebuffer');imageBytes+=data.length;if(imageBytes>60*1024*1024)throw Error('Las imágenes del documento son demasiado grandes.');
  const size=findAll(node,'extent')[0];const width=Math.max(1,Math.min(900,num(size?.getAttribute('cx'),1/9525)||500));
  return `<img src="data:${mime};base64,${data.toString('base64')}" alt="Imagen importada de Word" style="width:${width}px;max-width:100%;height:auto">`;
 }
 async function inline(node,baseRun=[]){
  const type=tag(node);
  if(type==='t'||type==='delText')return esc(node.textContent);
  if(type==='tab')return '&#9;';
  if(type==='br'||type==='cr')return '<br>';
  if(type==='drawing'||type==='pict')return image(node);
  if(['rPr','pPr','instrText','del','object'].includes(type)){if(type==='object')warnings.add('Los objetos incrustados quedan disponibles en el Word original.');return '';}
  if(type==='hyperlink'){const r=rels.get(node.getAttribute('r:id')),url=r?.getAttribute('Target');const text=(await Promise.all(children(node).map(n=>inline(n,baseRun)))).join('');return /^https?:\/\//i.test(url||'')?`<a href="${esc(url)}">${text}</a>`:text;}
  if(type==='r'){
   const rp=child(node,'rPr'),chain=inherit(val(rp,'rStyle')).map(s=>child(s,'rPr'));
   const text=(await Promise.all(children(node).map(n=>inline(n,baseRun)))).join('');
   const css=styleString(runStyle([...baseRun,...chain,rp]));const vert=val(rp,'vertAlign');
   const content=vert==='superscript'?`<sup>${text}</sup>`:vert==='subscript'?`<sub>${text}</sub>`:text;
   return css?`<span style="${esc(css)}">${content}</span>`:content;
  }
  if(type==='footnoteReference'||type==='endnoteReference'){warnings.add('Las notas al pie se conservan en el archivo original.');return `<sup>[${esc(attr(node,'id'))}]</sup>`;}
  return (await Promise.all(children(node).map(n=>inline(n,baseRun)))).join('');
 }
 function listInfo(p){
  const n=p.get('numPr'),id=val(n,'numId');if(!id||id==='0')return null;
  const level=Number(val(n,'ilvl')||0),number=findAll(numbering,'num').find(n=>attr(n,'numId')===id),abstractId=val(number,'abstractNumId');
  const abstract=findAll(numbering,'abstractNum').find(n=>attr(n,'abstractNumId')===abstractId),override=children(number).find(n=>tag(n)==='lvlOverride'&&Number(attr(n,'ilvl'))===level);
  const definition=child(override,'lvl')||children(abstract).find(n=>tag(n)==='lvl'&&Number(attr(n,'ilvl'))===level);
  const format=val(definition,'numFmt')||'decimal';
  return {id,level:Math.max(0,Math.min(8,level)),type:format==='bullet'?'ul':'ol',format,start:Number(val(override,'startOverride')||val(definition,'start')||1)};
 }
 async function paragraph(node){
  const direct=child(node,'pPr'),defaultStyle=[...styles.values()].find(s=>attr(s,'type')==='paragraph'&&['1','true','on'].includes(attr(s,'default'))),chain=inherit(val(direct,'pStyle')||attr(defaultStyle,'styleId')),pNodes=[defaultP,...chain.map(s=>child(s,'pPr')),direct],p=props(pNodes);
  const outline=attr(p.get('outlineLvl')),styleName=chain.map(s=>val(s,'name')||attr(s,'styleId')).join(' '),heading=outline!=null&&Number(outline)<6?Number(outline)+1:Number(styleName.match(/(?:heading|título|titulo)\s*([1-6])/i)?.[1]||0);
  const css=styleString({...runStyle([defaultR,...chain.map(s=>child(s,'rPr'))]),...paragraphStyle(pNodes)});
  const content=(await Promise.all(children(node).filter(n=>tag(n)!=='pPr').map(n=>inline(n,[defaultR,...chain.map(s=>child(s,'rPr'))])))).join('')||'<br>';
  return {content,css,tag:heading?'h'+heading:'p',list:listInfo(p)};
 }
 async function blocks(nodes){
  let out='',stack=[];const close=()=>{while(stack.length){out+='</li></'+stack.pop().type+'>';}};
  for(const node of nodes){
   if(tag(node)==='p'){
    const p=await paragraph(node),l=p.list;
    if(!l){close();out+=`<${p.tag} style="${esc(p.css)}">${p.content}</${p.tag}>`;continue;}
    const depth=Math.min(l.level,stack.length);
    while(stack.length>depth+1)out+='</li></'+stack.pop().type+'>';
    if(stack[depth]&&(stack[depth].id!==l.id||stack[depth].type!==l.type)){while(stack.length>depth)out+='</li></'+stack.pop().type+'>';}
    if(stack.length===depth+1)out+='</li>';
    else {const types={lowerLetter:'lower-alpha',upperLetter:'upper-alpha',lowerRoman:'lower-roman',upperRoman:'upper-roman',decimal:'decimal',bullet:'disc'};out+=`<${l.type} start="${l.start}" style="list-style-type:${types[l.format]||'decimal'}">`;stack.push(l);}
    out+=`<li><${p.tag} style="${esc(p.css)}">${p.content}</${p.tag}>`;
   }else if(tag(node)==='tbl'){
    close();out+='<table style="border-collapse:collapse;width:100%;table-layout:fixed"><tbody>';
    const rows=children(node).filter(n=>tag(n)==='tr'),grid=children(child(node,'tblGrid')).map(n=>num(attr(n,'w'))),totalWidth=grid.reduce((a,b)=>a+b,0);
    for(let ri=0;ri<rows.length;ri++){
     out+='<tr>';let col=0;
     for(const cell of children(rows[ri]).filter(n=>tag(n)==='tc')){
      const pr=child(cell,'tcPr'),span=Math.max(1,Math.min(50,Number(val(pr,'gridSpan')||1))),merge=child(pr,'vMerge');
      if(merge&&attr(merge)!=='restart'){col+=span;continue;}
      let rowspan=1;if(merge){for(let j=ri+1;j<rows.length;j++){let c=0,next;for(const candidate of children(rows[j]).filter(n=>tag(n)==='tc')){if(c===col){next=child(child(candidate,'tcPr'),'vMerge');break;}c+=Number(val(child(candidate,'tcPr'),'gridSpan')||1);}if(!next||attr(next)==='restart')break;rowspan++;}}
      const bg=color(attr(child(pr,'shd'),'fill')),vertical=val(pr,'vAlign');
      out+=`<td colspan="${span}" rowspan="${rowspan}" style="border:1px solid #888;padding:6px;${totalWidth?`width:${100*grid.slice(col,col+span).reduce((a,b)=>a+b,0)/totalWidth}%;`:''}vertical-align:${vertical==='center'?'middle':vertical==='bottom'?'bottom':'top'}${bg?';background-color:'+bg:''}">${await blocks(children(cell).filter(n=>tag(n)!=='tcPr'))}</td>`;col+=span;
     }out+='</tr>';
    }out+='</tbody></table>';
   }else if(tag(node)==='sdt'){close();out+=await blocks(children(child(node,'sdtContent')));}
   else if(tag(node)==='altChunk'){warnings.add('Una sección incrustada no se pudo convertir; consultá el Word original.');}
  }close();return out;
 }
 const body=findAll(document,'body')[0];
 if(!body)throw Error('El documento no contiene un cuerpo de texto válido.');
 if(findAll(document,'oMath').length||findAll(document,'oMathPara').length)warnings.add('Las ecuaciones de Word pueden perder su composición; consultá el original.');
 if(findAll(document,'txbxContent').length)warnings.add('Los cuadros de texto pueden perder su posición original.');
 if(findAll(document,'cols').some(n=>Number(attr(n,'num'))>1))warnings.add('Las columnas se importan como texto continuo.');
 if(findAll(document,'headerReference').length||findAll(document,'footerReference').length)warnings.add('Los encabezados y pies de página se conservan en el Word original.');
 const html=await blocks(children(body));
 if(!html.trim())throw Error('No se encontró contenido editable para importar. El documento puede contener únicamente objetos no compatibles.');
 return {html,warnings:[...warnings]};
}

async function importDocx(parent,dir,droppedPath){
 const {dialog}=require('electron');
 const result=droppedPath?{canceled:false,filePaths:[droppedPath]}:await dialog.showOpenDialog(parent,{title:'Importar Word en esta clase',properties:['openFile'],filters:[{name:'Documento Word (.docx)',extensions:['docx']}]});
 if(result.canceled||!result.filePaths.length)return {canceled:true};
 const file=result.filePaths[0];if(path.extname(file).toLowerCase()!=='.docx')throw Error('Guardá el documento como .docx desde Word o Google Docs.');
 if((await fs.stat(file)).size>40*1024*1024)throw Error('El documento supera los 40 MB.');
 const buffer=await fs.readFile(file),converted=await convertDocx(buffer);
 const id=crypto.randomUUID()+'.docx';await fs.mkdir(path.join(dir,'attachments'),{recursive:true});await fs.writeFile(path.join(dir,'attachments',id),buffer);
 return {...converted,canceled:false,file:{id,name:path.basename(file)}};
}
module.exports={convertDocx,importDocx};
