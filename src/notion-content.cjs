const {parseHTML}=require('linkedom');
function chunks(text,size=1900){const parts=[];for(let i=0;i<text.length;){let end=Math.min(i+size,text.length);if(end<text.length && /[\uD800-\uDBFF]/.test(text[end-1]))end--;parts.push(text.slice(i,end));i=end;}return parts;}
function rich(text,annotations={}){return chunks(String(text)).map(content=>({type:'text',text:{content},annotations}));}
function block(type,text){return {object:'block',type,[type]:{rich_text:rich(text)}};}
function htmlBlocks(html){
 const {document}=parseHTML('<html><body>'+String(html||'')+'</body></html>');
 const out=[];
 function inline(node,style={}){
  if(node.nodeType===3)return rich(node.textContent,style);
  if(node.nodeType!==1 || ['SCRIPT','STYLE','IFRAME','OBJECT'].includes(node.tagName))return [];
  if(node.tagName==='BR')return rich('\n',style);
  if(['UL','OL'].includes(node.tagName))return [];
  const a={...style};
  if(['B','STRONG'].includes(node.tagName)||/bold|[6-9]00/.test(node.style?.fontWeight||''))a.bold=true;
  if(['I','EM'].includes(node.tagName))a.italic=true;
  if(node.tagName==='U')a.underline=true;
  if(['S','STRIKE','DEL'].includes(node.tagName))a.strikethrough=true;
  if(node.tagName==='CODE')a.code=true;
  const result=[...node.childNodes].flatMap(child=>inline(child,a));
  if(node.tagName==='A' && /^https?:\/\//i.test(node.getAttribute('href')||''))for(const part of result)part.text.link={url:node.getAttribute('href').slice(0,2000)};
  return result;
 }
 function emit(type,parts){
  if(!parts.some(p=>p.text.content.trim()))return;
  for(let i=0;i<parts.length;i+=30){const data={rich_text:parts.slice(i,i+30)};if(type==='callout'){data.icon={type:'emoji',emoji:'💡'};data.color='green_background';}out.push({object:'block',type,[type]:data});}
 }
 function visit(node){
  if(node.nodeType===3){emit('paragraph',inline(node));return;}
  if(node.nodeType!==1 || ['SCRIPT','STYLE','IFRAME','OBJECT'].includes(node.tagName))return;
  if(['UL','OL'].includes(node.tagName)){for(const li of node.children){emit(node.tagName==='UL'?'bulleted_list_item':'numbered_list_item',inline(li));for(const child of li.children)if(['UL','OL'].includes(child.tagName))visit(child);}return;}
  if(node.classList.contains('ai-note')){emit('callout',inline(node));return;}
  if(node.tagName==='DIV' && [...node.children].some(el=>/^(DIV|P|H[1-6]|UL|OL|BLOCKQUOTE)$/.test(el.tagName))){for(const child of node.childNodes)visit(child);return;}
  const type=/^H[1-6]$/.test(node.tagName)?'heading_'+Math.min(3,Number(node.tagName[1])):node.tagName==='BLOCKQUOTE'?'quote':'paragraph';
  emit(type,inline(node));
 }
 for(const node of document.body.childNodes)visit(node);
 return out;
}
module.exports={htmlBlocks,rich,block};
