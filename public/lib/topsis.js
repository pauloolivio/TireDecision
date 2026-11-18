/**
 * TOPSIS — Technique for Order Preference by Similarity to Ideal Solution.
 *
 *  1. Normalização vetorial: r_ij = x_ij / sqrt(soma_i x_ij^2)
 *  2. Matriz ponderada: v_ij = w_j * r_ij
 *  3. Solução ideal positiva (A+) e negativa (A-), respeitando o sentido do
 *     critério (benefício: maior é melhor; custo: menor é melhor).
 *  4. Distâncias euclidianas S+ e S-.
 *  5. Coeficiente de proximidade: C_i = S- / (S+ + S-), em [0, 1].
 */

/**
 * @param {Array<{id:string, nome:string, valores:Record<string,number>}>} itens
 * @param {number[]} pesos vetor normalizado
 * @param {Array<{id:string, tipo:'beneficio'|'custo'}>} criterios
 */
export function calcularTOPSIS(itens, pesos, criterios) {
  const n = itens.length;
  if (!n) return [];
  if (n === 1) {
    return [
      {
        id: itens[0].id,
        nome: itens[0].nome,
        score: 1,
        sMais: 0,
        sMenos: 0,
        ranking: 1,
      },
    ];
  }

  const m = criterios.length;
  const x = itens.map((item) => criterios.map((c) => Number(item.valores[c.id]) || 0));

  // 1. Normalização vetorial por coluna
  const normas = [];
  for (let j = 0; j < m; j++) {
    let soma = 0;
    for (let i = 0; i < n; i++) soma += x[i][j] * x[i][j];
    normas[j] = Math.sqrt(soma);
  }
  const r = x.map((linha) => linha.map((v, j) => (normas[j] > 0 ? v / normas[j] : 0)));

  // 2. Ponderação
  const v = r.map((linha) => linha.map((val, j) => val * (Number(pesos[j]) || 0)));

  // 3. Ideal positivo / negativo
  const ideal = [];
  const antiIdeal = [];
  for (let j = 0; j < m; j++) {
    const coluna = v.map((linha) => linha[j]);
    const custo = criterios[j].tipo === "custo";
    ideal[j] = custo ? Math.min(...coluna) : Math.max(...coluna);
    antiIdeal[j] = custo ? Math.max(...coluna) : Math.min(...coluna);
  }

  // 4 e 5. Distâncias e coeficiente de proximidade
  const resultados = v.map((linha, i) => {
    let somaPos = 0;
    let somaNeg = 0;
    for (let j = 0; j < m; j++) {
      const dPos = linha[j] - ideal[j];
      const dNeg = linha[j] - antiIdeal[j];
      somaPos += dPos * dPos;
      somaNeg += dNeg * dNeg;
    }
    const sMais = Math.sqrt(somaPos);
    const sMenos = Math.sqrt(somaNeg);
    const denominador = sMais + sMenos;
    let score;
    if (denominador === 0) {
      score = 0.5; // todas as alternativas idênticas neste conjunto
    } else {
      score = sMenos / denominador;
    }
    return {
      id: itens[i].id,
      nome: itens[i].nome,
      score: Number(score.toFixed(4)),
      sMais: Number(sMais.toFixed(4)),
      sMenos: Number(sMenos.toFixed(4)),
    };
  });

  return ordenarComRanking(resultados);
}

/** Ordena por score desc e atribui posição (1 = melhor). */
export function ordenarComRanking(resultados) {
  const ordenado = [...resultados].sort(
    (a, b) => b.score - a.score || a.nome.localeCompare(b.nome, "pt-BR")
  );
  let posicao = 0;
  let scoreAnterior = null;
  return ordenado.map((r, idx) => {
    if (r.score !== scoreAnterior) {
      posicao = idx + 1;
      scoreAnterior = r.score;
    }
    return { ...r, ranking: posicao };
  });
}
