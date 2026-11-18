const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('api',Object.fromEntries(['load','save','attach','open','key','explain','exportPDF','notionStatus','notionConfigure','notionAutomatic','notionDisconnect','notionSync','notionOpen'].map(k=>[k,(arg)=>ipcRenderer.invoke(k,arg)])));
