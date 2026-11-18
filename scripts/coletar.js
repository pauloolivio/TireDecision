/**
 * Coleta dados do site e grava os arquivos-semente usados como reserva offline.
 *
 *   node scripts/coletar.js                 (medidas padrão)
 *   node scripts/coletar.js 205/55R16 195/55R16
 *   node scripts/coletar.js --todas
 */

import { obterProdutos, salvarSemente, normalizarMedida } from "../lib/scraper.js";

const PADRAO = ["205/55R16", "195/55R16", "175/65R14"];
const POPULARES = [
  "205/55R16",
  "195/55R16",
  "195/65R15",
  "185/65R15",
  "175/65R14",
  "205/60R16",
  "215/55R17",
  "225/45R17",
];

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const medidas = (
  args.length ? args : process.argv.includes("--todas") ? POPULARES : PADRAO
)
  .map((m) => normalizarMedida(m))
  .filter(Boolean);

const unicas = [...new Set(medidas)];
console.log(`Coletando ${unicas.length} medida(s)...\n`);

let sucesso = 0;
for (const medida of unicas) {
  process.stdout.write(`• ${medida} ... `);
  try {
    const { produtos, fonte } = await obterProdutos(medida, { refresh: true });
    if (!produtos.length) {
      console.log("sem produtos");
      continue;
    }
    const arquivo = await salvarSemente(medida, produtos, fonte.coletadoEm);
    sucesso += 1;
    console.log(`${produtos.length} pneus (${fonte.tipo}) -> ${arquivo.replace(process.cwd() + "\\", "")}`);
  } catch (erro) {
    console.log(`falhou: ${erro.message}`);
  }
}

console.log(`\nConcluído: ${sucesso}/${unicas.length} medida(s) com dados semente.`);
