// Contenu riche d'une fonctionnalité : document ProseMirror/Tiptap sérialisé en JSON. Le modèle
// reste SANS dépendance à Tiptap (types structurels seulement) ; le rendu/édition vit dans les
// composants (RichContent.vue / RichEditor.vue). Helpers de construction (migration v3→v4) et
// d'extraction de texte brut (export Markdown, recherche, complétude).

/** Nœud d'un document riche (paragraphe, titre, texte, saut, liste…). */
export interface RichNode {
  type: string
  text?: string
  attrs?: Record<string, unknown>
  content?: RichNode[]
  marks?: unknown[]
  [k: string]: unknown
}

/** Document riche racine (`type: 'doc'`). */
export interface RichDoc {
  type: string
  content?: RichNode[]
  [k: string]: unknown
}

/** Document vide (aucun contenu). */
export const EMPTY_DOC: RichDoc = { type: 'doc', content: [] }

/** Vrai si le document n'a aucun texte exploitable. */
export function isEmptyDoc(doc: RichDoc | null | undefined): boolean {
  if (!doc || !Array.isArray(doc.content) || doc.content.length === 0) return true
  return docToPlainText(doc).trim() === ''
}

/** Extrait le texte brut d'un document riche (blocs séparés par des sauts de ligne). */
export function docToPlainText(doc: RichDoc | null | undefined): string {
  if (!doc || !Array.isArray(doc.content)) return ''
  const out: string[] = []
  const walk = (n: RichNode): void => {
    if (typeof n.text === 'string') out.push(n.text)
    if (n.type === 'hardBreak') out.push('\n')
    if (Array.isArray(n.content)) n.content.forEach(walk)
    if (n.type === 'paragraph' || n.type === 'heading' || n.type === 'listItem') out.push('\n')
  }
  doc.content.forEach(walk)
  return out.join('').replace(/\n{3,}/g, '\n\n').trim()
}

/** Texte inline d'un nœud, marks Markdown appliqués (gras/italique/code). */
function inlineToMarkdown(node: RichNode): string {
  if (node.type === 'hardBreak') return '\n'
  let t = node.text ?? ''
  if (Array.isArray(node.marks)) {
    for (const m of node.marks as { type?: string }[]) {
      if (m.type === 'bold') t = `**${t}**`
      else if (m.type === 'italic') t = `*${t}*`
      else if (m.type === 'code') t = `\`${t}\``
    }
  }
  return t
}
function childrenToMarkdown(node: RichNode): string {
  return (node.content ?? []).map(inlineToMarkdown).join('')
}

/** Sérialise un document riche en Markdown (titres, paragraphes, listes, citations, code, marks). */
export function docToMarkdown(doc: RichDoc | null | undefined): string {
  if (!doc || !Array.isArray(doc.content)) return ''
  const lines: string[] = []
  const listItems = (list: RichNode, bullet: (i: number) => string): void => {
    ;(list.content ?? []).forEach((li, i) => {
      const text = (li.content ?? []).map(childrenToMarkdown).join(' ').trim()
      lines.push(`${bullet(i)}${text}`)
    })
    lines.push('')
  }
  for (const n of doc.content) {
    switch (n.type) {
      case 'heading':
        lines.push(`${'#'.repeat(Number(n.attrs?.level ?? 3))} ${childrenToMarkdown(n)}`, '')
        break
      case 'paragraph':
        lines.push(childrenToMarkdown(n), '')
        break
      case 'bulletList':
        listItems(n, () => '- ')
        break
      case 'orderedList':
        listItems(n, (i) => `${i + 1}. `)
        break
      case 'blockquote':
        ;(n.content ?? []).forEach((p) => lines.push(`> ${childrenToMarkdown(p)}`))
        lines.push('')
        break
      case 'codeBlock':
        lines.push('```', childrenToMarkdown(n), '```', '')
        break
      default:
        lines.push(childrenToMarkdown(n))
    }
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

/** Découpe un texte multi-lignes en nœuds inline (lignes séparées par des sauts durs). */
function inlineFromText(block: string): RichNode[] {
  const lines = block.split('\n')
  const nodes: RichNode[] = []
  lines.forEach((line, i) => {
    if (line) nodes.push({ type: 'text', text: line })
    if (i < lines.length - 1) nodes.push({ type: 'hardBreak' })
  })
  return nodes
}

/** Découpe un texte en paragraphes (blocs séparés par une ligne vide). */
function paragraphsFromText(text: string): RichNode[] {
  return text
    .split(/\n{2,}/)
    .map((block) => ({ type: 'paragraph', content: inlineFromText(block) }))
    .filter((p) => p.content.length > 0)
}

/** Titre de section niveau 3. */
function heading(text: string): RichNode {
  return { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text }] }
}

/**
 * Fusionne les anciens champs (Quoi / Implique / À confirmer / Notes) en UN document riche unique :
 * le « Quoi » ouvre le document (sans titre), les autres deviennent des sections titrées. Utilisé par
 * la migration v3→v4.
 */
export function mergeFeatureFields(fields: {
  description?: string
  implies?: string
  toConfirm?: string
  notes?: string
}): RichDoc {
  const content: RichNode[] = []
  if (fields.description?.trim()) content.push(...paragraphsFromText(fields.description))
  const section = (title: string, text?: string): void => {
    if (!text?.trim()) return
    content.push(heading(title))
    content.push(...paragraphsFromText(text))
  }
  section('Implique', fields.implies)
  section('À confirmer', fields.toConfirm)
  section('Notes', fields.notes)
  return { type: 'doc', content }
}
