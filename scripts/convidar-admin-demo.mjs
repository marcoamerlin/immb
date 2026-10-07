// Modo de teste: cadastra o primeiro administrador no emulador local.
// Uso (com "npm run dev" rodando): node scripts/convidar-admin-demo.mjs [email]
const email = (process.argv[2] || 'admin@teste.com').toLowerCase();
const url = `http://127.0.0.1:8080/v1/projects/demo-immb/databases/(default)/documents/convites/${encodeURIComponent(email)}`;
const resp = await fetch(url, {
  method: 'PATCH',
  headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
  body: JSON.stringify({
    fields: {
      nome: { stringValue: 'Administrador' },
      email: { stringValue: email },
      papel: { stringValue: 'admin' },
      unidadeId: { nullValue: null },
      criadoEm: { stringValue: new Date().toISOString() },
    },
  }),
});
if (!resp.ok) {
  console.error('Falhou:', resp.status, await resp.text());
  process.exit(1);
}
console.log(`Pronto! Abra http://localhost:5000, toque em "Primeiro acesso" e use ${email}.`);
