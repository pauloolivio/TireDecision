/**
 * CLI de análise — útil para testar sem abrir a interface.
 *
 *   node scripts/analisar.js 205/55R16
 *   node scripts/analisar.js 205/55R16 chuva
 *   node scripts/analisar.js 205/55R16 custo-beneficio --refresh
 */

import { obterProdutos } from "../lib/scraper.js";
import { analisar, reais } from "../public/lib/analise.js";
import { CENARIOS } from "../public/lib/cenarios.js";

const args = process.argv.slice(2);
const medida = args[0] || "205/55R16";
const cenarioId = args.find((a) => CENARIOS.some((c) => c.id === a)) || "custo-beneficio";
const refresh = args.includes("--refresh");

const dados = await obterProdutos(medida, { refresh });
const resultado = analisar(dados.produtos, { cenarioId });

console.log(`\nMedida ${dados.medida} — ${dados.produtos.length} pneus`);
console.log(`Fonte: ${dados.fonte.tipo} (coleta: ${dados.fonte.coletadoEm})`);
if (dados.fonte.aviso) console.log(`Aviso: ${dados.fonte.aviso}`);
console.log(
  `Cenário: ${resultado.cenario.nome} | CR ${(resultado.cenario.consistencia.cr * 100).toFixed(1)}%`
);
console.log(
  "Pesos: " +
    Object.entries(resultado.cenario.pesosObjeto)
      .map(([k, v]) => `${k} ${(v * 100).toFixed(0)}%`)
      .join(" | ")
);

const pct = (n) => `${(n * 100).toFixed(1)}%`;
console.log("\n#   Modelo                                    AHP    TOPSIS  Preço      R$/1000km  Ef  Chuva");
console.log("-".repeat(104));
for (const r of resultado.ranking) {
  console.log(
    [
      String(r.topsisRank).padStart(2),
      r.nome.padEnd(40).slice(0, 40),
      pct(r.ahpScore).padStart(6),
      pct(r.topsisScore).padStart(7),
      reais(r.preco).padStart(10),
      reais(r.custoTotalMilKm).padStart(10),
      ` ${r.eficiencia ?? "-"} `,
      ` ${r.chuva ?? "-"} `,
    ].join("  ")
  );
}

console.log(`\nVENCEDOR: ${resultado.vencedor.nome} (${resultado.vencedor.marcacao})`);
console.log(
  `Margem sobre o 2º (${resultado.segundo?.nome}): ${(resultado.margem * 100).toFixed(1)} p.p.`
);
console.log(`AHP concorda com o TOPSIS no 1º lugar: ${resultado.concordancia ? "sim" : "não"}`);
console.log("\nJustificativas:");
for (const j of resultado.justificativas) console.log(`  ${j.icone} ${j.texto}`);
