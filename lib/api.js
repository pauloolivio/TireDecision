/**
 * Camada de API compartilhada entre o servidor local (server.js) e a função
 * serverless da Vercel (api/[...rota].js).
 *
 * Não conhece nada de arquivos estáticos: recebe a URL já parseada e responde
 * JSON. Assim o mesmo código roda em um processo Node persistente ou em uma
 * função efêmera.
 */

import { obterProdutos, listarMedidas, normalizarMedida, TTL_CACHE_MS } from "./scraper.js";
import { analisar } from "../public/lib/analise.js";
import { CENARIOS } from "../public/lib/cenarios.js";

export const VERSAO = "1.0.0";
const INICIADO_EM = new Date();

/* ---------------------------------------------------------------- limite */
/**
 * Limite simples por IP (por instância). Protege o site de origem e o host
 * contra abuso. `RATE_LIMIT=0` desativa; padrão: 120 req/min.
 */
const LIMITE_POR_MINUTO = Number(process.env.RATE_LIMIT ?? 120);
const acessos = new Map();

function excedeuLimite(req) {
  if (!LIMITE_POR_MINUTO || LIMITE_POR_MINUTO <= 0) return false;
  const encaminhado = req?.headers?.["x-forwarded-for"];
  const ip = String(encaminhado ? encaminhado.split(",")[0].trim() : req?.socket?.remoteAddress || "local");
  const agora = Date.now();
  const janela = (acessos.get(ip) || []).filter((t) => agora - t < 60000);
  janela.push(agora);
  acessos.set(ip, janela);

  if (acessos.size > 1000) {
    for (const [chave, marcas] of acessos) {
      if (!marcas.length || agora - marcas[marcas.length - 1] > 60000) acessos.delete(chave);
    }
  }
  return janela.length > LIMITE_POR_MINUTO;
}

/* ----------------------------------------------------------------- JSON */
export function responderJson(resposta, status, dados, cabecalhos = {}) {
  const corpo = JSON.stringify(dados, null, 2);
  resposta.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(corpo),
    ...cabecalhos,
  });
  resposta.end(corpo);
}

/** Agrupa os produtos por marcação (ex.: 205/55R16 91V). */
export function agruparPorMarcacao(produtos) {
  const mapa = new Map();
  for (const p of produtos) {
    if (!mapa.has(p.marcacao)) {
      mapa.set(p.marcacao, { marcacao: p.marcacao, carga: p.carga, velocidade: p.velocidade, total: 0 });
    }
    mapa.get(p.marcacao).total += 1;
  }
  return [...mapa.values()].sort(
    (a, b) =>
      b.total - a.total ||
      Number(b.carga) - Number(a.carga) ||
      String(a.velocidade).localeCompare(String(b.velocidade))
  );
}

/* ------------------------------------------------------------- despacho */
/**
 * Trata uma rota /api/*.
 * @param {import("node:http").IncomingMessage} req
 * @param {URL} url
 * @param {import("node:http").ServerResponse} resposta
 */
export async function tratarApi(req, url, resposta) {
  const rota = url.pathname;

  if (rota === "/api/status") {
    return responderJson(resposta, 200, {
      ok: true,
      versao: VERSAO,
      ambiente: process.env.VERCEL ? "vercel" : "local",
      iniciadoEm: INICIADO_EM.toISOString(),
      uptimeSeg: Math.round(process.uptime()),
      ttlCacheMin: TTL_CACHE_MS / 60000,
      coletaAoVivo: process.env.ALLOW_SCRAPE !== "0",
      cenarios: CENARIOS.map((c) => ({ id: c.id, nome: c.nome })),
    });
  }

  if (rota === "/api/medidas") {
    const medidas = await listarMedidas();
    return responderJson(resposta, 200, { medidas, total: medidas.length });
  }

  if (rota === "/api/pneus" || rota === "/api/analise") {
    if (excedeuLimite(req)) {
      return responderJson(
        resposta,
        429,
        { erro: "Muitas requisições em pouco tempo. Aguarde um minuto." },
        { "retry-after": "60" }
      );
    }
  }

  if (rota === "/api/pneus") {
    const medida = normalizarMedida(url.searchParams.get("medida") || "");
    if (!medida) {
      return responderJson(resposta, 400, {
        erro: "Parâmetro 'medida' inválido. Use o formato 205/55R16.",
      });
    }
    const refresh = url.searchParams.get("refresh") === "1";
    const dados = await obterProdutos(medida, { refresh });
    return responderJson(resposta, 200, {
      ...dados,
      marcacoes: agruparPorMarcacao(dados.produtos),
      total: dados.produtos.length,
    });
  }

  if (rota === "/api/analise") {
    const medida = normalizarMedida(url.searchParams.get("medida") || "");
    if (!medida) {
      return responderJson(resposta, 400, {
        erro: "Parâmetro 'medida' inválido. Use o formato 205/55R16.",
      });
    }
    const refresh = url.searchParams.get("refresh") === "1";
    const cenario = url.searchParams.get("cenario") || "custo-beneficio";
    const marcacao = url.searchParams.get("marcacao");

    const dados = await obterProdutos(medida, { refresh });
    const produtos = marcacao
      ? dados.produtos.filter((p) => p.marcacao === marcacao)
      : dados.produtos;

    const resultado = analisar(produtos, { cenarioId: cenario });
    return responderJson(resposta, 200, {
      medida,
      marcacao: marcacao || null,
      fonte: dados.fonte,
      ...resultado,
    });
  }

  return responderJson(resposta, 404, { erro: "Rota de API não encontrada." });
}
