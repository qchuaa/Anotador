const fs = require('node:fs');
const path = require('node:path');
const nspell = require('nspell');
const directory = path.dirname(require.resolve('dictionary-es'));
const dictionary = nspell(fs.readFileSync(path.join(directory, 'index.aff')), fs.readFileSync(path.join(directory, 'index.dic')));
dictionary.add('plásmido');
const cache = new Map();
const normalize = word => word.replace(/[áéíóúü]/g,c=>({'á':'a','é':'e','í':'i','ó':'o','ú':'u','ü':'u'}[c]));
// Prefer frequent words for short typing errors instead of obscure dictionary entries.
const frequent=new Set(('hola bueno buena buenos buenas fue fui fueron fuera que quien cuando donde como porque pero para por con sin sobre entre hasta desde uno una unos unas tengo tiene tienen tenia tenía tener tenemos decía decia decir dice dicen dicho hacer hace hacen hecho hay hoy ayer mañana ahora antes después siempre nunca también además entonces mucho mucha poco poca todo toda todos todas esto esta este estos estas eso esa ese esas esos algo nada cada otro otra otros otras muy más menos bien mal sí no yo vos tú el ella ellos ellas nosotros ustedes usted me te se nos le les lo la los las mi mis tu tus su sus nuestro nuestra ser estar ir ver dar saber poder querer deber poner salir llegar llevar pasar pensar hablar escribir leer tomar seguir dejar encontrar volver llamar parecer sentir mirar usar trabajar estudiar aprender entender explicar ejemplo concepto conceptos clase clases apunte apuntes texto imagen archivo documento palabra palabras función funciones límite límites número números cálculo energía teoría problema resultado importante primero segundo tercero último nuevo nueva grande pequeño parte forma tiempo día días año años vez veces vida caso cosa cosas agua mundo mejor mismo misma tanto tan así allí aquí cuánto cuanto cuál cual debe puede podemos quiero queremos necesito necesita estás está están estaba estamos soy sos es son eres era eran será serán sean siendo estábamos').split(' '));
const frequency=new Map(fs.readFileSync(path.join(__dirname,'assets','es-frequency.txt'),'utf8').trim().split(/\r?\n/).map(line=>{const [w,count]=line.split(' ');return [w,Number(count)];}));
const keyboard=['qwertyuiop','asdfghjklñ','zxcvbnm'];
function near(a,b){const pa=keyboard.map((r,y)=>[r.indexOf(a),y]).find(p=>p[0]>=0),pb=keyboard.map((r,y)=>[r.indexOf(b),y]).find(p=>p[0]>=0);return pa&&pb&&Math.abs(pa[0]-pb[0])<=1&&Math.abs(pa[1]-pb[1])<=1;}
function typingDistance(a,b){
 a=normalize(a);b=normalize(b);const d=Array.from({length:a.length+1},()=>Array(b.length+1).fill(0));
 for(let i=0;i<=a.length;i++)d[i][0]=i*.85;for(let j=0;j<=b.length;j++)d[0][j]=j*.7;
 for(let i=1;i<=a.length;i++)for(let j=1;j<=b.length;j++){
  d[i][j]=Math.min(d[i-1][j]+.85,d[i][j-1]+.7,d[i-1][j-1]+(a[i-1]===b[j-1]?0:near(a[i-1],b[j-1])?(a.length<5?.35:.8):1));
  if(i>1&&j>1&&a[i-1]===b[j-2]&&a[i-2]===b[j-1])d[i][j]=Math.min(d[i][j],d[i-2][j-2]+.55);
 }return d[a.length][b.length];
}

