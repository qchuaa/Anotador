const fs = require('node:fs');
const path = require('node:path');
const nspell = require('nspell');
const directory = path.dirname(require.resolve('dictionary-es'));
const dictionary = nspell(fs.readFileSync(path.join(directory, 'index.aff')), fs.readFileSync(path.join(directory, 'index.dic')));
const cache = new Map();
const normalize = word => word.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

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
      cache.set(word, candidates.size === 1 ? [...candidates][0] : null);
    }
    result[word] = cache.get(word);
  }
  return result;
}

module.exports = { suggestions, remember, preferences, mergePreferences };
