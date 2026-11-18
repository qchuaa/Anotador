const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),asar=require('@electron/asar');
const archive=process.argv[2]||'dist-remodel/win-unpacked/resources/app.asar';
let count=0;
function check(dir){for(const name of fs.readdirSync(dir)){const file=path.join(dir,name);if(fs.statSync(file).isDirectory())check(file);else{assert.ok(fs.readFileSync(file).equals(asar.extractFile(archive,file)),'Packaged file differs: '+file);count++;}}}
check('src');console.log('PASS: '+count+' packaged source/assets files match the working files exactly.');
