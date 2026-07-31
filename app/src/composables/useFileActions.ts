// Actions fichier de haut niveau : relient io/file au store (load / markSaved) et transforment
// les erreurs de validation en message utilisateur. Partagé par StatusChip et les raccourcis
// clavier (⌘O / ⌘S / ⌘⇧S) pour une seule implémentation.
import { useProjectStore } from '@/stores/project'
import { openProject, saveProject, saveProjectAs, ProjectFileError } from '@/io/file'

export interface FileActions {
  newProject: () => void
  open: () => Promise<void>
  save: () => Promise<boolean>
  saveAs: () => Promise<boolean>
}

export function useFileActions(): FileActions {
  const project = useProjectStore()

  /** Repart d'un projet vide (avertit si des modifications ne sont pas sauvegardées). */
  function newProject(): void {
    if (
      project.dirty &&
      !window.confirm('Des modifications ne sont pas sauvegardées. Créer un nouveau projet ?')
    ) {
      return
    }
    project.reset()
  }

  async function open(): Promise<void> {
    // Avertit avant d'écraser un projet non sauvegardé (le pipeline de validation, lui, est
    // dans io/file : taille → parse → migrate → zod → invariants).
    if (project.dirty && !window.confirm('Des modifications ne sont pas sauvegardées. Ouvrir un autre projet ?')) {
      return
    }
    try {
      const res = await openProject()
      if (res) project.load(res.doc)
    } catch (err) {
      window.alert(err instanceof ProjectFileError ? err.message : "Ouverture impossible : fichier illisible.")
    }
  }

  async function save(): Promise<boolean> {
    const ok = await saveProject(project.serialize())
    if (ok) project.markSaved()
    return ok
  }

  async function saveAs(): Promise<boolean> {
    const ok = await saveProjectAs(project.serialize())
    if (ok) project.markSaved()
    return ok
  }

  return { newProject, open, save, saveAs }
}
