// L'API renvoie les dates au format 'AAAA-MM-JJ' : on les lit comme des dates locales
// (new Date('AAAA-MM-JJ') les placerait à minuit UTC, soit la veille à l'ouest de Greenwich)
export const parseDay = (s: string) => new Date(s.slice(0, 10) + 'T00:00:00')

export const fmtDate = (s: string | null | undefined, opts?: Intl.DateTimeFormatOptions) =>
  s ? parseDay(s).toLocaleDateString('fr-FR', opts) : '—'

export const todayIso = () => new Date().toISOString().slice(0, 10)

// Suivi du retour d'une absence approuvée
export const RETURN_FR: Record<string, string> = {
  declared:      'Retour déclaré',
  to_regularize: 'Retour tardif — régularisation RH',
  closed:        'Clôturée',
}
export const REGULARIZATION_FR: Record<string, string> = {
  deduire_conge: 'Dépassement déduit du congé',
  sans_solde:    'Dépassement en sans solde',
  maladie:       'Dépassement couvert par un arrêt maladie',
  injustifiee:   'Absence injustifiée',
  historique:    'Clôture automatique (historique)',
}

// Absence approuvée commencée, sans retour enregistré
export const awaitingReturn = (r: any) =>
  r.status === 'approved' && !r.return_status && r.start_date?.slice(0, 10) < todayIso()

export const STATUS_FR: Record<string, string> = {
  draft:     'Brouillon',
  pending:   'En attente',
  approved:  'Approuvée',
  rejected:  'Rejetée',
  cancelled: 'Annulée',
}
