/**
 * Coletor de dados do pneufree.com.br.
 *
 * O site é uma aplicação Next.js (App Router). Em vez de raspar o HTML
 * renderizado com expressões regulares frágeis, o coletor decodifica o payload
 * RSC embutido na página (`self.__next_f.push`) e lê o objeto
 * `initialProducts`, que já traz preço, classes da etiqueta INMETRO
 * (eficiência, aderência no molhado, ruído) e o índice UTQG de durabilidade.
 *
 * Vantagens: sem navegador, sem dependências, dados estruturados e paginação
 * suportada. Há cache em disco com validade e dados-semente de reserva para
 * funcionar offline.
 */

import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizarClasse } from "../public/lib/eficiencia.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(__dirname, "..");
const NA_VERCEL = Boolean(process.env.VERCEL);

/**
 * Na Vercel o sistema de arquivos é somente-leitura (exceto /tmp). O cache vai
 * para um diretório temporário; as sementes continuam sendo lidas do pacote.
 */
const DIR_CACHE = process.env.CACHE_DIR
  ? path.resolve(process.env.CACHE_DIR)
  : NA_VERCEL
    ? path.join(os.tmpdir(), "tiredecision-cache")
    : path.join(RAIZ, "data", "cache");
const DIR_SEMENTE = path.join(RAIZ, "data", "semente");

export const BASE_URL = "https://www.pneufree.com.br";
export const TTL_CACHE_MS = 30 * 60 * 1000;
const MAX_PAGINAS = 6;
const TIMEOUT_MS = 20000;

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

/** "205/55R16" -> { largura: "205", serie: "55", aro: "16" } */
export function parseMedida(texto) {
  if (!texto) return null;
  const m = String(texto)
    .toUpperCase()
    .match(/(\d{3})\s*[\/\-.\s]\s*(\d{2})\s*[R\/\-.\s]?\s*(\d{2})/);
  if (!m) return null;
  const largura = Number(m[1]);
  const serie = Number(m[2]);
  const aro = Number(m[3]);
  // sanidade: medidas de passeio/SUV
  if (largura < 100 || largura > 400) return null;
  if (serie < 20 || serie > 90) return null;
  if (aro < 12 || aro > 24) return null;
  return { largura: m[1], serie: m[2], aro: m[3] };
}

/** Normaliza qualquer entrada para "205/55R16" (ou null). */
export function normalizarMedida(texto) {
  const p = parseMedida(texto);
  return p ? `${p.largura}/${p.serie}R${p.aro}` : null;
}

/** "205/55R16" -> "205-55-16" (formato de URL do site). */
export function medidaParaSlug(medida) {
  const p = parseMedida(medida);
  if (!p) return null;
  return `${p.largura}-${p.serie}-${p.aro}`;
}

