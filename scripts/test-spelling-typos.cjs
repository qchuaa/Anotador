const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {suggestions,remember}=require('../src/spelling.cjs');
const cases={decoa:'decía',buno:'bueno',gue:'fue',palbras:'palabras',completamnte:'completamente',explicacon:'explicación',aplicacon:'aplicación',informacon:'información',documnto:'documento',escrbir:'escribir',necesrio:'necesario',imprtante:'importante',respesta:'respuesta',trabjo:'trabajo',estdiar:'estudiar',estduiar:'estudiar',desarollo:'desarrollo',funciom:'función',biologoa:'biología',cmunicacion:'comunicación',algortimo:'algoritmo',aprenser:'aprender',plasmido:'plásmido'};
const got=suggestions(Object.keys(cases));for(const [word,expected] of Object.entries(cases))assert.equal(got[word],expected,word);
const valid=['bueno','recia','informaron','aplicaron','niño','año','desarrollo','algoritmo','qwerty'];
for(const [word,result] of Object.entries(suggestions(valid)))assert.equal(result,null,word+' stays unchanged');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'typo-prefs-'));remember('documnto',dir);assert.equal(suggestions(['documnto'],dir).documnto,false);
assert.deepEqual(suggestions(Object.keys(cases)),got);
console.log('PASS: 23 omission/substitution/transposition/accent cases, valid words, ñ, unknown text, cache and personal exceptions.');
