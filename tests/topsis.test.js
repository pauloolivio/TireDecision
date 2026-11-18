import { test } from "node:test";
import assert from "node:assert/strict";
import { calcularTOPSIS, ordenarComRanking } from "../public/lib/topsis.js";

const BENEFICIO = [
  { id: "x", tipo: "beneficio" },
  { id: "y", tipo: "beneficio" },
];

test("exemplo 2x2 calculado à mão", () => {
  // x = [[1,2],[3,2]], pesos 0,5/0,5, ambos benefício.
  // A alternativa 2 domina no critério x e empata em y -> C = 1.
  const itens = [
    { id: "a", nome: "A", valores: { x: 1, y: 2 } },
    { id: "b", nome: "B", valores: { x: 3, y: 2 } },
  ];
  const res = calcularTOPSIS(itens, [0.5, 0.5], BENEFICIO);
  const a = res.find((r) => r.id === "a");
  const b = res.find((r) => r.id === "b");

  assert.ok(Math.abs(a.sMais - 0.3162) < 0.001);
  assert.ok(Math.abs(a.sMenos - 0) < 1e-6);
  assert.equal(a.score, 0);

  assert.ok(Math.abs(b.sMais - 0) < 1e-6);
  assert.ok(Math.abs(b.sMenos - 0.3162) < 0.001);
  assert.equal(b.score, 1);
  assert.equal(b.ranking, 1);
});

test("alternativas idênticas ficam neutras", () => {
  const itens = [
    { id: "a", nome: "A", valores: { x: 5, y: 5 } },
    { id: "b", nome: "B", valores: { x: 5, y: 5 } },
  ];
  const res = calcularTOPSIS(itens, [0.5, 0.5], BENEFICIO);
  for (const r of res) assert.equal(r.score, 0.5);
});

test("critério de custo inverte a preferência", () => {
  const criterios = [{ id: "preco", tipo: "custo" }];
  const itens = [
    { id: "caro", nome: "Caro", valores: { preco: 500 } },
    { id: "barato", nome: "Barato", valores: { preco: 300 } },
  ];
  const res = calcularTOPSIS(itens, [1], criterios);
  assert.equal(res[0].id, "barato");
  assert.equal(res[0].score, 1);
  assert.equal(res[1].score, 0);
});

test("uma única alternativa recebe score 1", () => {
  const res = calcularTOPSIS([{ id: "a", nome: "A", valores: { x: 1, y: 1 } }], [0.5, 0.5], BENEFICIO);
  assert.equal(res.length, 1);
  assert.equal(res[0].score, 1);
  assert.equal(res[0].ranking, 1);
});

test("peso zero anula o critério", () => {
  const itens = [
    { id: "a", nome: "A", valores: { x: 100, y: 1 } },
    { id: "b", nome: "B", valores: { x: 1, y: 2 } },
  ];
  const res = calcularTOPSIS(itens, [0, 1], BENEFICIO);
  assert.equal(res[0].id, "b");
  assert.equal(res[0].score, 1);
});

test("scores sempre no intervalo [0,1] e ranking coerente", () => {
  const itens = Array.from({ length: 6 }, (_, i) => ({
    id: `i${i}`,
    nome: `Item ${i}`,
    valores: { a: (i * 37) % 11, b: 100 - i * 7, c: i + 1 },
  }));
  const criterios = [
    { id: "a", tipo: "beneficio" },
    { id: "b", tipo: "custo" },
    { id: "c", tipo: "beneficio" },
  ];
  const res = calcularTOPSIS(itens, [0.4, 0.35, 0.25], criterios);
  assert.equal(res.length, 6);
  for (let i = 1; i < res.length; i++) {
    assert.ok(res[i].score <= res[i - 1].score);
    assert.ok(res[i].score >= 0 && res[i].score <= 1);
    assert.ok(res[i].ranking >= res[i - 1].ranking);
  }
});

test("ordenarComRanking dá empates na mesma posição", () => {
  const ordenado = ordenarComRanking([
    { nome: "A", score: 0.8 },
    { nome: "B", score: 0.8 },
    { nome: "C", score: 0.5 },
  ]);
  assert.deepEqual(
    ordenado.map((o) => o.ranking),
    [1, 1, 3]
  );
});
