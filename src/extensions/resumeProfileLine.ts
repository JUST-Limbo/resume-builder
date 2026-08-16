import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'

const pluginKey = new PluginKey<DecorationSet>('resumeProfileLine')

/**
 * 与 markdown.ts 一致：首个 h1 之后、遇到第一个 h2 之前的顶层块，
 * 加上 resume-profile-line，使模板 Custom CSS（如 font-size: 0.9em）在效果区生效，
 * 避免简介段字号偏大、整页累计偏高、页末比打印更早断页。
 */
const buildProfileDecorations = (doc: ProseMirrorNode) => {
  const decorations: ReturnType<typeof Decoration.node>[] = []
  let marking = false

  doc.forEach((node, pos) => {
    if (node.type.name === 'heading') {
      const level = node.attrs.level
      if (level === 1) {
        marking = true
        return
      }
      if (level === 2 && marking) {
        marking = false
        return
      }
    }

    if (!marking) return
    decorations.push(
      Decoration.node(pos, pos + node.nodeSize, {
        class: 'resume-profile-line',
      }),
    )
  })

  return DecorationSet.create(doc, decorations)
}

export const ResumeProfileLine = Extension.create({
  name: 'resumeProfileLine',

  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: pluginKey,
        state: {
          init: (_, state) => buildProfileDecorations(state.doc),
          apply(tr, old) {
            if (!tr.docChanged) return old
            return buildProfileDecorations(tr.doc)
          },
        },
        props: {
          decorations(state) {
            return pluginKey.getState(state) || DecorationSet.empty
          },
        },
      }),
    ]
  },
})
