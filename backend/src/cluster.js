// ════════════════════════════════════════════════════════════
//  Démarrage multi-processus (un processus Node par cœur, 4 au plus par défaut)
//  WEB_CONCURRENCY=n pour fixer le nombre. Les relances ne tournent que dans
//  le processus 0 (verrou PostgreSQL en plus). Un processus qui tombe est relancé.
//  Les limites anti-abus sont comptées par processus (mémoire locale).
// ════════════════════════════════════════════════════════════
const cluster = require('cluster');
const os = require('os');

if (cluster.isPrimary) {
  const n = parseInt(process.env.WEB_CONCURRENCY) || Math.min(4, os.cpus().length);
  console.log(`⟡ EcoGec : démarrage de ${n} processus`);
  const fork = (i) => cluster.fork({ NODE_APP_INSTANCE: String(i) }).on('exit', (code) => {
    console.error(`Processus ${i} arrêté (code ${code}) : relance`);
    setTimeout(() => fork(i), 1000);
  });
  for (let i = 0; i < n; i++) fork(i);
} else {
  require('./app').startServer();
}
