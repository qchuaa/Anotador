const { _electron } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
(async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'anotador-delete-test-'));
  const lesson = (id, number) => ({id, number, title:'Clase '+number, date:'2026-11-16',html:'<p>Apunte de prueba</p>',images:[],files:[]});
  fs.writeFileSync(path.join(profile,'notes.json'), JSON.stringify([
    {id:'a',name:'Materia A',day:1,classes:[lesson('a1',1),lesson('a2',2)]},
    {id:'b',name:'Materia B',day:2,classes:[lesson('b1',1)]}
  ]));
  const app = await _electron.launch(process.argv[2]
    ? {executablePath:path.resolve(process.argv[2]),args:['--user-data-dir='+profile]}
    : {args:[path.resolve('.'),'--user-data-dir='+profile]});
  try {
    assert.equal(await app.evaluate(({app})=>app.getPath('userData')),profile);
    const page = await app.firstWindow();
    const errors=[]; page.on('pageerror',e=>errors.push(e.message));
    await page.locator('.card[data-id="a"]').click();
    await page.locator('.delete-class[data-id="a1"]').click();
    assert.equal(await page.locator('#delete-location').inputValue(),'local');
    assert.deepEqual(await page.locator('#delete-location option').allTextContents(),['Solo en esta PC','En esta PC y en Notion']);
    await page.locator('button[value="cancel"]').click();
    assert.equal(await page.locator('.class-row').count(),2);
    await page.locator('.delete-class[data-id="a1"]').click();
    await page.locator('#confirm').click();
    await page.waitForFunction(()=>document.querySelectorAll('.class-row').length===1);
    await page.locator('#delete-book').click();
    await page.keyboard.press('Escape');
    await page.waitForFunction(()=>!document.querySelector('#modal').open);
    assert.equal(await page.locator('h1').innerText(),'Materia A');
    await page.locator('.open-class').click();
    await page.locator('.editor').fill('Texto guardado antes de borrar');
    await page.locator('#delete-lesson').click();
    await page.locator('#confirm').click();
    await page.waitForFunction(()=>!deletionBusy&&!!document.querySelector('#delete-book')&&document.querySelectorAll('.class-row').length===0);
    // Choosing both must reach IPC; a failed remote request preserves the notebook.
    await app.evaluate(({ipcMain})=>{globalThis.deletionRequests=[];ipcMain.removeHandler('deleteItem');ipcMain.handle('deleteItem',(_e,data)=>{globalThis.deletionRequests.push(data);throw Error('Prueba: sin conexión');});});
    await page.locator('#delete-book').click();await page.locator('#delete-location').selectOption('both');await page.locator('#confirm').click();
    await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('Prueba: sin conexión'));await page.waitForFunction(()=>!deletionBusy);assert.equal(await page.locator('h1').innerText(),'Materia A');
    assert.equal((await app.evaluate(()=>globalThis.deletionRequests))[0].location,'both');
    await app.evaluate(async({ipcMain,app})=>{const fs=process.getBuiltinModule('fs'),path=process.getBuiltinModule('path');ipcMain.removeHandler('deleteItem');ipcMain.handle('deleteItem',(_e,data)=>{const file=path.join(app.getPath('userData'),'notes.json');const all=JSON.parse(fs.readFileSync(file));const next=all.filter(b=>b.id!==data.bookId);fs.writeFileSync(file,JSON.stringify(next));return {books:next};});});
    await page.locator('#delete-book').click();await page.locator('#confirm').click();
    await page.waitForFunction(()=>document.querySelectorAll('.card').length===1);
    assert.equal(await page.locator('nav button').count(),1);
    await page.locator('.card[data-id="b"]').click();
    await page.locator('#delete-book').click();
    await page.locator('#confirm').click();
    await page.waitForFunction(()=>document.querySelector('h1')?.textContent==='Mis cuadernos' && document.querySelectorAll('.card').length===0);
    await page.evaluate(()=>saveChain);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(profile,'notes.json'),'utf8')),[]);
    await page.reload();
    await page.locator('#add').waitFor();
    assert.equal(await page.locator('.card').count(),0);
    assert.deepEqual(errors,[]);
    console.log('PASS: cancel, Escape after previous confirmation, list/editor deletion, notebook cascade, sidebar, persistence and reload. Isolated profile: '+profile);
  } finally { await app.close(); }
})().catch(e=>{console.error(e);process.exit(1)});
