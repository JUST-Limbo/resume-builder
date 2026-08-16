import { Extension } from '@tiptap/core'

/**
 * Typora 风格快捷键：Ctrl/⌘+1~6 标题，加粗/斜体沿用 StarterKit。
 */
export const ResumeShortcuts = Extension.create({
  name: 'resumeShortcuts',
  addKeyboardShortcuts() {
    return {
      'Mod-1': () => this.editor.commands.toggleHeading({ level: 1 }),
      'Mod-2': () => this.editor.commands.toggleHeading({ level: 2 }),
      'Mod-3': () => this.editor.commands.toggleHeading({ level: 3 }),
      'Mod-4': () => this.editor.commands.toggleHeading({ level: 4 }),
      'Mod-5': () => this.editor.commands.toggleHeading({ level: 5 }),
      'Mod-6': () => this.editor.commands.toggleHeading({ level: 6 }),
    }
  },
})