// Index all dictionary roots by their unaccented spelling. Inflected forms are
// still checked through nspell, so missing accents and letters can be fixed together.
const roots=new Map();
for(const line of fs.readFileSync(path.join(directory,'index.dic'),'utf8').split(/\r?\n/).slice(1)){
 const word=line.split('/')[0].split(/\s/)[0].toLowerCase();
 if(!/^[a-záéíóúüñ]{3,40}$/.test(word))continue;
 const key=normalize(word);if(!roots.has(key))roots.set(key,new Set());roots.get(key).add(word);
}
function typingCandidates(word){
 const found=new Set(dictionary.suggest(word)),base=normalize(word),alphabet='abcdefghijklmnñopqrstuvwxyz';
 const check=candidate=>{
  if(roots.has(candidate))for(const value of roots.get(candidate))found.add(value);
  if(dictionary.correct(candidate))found.add(candidate);
  else for(let i=Math.max(0,candidate.length-4);i<candidate.length;i++){
   const accent={a:'á',e:'é',i:'í',o:'ó',u:'ú'}[candidate[i]];if(!accent)continue;
   const accented=candidate.slice(0,i)+accent+candidate.slice(i+1);if(dictionary.correct(accented))found.add(accented);
  }
 };
 check(base);
 for(let i=0;i<=base.length;i++){
  if(i<base.length){
   check(base.slice(0,i)+base.slice(i+1));
   if(i+1<base.length)check(base.slice(0,i)+base[i+1]+base[i]+base.slice(i+2));
  }
  for(const letter of alphabet){
   check(base.slice(0,i)+letter+base.slice(i));
   if(i<base.length&&letter!==base[i])check(base.slice(0,i)+letter+base.slice(i+1));
  }
 }
 return [...found].filter(c=>/^[a-záéíóúüñ]{3,40}$/.test(c)&&dictionary.correct(c));
}

function preferences(dir) {
  try { return JSON.parse(fs.readFileSync(path.join(dir, 'spelling-preferences.json'), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return {}; throw error; }
}

function remember(word, dir) {
  if (typeof word !== 'string' || !/^[a-záéíóúüñ]{1,60}$/i.test(word)) throw Error('Palabra inválida');
  mergePreferences([word], dir);
}

function mergePreferences(words, dir) {
  const saved = preferences(dir);
  for (const word of words) {
    if (typeof word === 'string' && /^[a-záéíóúüñ]{1,60}$/i.test(word)) saved[word.toLowerCase()] = true;
  }
  const file = path.join(dir, 'spelling-preferences.json');
  fs.writeFileSync(file + '.tmp', JSON.stringify(saved));
  fs.renameSync(file + '.tmp', file);
}

function suggestions(words, dir) {
  const result = {};
  const saved = dir ? preferences(dir) : {};
  for (const word of [...new Set(words)].slice(0, 500)) {
    if (!/^[a-záéíóúüñ]{3,40}$/i.test(word)) continue;
    if (saved[word.toLowerCase()]) { result[word] = false; continue; }
    if (!cache.has(word)) {
      const candidates = new Set();
      if (!dictionary.correct(word)) {
        for (let index = 0; index < word.length; index++) {
          const accent = {a:'á',e:'é',i:'í',o:'ó',u:'ú'}[word[index]];
          if (!accent) continue;
          const candidate = word.slice(0,index) + accent + word.slice(index+1);
          if (dictionary.correct(candidate)) candidates.add(candidate);
        }
        for (const candidate of dictionary.suggest(word)) {
          if (normalize(candidate) === normalize(word)) candidates.add(candidate);
        }
      }
      let replacement=candidates.size===1?[...candidates][0]:null;
      if(!replacement&&!dictionary.correct(word)){
        const all=typingCandidates(word);
        const preferred=all;
        const ranked=preferred.map(candidate=>({candidate,distance:typingDistance(word,candidate),score:typingDistance(word,candidate)-.28*Math.log10(1+(frequency.get(candidate)||0))-(frequent.has(candidate)?.1:0)})).filter(c=>c.distance<=1.05).sort((a,b)=>a.score-b.score);
        if(ranked.length&&(!ranked[1]||ranked[1].score-ranked[0].score>.12))replacement=ranked[0].candidate;
      }
      cache.set(word,replacement);
    }
    result[word] = cache.get(word);
  }
  return result;
}

module.exports = { suggestions, remember, preferences, mergePreferences };
