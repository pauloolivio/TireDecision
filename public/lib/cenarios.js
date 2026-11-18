/**
 * Critérios de decisão e cenários pré-definidos.
 *
 * Cada cenário traz uma matriz de comparação par a par (escala de Saaty) entre
 * os cinco fatores. Os pesos do cenário NÃO são digitados à mão: eles são
 * calculados pelo motor AHP a partir dessa matriz, junto com a razão de
 * consistência (CR). Assim o cenário é uma preferência declarada consistente,
 * e não um conjunto arbitrário de percentuais.
 *
 * Ordem dos critérios: chuva, eficiência, vida útil, preço, ruído.
 */

export const CRITERIOS = [
  {
    id: "chuva",
    nome: "Chuva (segurança)",
    curto: "Chuva",
    tipo: "beneficio",
    unidade: "classe",
    descricao: "Aderência em piso molhado, pela classe da etiqueta INMETRO.",
  },
  {
    id: "eficiencia",
    nome: "Eficiência de rolamento",
    curto: "Eficiência",
    tipo: "beneficio",
    unidade: "classe",
    descricao: "Classe de eficiência energética INMETRO convertida em índice (A = 100%).",
  },
  {
    id: "vida",
    nome: "Vida útil (UTQG)",
    curto: "Vida útil",
    tipo: "beneficio",
    unidade: "UTQG",
    descricao: "Índice de durabilidade UTQG (treadwear) informado pelo fabricante.",
  },
  {
    id: "preco",
    nome: "Preço",
    curto: "Preço",
    tipo: "custo",
    unidade: "R$",
    descricao: "Preço à vista no site, por pneu.",
  },
  {
    id: "ruido",
    nome: "Ruído",
    curto: "Ruído",
    tipo: "custo",
    unidade: "dB",
    descricao: "Nível de ruído externo medido em dB (menor é melhor).",
  },
];

export const CRITERIOS_POR_ID = Object.fromEntries(CRITERIOS.map((c) => [c.id, c]));

/**
 * Matrizes de Saaty. Só o triângulo superior é obrigatório; os recíprocos são
 * preenchidos automaticamente pelo motor.
 */
export const CENARIOS = [
  {
    id: "custo-beneficio",
    nome: "Custo-benefício",
    emoji: "⚖️",
    resumo: "Equilíbrio com preço e eficiência em destaque.",
    descricao:
      "Cenário padrão para quem quer o melhor retorno por real investido. Preço e eficiência pesam mais, sem abandonar segurança e durabilidade.",
    matriz: [
      [1, 1, 1, 1 / 2, 3],
      [1, 1, 1, 1 / 2, 2],
      [1, 1, 1, 1 / 2, 2],
      [2, 2, 2, 1, 4],
      [1 / 3, 1 / 2, 1 / 2, 1 / 4, 1],
    ],
  },
  {
    id: "chuva",
    nome: "Segurança na chuva",
    emoji: "🌧️",
    resumo: "Prioriza frenagem e aderência no molhado.",
    descricao:
      "Indicado para quem roda muito em rodovia, clima chuvoso ou com a família a bordo. A aderência em piso molhado domina a decisão.",
    matriz: [
      [1, 5, 4, 4, 6],
      [1 / 5, 1, 1 / 2, 1 / 2, 2],
      [1 / 4, 2, 1, 1, 3],
      [1 / 4, 2, 1, 1, 3],
      [1 / 6, 1 / 2, 1 / 3, 1 / 3, 1],
    ],
  },
  {
    id: "economia",
    nome: "Economia de combustível",
    emoji: "⛽",
    resumo: "Foco na classe de eficiência (A é a melhor).",
    descricao:
      "Para quem roda muitos km por mês: a classe de rolamento reduz o consumo e o custo por quilômetro ao longo da vida do pneu.",
    matriz: [
      [1, 1 / 12, 1 / 2, 1 / 2, 2],
      [12, 1, 8, 10, 10],
      [2, 1 / 8, 1, 1, 3],
      [2, 1 / 10, 1, 1, 3],
      [1 / 2, 1 / 10, 1 / 3, 1 / 3, 1],
    ],
  },
  {
    id: "durabilidade",
    nome: "Máxima durabilidade",
    emoji: "🛞",
    resumo: "Maior vida útil e menos trocas.",
    descricao:
      "Para frotas, motoristas de aplicativo e quem quer espaçar as trocas. O índice UTQG de durabilidade é o fator decisivo.",
    matriz: [
      [1, 2, 1 / 3, 1, 2],
      [1 / 2, 1, 1 / 4, 1 / 2, 2],
      [3, 4, 1, 3, 5],
      [1, 2, 1 / 3, 1, 3],
      [1 / 2, 1 / 2, 1 / 5, 1 / 3, 1],
    ],
  },
  {
    id: "conforto",
    nome: "Conforto acústico",
    emoji: "🔇",
    resumo: "Cabine mais silenciosa.",
    descricao:
      "Para quem faz viagens longas e sente o ruído de rodagem. O nível em dB passa a ser o critério mais importante.",
    matriz: [
      [1, 2, 2, 1, 1 / 4],
      [1 / 2, 1, 1, 1 / 2, 1 / 5],
      [1 / 2, 1, 1, 1 / 2, 1 / 4],
      [1, 2, 2, 1, 1 / 3],
      [4, 5, 4, 3, 1],
    ],
  },
  {
    id: "orcamento",
    nome: "Orçamento apertado",
    emoji: "💰",
    resumo: "Menor preço possível sem perder o mínimo de segurança.",
    descricao:
      "Quando o bolso manda: o preço domina, mas eficiência e segurança ainda entram com peso relevante para não comprar dor de cabeça.",
    matriz: [
      [1, 1 / 2, 1, 1 / 4, 2],
      [2, 1, 2, 1 / 2, 3],
      [1, 1 / 2, 1, 1 / 4, 2],
      [4, 2, 4, 1, 5],
      [1 / 2, 1 / 3, 1 / 2, 1 / 5, 1],
    ],
  },
];

export const CENARIO_PERSONALIZADO = {
  id: "personalizado",
  nome: "Personalizado",
  emoji: "🎛️",
  resumo: "Você define os pesos.",
  descricao:
    "Ajuste livre dos cinco pesos. Neste modo a matriz é derivada dos pesos (consistência perfeita, CR = 0).",
  matriz: null,
};

/** Premissas econômicas padrão (ajustáveis na interface). */
export const PREMISSAS_PADRAO = {
  /** Consumo de referência de um pneu classe A, em L/100 km. */
  baseL100: 7.0,
  /** Preço do litro de gasolina, em R$. */
  precoLitro: 6.2,
  /** Quilômetros estimados por ponto de UTQG (1 ponto ≈ 150 km). */
  kmPorUtqg: 150,
  /** Degradação de eficiência por classe da etiqueta. */
  passoEficiencia: 0.08,
};

/**
 * Todos os cenários já resolvidos (pesos + CR), prontos para a interface.
 * @param {(matriz:number[][])=>object} resolver função de resolução do motor AHP
 */
export function cenariosResolvidos(resolver) {
  return CENARIOS.map((c) => {
    const r = resolver(c.matriz);
    return {
      ...c,
      pesos: Object.fromEntries(CRITERIOS.map((crit, i) => [crit.id, r.pesos[i]])),
      consistencia: {
        lambdaMax: r.lambdaMax,
        ci: r.ci,
        cr: r.cr,
        consistente: r.consistente,
      },
    };
  });
}
