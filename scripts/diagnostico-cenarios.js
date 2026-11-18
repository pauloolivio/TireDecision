/**
 * Diagnóstico: imprime pesos e consistência de todos os cenários.
 * Uso: node scripts/diagnostico-cenarios.js
 */
import { resolverMatriz } from "../public/lib/ahp.js";
import { CENARIOS, CRITERIOS, cenariosResolvidos } from "../public/lib/cenarios.js";

const resolvidos = cenariosResolvidos(resolverMatriz);

for (const c of resolvidos) {
  console.log(`\n${c.emoji} ${c.nome}  (CR = ${(c.consistencia.cr * 100).toFixed(1)}%)`);
  CRITERIOS.forEach((crit) => {
    const p = c.pesos[crit.id];
    console.log(`   ${crit.curto.padEnd(12)} ${(p * 100).toFixed(1).padStart(5)}%  ${"█".repeat(Math.round(p * 40))}`);
  });
}

// Aviso se algum cenário estiver inconsistente (CR > 10%)
const ruins = resolvidos.filter((c) => !c.consistencia.consistente);
console.log(
  `\n${ruins.length === 0 ? "OK" : "ATENÇÃO"}: ${ruins.length} cenário(s) com CR > 10%.`
);

// Soma dos pesos (deve ser 1)
for (const c of CENARIOS) {
  const { pesos } = resolverMatriz(c.matriz);
  const soma = pesos.reduce((a, b) => a + b, 0);
  if (Math.abs(soma - 1) > 1e-6) console.log(`Soma inválida em ${c.id}: ${soma}`);
}
