/**
 * Testa a função serverless da Vercel com objetos req/res simulados.
 * Também cobre o modo "somente cache/semente" (ALLOW_SCRAPE=0), útil para
 * uma instância pública que não deve bater no site.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import handler from "../api/[...rota].js";

function criarResposta() {
  return {
    statusCode: 0,
    headers: {},
    corpo: "",
    headersSent: false,
    writeHead(status, headers) {
      this.statusCode = status;
      this.headers = headers || {};
      this.headersSent = true;
    },
    end(pedaco) {
      if (pedaco) this.corpo += pedaco;
    },
  };
}

async function chamar(url) {
  const req = {
    url,
    method: "GET",
    headers: { host: "localhost" },
    socket: { remoteAddress: "127.0.0.1" },
  };
  const res = criarResposta();
  await handler(req, res);
  let json = null;
  try {
    json = JSON.parse(res.corpo);
  } catch {
    /* resposta não-JSON */
  }
  return { status: res.statusCode, headers: res.headers, json };
}

test("/api/status responde com versão e cenários", async () => {
  const { status, json } = await chamar("/api/status");
  assert.equal(status, 200);
  assert.equal(json.ok, true);
  assert.equal(json.versao, "1.0.0");
  assert.equal(json.cenarios.length, 6);
  assert.equal(typeof json.coletaAoVivo, "boolean");
});

test("/api/medidas lista medidas", async () => {
  const { status, json } = await chamar("/api/medidas");
  assert.equal(status, 200);
  assert.ok(json.medidas.includes("205/55R16"));
});

test("rota desconhecida retorna 404", async () => {
  const { status, json } = await chamar("/api/inexistente");
  assert.equal(status, 404);
  assert.match(json.erro, /não encontrada/i);
});

test("medida inválida retorna 400", async () => {
  const { status, json } = await chamar("/api/pneus?medida=abc");
  assert.equal(status, 400);
  assert.match(json.erro, /inválido/i);
});

test("modo ALLOW_SCRAPE=0 serve semente sem acessar o site", async (t) => {
  const anterior = process.env.ALLOW_SCRAPE;
  process.env.ALLOW_SCRAPE = "0";
  t.after(() => {
    if (anterior === undefined) delete process.env.ALLOW_SCRAPE;
    else process.env.ALLOW_SCRAPE = anterior;
  });

  const { status, json } = await chamar("/api/pneus?medida=205/55R16&refresh=1");
  assert.equal(status, 200);
  assert.ok(json.total >= 5, `esperava pneus da semente, veio ${json.total}`);
  assert.ok(["semente", "cache", "cache-expirado"].includes(json.fonte.tipo));
  assert.ok(json.fonte.aviso, "deve avisar que a coleta está desativada");
  assert.ok(json.marcacoes.length >= 1);

  const analise = await chamar("/api/analise?medida=205/55R16&cenario=chuva");
  assert.equal(analise.status, 200);
  assert.ok(analise.json.vencedor);
  assert.equal(analise.json.ranking.length, json.produtos.length);
});
