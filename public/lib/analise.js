/**
 * Motor de análise: transforma os produtos coletados do site em alternativas
 * normalizadas, aplica o modelo de eficiência INMETRO e roda AHP + TOPSIS.
 *
 * Fluxo:
 *   produtos do site
 *     -> índices (eficiência, chuva) e dados econômicos derivados
 *     -> cenário (matriz AHP) -> vetor de pesos + CR
 *     -> AHP/MAVT e TOPSIS -> ranking
 *     -> veredito + justificativas + sensibilidade entre cenários
 */

import {
  CRITERIOS,
  PREMISSAS_PADRAO,
  CENARIOS,
  CENARIO_PERSONALIZADO,
} from "./cenarios.js";
import { pontuarAHP, normalizarPesos, matrizDePesos, resolverMatriz } from "./ahp.js";
import { calcularTOPSIS } from "./topsis.js";
import {
  infoEficiencia,
  infoChuva,
  consumoEstimado,
  custoEnergiaPorMilKm,
} from "./eficiencia.js";

const CRITERIOS_IDS = CRITERIOS.map((c) => c.id);

/** Formata número como moeda brasileira. */
export function reais(valor) {
  return Number(valor).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });
}

function mediana(valores) {
  const v = valores.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (!v.length) return null;
  const meio = Math.floor(v.length / 2);
  return v.length % 2 ? v[meio] : (v[meio - 1] + v[meio]) / 2;
}

/**
 * Resolve o cenário escolhido em vetor de pesos + consistência.
 */
export function resolverCenario(cenarioId = "custo-beneficio", pesosPersonalizados = null) {
  if (cenarioId === CENARIO_PERSONALIZADO.id || pesosPersonalizados) {
    const base = pesosPersonalizados || Object.fromEntries(CRITERIOS_IDS.map((id) => [id, 1]));
    const vetor = normalizarPesos(CRITERIOS_IDS.map((id) => Number(base[id]) || 0));
    const matriz = matrizDePesos(vetor);
    return {
      id: CENARIO_PERSONALIZADO.id,
      nome: CENARIO_PERSONALIZADO.nome,
      emoji: CENARIO_PERSONALIZADO.emoji,
      descricao: CENARIO_PERSONALIZADO.descricao,
      pesos: vetor,
      pesosObjeto: Object.fromEntries(CRITERIOS_IDS.map((id, i) => [id, Number(vetor[i].toFixed(6))])),
      // matriz derivada dos próprios pesos: consistência perfeita por construção
      consistencia: { lambdaMax: CRITERIOS_IDS.length, ci: 0, cr: 0, consistente: true },
      matriz,
      personalizado: true,
    };
  }

  const cenario = CENARIOS.find((c) => c.id === cenarioId) || CENARIOS[0];
  const r = resolverMatriz(cenario.matriz);
  return {
    id: cenario.id,
    nome: cenario.nome,
    emoji: cenario.emoji,
    descricao: cenario.descricao,
    resumo: cenario.resumo,
    pesos: r.pesos,
    pesosObjeto: Object.fromEntries(CRITERIOS_IDS.map((id, i) => [id, r.pesos[i]])),
    consistencia: { lambdaMax: r.lambdaMax, ci: r.ci, cr: r.cr, consistente: r.consistente },
    matriz: r.matriz,
    personalizado: false,
  };
}

/**
 * Constrói as alternativas normalizadas (com imputação de dados faltantes).
 * @param {Array} produtos
 * @param {object} premissas
 */
