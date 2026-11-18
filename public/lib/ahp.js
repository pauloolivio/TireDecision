/**
 * AHP — Analytic Hierarchy Process.
 *
 * Etapas implementadas:
 *  1. Matriz de comparação par a par (escala de Saaty, 1..9).
 *  2. Vetor de prioridades pelo método do autovetor aproximado (média
 *     geométrica das linhas), normalizado para soma 1.
 *  3. Consistência: lambda_max, índice de consistência (CI) e razão de
 *     consistência (CR = CI / RI). CR <= 0,10 é considerado aceitável.
 *  4. Agregação das alternativas por soma ponderada dos valores normalizados
 *     (MAVT), com critérios de benefício e de custo.
 */

/** Índice aleatório de Saaty (RI) por dimensão da matriz. */
export const RI = [0, 0, 0, 0.58, 0.9, 1.12, 1.24, 1.32, 1.41, 1.45, 1.49];

/**
 * Vetor de prioridades pela média geométrica das linhas.
 * @param {number[][]} matriz matriz quadrada recíproca positiva
 * @returns {number[]} pesos normalizados (soma 1)
 */
export function autovetorGeometrico(matriz) {
  const n = matriz.length;
  const medias = matriz.map((linha) => {
    const produto = linha.reduce((acc, v) => acc * (Number(v) > 0 ? Number(v) : 1), 1);
    return Math.pow(produto, 1 / n);
  });
  const soma = medias.reduce((a, b) => a + b, 0);
  if (soma <= 0) return new Array(n).fill(1 / n);
  return medias.map((m) => m / soma);
}

/**
 * Calcula lambda_max, CI e CR de uma matriz de comparação.
 * @returns {{lambdaMax:number, ci:number, cr:number, consistente:boolean, n:number}}
 */
export function consistencia(matriz, pesos = autovetorGeometrico(matriz)) {
  const n = matriz.length;
  if (n <= 2) {
    return { lambdaMax: n, ci: 0, cr: 0, consistente: true, n };
  }
  let soma = 0;
  for (let i = 0; i < n; i++) {
    let linha = 0;
    for (let j = 0; j < n; j++) linha += Number(matriz[i][j]) * pesos[j];
    soma += pesos[i] > 0 ? linha / pesos[i] : 0;
  }
  const lambdaMax = soma / n;
  const ci = (lambdaMax - n) / (n - 1);
  const ri = RI[n] ?? 1.49;
  const cr = ri > 0 ? ci / ri : 0;
  return {
    lambdaMax: Number(lambdaMax.toFixed(6)),
    ci: Number(ci.toFixed(6)),
    cr: Number(cr.toFixed(6)),
    consistente: cr <= 0.1,
    n,
  };
}

/**
 * Resolve uma matriz de comparação: pesos + consistência.
 * Aceita matriz completa ou apenas o triângulo superior (com 1 na diagonal).
 */
export function resolverMatriz(matriz) {
  const m = completarMatriz(matriz);
  const pesos = autovetorGeometrico(m);
  const c = consistencia(m, pesos);
  return { ...c, pesos: pesos.map((p) => Number(p.toFixed(6))), matriz: m };
}

/**
 * Aceita matriz com valores nulos/ausentes abaixo da diagonal e preenche
 * com os recíprocos (a_ji = 1 / a_ij).
 */
export function completarMatriz(matriz) {
  const n = matriz.length;
  const m = Array.from({ length: n }, () => new Array(n).fill(1));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const v = matriz[i]?.[j] ?? matriz[j]?.[i];
      if (v === null || v === undefined || v === 0) {
        m[i][j] = i === j ? 1 : 1;
      } else if (i === j) {
        m[i][j] = 1;
      } else {
        m[i][j] = j > i ? Number(v) : 1 / Number(matriz[j][i] ?? v);
      }
    }
  }
  return m;
}

/**
 * Constrói a matriz perfeitamente consistente a partir de pesos quaisquer
 * (a_ij = w_i / w_j). Usada no modo "personalizado". Pesos nulos são
 * substituídos por um valor mínimo apenas para manter a matriz inversível.
 */
export function matrizDePesos(pesos) {
  const w = normalizarPesos(pesos).map((v) => Math.max(v, 1e-4));
  return w.map((wi) => w.map((wj) => (wj > 0 ? wi / wj : 1)));
}

/** Normaliza um vetor de pesos para soma 1. */
export function normalizarPesos(pesos) {
  const lista = Array.isArray(pesos)
    ? pesos.map((p) => (Number(p) > 0 ? Number(p) : 0))
    : Object.values(pesos).map((p) => (Number(p) > 0 ? Number(p) : 0));
  const soma = lista.reduce((a, b) => a + b, 0);
  if (soma <= 0) return lista.map(() => 1 / lista.length);
  return lista.map((p) => p / soma);
}

/**
 * Converte um objeto de pesos {id: valor} em vetor na ordem dos critérios.
 */
export function pesosParaVetor(pesos, criterios) {
  return normalizarPesos(criterios.map((c) => pesos[c.id] ?? 0));
}

/**
 * Normaliza uma coluna de valores conforme o tipo do critério.
 * Benefício: x / max. Custo: min / x.
 */
export function normalizarColuna(valores, tipo) {
  const positivos = valores.filter((v) => Number.isFinite(v));
  if (!positivos.length) return valores.map(() => 0);

  if (tipo === "custo") {
    const positivosEstritos = positivos.filter((v) => v > 0);
    const min = positivosEstritos.length ? Math.min(...positivosEstritos) : 0;
    if (min <= 0) {
      const max = Math.max(...positivos, 1);
      return valores.map((v) => (Number.isFinite(v) ? v / max : 0));
    }
    return valores.map((v) => (Number.isFinite(v) && v > 0 ? min / v : 0));
  }

  const max = Math.max(...positivos, 0);
  if (max <= 0) return valores.map(() => 0);
  return valores.map((v) => (Number.isFinite(v) ? v / max : 0));
}

/**
 * Agregação AHP/MAVT: score_i = soma_j (w_j * v_ij).
 *
 * @param {Array<{id:string, nome:string, valores:Record<string,number>}>} itens
 * @param {number[]} pesos vetor de pesos já normalizado
 * @param {Array<{id:string, tipo:'beneficio'|'custo'}>} criterios
 * @returns {Array<{id:string, nome:string, score:number, normalizado:Record<string,number>, contribuicoes:Record<string,number>}>}
 */
export function pontuarAHP(itens, pesos, criterios) {
  if (!itens.length) return [];

  const normalizado = criterios.map((c) =>
    normalizarColuna(
      itens.map((i) => Number(i.valores[c.id])),
      c.tipo
    )
  );

  return itens.map((item, i) => {
    let score = 0;
    const norm = {};
    const contrib = {};
    criterios.forEach((c, j) => {
      const v = Number.isFinite(normalizado[j][i]) ? normalizado[j][i] : 0;
      const w = Number.isFinite(pesos[j]) ? pesos[j] : 0;
      norm[c.id] = Number(v.toFixed(4));
      contrib[c.id] = Number((v * w).toFixed(4));
      score += v * w;
    });
    return {
      id: item.id,
      nome: item.nome,
      score: Number(score.toFixed(4)),
      normalizado: norm,
      contribuicoes: contrib,
    };
  });
}

/** Ordena decrescente por score, com desempate pelo nome. */
export function ordenarPorScore(resultados) {
  return [...resultados].sort((a, b) => b.score - a.score || a.nome.localeCompare(b.nome, "pt-BR"));
}
