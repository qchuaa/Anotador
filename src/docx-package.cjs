const JSZip=require('jszip');
// html-to-docx emits sectPr before the body and does not merge margin defaults.
// Normalize the package to the ordering/values expected by Microsoft Word.
async function normalizeDocx(buffer){
 const zip=await JSZip.loadAsync(buffer),file=zip.file('word/document.xml');
 if(!file)throw Error('El documento no contiene word/document.xml.');
 let xml=await file.async('string');
 xml=xml.replace(/<w:pgMar\b[^>]*\/>/g,tag=>tag.replace(/w:(header|footer|gutter)="(?:undefined|NaN|null)"/g,(_,key)=>`w:${key}="${key==='gutter'?0:720}"`));
 const section=xml.match(/<w:body>\s*(<w:sectPr\b[\s\S]*?<\/w:sectPr>)/);
 if(section){xml=xml.replace(section[1],'');xml=xml.replace('</w:body>',section[1]+'</w:body>');}
 if(/\b[\w:]+="(?:undefined|NaN|null)"/.test(xml))throw Error('No se pudo generar un Word válido.');
 zip.file('word/document.xml',xml);
 return zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'});
}
module.exports={normalizeDocx};