export function prepararAlternativas(produtos, premissas = {}) {
  const p = { ...PREMISSAS_PADRAO, ...premissas };
  const lista = (produtos || []).filter((x) => Number(x.preco) > 0);
  if (!lista.length) return { alternativas: [], qualidade: null };

  const utqgs = lista.map((x) => Number(x.vidaUtil) || 0).filter((n) => n > 0);
  const utqgMediana = mediana(utqgs) || 400;

  const classesEfic = lista.map((x) => infoEficiencia(x.eficiencia, p.passoEficiencia)).filter(Boolean);
  const classesChuva = lista.map((x) => infoChuva(x.chuva)).filter(Boolean);
  const indiceEficMediana = mediana(classesEfic.map((c) => c.indice)) ?? 0.85;
  const indiceChuvaMediana = mediana(classesChuva.map((c) => c.indice)) ?? 0.8;

  const alternativas = lista.map((produto) => {
    const efic = infoEficiencia(produto.eficiencia, p.passoEficiencia);
    const chuva = infoChuva(produto.chuva);
    const utqgOriginal = Number(produto.vidaUtil) || 0;

    const flags = [];
    let utqg = utqgOriginal;
    if (!utqg) {
      utqg = utqgMediana;
      flags.push("vida-estimada");
    }
    let indiceEfic = efic?.indice ?? indiceEficMediana;
    let indiceChuvaVal = chuva?.indice ?? indiceChuvaMediana;
    if (!efic || !chuva) flags.push("etiqueta-incompleta");
    if (produto.emEstoque === false) flags.push("sem-estoque");

    const vidaKm = Math.round(utqg * p.kmPorUtqg);
    const custoEnergia = custoEnergiaPorMilKm(produto.eficiencia, {
      baseL100: p.baseL100,
      precoLitro: p.precoLitro,
      passo: p.passoEficiencia,
    }) ?? Number(((p.baseL100 / indiceEfic) * 10 * p.precoLitro).toFixed(2));
    const custoAquisicaoPorMilKm = vidaKm > 0 ? (Number(produto.preco) / vidaKm) * 1000 : null;

    return {
      id: produto.id || produto.url || `${produto.marca}-${produto.modelo}`,
      nome: `${produto.marca} ${produto.modelo}`.trim(),
      marca: produto.marca,
      modelo: produto.modelo,
      marcacao: produto.marcacao,
      url: produto.url || null,
      preco: Number(produto.preco),
      eficiencia: produto.eficiencia,
      chuva: produto.chuva,
      ruido: Number(produto.ruido),
      vidaUtil: utqgOriginal,
      vidaEfetiva: utqg,
      emEstoque: produto.emEstoque !== false,
      estoque: produto.estoque ?? null,
      flags,
      indices: {
        chuva: Number(indiceChuvaVal.toFixed(4)),
        eficiencia: Number(indiceEfic.toFixed(4)),
      },
      classes: {
        eficiencia: efic,
        chuva,
      },
      consumo: consumoEstimado(produto.eficiencia, {
        baseL100: p.baseL100,
        passo: p.passoEficiencia,
      }),
      custoEnergiaMilKm: custoEnergia,
      custoAquisicaoMilKm: custoAquisicaoPorMilKm === null ? null : Number(custoAquisicaoPorMilKm.toFixed(2)),
      custoTotalMilKm: Number(
        ((custoAquisicaoPorMilKm ?? 0) + custoEnergia).toFixed(2)
      ),
      vidaKm,
    };
  });

  const comEtiqueta = alternativas.filter((a) => !a.flags.includes("etiqueta-incompleta")).length;
  const comVida = alternativas.filter((a) => a.vidaUtil > 0).length;

  return {
    alternativas,
    qualidade: {
      total: alternativas.length,
      comEtiqueta,
      comVida,
      utqgMediana,
      percentualEtiqueta: Number(((comEtiqueta / alternativas.length) * 100).toFixed(1)),
    },
  };
}

/**
 * Executa a análise completa.
 *
 * @param {Array} produtos produtos normalizados do scraper
 * @param {object} opcoes
 * @param {string} [opcoes.cenarioId]
 * @param {object} [opcoes.pesosPersonalizados] {chuva, eficiencia, vida, preco, ruido}
 * @param {object} [opcoes.premissas]
 * @param {number} [opcoes.topSensibilidade]
 */
