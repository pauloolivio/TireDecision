import { test } from "node:test";
import assert from "node:assert/strict";
import { analisar, resolverCenario, prepararAlternativas } from "../public/lib/analise.js";
import { CENARIOS } from "../public/lib/cenarios.js";

const PRODUTOS = [
  {
    id: "p1",
    marca: "MICHELIN",
    modelo: "PRIMACY 5",
    marcacao: "205/55R16 94V",
    url: "https://exemplo/1",
    preco: 559,
    eficiencia: "B",
    chuva: "A",
    ruido: 70,
    vidaUtil: 420,
    emEstoque: true,
    estoque: 50,
  },
  {
    id: "p2",
    marca: "XBRI",
    modelo: "ECOLOGY",
    marcacao: "205/55R16 91V",
    url: "https://exemplo/2",
    preco: 339,
    eficiencia: "C",
    chuva: "B",
    ruido: 70,
    vidaUtil: 420,
    emEstoque: true,
    estoque: 800,
  },
  {
    id: "p3",
    marca: "PIRELLI",
    modelo: "P400 EVO",
    marcacao: "205/55R16 91V",
    url: "https://exemplo/3",
    preco: 419,
    eficiencia: "E",
    chuva: "E",
    ruido: 73,
    vidaUtil: 0,
    emEstoque: false,
    estoque: 0,
  },
];

test("cenários resolvem pesos consistentes", () => {
  for (const cenario of CENARIOS) {
    const r = resolverCenario(cenario.id);
    const soma = Object.values(r.pesosObjeto).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(soma - 1) < 1e-5, `soma dos pesos de ${cenario.id} = ${soma}`);
    assert.ok(r.consistencia.cr <= 0.1, `CR de ${cenario.id} = ${r.consistencia.cr}`);
    assert.ok(r.pesos.length === 5);
  }
});

test("cenário de chuva prioriza aderência", () => {
  const r = resolverCenario("chuva");
  assert.ok(r.pesosObjeto.chuva > 0.45);
  assert.ok(r.pesosObjeto.chuva > r.pesosObjeto.preco);
});

test("pesos personalizados são normalizados e consistentes", () => {
  const r = resolverCenario("personalizado", {
    chuva: 4,
    eficiencia: 3,
    vida: 0,
    preco: 2,
    ruido: 1,
  });
  assert.equal(r.personalizado, true);
  assert.ok(Math.abs(r.pesosObjeto.chuva - 0.4) < 1e-6);
  assert.ok(Math.abs(r.pesosObjeto.eficiencia - 0.3) < 1e-6);
  assert.equal(r.pesosObjeto.vida, 0);
  assert.equal(r.consistencia.cr, 0);
  assert.ok(Array.isArray(r.matriz) && r.matriz.length === 5);
});

test("dados faltantes são imputados e sinalizados", () => {
  const { alternativas, qualidade } = prepararAlternativas(PRODUTOS);
  const p3 = alternativas.find((a) => a.id === "p3");
  assert.equal(p3.vidaUtil, 0);
  assert.ok(p3.vidaEfetiva > 0, "UTQG ausente deve ser imputado");
  assert.ok(p3.flags.includes("vida-estimada"));
  assert.equal(qualidade.comVida, 2);
  assert.equal(qualidade.total, 3);
});

test("ranking completo com veredito e sensibilidade", () => {
  const a = analisar(PRODUTOS, { cenarioId: "custo-beneficio" });
  assert.equal(a.ranking.length, 3);
  assert.equal(a.podio.length, 3);
  assert.ok(a.vencedor);
  assert.equal(a.ranking[0].topsisRank, 1);
  assert.ok(a.ranking[0].topsisScore >= a.ranking[1].topsisScore);
  assert.ok(a.ranking[0].ahpScore >= 0 && a.ranking[0].ahpScore <= 1);
  assert.ok(a.margem >= 0);
  assert.ok(a.justificativas.length >= 3);
  assert.equal(a.sensibilidade.length, 3);
  assert.equal(Object.keys(a.sensibilidade[0].ranks).length, CENARIOS.length);
});

test("cenário de chuva elege o pneu com classe A", () => {
  const a = analisar(PRODUTOS, { cenarioId: "chuva" });
  assert.equal(a.vencedor.id, "p1");
});

test("pesos só de preço elegem o mais barato", () => {
  const a = analisar(PRODUTOS, {
    cenarioId: "personalizado",
    pesosPersonalizados: { chuva: 0, eficiencia: 0, vida: 0, preco: 100, ruido: 0 },
  });
  assert.equal(a.vencedor.id, "p2");
});

test("conjunto vazio não quebra", () => {
  const a = analisar([], { cenarioId: "custo-beneficio" });
  assert.equal(a.ranking.length, 0);
  assert.equal(a.vencedor, null);
  assert.deepEqual(a.justificativas, []);
});

test("premissas alteram consumo e custo por km", () => {
  const base = analisar(PRODUTOS, { cenarioId: "custo-beneficio" });
  const caro = analisar(PRODUTOS, {
    cenarioId: "custo-beneficio",
    premissas: { precoLitro: 12.4 },
  });
  assert.ok(caro.ranking[0].custoTotalMilKm > base.ranking[0].custoTotalMilKm);
  assert.ok(base.ranking[0].consumo > 0);
});