/** "205-55-16" -> "205/55R16". */
export function slugParaMedida(slug) {
  const m = String(slug).match(/(\d{3})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}/${m[2]}R${m[3]}` : null;
}

/** Junta os pedaços do payload RSC em um único texto. */
export function decodificarRsc(html) {
  const re = /self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g;
  const partes = [];
  let m;
  while ((m = re.exec(html))) {
    try {
      partes.push(JSON.parse(m[1]));
    } catch {
      /* pedaço malformado: ignora */
    }
  }
  return partes.join("");
}

/** Extrai o objeto JSON balanceado a partir de um índice. */
export function extrairObjeto(texto, inicio) {
  let profundidade = 0;
  let emString = false;
  let escape = false;
  for (let i = inicio; i < texto.length; i++) {
    const c = texto[i];
    if (emString) {
      if (escape) escape = false;
      else if (c === "\\") escape = true;
      else if (c === '"') emString = false;
      continue;
    }
    if (c === '"') {
      emString = true;
      continue;
    }
    if (c === "{") profundidade++;
    else if (c === "}") {
      profundidade--;
      if (profundidade === 0) return texto.slice(inicio, i + 1);
    }
  }
  return null;
}

/**
 * Lê o bloco `initialProducts` da página.
 * @returns {{total:number,totalPages:number,pageNumber:number,result:object[]}|null}
 */
export function extrairInitialProducts(html) {
  const rsc = decodificarRsc(html);
  const chave = '"initialProducts":';
  const pos = rsc.indexOf(chave);
  if (pos === -1) return null;
  const inicio = rsc.indexOf("{", pos + chave.length);
  if (inicio === -1) return null;
  const bruto = extrairObjeto(rsc, inicio);
  if (!bruto) return null;
  try {
    return JSON.parse(bruto);
  } catch {
    return null;
  }
}

/** Converte o produto cru do site no formato interno. */
export function mapearProduto(bruto) {
  const a = bruto.attributes || {};
  const medida = `${a.width || "?"}/${a.series || "?"}R${a.rim || "?"}`;
  const carga = String(a.loadIndex || "").trim().split(/\s+/)[0] || "";
  const velocidade = String(a.speedIndex || "").trim().split(/\s+/)[0] || "";
  const precos = Array.isArray(bruto.prices) ? bruto.prices : [];
  const aVista = precos.find((p) => Number(p.parcel) === 0) || precos[0];
  const estoque = Array.isArray(bruto.Stock)
    ? bruto.Stock.reduce((soma, s) => soma + (Number(s.Qty) || 0), 0)
    : 0;

  return {
    id: String(bruto._id || bruto.erP_id || `${bruto.brand}-${bruto.model}-${medida}`),
    marca: String(bruto.brand || "").trim(),
    modelo: String(bruto.model || "").trim(),
    medida,
    carga,
    velocidade,
    marcacao: `${medida}${carga ? ` ${carga}` : ""}${velocidade || ""}`,
    preco: aVista ? Number(aVista.value) : null,
    eficiencia: normalizarClasse(a.inmetroEfficiency),
    chuva: normalizarClasse(a.inmetroWetBraking),
    ruido: Number(a.inmetroSound) || null,
    vidaUtil: Number(a.utqgDurability) || 0,
    utqgTracao: a.utqgTraction || null,
    utqgTemperatura: a.utqgTemperature || null,
    emEstoque: Boolean(bruto.inStock) && estoque > 0,
    estoque,
    url: bruto.Seo?.permalink ? `${BASE_URL}/pneu/${bruto.Seo.permalink}` : null,
  };
}

async function buscarHtml(url) {
  const resposta = await fetch(url, {
    headers: {
      "user-agent": UA,
      accept: "text/html,application/xhtml+xml",
      "accept-language": "pt-BR,pt;q=0.9",
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!resposta.ok) {
    throw new Error(`HTTP ${resposta.status} ao acessar ${url}`);
  }
  return resposta.text();
}

async function comRetentativa(fn, tentativas = 2) {
  let ultimoErro;
  for (let i = 0; i < tentativas; i++) {
    try {
      return await fn();
    } catch (erro) {
      ultimoErro = erro;
      if (i < tentativas - 1) await new Promise((r) => setTimeout(r, 900 * (i + 1)));
    }
  }
  throw ultimoErro;
}

/**
 * Coleta todas as páginas de uma medida.
 * @param {string} medida ex.: "205/55R16"
 * @returns {Promise<{produtos:object[], paginas:number}>}
 */
export async function coletarDoSite(medida) {
  const slug = medidaParaSlug(medida);
  if (!slug) throw new Error(`Medida inválida: ${medida}`);

  const url = (pagina) =>
    `${BASE_URL}/pneus/medidas/${slug}${pagina > 1 ? `?page=${pagina}` : ""}`;

  const primeiraHtml = await comRetentativa(() => buscarHtml(url(1)));
  const primeira = extrairInitialProducts(primeiraHtml);
  if (!primeira || !Array.isArray(primeira.result)) {
    throw new Error(
      "Não foi possível ler os produtos da página. O layout do site pode ter mudado."
    );
  }

  const porId = new Map();
  for (const item of primeira.result) porId.set(item._id, mapearProduto(item));

  const totalPaginas = Math.min(Number(primeira.totalPages) || 1, MAX_PAGINAS);
  for (let pagina = 2; pagina <= totalPaginas; pagina++) {
    try {
      const html = await comRetentativa(() => buscarHtml(url(pagina)), 1);
      const dados = extrairInitialProducts(html);
      for (const item of dados?.result || []) porId.set(item._id, mapearProduto(item));
      await new Promise((r) => setTimeout(r, 350));
    } catch {
      /* página extra falhou: segue com o que já temos */
    }
  }

  const produtos = [...porId.values()].filter(
    (p) => p.preco !== null && Number.isFinite(p.preco) && p.medida === normalizarMedida(medida)
  );

  return { produtos, paginas: totalPaginas, totalSite: primeira.total };
}

async function garantirDiretorios() {
  await mkdir(DIR_CACHE, { recursive: true });
  await mkdir(DIR_SEMENTE, { recursive: true });
}

function caminhoCache(medida) {
  return path.join(DIR_CACHE, `${medidaParaSlug(medida)}.json`);
}

function caminhoSemente(medida) {
  return path.join(DIR_SEMENTE, `${medidaParaSlug(medida)}.json`);
}

async function lerJson(caminho) {
  try {
    return JSON.parse(await readFile(caminho, "utf8"));
  } catch {
    return null;
  }
}

async function gravarJson(caminho, dados) {
  await garantirDiretorios();
  await writeFile(caminho, JSON.stringify(dados, null, 2), "utf8");
}

function montarResposta(medida, produtos, fonte, coletadoEm, extra = {}) {
  return {
    medida,
    produtos,
    fonte: {
      tipo: fonte,
      coletadoEm,
      idadeMin: coletadoEm
        ? Math.max(0, Math.round((Date.now() - new Date(coletadoEm).getTime()) / 60000))
        : null,
      url: `${BASE_URL}/pneus/medidas/${medidaParaSlug(medida)}`,
      ...extra,
    },
  };
}

/**
 * Obtém os produtos de uma medida com cache, rede e reserva offline.
 *
 * @param {string} medida
 * @param {{refresh?:boolean, ttlMs?:number, permitirSemente?:boolean, permitirRede?:boolean}} opcoes
 */
export async function obterProdutos(medida, opcoes = {}) {
  const medidaNormalizada = normalizarMedida(medida);
  if (!medidaNormalizada) {
    const erro = new Error(
      "Marcação inválida. Use o formato 205/55R16 (largura/série + R + aro)."
    );
    erro.codigo = "MEDIDA_INVALIDA";
    throw erro;
  }

  const { refresh = false, ttlMs = TTL_CACHE_MS, permitirSemente = true } = opcoes;
  const cache = await lerJson(caminhoCache(medidaNormalizada));
  const cacheValido =
    cache && Array.isArray(cache.produtos) && cache.produtos.length > 0 && !refresh;
  const idadeMs = cache ? Date.now() - new Date(cache.coletadoEm).getTime() : Infinity;

  if (cacheValido && idadeMs < ttlMs) {
    return montarResposta(medidaNormalizada, cache.produtos, "cache", cache.coletadoEm, {
      expiraEmMin: Math.max(0, Math.round((ttlMs - idadeMs) / 60000)),
    });
  }

  const redePermitida = opcoes.permitirRede !== false && process.env.ALLOW_SCRAPE !== "0";
  if (!redePermitida) {
    return respostaDeReserva(
      medidaNormalizada,
      cache,
      permitirSemente,
      "Coleta ao vivo desativada neste ambiente (ALLOW_SCRAPE=0)."
    );
  }

  try {
    const { produtos, paginas, totalSite } = await coletarDoSite(medidaNormalizada);
    const coletadoEm = new Date().toISOString();
    if (produtos.length) {
      await gravarJson(caminhoCache(medidaNormalizada), {
        medida: medidaNormalizada,
        coletadoEm,
        produtos,
      });
    }
    return montarResposta(medidaNormalizada, produtos, "site", coletadoEm, {
      paginas,
      totalSite,
    });
  } catch (erro) {
    return respostaDeReserva(
      medidaNormalizada,
      cache,
      permitirSemente,
      `Falha ao consultar o site (${erro.message}).`
    );
  }
}

/** Última coleta salva ou dados-semente; erro claro se não houver nada. */
async function respostaDeReserva(medida, cache, permitirSemente, motivo) {
  if (cache && Array.isArray(cache.produtos) && cache.produtos.length) {
    return montarResposta(medida, cache.produtos, "cache-expirado", cache.coletadoEm, {
      aviso: `${motivo} Exibindo a última coleta salva.`,
    });
  }
  if (permitirSemente) {
    const semente = await lerJson(caminhoSemente(medida));
    if (semente && Array.isArray(semente.produtos) && semente.produtos.length) {
      return montarResposta(medida, semente.produtos, "semente", semente.coletadoEm, {
        aviso: `${motivo} Exibindo dados locais de demonstração.`,
      });
    }
  }
  const falha = new Error(`Não foi possível coletar os pneus de ${medida}: ${motivo}`);
  falha.codigo = "FALHA_COLETA";
  throw falha;
}

/** Lista as medidas conhecidas (semente + cache + catálogo). */
export async function listarMedidas() {
  await garantirDiretorios();
  const medidas = new Set();

  try {
    const catalogo = await lerJson(path.join(RAIZ, "data", "medidas.json"));
    for (const m of catalogo?.medidas || []) medidas.add(m);
  } catch {
    /* opcional */
  }

  for (const dir of [DIR_SEMENTE, DIR_CACHE]) {
    try {
      for (const arquivo of await readdir(dir)) {
        const m = arquivo.match(/(\d{3})-(\d{2})-(\d{2})\.json/);
        if (m) medidas.add(`${m[1]}/${m[2]}R${m[3]}`);
      }
    } catch {
      /* diretório ainda não existe */
    }
  }

  return [...medidas].sort((a, b) => {
    const pa = parseMedida(a);
    const pb = parseMedida(b);
    return (
      Number(pa.largura) - Number(pb.largura) ||
      Number(pa.serie) - Number(pb.serie) ||
      Number(pa.aro) - Number(pb.aro)
    );
  });
}

/** Salva um instantâneo como semente (usado pelo script de coleta). */
export async function salvarSemente(medida, produtos, coletadoEm = new Date().toISOString()) {
  await garantirDiretorios();
  const caminho = caminhoSemente(medida);
  await gravarJson(caminho, { medida: normalizarMedida(medida), coletadoEm, produtos });
  return caminho;
}

export const caminhos = { DIR_CACHE, DIR_SEMENTE, RAIZ, existe: existsSync };
