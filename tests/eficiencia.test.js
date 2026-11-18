import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CLASSES,
  indiceEficiencia,
  infoEficiencia,
  indiceChuva,
  consumoEstimado,
  custoEnergiaPorMilKm,
  normalizarClasse,
  tabelaClasses,
} from "../public/lib/eficiencia.js";

test("classes válidas e normalização", () => {
  assert.deepEqual(CLASSES, ["A", "B", "C", "D", "E", "F", "G"]);
  assert.equal(normalizarClasse("b"), "B");
  assert.equal(normalizarClasse(" E "), "E");
  assert.equal(normalizarClasse(""), null);
  assert.equal(normalizarClasse("Z"), null);
  assert.equal(normalizarClasse(null), null);
});

test("A = 100% e B = 92% (8% por classe)", () => {
  assert.equal(indiceEficiencia("A"), 1);
  assert.equal(indiceEficiencia("B"), 0.92);
  assert.ok(Math.abs(indiceEficiencia("C") - 0.8464) < 1e-9);
  assert.ok(Math.abs(indiceEficiencia("G") - 0.606355) < 1e-6);
});

test("eficiência é estritamente decrescente de A a G", () => {
  const indices = CLASSES.map((c) => indiceEficiencia(c));
  for (let i = 1; i < indices.length; i++) {
    assert.ok(indices[i] < indices[i - 1], `${CLASSES[i]} deveria ser menor que ${CLASSES[i - 1]}`);
  }
});

test("passo configurável altera a escala", () => {
  assert.equal(indiceEficiencia("B", 0.1), 0.9);
  assert.ok(Math.abs(indiceEficiencia("C", 0.05) - 0.9025) < 1e-9);
});

test("informações da etiqueta incluem faixa de RRC", () => {
  const info = infoEficiencia("B");
  assert.equal(info.classe, "B");
  assert.equal(info.posicao, 1);
  assert.equal(info.percentual, 92);
  assert.match(info.rrcFaixa, /6,6/);
  assert.equal(infoEficiencia(null), null);
});

test("aderência na chuva: escala ordinal de A (melhor) a G (pior)", () => {
  assert.equal(indiceChuva("A"), 1);
  assert.ok(Math.abs(indiceChuva("B") - 5 / 6) < 1e-6);
  assert.equal(indiceChuva("G"), 0);
  assert.ok(indiceChuva("B") > indiceChuva("C"));
  assert.equal(indiceChuva("X"), null);
});

test("consumo e custo de energia", () => {
  assert.equal(consumoEstimado("A", { baseL100: 7 }), 7);
  const b = consumoEstimado("B", { baseL100: 7 });
  assert.ok(Math.abs(b - 7.6087) < 0.001);
  const custo = custoEnergiaPorMilKm("A", { baseL100: 7, precoLitro: 6 });
  assert.equal(custo, 420);
});

test("tabela de classes tem as 7 linhas com dados", () => {
  const linhas = tabelaClasses();
  assert.equal(linhas.length, 7);
  for (const linha of linhas) {
    assert.ok(linha.eficiencia.indice > 0);
    assert.ok(linha.chuva.indice >= 0);
    assert.ok(linha.consumo >= 7);
  }
});
