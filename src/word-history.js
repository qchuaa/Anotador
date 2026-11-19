let activeHistory;

function installWordHistory(editor) {
  const history = {editor, undo: [], redo: [], group: null};
  activeHistory = history;
  editor.addEventListener('beforeinput', event => {
    if (event.inputType === 'historyUndo' || event.inputType === 'historyRedo') {
      event.preventDefault();
      editorUndo(event.inputType === 'historyRedo');
      return;
    }
    const typing = event.inputType === 'insertText' && event.data;
    const kind = typing ? (/\s/.test(event.data) ? 'space' : 'word') : event.inputType;
    if (!typing || (kind === 'word' && history.group !== 'word') || !getSelection().isCollapsed) {
      history.undo.push(editorSnapshot(editor));
      if (history.undo.length > 300) history.undo.shift();
    }
    history.group = kind;
    history.redo.length = 0;
  });
  editor.addEventListener('pointerdown', () => { history.group = null; });
  editor.addEventListener('keydown', event => {
    if (event.ctrlKey && !event.altKey && ['z', 'y'].includes(event.key.toLowerCase())) {
      event.preventDefault();
      editorUndo(event.key.toLowerCase() === 'y' || event.shiftKey);
    }
    if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key)) history.group = null;
  });
}

function editorSnapshot(editor) {
  const selection = getSelection();
  let node = selection.anchorNode;
  const path = [];
  if (!editor.contains(node)) return {html: editor.innerHTML};
  while (node !== editor) {
    path.unshift(Array.prototype.indexOf.call(node.parentNode.childNodes, node));
    node = node.parentNode;
  }
  return {html: editor.innerHTML, path, offset: selection.anchorOffset};
}

function editorUndo(redo = false) {
  const history = activeHistory;
  if (!history?.editor.isConnected) return;
  const source = redo ? history.redo : history.undo;
  const target = redo ? history.undo : history.redo;
  if (!source.length) return;
  clearTimeout(window.correctTimer);
  target.push(editorSnapshot(history.editor));
  let snapshot = source.pop();
  history.editor.innerHTML = snapshot.html;
  history.editor.focus({preventScroll:true});
  let node = history.editor;
  for (const index of snapshot.path || []) node = node.childNodes[index] || node;
  const range = document.createRange();
  range.setStart(node, Math.min(snapshot.offset || 0, node.nodeType === 3 ? node.length : node.childNodes.length));
  range.collapse(true);
  getSelection().removeAllRanges();
  getSelection().addRange(range);
  history.group = null;
  capture();
}
