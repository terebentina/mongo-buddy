import { EditorView, keymap, type KeyBinding } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import { javascript } from '@codemirror/lang-javascript';
import { bracketMatching, defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { oneDark } from '@codemirror/theme-one-dark';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { openSearchPanel, search, searchKeymap } from '@codemirror/search';

export function isDarkMode(): boolean {
  return document.documentElement.classList.contains('dark');
}

export interface BaseExtensionOptions {
  extraKeymaps?: readonly KeyBinding[];
}

export function baseExtensions({ extraKeymaps = [] }: BaseExtensionOptions = {}): Extension[] {
  return [
    javascript(),
    isDarkMode() ? oneDark : syntaxHighlighting(defaultHighlightStyle),
    bracketMatching(),
    history(),
    search(),
    keymap.of([
      ...extraKeymaps,
      ...defaultKeymap,
      ...historyKeymap,
      ...searchKeymap,
      { key: 'Mod-h', run: openSearchPanel },
    ]),
    EditorView.lineWrapping,
  ];
}
