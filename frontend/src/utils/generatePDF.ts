import pdfMake from 'pdfmake/build/pdfmake'
import pdfFonts from 'pdfmake/build/vfs_fonts'

pdfMake.addVirtualFileSystem(pdfFonts)

export interface LeaveRequestPDF {
  employee_name:  string
  project_name:   string
  days_count:     number
  start_date:     string
  end_date:       string
  return_date:    string
  reason:         string
  status:         string
  manager_name:   string
  director_name:  string
  city:           string
}

export function generateLeavePDF(data: LeaveRequestPDF) {
  const today = new Date().toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'long', year: 'numeric'
  })

  const fmtDate = (d: string) => new Date(d).toLocaleDateString('fr-FR', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
  })

  const statusFr: Record<string, string> = {
    approved: 'Approuvée ✓',
    pending:  'En attente de validation',
    rejected: 'Rejetée',
  }

  const docDefinition: any = {
    pageSize: 'A4',
    pageMargins: [50, 60, 50, 60],
    defaultStyle: { font: 'Roboto', fontSize: 11, color: '#1E293B' },

    content: [
      // ── EN-TÊTE ──────────────────────────────────────────
      {
        columns: [
          {
            stack: [
              { text: 'EcoGec', style: 'logo' },
              { text: 'Système de Gestion des Congés', style: 'logoSub' },
            ]
          },
          {
            stack: [
              { text: 'DEMANDE DE CONGÉ', style: 'docTitle' },
              { text: `Réf : DCA-${Date.now().toString().slice(-6)}`, style: 'ref' },
            ],
            alignment: 'right',
          }
        ],
        marginBottom: 20,
      },

      // Ligne séparatrice
      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 495, y2: 0, lineWidth: 2, lineColor: '#0F2447' }], marginBottom: 25 },

      // ── INFORMATIONS DEMANDEUR ───────────────────────────
      { text: 'INFORMATIONS DU DEMANDEUR', style: 'sectionTitle' },
      {
        table: {
          widths: ['35%', '65%'],
          body: [
            [{ text: 'Nom et Prénom', style: 'tableLabel' }, { text: data.employee_name, style: 'tableValue' }],
            [{ text: 'Projet / Service', style: 'tableLabel' }, { text: data.project_name || '—', style: 'tableValue' }],
            [{ text: 'Superviseur', style: 'tableLabel' }, { text: data.manager_name || '—', style: 'tableValue' }],
          ]
        },
        layout: 'tableLayout',
        marginBottom: 20,
      },

      // ── DÉTAILS DU CONGÉ ─────────────────────────────────
      { text: 'DÉTAILS DE LA DEMANDE', style: 'sectionTitle' },
      {
        table: {
          widths: ['35%', '65%'],
          body: [
            [{ text: 'Nombre de jours ouvrés', style: 'tableLabel' }, { text: `${data.days_count} jour(s) ouvré(s)`, style: 'tableValueBold' }],
            [{ text: 'Date de début', style: 'tableLabel' }, { text: fmtDate(data.start_date), style: 'tableValue' }],
            [{ text: 'Date de fin', style: 'tableLabel' }, { text: fmtDate(data.end_date), style: 'tableValue' }],
            [{ text: 'Date de retour', style: 'tableLabel' }, { text: fmtDate(data.return_date), style: 'tableValueBold' }],
            [{ text: 'Motif', style: 'tableLabel' }, { text: data.reason || 'Non précisé', style: 'tableValue' }],
            [{ text: 'Statut', style: 'tableLabel' }, {
              text: statusFr[data.status] || data.status,
              style: 'tableValue',
              color: data.status === 'approved' ? '#166534' : data.status === 'rejected' ? '#991B1B' : '#854D0E',
              bold: true,
            }],
          ]
        },
        layout: 'tableLayout',
        marginBottom: 30,
      },

      // ── NOTE LÉGALE ──────────────────────────────────────
      {
        text: 'Le demandeur certifie l\'exactitude des informations ci-dessus et s\'engage à respecter les procédures en vigueur.',
        style: 'legalNote',
        marginBottom: 40,
      },

      // Ligne séparatrice
      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 495, y2: 0, lineWidth: 0.5, lineColor: '#CBD5E1' }], marginBottom: 30 },

      // ── SIGNATURES ───────────────────────────────────────
      { text: 'SIGNATURES', style: 'sectionTitle', marginBottom: 20 },
      {
        columns: [
          // Demandeur
          {
            stack: [
              { text: 'Le Demandeur', style: 'sigTitle' },
              { text: '\n\n\n', },
              { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 130, y2: 0, lineWidth: 0.5, lineColor: '#64748B' }] },
              { text: data.employee_name, style: 'sigName' },
              { text: 'Signature', style: 'sigRole' },
            ],
            width: '33%',
          },
          // Superviseur
          {
            stack: [
              { text: 'Le Superviseur', style: 'sigTitle' },
              { text: '\n\n\n', },
              { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 130, y2: 0, lineWidth: 0.5, lineColor: '#64748B' }] },
              { text: data.manager_name || '—', style: 'sigName' },
              { text: 'Manager de projet', style: 'sigRole' },
            ],
            width: '33%',
            alignment: 'center',
          },
          // Directeur
          {
            stack: [
              { text: 'Le Directeur Exécutif', style: 'sigTitle' },
              { text: '\n\n\n', },
              { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 130, y2: 0, lineWidth: 0.5, lineColor: '#64748B' }] },
              { text: data.director_name || '—', style: 'sigName' },
              { text: 'Direction Générale', style: 'sigRole' },
            ],
            width: '33%',
            alignment: 'right',
          },
        ],
        marginBottom: 40,
      },

      // ── PIED DE PAGE ─────────────────────────────────────
      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 495, y2: 0, lineWidth: 0.5, lineColor: '#CBD5E1' }], marginBottom: 10 },
      {
        columns: [
          { text: `Fait à ${data.city || 'Abidjan'}, le ${today}`, style: 'footer' },
          { text: 'EcoGec — Document officiel', style: 'footer', alignment: 'right' },
        ]
      },
    ],

    // ── STYLES ───────────────────────────────────────────────
    styles: {
      logo: {
        fontSize: 22, bold: true, color: '#0F2447', fontFamily: 'Roboto',
      },
      logoSub: {
        fontSize: 9, color: '#64748B', marginTop: 2,
      },
      docTitle: {
        fontSize: 16, bold: true, color: '#0F2447', marginTop: 8,
      },
      ref: {
        fontSize: 9, color: '#64748B', marginTop: 4,
      },
      sectionTitle: {
        fontSize: 10, bold: true, color: '#0F2447',
        background: '#F1F5F9', padding: [8, 6],
        marginBottom: 10,
        textTransform: 'uppercase',
        letterSpacing: 1,
      },
      tableLabel: {
        fontSize: 10, color: '#64748B', bold: true,
        fillColor: '#F8FAFC', margin: [8, 6, 8, 6],
      },
      tableValue: {
        fontSize: 10, color: '#1E293B', margin: [8, 6, 8, 6],
      },
      tableValueBold: {
        fontSize: 10, color: '#1E293B', bold: true, margin: [8, 6, 8, 6],
      },
      legalNote: {
        fontSize: 9, color: '#64748B', italics: true,
        alignment: 'justify', lineHeight: 1.4,
      },
      sigTitle: {
        fontSize: 10, bold: true, color: '#0F2447', marginBottom: 4,
      },
      sigName: {
        fontSize: 10, bold: true, color: '#1E293B', marginTop: 6,
      },
      sigRole: {
        fontSize: 9, color: '#64748B', marginTop: 2,
      },
      footer: {
        fontSize: 8, color: '#94A3B8',
      },
    },

    // ── TABLE LAYOUT ─────────────────────────────────────────
    tableLayouts: {
      tableLayout: {
        hLineWidth: () => 0.5,
        vLineWidth: () => 0.5,
        hLineColor: () => '#E2E8F0',
        vLineColor: () => '#E2E8F0',
        paddingLeft:   () => 0,
        paddingRight:  () => 0,
        paddingTop:    () => 0,
        paddingBottom: () => 0,
      }
    },
  }

  pdfMake.createPdf(docDefinition).download(
    `conge_${data.employee_name.replace(/\s+/g, '_')}_${data.start_date}.pdf`
  )
}

// Calcul date de retour (prochain jour ouvré après la fin)
export function calcReturnDate(endDate: string): string {
  const d = new Date(endDate)
  d.setDate(d.getDate() + 1)
  while (d.getDay() === 0 || d.getDay() === 6) {
    d.setDate(d.getDate() + 1)
  }
  return d.toISOString().slice(0, 10)
}