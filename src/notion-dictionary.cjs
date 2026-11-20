const {preferences, mergePreferences} = require('./spelling.cjs');
const {block} = require('./notion-content.cjs');
const title = 'Diccionario personal de Anotador';
const plain = parts => (parts || []).map(part => part.plain_text ?? part.text?.content ?? '').join('');

async function syncDictionary(sync) {
  const root = await sync.children(sync.state.config.parentId);
  const containers = root.filter(item => !item.archived && !item.in_trash && item.type === 'toggle' && plain(item.toggle.rich_text) === title);
  const remote = new Set();
  for (const container of containers) {
    for (const item of await sync.children(container.id)) {
      if (item.type !== 'paragraph' || item.archived || item.in_trash) continue;
      const word = plain(item.paragraph.rich_text).toLowerCase();
      if (/^[a-záéíóúüñ]{1,60}$/i.test(word)) remote.add(word);
    }
  }
  // Read the file again after network awaits so recent local choices are retained.
  mergePreferences([...remote], sync.dir);
  const missing = Object.keys(preferences(sync.dir)).filter(word => !remote.has(word));
  if (!missing.length) return;
  let target = containers[0]?.id;
  if (!target) {
    const created = await sync.request('PATCH', `/blocks/${sync.state.config.parentId}/children`, {children: [block('toggle', title)]});
    target = created.results[0].id;
  }
  // Append instead of replacing to preserve concurrent additions from other devices.
  for (let offset = 0; offset < missing.length; offset += 80) {
    await sync.request('PATCH', `/blocks/${target}/children`, {children: missing.slice(offset, offset + 80).map(word => block('paragraph', word))});
  }
}

module.exports = {syncDictionary};
