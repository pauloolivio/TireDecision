/**
 * Modelo de eficiência de rolamento baseado na etiqueta INMETRO / PBE Pneus.
 *
 * A etiqueta classifica o pneu em A..G. A classe A é a de menor resistência ao
 * rolamento (mais eficiente). Adotamos, conforme solicitado, uma degradação
 * geométrica de 8% por classe: cada classe abaixo perde ~8% de eficiência por
 * km rodado em relação à classe imediatamente superior.
 *
 *   A = 100,0%   B = 92,0%   C = 84,6%   D = 77,9%
 *   E = 71,6%    F = 65,9%   G = 60,6%
 *
 * As faixas de coeficiente de resistência ao rolamento (RRC, kg/t) e do índice
 * de aderência em piso molhado (G) são as faixas de referência da etiqueta
 * para pneus de passeio (C1), usadas apenas como informação de apoio.
 */

export const CLASSES = ["A", "B", "C", "D", "E", "F", "G"];

/** Degradação padrão por classe (8%). Pode ser ajustada na interface. */
export const PASSO_PADRAO = 0.08;

/** Faixas de RRC (kg/t) por classe — referência da etiqueta (C1). */
export const RRC_POR_CLASSE = {
  A: { min: 0, max: 6.5, texto: "≤ 6,5" },
  B: { min: 6.6, max: 7.7, texto: "6,6 – 7,7" },
  C: { min: 7.8, max: 9.0, texto: "7,8 – 9,0" },
  D: { min: 9.1, max: 10.5, texto: "9,1 – 10,5" },
  E: { min: 10.6, max: 12.0, texto: "10,6 – 12,0" },
  F: { min: 12.1, max: 13.5, texto: "12,1 – 13,5" },
  G: { min: 13.6, max: Infinity, texto: "≥ 13,6" },
};

/** Faixas do índice de aderência em piso molhado (G) por classe (C1). */
export const WET_POR_CLASSE = {
  A: { min: 1.55, max: Infinity, texto: "G ≥ 1,55" },
  B: { min: 1.4, max: 1.54, texto: "1,40 – 1,54" },
  C: { min: 1.25, max: 1.39, texto: "1,25 – 1,39" },
  D: { min: 1.1, max: 1.24, texto: "1,10 – 1,24" },
  E: { min: 0.95, max: 1.09, texto: "0,95 – 1,09" },
  F: { min: 0.8, max: 0.94, texto: "0,80 – 0,94" },
  G: { min: 0, max: 0.79, texto: "G ≤ 0,79" },
};

/** Valor representativo do índice de aderência (ponto médio da faixa). */
const WET_REPRESENTATIVO = { A: 1.6, B: 1.47, C: 1.32, D: 1.17, E: 1.02, F: 0.87, G: 0.72 };

const INDICE_CLASSE = Object.fromEntries(CLASSES.map((c, i) => [c, i]));

/** Normaliza "b" / "B " / "" para "B" ou null. */
export function normalizarClasse(valor) {
  if (valor === null || valor === undefined) return null;
  const letra = String(valor).trim().toUpperCase();
  return CLASSES.includes(letra) ? letra : null;
}

/**
 * Índice 0..1 de eficiência de rolamento (A = 1). Cresce geometricamente:
 * indice = (1 - passo) ^ posicao_da_classe.
 */
export function indiceEficiencia(classe, passo = PASSO_PADRAO) {
  const c = normalizarClasse(classe);
  if (!c) return null;
  const p = Math.min(Math.max(Number(passo) || PASSO_PADRAO, 0), 0.5);
  return Number(Math.pow(1 - p, INDICE_CLASSE[c]).toFixed(6));
}

/** Informações completas da classe de eficiência. */
export function infoEficiencia(classe, passo = PASSO_PADRAO) {
  const c = normalizarClasse(classe);
  if (!c) return null;
  const indice = indiceEficiencia(c, passo);
  const rrc = RRC_POR_CLASSE[c];
  return {
    classe: c,
    indice,
    percentual: Number((indice * 100).toFixed(1)),
    posicao: INDICE_CLASSE[c],
    rrcFaixa: rrc.texto,
    rrcMin: rrc.min,
    rrcMax: rrc.max,
  };
}

/**
 * Índice 0..1 de aderência em piso molhado (A = 1). A etiqueta é uma escala
 * ordinal: convertemos A..G em notas igualmente espaçadas (A = 100%,
 * B = 83,3%, ..., G = 0%). As faixas do índice G da etiqueta ficam disponíveis
 * como referência física em WET_POR_CLASSE.
 */
export function indiceChuva(classe) {
  const c = normalizarClasse(classe);
  if (!c) return null;
  const posicao = INDICE_CLASSE[c];
  return Number(((CLASSES.length - 1 - posicao) / (CLASSES.length - 1)).toFixed(6));
}

export function infoChuva(classe) {
  const c = normalizarClasse(classe);
  if (!c) return null;
  const indice = indiceChuva(c);
  return {
    classe: c,
    indice,
    percentual: Number((indice * 100).toFixed(1)),
    posicao: INDICE_CLASSE[c],
    faixa: WET_POR_CLASSE[c].texto,
    referencia: WET_REPRESENTATIVO[c],
  };
}

/**
 * Consumo estimado (L/100 km) para um pneu daquela classe.
 * O consumo associado ao rolamento é inversamente proporcional à eficiência:
 * consumo = base / indice.
 */
export function consumoEstimado(classe, { baseL100 = 7, passo = PASSO_PADRAO } = {}) {
  const indice = indiceEficiencia(classe, passo);
  if (!indice) return null;
  return Number((baseL100 / indice).toFixed(3));
}

/**
 * Custo de energia por 1.000 km (R$).
 */
export function custoEnergiaPorMilKm(
  classe,
  { baseL100 = 7, precoLitro = 6.2, passo = PASSO_PADRAO } = {}
) {
  const consumo = consumoEstimado(classe, { baseL100, passo });
  if (consumo === null) return null;
  return Number((consumo * 10 * precoLitro).toFixed(2));
}

/** Tabela pronta para exibição na metodologia. */
export function tabelaClasses(passo = PASSO_PADRAO, { baseL100 = 7 } = {}) {
  return CLASSES.map((c) => ({
    classe: c,
    eficiencia: infoEficiencia(c, passo),
    chuva: infoChuva(c),
    consumo: consumoEstimado(c, { passo, baseL100 }),
  }));
}
