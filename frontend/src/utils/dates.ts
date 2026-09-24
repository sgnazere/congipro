// L'API renvoie les dates au format 'AAAA-MM-JJ' : on les lit comme des dates locales
// (new Date('AAAA-MM-JJ') les placerait à minuit UTC, soit la veille à l'ouest de Greenwich)
export const parseDay = (s: string) => new Date(s.slice(0, 10) + 'T00:00:00')

export const fmtDate = (s: string | null | undefined, opts?: Intl.DateTimeFormatOptions) =>
  s ? parseDay(s).toLocaleDateString('fr-FR', opts) : '—'

export const STATUS_FR: Record<string, string> = {
  draft:     'Brouillon',
  pending:   'En attente',
  approved:  'Approuvée',
  rejected:  'Rejetée',
  cancelled: 'Annulée',
}
