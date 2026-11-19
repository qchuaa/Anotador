const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
async function receiveFiles(paths,dir){
 if(!Array.isArray(paths)||paths.length>30)throw Error('Arrastrá hasta 30 archivos a la vez.');
 const results=[];
 for(const file of paths){
  try{
   if(typeof file!=='string'||!path.isAbsolute(file))throw Error('No se pudo leer el archivo arrastrado.');
   const ext=path.extname(file).toLowerCase();
   if(!['.docx','.pdf','.ppt','.pptx'].includes(ext))throw Error('Usá archivos DOCX, PDF, PPT o PPTX.');
   const stat=await fs.stat(file);if(!stat.isFile())throw Error('Elegí un archivo, no una carpeta.');
   if(ext==='.docx'){results.push(await require('./docx-import.cjs').importDocx(null,dir,file));continue;}
   if(stat.size>200*1024*1024)throw Error('El material supera los 200 MB.');
   const id=crypto.randomUUID()+ext;await fs.mkdir(path.join(dir,'attachments'),{recursive:true});await fs.copyFile(file,path.join(dir,'attachments',id));
   results.push({file:{id,name:path.basename(file)}});
  }catch(error){results.push({error:(typeof file==='string'?path.basename(file)+': ':'')+error.message});}
 }
 return results;
}
module.exports={receiveFiles};
