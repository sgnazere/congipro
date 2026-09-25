// ════════════════════════════════════════════════════════════
//  Tâche planifiée : relances de retour de congé
//  Un passage puis sortie. À lancer toutes les heures (cron, Planificateur
//  de tâches Windows) avec REMINDERS_IN_API=false dans l'API.
//  Un verrou PostgreSQL empêche deux passages simultanés.
// ════════════════════════════════════════════════════════════

const { runReturnReminders, pool } = require('../app');

runReturnReminders()
  .then(n => console.log(`${new Date().toISOString()} — ${n} relance(s) de retour envoyée(s)`))
  .catch(err => { console.error('Relances retour :', err.message); process.exitCode = 1; })
  .finally(() => pool.end());
