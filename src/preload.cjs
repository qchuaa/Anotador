const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('api',Object.fromEntries(['load','save','attach','open','key','explain'].map(k=>[k,(arg)=>ipcRenderer.invoke(k,arg)])));
