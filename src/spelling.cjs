const fs = require('node:fs');
const path = require('node:path');
const nspell = require('nspell');
const directory = path.dirname(require.resolve('dictionary-es'));
const dictionary = nspell(fs.readFileSync(path.join(directory, 'index.aff')), fs.readFileSync(path.join(directory, 'index.dic')));
const cache = new Map();

function suggestions(words) {
  const result = {};
  for (const word of [...new Set(words)].slice(0, 500)) {
    if (!/^[a-záéíóúüñ]{3,40}$/i.test(word)) continue;
    if (!cache.has(word)) {
      cache.set(word, dictionary.correct(word) ? null : dictionary.suggest(word)[0] || null);
    }
    result[word] = cache.get(word);
  }
  return result;
}

module.exports = { suggestions };