export function analisar(produtos, opcoes = {}) {
  const {
    cenarioId = "custo-beneficio",
    pesosPersonalizados = null,
    premissas = {},
    topSensibilidade = 8,
  } = opcoes;

  const premissasEfetivas = { ...PREMISSAS_PADRAO, ...premissas };
  const cenario = resolverCenario(cenarioId, pesosPersonalizados);
  const { alternativas, qualidade } = prepararAlternativas(produtos, premissasEfetivas);

  if (!alternativas.length) {
    return {
      cenario,
      premissas: premissasEfetivas,
      alternativas: [],
      ranking: [],
      vencedor: null,
      podio: [],
      qualidade,
      justificativas: [],
      sensibilidade: [],
      geradoEm: new Date().toISOString(),
    };
  }

  const itens = alternativas.map((a) => ({
    id: a.id,
    nome: a.nome,
    valores: {
      chuva: a.indices.chuva,
      eficiencia: a.indices.eficiencia,
      vida: a.vidaEfetiva,
      preco: a.preco,
      ruido: a.ruido,
    },
  }));

  const ahp = pontuarAHP(itens, cenario.pesos, CRITERIOS);
  const topsis = calcularTOPSIS(itens, cenario.pesos, CRITERIOS);

  const porId = new Map(alternativas.map((a) => [a.id, a]));
  const ahpPorId = new Map(ahp.map((r) => [r.id, r]));
  const topsisPorId = new Map(topsis.map((r) => [r.id, r]));

  const ranking = topsis.map((t) => {
    const alt = porId.get(t.id);
    const a = ahpPorId.get(t.id);
    return {
      ...alt,
      ahpScore: a.score,
      ahpRank: 0,
      topsisScore: t.score,
      topsisRank: t.ranking,
      sMais: t.sMais,
      sMenos: t.sMenos,
      contribuicoes: a.contribuicoes,
    };
  });

  // posição AHP
  [...ranking]
    .sort((x, y) => y.ahpScore - x.ahpScore)
    .forEach((r, i) => {
      r.ahpRank = i + 1;
    });

  const vencedor = ranking[0];
  const segundo = ranking[1] || null;

  const concordancia = vencedor && vencedor.ahpRank === 1;
  const margem = segundo ? Number((vencedor.topsisScore - segundo.topsisScore).toFixed(4)) : 1;

  const justificativas = construirJustificativas(vencedor, segundo, ranking, cenario, premissasEfetivas);

  // Sensibilidade: posição TOPSIS de cada finalista em cada cenário
  const sensibilidade = calcularSensibilidade(alternativas, ranking, topSensibilidade);

  return {
    cenario,
    premissas: premissasEfetivas,
    alternativas,
    ranking,
    vencedor,
    podio: ranking.slice(0, 3),
    segundo,
    margem,
    concordancia,
    qualidade,
    justificativas,
    estatisticas: estatisticas(ranking),
    sensibilidade,
    geradoEm: new Date().toISOString(),
  };
}

function estatisticas(ranking) {
  const precos = ranking.map((r) => r.preco);
  const custos = ranking.map((r) => r.custoTotalMilKm);
  return {
    precoMin: Math.min(...precos),
    precoMax: Math.max(...precos),
    precoMediana: mediana(precos),
    custoMilKmMin: Math.min(...custos),
    custoMilKmMax: Math.max(...custos),
    custoMilKmMediana: mediana(custos),
    total: ranking.length,
  };
}

