const {BrowserWindow,dialog,app}=require('electron');
const fs=require('node:fs/promises');
const path=require('node:path');
const HTMLtoDOCX=require('html-to-docx');

let exportInProgress=false;
async function exportPDF(parent,payload) {
  if(exportInProgress)throw new Error('Ya hay una exportación en curso.');
  if(!payload || typeof payload.name!=='string' || !Array.isArray(payload.classes) || !payload.classes.length)throw new Error('No hay clases para exportar.');
  const format=payload.format==='docx'?'docx':'pdf';
  const label=format==='docx'?'Word / Docs':'PDF';
  exportInProgress=true;
  let printWindow;
  try {
    const title=payload.wholeBook?payload.name:payload.name+' - '+(payload.classes[0].title||'Clase');
    const safeName=title.replace(/[<>:"/\\|?*\x00-\x1f]/g,'-').replace(/[. ]+$/g,'').slice(0,140)||'Anotador';
    const result=await dialog.showSaveDialog(parent,{title:(payload.wholeBook?'Descargar cuaderno como ':'Descargar clase como ')+label,defaultPath:path.join(app.getPath('downloads'),safeName+'.'+format),filters:[{name:format==='docx'?'Documento Word / Google Docs':'Documento PDF',extensions:[format]}],properties:['showOverwriteConfirmation','createDirectory']});
    if(result.canceled || !result.filePath)return {canceled:true};
    printWindow=new BrowserWindow({show:false,width:1000,height:800,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
    printWindow.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    printWindow.webContents.on('will-navigate',e=>e.preventDefault());
    await printWindow.loadFile(path.join(__dirname,'pdf.html'));
    await printWindow.webContents.executeJavaScript(`window.renderExport(${JSON.stringify(payload)})`);
    const data=format==='docx'?await HTMLtoDOCX(await printWindow.webContents.executeJavaScript('window.wordExportHTML()'),null,{title,creator:'Anotador',font:'Arial',fontSize:22,pageSize:{width:11906,height:16838},margins:{top:1134,right:1134,bottom:1134,left:1134,header:720,footer:720,gutter:0}}):await printWindow.webContents.printToPDF({printBackground:true,pageSize:'A4',preferCSSPageSize:true,displayHeaderFooter:true,headerTemplate:'<div></div>',footerTemplate:'<div style="width:100%;text-align:center;font-size:9px;color:#666;font-family:Arial">Anotador · <span class="pageNumber"></span> / <span class="totalPages"></span></div>',generateTaggedPDF:true});
    const filePath=result.filePath.toLowerCase().endsWith('.'+format)?result.filePath:result.filePath+'.'+format;
    await fs.writeFile(filePath,format==='docx'?await require('./docx-package.cjs').normalizeDocx(data):data);
    return {canceled:false,filePath};
  }finally{
    if(printWindow && !printWindow.isDestroyed())printWindow.destroy();
    exportInProgress=false;
  }
}
module.exports={exportPDF};
