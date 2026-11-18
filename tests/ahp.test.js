import { test } from "node:test";
import assert from "node:assert/strict";
import {
  autovetorGeometrico,
  consistencia,
  resolverMatriz,
  normalizarPesos,
  normalizarColuna,
  pontuarAHP,
  matrizDePesos,
} from "../public/lib/ahp.js";

test("exemplo clássico de Saaty: pesos e CR", () => {
  // Matriz 3x3 consolidada na literatura (CR ≈ 3,3%)
  const matriz = [
    [1, 1 / 5, 1 / 3],
    [5, 1, 3],
    [3, 1 / 3, 1],
  ];
  const pesos = autovetorGeometrico(matriz);
  assert.ok(Math.abs(pesos[0] - 0.1047) < 0.001);
  assert.ok(Math.abs(pesos[1] - 0.637) < 0.001);
  assert.ok(Math.abs(pesos[2] - 0.2583) < 0.001);
  assert.ok(Math.abs(pesos.reduce((a, b) => a + b, 0) - 1) < 1e-9);

  const c = consistencia(matriz, pesos);
  assert.ok(Math.abs(c.lambdaMax - 3.0385) < 0.001);
  assert.ok(Math.abs(c.cr - 0.0332) < 0.002);
  assert.equal(c.consistente, true);
});

test("matriz 2x2 é sempre consistente", () => {
  const c = consistencia([
    [1, 3],
    [1 / 3, 1],
  ]);
  assert.equal(c.cr, 0);
  assert.equal(c.consistente, true);
});

test("matriz inconsistente é sinalizada", () => {
  const matriz = [
    [1, 9, 1 / 9],
    [1 / 9, 1, 9],
    [9, 1 / 9, 1],
  ];
  const c = consistencia(matriz);
  assert.ok(c.cr > 0.1);
  assert.equal(c.consistente, false);
});

test("completarMatriz preenche recíprocos", () => {
  const r = resolverMatriz([
    [1, 3, null],
    [null, 1, 5],
    [null, null, 1],
  ]);
  assert.equal(r.matriz[1][0], 1 / 3);
  assert.equal(r.matriz[2][1], 1 / 5);
  assert.equal(r.matriz[0][1], 3);
});

test("normalizarPesos soma 1 e trata zeros", () => {
  assert.deepEqual(
    normalizarPesos([2, 2, 0]).map((v) => Number(v.toFixed(4))),
    [0.5, 0.5, 0]
  );
  const iguais = normalizarPesos([0, 0, 0, 0]);
  assert.ok(Math.abs(iguais.reduce((a, b) => a + b, 0) - 1) < 1e-9);
});

test("normalizarColuna respeita benefício e custo", () => {
  assert.deepEqual(normalizarColuna([10, 5, 20], "beneficio"), [0.5, 0.25, 1]);
  assert.deepEqual(normalizarColuna([10, 5, 20], "custo"), [0.5, 1, 0.25]);
  assert.deepEqual(normalizarColuna([0, 0], "beneficio"), [0, 0]);
});

test("pontuarAHP soma ponderada coerente", () => {
  const itens = [
    { id: "a", nome: "A", valores: { x: 10, y: 1 } },
    { id: "b", nome: "B", valores: { x: 5, y: 2 } },
  ];
  const res = pontuarAHP(
    itens,
    [0.5, 0.5],
    [
      { id: "x", tipo: "beneficio" },
      { id: "y", tipo: "beneficio" },
    ]
  );
  // a: 0.5*1 + 0.5*0.5 = 0.75 ; b: 0.5*0.5 + 0.5*1 = 0.75
  assert.equal(res[0].score, 0.75);
  assert.equal(res[1].score, 0.75);
  assert.equal(res[0].contribuicoes.x, 0.5);
});

test("matrizDePesos gera matriz perfeitamente consistente", () => {
  const pesos = [0.4, 0.3, 0.2, 0.1];
  const m = matrizDePesos(pesos);
  const c = consistencia(m);
  assert.ok(c.cr < 1e-9);
  assert.ok(Math.abs(m[0][1] - 0.4 / 0.3) < 1e-9);
});