function construirJustificativas(vencedor, segundo, ranking, cenario, premissas) {
  if (!vencedor) return [];
  const itens = [];
  const medianaPreco = mediana(ranking.map((r) => r.preco));

  if (segundo) {
    itens.push({
      icone: "🏆",
      texto: `Lidera o TOPSIS com ${(vencedor.topsisScore * 100).toFixed(1)}% de proximidade da solução ideal, ${
        vencedor.topsisScore >= segundo.topsisScore
          ? `${((vencedor.topsisScore - segundo.topsisScore) * 100).toFixed(1)} p.p.`
          : "0 p.p."
      } à frente de ${segundo.nome}.`,
    });
  }

  const efic = vencedor.classes.eficiencia;
  if (efic) {
    itens.push({
      icone: "⛽",
      texto: `Etiqueta ${efic.classe} de rolamento (${efic.percentual.toFixed(1)}% da eficiência da classe A): consumo estimado de ${
        vencedor.consumo ? vencedor.consumo.toFixed(2).replace(".", ",") : "—"
      } L/100 km e ${reais(vencedor.custoEnergiaMilKm)} de combustível por 1.000 km.`,
    });
  }

  const chuva = vencedor.classes.chuva;
  if (chuva) {
    itens.push({
      icone: "🌧️",
      texto: `Aderência em piso molhado classe ${chuva.classe} (índice ${chuva.percentual.toFixed(0)}% da classe A) — ${
        chuva.classe === "A" || chuva.classe === "B"
          ? "referência de segurança na chuva"
          : "ponto de atenção se você roda muito em piso molhado"
      }.`,
    });
  }

  if (medianaPreco) {
    const diferenca = ((vencedor.preco - medianaPreco) / medianaPreco) * 100;
    itens.push({
      icone: "💰",
      texto: `${reais(vencedor.preco)} por pneu — ${Math.abs(diferenca).toFixed(0)}% ${
        diferenca <= 0 ? "abaixo" : "acima"
      } da mediana do conjunto (${reais(medianaPreco)}). Custo total estimado de ${reais(
        vencedor.custoTotalMilKm
      )} por 1.000 km (compra + combustível).`,
    });
  }

  if (vencedor.vidaUtil > 0) {
    itens.push({
      icone: "🛞",
      texto: `UTQG ${vencedor.vidaUtil} (≈ ${vencedor.vidaKm.toLocaleString("pt-BR")} km estimados a ${
        premissas.kmPorUtqg
      } km/ponto).`,
    });
  }

  itens.push({
    icone: "🎯",
    texto: `Cenário aplicado: ${cenario.emoji || ""} ${cenario.nome} — pesos ${CRITERIOS.map(
      (c) => `${c.curto} ${(cenario.pesosObjeto[c.id] * 100).toFixed(0)}%`
    ).join(", ")}.`,
  });

  return itens;
}

function calcularSensibilidade(alternativas, ranking, top) {
  const finalistas = ranking.slice(0, top).map((r) => r.id);
  const itens = alternativas
    .filter((a) => finalistas.includes(a.id))
    .map((a) => ({
      id: a.id,
      nome: a.nome,
      marcacao: a.marcacao,
      ranks: {},
    }));
  const porId = new Map(itens.map((i) => [i.id, i]));

  const resolvidos = CENARIOS.map((c) => {
    const r = resolverMatriz(c.matriz);
    return { id: c.id, nome: c.nome, emoji: c.emoji, pesos: r.pesos };
  });

  for (const cen of resolvidos) {
    const res = calcularTOPSIS(
      alternativas.map((a) => ({
        id: a.id,
        nome: a.nome,
        valores: {
          chuva: a.indices.chuva,
          eficiencia: a.indices.eficiencia,
          vida: a.vidaEfetiva,
          preco: a.preco,
          ruido: a.ruido,
        },
      })),
      cen.pesos,
      CRITERIOS
    );
    for (const r of res) {
      const alvo = porId.get(r.id);
      if (alvo) alvo.ranks[cen.id] = r.ranking;
    }
  }

  return itens.map((i) => ({ ...i, vitorias: Object.values(i.ranks).filter((r) => r === 1).length }));
}

export { CRITERIOS, PREMISSAS_PADRAO, CENARIOS, CENARIO_PERSONALIZADO };
