import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseMedida,
  normalizarMedida,
  medidaParaSlug,
  slugParaMedida,
  decodificarRsc,
  extrairObjeto,
  extrairInitialProducts,
  mapearProduto,
  obterProdutos,
} from "../lib/scraper.js";

test("parse de medidas em formatos comuns", () => {
  const esperado = { largura: "205", serie: "55", aro: "16" };
  assert.deepEqual(parseMedida("205/55R16"), esperado);
  assert.deepEqual(parseMedida("205/55 R16"), esperado);
  assert.deepEqual(parseMedida("205 55 R16"), esperado);
  assert.deepEqual(parseMedida("205-55-16"), esperado);
  assert.deepEqual(parseMedida("205/55/16"), esperado);
  assert.deepEqual(parseMedida("pneu 205/55r16 91v"), esperado);
  assert.equal(parseMedida(""), null);
  assert.equal(parseMedida("abc"), null);
  assert.equal(parseMedida("205/55R99"), null, "aro fora da faixa deve falhar");
});

test("normalização e conversão de slug", () => {
  assert.equal(normalizarMedida("205/55R16"), "205/55R16");
  assert.equal(normalizarMedida("205-55-16"), "205/55R16");
  assert.equal(medidaParaSlug("205/55R16"), "205-55-16");
  assert.equal(slugParaMedida("205-55-16"), "205/55R16");
  assert.equal(normalizarMedida("lixo"), null);
});

test("decodifica payload RSC em vários pedaços", () => {
  const rsc = 'a:{"x":"aspas \\" dentro","y":1}';
  const meio = Math.floor(rsc.length / 2);
  const html = `
    <script>self.__next_f.push([1,${JSON.stringify(rsc.slice(0, meio))}])</script>
    <script>self.__next_f.push([1,${JSON.stringify(rsc.slice(meio))}])</script>`;
  assert.equal(decodificarRsc(html), rsc);
});

test("extrai initialProducts do payload", () => {
  const dados = {
    total: 1,
    totalPages: 1,
    pageSize: 25,
    pageNumber: 1,
    result: [
      {
        _id: "1",
        brand: "MICHELIN",
        model: "ENERGY XM2+",
        Stock: [{ Qty: 5 }],
        prices: [
          { parcel: 0, value: 469 },
          { parcel: 1, value: 480 },
        ],
        attributes: {
          width: "205",
          series: "55",
          rim: 16,
          loadIndex: "91 (615 Kg)",
          speedIndex: "V (240km/h)",
          inmetroEfficiency: "e",
          inmetroWetBraking: "b",
          inmetroSound: 69,
          utqgDurability: 420,
        },
        Seo: { permalink: "pneu-205-55r16-91v-energy-xm2-plus-michelin" },
        inStock: true,
      },
    ],
  };
  const rsc = `7:{"initialProducts":${JSON.stringify(dados)},"outra":true}`;
  const html = `<script>self.__next_f.push([1,${JSON.stringify(rsc)}])</script>`;
  const lido = extrairInitialProducts(html);
  assert.equal(lido.total, 1);
  assert.equal(lido.result[0].brand, "MICHELIN");
});

test("extrairObjeto respeita strings e chaves aninhadas", () => {
  const texto = 'lixo{"a":{"b":"}"},"c":1}resto';
  const obj = extrairObjeto(texto, texto.indexOf("{"));
  assert.equal(obj, '{"a":{"b":"}"},"c":1}');
});

test("HTML sem payload retorna null", () => {
  assert.equal(extrairInitialProducts("<html><body>nada</body></html>"), null);
});

test("mapearProduto normaliza os campos", () => {
  const p = mapearProduto({
    _id: "abc",
    brand: "MICHELIN",
    model: "ENERGY XM2+",
    Stock: [{ Qty: 3 }, { Qty: 7 }],
    prices: [
      { parcel: 1, value: 480 },
      { parcel: 0, value: 469 },
    ],
    attributes: {
      width: "205",
      series: "55",
      rim: 16,
      loadIndex: "91 (615 Kg)",
      speedIndex: "V (240km/h)",
      inmetroEfficiency: "e",
      inmetroWetBraking: "b",
      inmetroSound: 69,
      utqgDurability: 420,
    },
    Seo: { permalink: "pneu-teste" },
    inStock: true,
  });
  assert.equal(p.marcacao, "205/55R16 91V");
  assert.equal(p.preco, 469);
  assert.equal(p.eficiencia, "E");
  assert.equal(p.chuva, "B");
  assert.equal(p.ruido, 69);
  assert.equal(p.vidaUtil, 420);
  assert.equal(p.estoque, 10);
  assert.equal(p.emEstoque, true);
  assert.equal(p.url, "https://www.pneufree.com.br/pneu/pneu-teste");
});

test("produto sem estoque é marcado", () => {
  const p = mapearProduto({
    _id: "x",
    brand: "A",
    model: "B",
    Stock: [{ Qty: 0 }],
    prices: [{ parcel: 0, value: 100 }],
    attributes: { width: "205", series: "55", rim: 16 },
    inStock: true,
  });
  assert.equal(p.emEstoque, false);
});

test("medida inexistente cai para semente ou erro claro", async () => {
  await assert.rejects(
    () => obterProdutos("999/99R99", { refresh: true, permitirSemente: false }),
    (erro) => erro.codigo === "MEDIDA_INVALIDA"
  );
});

test("coleta ao vivo do site", { skip: process.env.TD_LIVE !== "1" }, async () => {
  const { produtos, fonte } = await obterProdutos("205/55R16", { refresh: true });
  assert.ok(produtos.length >= 10, `esperava 10+ pneus, veio ${produtos.length}`);
  assert.ok(["site", "cache"].includes(fonte.tipo));
  const comEtiqueta = produtos.filter((p) => p.eficiencia && p.chuva && p.ruido);
  assert.ok(comEtiqueta.length >= produtos.length * 0.8, "maioria deve ter etiqueta INMETRO");
  assert.ok(produtos.every((p) => p.preco > 0));
});
