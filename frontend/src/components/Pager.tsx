// Barre de pagination commune
export function Pager({ page, total, limit, onPage }: { page: number, total: number, limit: number, onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / limit))
  if (pages <= 1) return null
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginTop: 12, fontSize: '.8rem' }}>
      <button className="btn btn-sm btn-outline" disabled={page <= 1} onClick={() => onPage(page - 1)}>◀ Précédent</button>
      <span style={{ color: 'var(--muted)' }}>Page {page} / {pages} · {total} élément(s)</span>
      <button className="btn btn-sm btn-outline" disabled={page >= pages} onClick={() => onPage(page + 1)}>Suivant ▶</button>
    </div>
  )
}
