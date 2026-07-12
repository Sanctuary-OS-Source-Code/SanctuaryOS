import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export const IconPlugin = Extension.create({
  name: 'iconPlugin',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('iconPlugin'),
        state: {
          init(_, { doc }) {
            return getDecorations(doc);
          },
          apply(tr, oldState) {
            return tr.docChanged ? getDecorations(tr.doc) : oldState;
          },
        },
        props: {
          decorations(state) {
            return this.getState(state);
          },
          handleKeyDown(view, event) {
            const { state } = view;
            const { selection, doc } = state;
            if (!selection.empty) return false;
            
            const pos = selection.from;
            const $pos = doc.resolve(pos);
            const parent = $pos.parent;
            
            const textBefore = parent.textBetween(Math.max(0, $pos.parentOffset - 50), $pos.parentOffset, null, '\ufffc');
            const textAfter = parent.textBetween($pos.parentOffset, Math.min(parent.nodeSize - 2, $pos.parentOffset + 50), null, '\ufffc');
            
            if (event.key === 'Backspace') {
              const match = textBefore.match(/\[ICON:[a-zA-Z0-9_]+\]$/);
              if (match) {
                const tr = state.tr;
                tr.delete(pos - match[0].length, pos);
                view.dispatch(tr);
                return true;
              }
              const insideMatch = textBefore.match(/\[ICON:[a-zA-Z0-9_]+$/);
              if (insideMatch) {
                const restMatch = textAfter.match(/^.*?\]/);
                if (restMatch) {
                  const tr = state.tr;
                  tr.delete(pos - insideMatch[0].length, pos + restMatch[0].length);
                  view.dispatch(tr);
                  return true;
                }
              }
            }
            if (event.key === 'Delete') {
              const match = textAfter.match(/^\[ICON:[a-zA-Z0-9_]+\]/);
              if (match) {
                const tr = state.tr;
                tr.delete(pos, pos + match[0].length);
                view.dispatch(tr);
                return true;
              }
            }
            if (event.key === 'ArrowLeft') {
              const match = textBefore.match(/\[ICON:[a-zA-Z0-9_]+\]$/);
              if (match) {
                const tr = state.tr;
                tr.setSelection(TextSelection.create(doc, pos - match[0].length));
                view.dispatch(tr);
                return true;
              }
              const insideMatch = textBefore.match(/\[ICON:[a-zA-Z0-9_]+$/);
              if (insideMatch) {
                const restMatch = textAfter.match(/^.*?\]/);
                if (restMatch) {
                  const tr = state.tr;
                  tr.setSelection(TextSelection.create(doc, pos - insideMatch[0].length));
                  view.dispatch(tr);
                  return true;
                }
              }
            }
            if (event.key === 'ArrowRight') {
              const match = textAfter.match(/^\[ICON:[a-zA-Z0-9_]+\]/);
              if (match) {
                const tr = state.tr;
                tr.setSelection(TextSelection.create(doc, pos + match[0].length));
                view.dispatch(tr);
                return true;
              }
              const insideMatch = textBefore.match(/\[ICON:[a-zA-Z0-9_]+$/);
              if (insideMatch) {
                const restMatch = textAfter.match(/^.*?\]/);
                if (restMatch) {
                  const tr = state.tr;
                  tr.setSelection(TextSelection.create(doc, pos + restMatch[0].length));
                  view.dispatch(tr);
                  return true;
                }
              }
            }
            return false;
          }
        },
      }),
    ];
  },
});

function getDecorations(doc: any) {
  const decorations: Decoration[] = [];
  const regex = /\[ICON:([a-zA-Z0-9_]+)\]/g;

  doc.descendants((node: any, pos: number) => {
    if (!node.isText) {
      return;
    }

    const text = node.text;
    let match;

    while ((match = regex.exec(text)) !== null) {
      const iconName = match[1];
      const start = pos + match.index;
      const end = start + match[0].length;

      decorations.push(
        Decoration.inline(start, end, {
          nodeName: 'span',
          style: 'font-size: 0; color: transparent; user-select: none;', 
          class: 'icon-tag-hidden',
        })
      );
      
      decorations.push(
        Decoration.widget(end, () => {
          const iconSpan = document.createElement('span');
          iconSpan.className = 'material-symbols-outlined !text-[1.3rem] theme-text-accent mx-0.5 select-none pointer-events-none inline-block';
          iconSpan.innerText = iconName;
          iconSpan.style.transform = 'translateY(4px)';
          return iconSpan;
        }, { side: 1 })
      );
    }
  });

  return DecorationSet.create(doc, decorations);
}
