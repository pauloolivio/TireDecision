/**
 * TireDecision — controlador da interface.
 *
 * Toda a matemática (AHP, TOPSIS, INMETRO) vem dos módulos em /lib, os mesmos
 * usados pelo servidor e pelos testes. O navegador recalcula na hora quando o
 * usuário troca o cenário, a marcação ou os pesos.
 */

import { analisar, reais, CRITERIOS } from "/lib/analise.js";
import { resolverCenario } from "/lib/analise.js";
import { CENARIOS, CENARIO_PERSONALIZADO, PREMISSAS_PADRAO } from "./lib/cenarios.js";
import { tabelaClasses } from "./lib/eficiencia.js";

const $ = (seletor) => document.querySelector(seletor);
const $$ = (seletor) => [...document.querySelectorAll(seletor)];

const CORES = {
  chuva: "#38bdf8",
  eficiencia: "#34d399",
  vida: "#a78bfa",
  preco: "#fbbf24",
  ruido: "#f472b6",
};

const estado = {
  medida: "205/55R16",
  marcacao: null,
  produtos: [],
  marcacoes: [],
  fonte: null,
  cenarioId: "custo-beneficio",
  pesosCustom: null,
  premissas: { ...PREMISSAS_PADRAO },
  sort: "topsis",
  analise: null,
  carregando: false,
  autoTimer: null,
};

const pct = (n, casas = 1) =>
  Number.isFinite(n) ? `${(n * 100).toFixed(casas).replace(".", ",")}%` : "—";

const num = (n, casas = 2) =>
  Number.isFinite(n) ? n.toFixed(casas).replace(".", ",") : "—";

const escapar = (texto) =>
  String(texto ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function normalizarMedida(texto) {
  const m = String(texto || "").match(/(\d{3})\s*[\/\s]\s*(\d{2})\s*r?\s*(\d{2})/i);
  return m ? `${m[1]}/${m[2]}R${m[3]}` : null;
}

function fmtData(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function setStatus(tipo, texto) {
  const el = $("#status");
  el.className = `status ${tipo}`;
  $("#status-text").textContent = texto;
}

let toastTimer;
function toast(mensagem, tipo = "") {
  const el = $("#toast");
  el.textContent = mensagem;
  el.className = `toast show ${tipo}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.className = "toast";
  }, 4200);
}

async function api(url) {
  const resposta = await fetch(url, { headers: { accept: "application/json" } });
  let dados = null;
  try {
    dados = await resposta.json();
  } catch {
    /* resposta sem JSON */
  }
  if (!resposta.ok) {
    const erro = new Error(dados?.erro || `Falha na requisição (HTTP ${resposta.status})`);
    erro.codigo = dados?.codigo;
    throw erro;
  }
  return dados;
}

/* =======================================================================
   Cenários
   ===================================================================== */

function renderCenarios() {
  const alvo = $("#cenarios");
  const todos = [...CENARIOS, CENARIO_PERSONALIZADO];
  alvo.innerHTML = todos
    .map((c) => {
      const resolvido = c.id === CENARIO_PERSONALIZADO.id ? null : resolverCenario(c.id);
      const ativo = estado.cenarioId === c.id;
      const mini = resolvido
        ? `<div class="mini-weights">${CRITERIOS.map(
            (crit) =>
              `<i style="width:${(resolvido.pesosObjeto[crit.id] * 100).toFixed(1)}%;background:${CORES[crit.id]}"></i>`
          ).join("")}</div>`
        : `<div class="mini-weights"><i style="width:20%;background:#475569"></i><i style="width:20%;background:#64748b"></i><i style="width:20%;background:#94a3b8"></i><i style="width:20%;background:#cbd5e1"></i><i style="width:20%;background:#e2e8f0"></i></div>`;
      return `
        <button class="scenario-card ${ativo ? "on" : ""}" data-cenario="${c.id}" type="button"
                aria-pressed="${ativo}">
          <div class="emoji">${c.emoji}</div>
          <div class="nome">${escapar(c.nome)}</div>
          <div class="resumo">${escapar(c.resumo)}</div>
          ${mini}
        </button>`;
    })
    .join("");
}

function selecionarCenario(id) {
  estado.cenarioId = id;
  if (id === CENARIO_PERSONALIZADO.id) {
    const base = estado.analise?.cenario?.pesosObjeto || { chuva: 20, eficiencia: 20, vida: 20, preco: 20, ruido: 20 };
    estado.pesosCustom = { ...base };
    $("#custom-controls").hidden = false;
    sincronizarSliders();
  } else {
    estado.pesosCustom = null;
    $("#custom-controls").hidden = true;
  }
  renderCenarios();
  recomputar();
}

function sincronizarSliders() {
  for (const crit of CRITERIOS) {
    const slider = $(`#sl-${crit.id}`);
    const label = $(`#sl-${crit.id}-val`);
    const valor = Math.round((estado.pesosCustom?.[crit.id] ?? 0.2) * 100);
    if (slider) slider.value = valor;
    if (label) label.textContent = `${valor}%`;
  }
}

/* =======================================================================
   Pesos, matriz e consistência
   ===================================================================== */

function renderPesos() {
  const cenario = estado.analise?.cenario;
  if (!cenario) return;

  $("#pesos").innerHTML = CRITERIOS.map((c) => {
    const valor = cenario.pesosObjeto[c.id] ?? 0;
    return `
      <div class="weight-row">
        <div class="weight-top">
          <span class="lab">${escapar(c.nome)}</span>
          <span class="val">${pct(valor, 1)}</span>
        </div>
        <div class="weight-track">
          <div class="weight-fill" style="width:${(valor * 100).toFixed(1)}%;background:${CORES[c.id]}"></div>
        </div>
      </div>`;
  }).join("");

  const badge = $("#cr-badge");
  if (cenario.personalizado) {
    badge.className = "cr ok";
    badge.textContent = "Pesos manuais · matriz consistente (CR = 0)";
  } else {
    const cr = cenario.consistencia.cr;
    badge.className = `cr ${cenario.consistencia.consistente ? "ok" : "bad"}`;
    badge.textContent = `CR = ${pct(cr, 2)} · ${cenario.consistencia.consistente ? "consistente" : "revisar julgamentos"}`;
    badge.title = `λmax = ${num(cenario.consistencia.lambdaMax, 3)} · CI = ${num(cenario.consistencia.ci, 4)} · RI = 1,12`;
  }

  renderMatriz(cenario);
}

function fmtSaaty(valor) {
  if (!Number.isFinite(valor)) return "—";
  if (valor >= 1) return num(valor, Number.isInteger(valor) ? 0 : 1);
  const inverso = 1 / valor;
  return `1/${num(inverso, Number.isInteger(inverso) ? 0 : 1)}`;
}

function renderMatriz(cenario) {
  const matriz = cenario.matriz;
  const alvo = $("#matriz");
  if (!matriz || !alvo) {
    alvo.innerHTML = "";
    return;
  }
  alvo.innerHTML = `
    <div class="table-scroll" style="margin-top:10px">
      <table>
        <thead>
          <tr>
            <th></th>
            ${CRITERIOS.map((c) => `<th class="center" title="${escapar(c.nome)}">${escapar(c.curto)}</th>`).join("")}
            <th class="right">Peso</th>
          </tr>
        </thead>
        <tbody>
          ${matriz
            .map(
              (linha, i) => `
            <tr>
              <td class="muted">${escapar(CRITERIOS[i].curto)}</td>
              ${linha
                .map(
                  (v, j) =>
                    `<td class="center num ${i === j ? "muted" : ""}">${i === j ? "1" : fmtSaaty(v)}</td>`
                )
                .join("")}
              <td class="right num" style="color:${CORES[CRITERIOS[i].id]}">${pct(cenario.pesosObjeto[CRITERIOS[i].id], 1)}</td>
            </tr>`
            )
            .join("")}
        </tbody>
      </table>
    </div>`;
}

/* =======================================================================
   Veredito
   ===================================================================== */

function vazio(mensagem, detalhe = "") {
  return `<div class="empty"><b>${escapar(mensagem)}</b>${escapar(detalhe)}</div>`;
}

function badgeClasse(rotulo, classe, extra = "") {
  const c = classe || "—";
  return `<span class="crit-badge">${rotulo} <span class="classe classe-${classe || "nd"}">${escapar(c)}</span>${
    extra ? `<span class="dim">${extra}</span>` : ""
  }</span>`;
}

function renderVeredito() {
  const a = estado.analise;
  const v = a?.vencedor;

  if (!v) {
    $("#v-nome").textContent = "Sem dados para analisar";
    $("#v-marcacao").textContent = "Escolha uma marcação com pneus disponíveis.";
    $("#v-preco").textContent = "—";
    $("#v-badges").innerHTML = "";
    $("#v-razoes").innerHTML = "";
    $("#v-podio").innerHTML = "";
    $("#v-score").textContent = "—";
    $("#v-ahp").textContent = "—";
    $("#v-margem").textContent = "—";
    $("#v-custo").textContent = "—";
    $("#v-consumo").textContent = "—";
    $("#v-link").hidden = true;
    $("#v-concordancia").className = "agree";
    $("#v-concordancia").textContent = "Aguardando dados.";
    return;
  }

  $("#v-kicker").textContent = `${a.cenario.emoji || "🏆"} Melhor opção — ${a.cenario.nome}`;
  $("#v-nome").textContent = v.nome;
  $("#v-marcacao").textContent = v.marcacao;
  $("#v-preco").textContent = reais(v.preco);

  const link = $("#v-link");
  if (v.url) {
    link.href = v.url;
    link.hidden = false;
  } else {
    link.hidden = true;
  }

  const vidaTxt = v.flags.includes("vida-estimada") ? "estimado" : "";
  $("#v-badges").innerHTML = [
    badgeClasse("Eficiência", v.eficiencia, v.classes.eficiencia ? pct(v.classes.eficiencia.indice, 0) : ""),
    badgeClasse("Chuva", v.chuva, v.classes.chuva ? pct(v.classes.chuva.indice, 0) : ""),
    `<span class="crit-badge">Ruído <b>${v.ruido ?? "—"} dB</b></span>`,
    `<span class="crit-badge">UTQG <b>${v.vidaUtil > 0 ? v.vidaUtil : v.vidaEfetiva}</b>${
      vidaTxt ? ` <span class="tag warn">${vidaTxt}</span>` : ""
    }</span>`,
    `<span class="crit-badge">Consumo <b>${v.consumo ? num(v.consumo) : "—"} L/100 km</b></span>`,
  ].join("");

  $("#v-razoes").innerHTML = a.justificativas
    .map((j) => `<li><span class="ico">${j.icone}</span><span>${formatarJustificativa(j.texto)}</span></li>`)
    .join("");

  const score = v.topsisScore;
  const circunferencia = 314.159;
  $("#gauge-valor").style.strokeDashoffset = String(circunferencia * (1 - score));
  $("#v-score").textContent = pct(score, 0);
  $("#v-ahp").textContent = pct(v.ahpScore, 0);
  $("#v-margem").textContent = a.segundo ? `+${num(a.margem * 100, 1)} p.p.` : "—";
  $("#v-custo").textContent = reais(v.custoTotalMilKm);
  $("#v-consumo").textContent = v.consumo ? `${num(v.consumo)} L/100 km` : "—";

  const concordancia = $("#v-concordancia");
  if (a.concordancia) {
    concordancia.className = "agree ok";
    concordancia.textContent = "✓ AHP e TOPSIS apontam o mesmo vencedor — decisão robusta.";
  } else {
    const liderAhp = [...a.ranking].sort((x, y) => x.ahpRank - y.ahpRank)[0];
    concordancia.className = "agree dif";
    concordancia.textContent = `⚠ O TOPSIS elege ${v.nome}; o AHP prefere ${liderAhp.nome}. Divergência comum quando preço e vida útil puxam para lados opostos.`;
  }

  $("#v-podio").innerHTML = a.podio
    .map(
      (p, i) => `
      <div class="item">
        <span class="pos">${i + 1}º</span>
        <span class="nome" title="${escapar(p.nome)}">${escapar(p.nome)}</span>
        <span class="sc">${pct(p.topsisScore, 0)}</span>
      </div>`
    )
    .join("");
}

function formatarJustificativa(texto) {
  // destaca valores em R$ e percentuais
  return escapar(texto)
    .replace(/(R\$\s?[\d.,]+)/g, "<b>$1</b>")
    .replace(/(\b\d+(?:[.,]\d+)?%)/g, "<b>$1</b>");
}

/* =======================================================================
   Gráficos SVG
   ===================================================================== */

function renderChart() {
  const a = estado.analise;
  const alvo = $("#chart");
  if (!a?.ranking?.length) {
    alvo.innerHTML = vazio("Sem alternativas para comparar", "Ajuste a marcação ou atualize os dados.");
    return;
  }

  const ordenado = [...a.ranking].sort((x, y) => {
    if (estado.sort === "ahp") return y.ahpScore - x.ahpScore;
    if (estado.sort === "preco") return x.preco - y.preco;
    if (estado.sort === "custo") return x.custoTotalMilKm - y.custoTotalMilKm;
    return y.topsisScore - x.topsisScore;
  });

  if (telaEstreita()) {
    renderChartEstreito(ordenado);
    return;
  }

  const limite = 14;
  const itens = ordenado.slice(0, limite);
  const largura = 780;
  const esquerda = 226;
  const larguraBarra = 470;
  const alturaLinha = 40;
  const altura = itens.length * alturaLinha + 16;

  const barras = itens
    .map((item, i) => {
      const y = i * alturaLinha + 8;
      const nome = item.nome.length > 30 ? `${item.nome.slice(0, 29)}…` : item.nome;
      const wAhp = Math.max(2, item.ahpScore * larguraBarra);
      const wTop = Math.max(2, item.topsisScore * larguraBarra);
      return `
        <g class="row">
          <rect class="row-bg" x="0" y="${y}" width="${largura}" height="${alturaLinha}" fill="transparent"/>
          <text x="0" y="${y + 16}" fill="#cbd5e1" font-size="11.5" font-weight="600">${escapar(nome)}</text>
          <text x="0" y="${y + 29}" fill="#5f7292" font-size="9.5">${escapar(item.marcacao)} · ${reais(item.preco)}</text>
          <rect x="${esquerda}" y="${y + 6}" width="${wAhp}" height="9" rx="4.5" fill="#34d399" opacity="0.9"/>
          <rect x="${esquerda}" y="${y + 20}" width="${wTop}" height="9" rx="4.5" fill="#38bdf8" opacity="0.95"/>
          <text x="${largura - 6}" y="${y + 13}" text-anchor="end" fill="#6ee7b7" font-size="9.5"
                font-family="ui-monospace, monospace">${pct(item.ahpScore, 1)}</text>
          <text x="${largura - 6}" y="${y + 27}" text-anchor="end" fill="#7dd3fc" font-size="9.5"
                font-family="ui-monospace, monospace">${pct(item.topsisScore, 1)}</text>
        </g>`;
    })
    .join("");

  alvo.innerHTML = `
    <svg viewBox="0 0 ${largura} ${altura}" role="img"
         aria-label="Comparação das pontuações AHP e TOPSIS por pneu">
      ${barras}
    </svg>
    ${ordenado.length > limite ? `<p class="dim" style="font-size:11.5px;margin:6px 0 0">Exibindo os ${limite} primeiros de ${ordenado.length}. A tabela completa está logo abaixo.</p>` : ""}`;
}

function telaEstreita() {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(max-width: 720px)").matches
    : false;
}

/** Layout vertical compacto para telas estreitas: barras em largura total. */
function renderChartEstreito(ordenado) {
  const limite = 8;
  const itens = ordenado.slice(0, limite);
  const largura = 360;
  const larguraBarra = 290;
  const alturaLinha = 56;
  const altura = itens.length * alturaLinha + 8;

  const linhas = itens
    .map((item, i) => {
      const y = i * alturaLinha + 6;
      const nome = item.nome.length > 34 ? `${item.nome.slice(0, 33)}…` : item.nome;
      const wAhp = Math.max(2, item.ahpScore * larguraBarra);
      const wTop = Math.max(2, item.topsisScore * larguraBarra);
      return `
        <g>
          <text x="0" y="${y + 11}" fill="#cbd5e1" font-size="11.5" font-weight="600">${escapar(nome)}</text>
          <text x="0" y="${y + 23}" fill="#5f7292" font-size="9">${escapar(item.marcacao)} · ${reais(item.preco)}</text>
          <rect x="0" y="${y + 28}" width="${wAhp}" height="7" rx="3.5" fill="#34d399"/>
          <text x="${largura}" y="${y + 35}" text-anchor="end" fill="#6ee7b7" font-size="9"
                font-family="ui-monospace, monospace">${pct(item.ahpScore, 1)}</text>
          <rect x="0" y="${y + 40}" width="${wTop}" height="7" rx="3.5" fill="#38bdf8"/>
          <text x="${largura}" y="${y + 47}" text-anchor="end" fill="#7dd3fc" font-size="9"
                font-family="ui-monospace, monospace">${pct(item.topsisScore, 1)}</text>
        </g>`;
    })
    .join("");

  $("#chart").innerHTML = `
    <svg viewBox="0 0 ${largura} ${altura}" role="img" aria-label="Pontuações AHP e TOPSIS">
      ${linhas}
    </svg>
    ${ordenado.length > limite ? `<p class="dim" style="font-size:11.5px;margin:6px 0 0">Top ${limite} de ${ordenado.length}.</p>` : ""}`;
}

function renderChartContrib() {
  const a = estado.analise;
  const alvo = $("#chart-contrib");
  if (!a?.ranking?.length) {
    alvo.innerHTML = "";
    return;
  }
  const itens = [...a.ranking].sort((x, y) => x.ahpRank - y.ahpRank).slice(0, 5);
  const largura = 780;
  const esquerda = 210;
  const larguraBarra = 500;
  const alturaLinha = 34;
  const altura = itens.length * alturaLinha + 30;

  const legendas = CRITERIOS.map(
    (c, i) =>
      `<g transform="translate(${i * 118},0)"><rect width="10" height="10" rx="2" fill="${CORES[c.id]}"/><text x="15" y="9" fill="#9fb0c9" font-size="10">${escapar(c.curto)}</text></g>`
  ).join("");

  const linhas = itens
    .map((item, i) => {
      const y = i * alturaLinha + 26;
      let acumulado = 0;
      const segmentos = CRITERIOS.map((c) => {
        const v = item.contribuicoes?.[c.id] ?? 0;
        const w = v * larguraBarra;
        const x = esquerda + acumulado * larguraBarra;
        acumulado += v;
        return w > 0.5
          ? `<rect x="${x}" y="${y}" width="${Math.max(0, w - 1)}" height="14" fill="${CORES[c.id]}" opacity="0.9"><title>${escapar(
              c.nome
            )}: ${pct(v, 1)}</title></rect>`
          : "";
      }).join("");
      return `
        <g>
          <text x="0" y="${y + 11}" fill="#cbd5e1" font-size="11">${escapar(
            item.nome.length > 27 ? `${item.nome.slice(0, 26)}…` : item.nome
          )}</text>
          ${segmentos}
          <text x="${largura - 4}" y="${y + 11}" text-anchor="end" fill="#e2e8f0" font-size="10"
                font-family="ui-monospace, monospace">${pct(item.ahpScore, 1)}</text>
        </g>`;
    })
    .join("");

  alvo.innerHTML = `<svg viewBox="0 0 ${largura} ${altura}" role="img" aria-label="Contribuição por critério">
      <g transform="translate(0,4)">${legendas}</g>
      ${linhas}
    </svg>`;
}

/* =======================================================================
   Tabela e sensibilidade
   ===================================================================== */

function renderTabela() {
  const a = estado.analise;
  const corpo = $("#tabela-corpo");
  if (!a?.ranking?.length) {
    corpo.innerHTML = `<tr><td colspan="12">${vazio("Nenhum pneu encontrado", "Verifique a medida digitada.")}</td></tr>`;
    $("#tabela-resumo").textContent = "—";
    return;
  }

  const marcacao = estado.marcacao || "todas as marcações";
  $("#tabela-resumo").textContent = `${a.ranking.length} pneus em ${estado.medida} · ${marcacao} · atualizado em ${fmtData(
    estado.fonte?.coletadoEm
  )}`;

  corpo.innerHTML = a.ranking
    .map((r) => {
      const tags = [];
      if (r.flags.includes("vida-estimada")) tags.push('<span class="tag warn">UTQG estimado</span>');
      if (r.flags.includes("etiqueta-incompleta")) tags.push('<span class="tag warn">etiqueta incompleta</span>');
      if (r.flags.includes("sem-estoque")) tags.push('<span class="tag out">sem estoque</span>');
      if (r.emEstoque && r.estoque !== null && r.estoque < 10) tags.push('<span class="tag">últimas un.</span>');
      if (!tags.length) tags.push('<span class="tag" style="color:#6ee7b7;border-color:rgba(52,211,153,.25)">disponível</span>');

      return `
        <tr class="${r.topsisRank === 1 ? "destaque" : ""}">
          <td class="num dim">${r.topsisRank}º</td>
          <td>
            <div class="modelo-cell">
              <span class="m" title="${escapar(r.nome)}">${escapar(r.nome)}</span>
              <span class="s">${escapar(r.marca)}</span>
            </div>
          </td>
          <td class="num dim" style="white-space:nowrap">${escapar(r.marcacao)}</td>
          <td class="center"><span class="classe classe-${r.eficiencia || "nd"}">${r.eficiencia || "—"}</span></td>
          <td class="center"><span class="classe classe-${r.chuva || "nd"}">${r.chuva || "—"}</span></td>
          <td class="center num">${r.ruido ?? "—"} dB</td>
          <td class="center num">${r.vidaUtil > 0 ? r.vidaUtil : `<span class="dim">${r.vidaEfetiva}*</span>`}</td>
          <td class="right num">${reais(r.preco)}</td>
          <td class="right num muted">${reais(r.custoTotalMilKm)}</td>
          <td class="right">
            <div class="score-bar">
              <div class="track"><div class="fill" style="width:${(r.ahpScore * 100).toFixed(1)}%;background:#34d399"></div></div>
              <span class="num">${pct(r.ahpScore, 1)}</span>
            </div>
          </td>
          <td class="right">
            <div class="score-bar">
              <div class="track"><div class="fill" style="width:${(r.topsisScore * 100).toFixed(1)}%;background:#38bdf8"></div></div>
              <span class="num">${pct(r.topsisScore, 1)}</span>
            </div>
          </td>
          <td>${tags.join(" ")}</td>
        </tr>`;
    })
    .join("");
}

function renderSensibilidade() {
  const a = estado.analise;
  const alvo = $("#sensibilidade");
  if (!a?.sensibilidade?.length) {
    alvo.innerHTML = vazio("Sem dados suficientes", "");
    return;
  }

  const cenarios = CENARIOS;
  const linhas = a.sensibilidade
    .map((item) => {
      const celulas = cenarios
        .map((c) => {
          const rank = item.ranks[c.id];
          const classe = rank === 1 ? "rank1" : rank === 2 ? "rank2" : rank === 3 ? "rank3" : "rankx";
          return `<td class="center num ${classe}">${rank ?? "—"}º</td>`;
        })
        .join("");
      return `<tr>
        <td>${escapar(item.nome)}</td>
        ${celulas}
        <td class="center num">${item.vitorias}</td>
      </tr>`;
    })
    .join("");

  alvo.innerHTML = `
    <p class="dim" style="font-size:12px;margin:0 0 10px">
      Posição no TOPSIS de cada finalista quando o cenário muda. Um pneu que fica no topo em vários cenários
      é uma escolha mais segura.
    </p>
    <div class="table-scroll">
      <table class="sens-table">
        <thead>
          <tr>
            <th>Modelo</th>
            ${cenarios.map((c) => `<th class="center" title="${escapar(c.nome)}">${c.emoji} ${escapar(c.nome.split(" ")[0])}</th>`).join("")}
            <th class="center">Vitórias</th>
          </tr>
        </thead>
        <tbody>${linhas}</tbody>
      </table>
    </div>`;
}

/* =======================================================================
   Metodologia
   ===================================================================== */

function renderMetodologia() {
  const passo = estado.premissas.passoEficiencia;
  $("#txt-passo").textContent = `${(passo * 100).toFixed(0)}%`;

  const linhas = tabelaClasses(passo, { baseL100: estado.premissas.baseL100 })
    .map(
      ({ classe, eficiencia, chuva, consumo }) => `
      <tr>
        <td><span class="classe classe-${classe}">${classe}</span></td>
        <td class="right num">${pct(eficiencia.indice, 1)}</td>
        <td class="right num muted">${eficiencia.rrcFaixa}</td>
        <td class="right num muted">${pct(chuva.indice, 1)}</td>
        <td class="right num">${num(consumo, 2)} L/100 km</td>
      </tr>`
    )
    .join("");
  $("#tabela-classes").innerHTML = linhas;
}

/* =======================================================================
   Carga de dados
   ===================================================================== */

function aplicarDados(dados, { preservarMarcacao = false } = {}) {
  estado.produtos = dados.produtos || [];
  estado.marcacoes = dados.marcacoes || [];
  estado.fonte = dados.fonte || null;
  estado.medida = dados.medida || estado.medida;

  const existe = estado.marcacoes.some((m) => m.marcacao === estado.marcacao);
  if (!preservarMarcacao || !existe) {
    estado.marcacao = estado.marcacoes[0]?.marcacao || null;
  }

  renderVariants();
  recomputar();

  const fonte = dados.fonte?.tipo || "—";
  const rotuloFonte =
    fonte === "site" ? "site" : fonte === "cache" ? "cache" : fonte === "semente" ? "dados locais" : fonte;
  setStatus(
    fonte === "site" || fonte === "cache" ? "ok" : "off",
    `${estado.produtos.length} pneus · ${rotuloFonte} · ${fmtData(dados.fonte?.coletadoEm)}`
  );

  const msg = $("#search-msg");
  const aviso = dados.fonte?.aviso;
  msg.className = `search-msg ${aviso ? "warn" : ""}`;
  msg.textContent = aviso
    ? aviso
    : `${estado.produtos.length} pneus em ${estado.marcacoes.length} marcação(ões). Fonte: ${rotuloFonte}${
        dados.fonte?.idadeMin !== null && dados.fonte?.idadeMin !== undefined
          ? ` · coletado há ${dados.fonte.idadeMin} min`
          : ""
      }.`;

  $("#rodape-status").textContent = `Última coleta: ${fmtData(dados.fonte?.coletadoEm)} · medida ${estado.medida} · ${
    estado.produtos.length
  } produtos.`;
}

function renderVariants() {
  const alvo = $("#variants");
  if (!estado.marcacoes.length) {
    alvo.innerHTML = "";
    return;
  }
  const todas = `<button class="chip ${!estado.marcacao ? "on" : ""}" data-marcacao="">
      Todas <span class="n">${estado.produtos.length}</span></button>`;
  const chips = estado.marcacoes
    .map(
      (m) => `<button class="chip ${estado.marcacao === m.marcacao ? "on" : ""}" data-marcacao="${escapar(
        m.marcacao
      )}" title="${escapar(m.marcacao)}">
        ${escapar(m.marcacao.replace(estado.medida, "").trim() || m.marcacao)}
        <span class="n">${m.total}</span></button>`
    )
    .join("");
  alvo.innerHTML = todas + chips;
}

function recomputar() {
  const produtos = estado.marcacao
    ? estado.produtos.filter((p) => p.marcacao === estado.marcacao)
    : estado.produtos;

  if (!produtos.length) {
    estado.analise = null;
    renderVeredito();
    renderChart();
    renderTabela();
    renderSensibilidade();
    return;
  }

  estado.analise = analisar(produtos, {
    cenarioId: estado.cenarioId,
    pesosPersonalizados: estado.cenarioId === CENARIO_PERSONALIZADO.id ? estado.pesosCustom : null,
    premissas: estado.premissas,
  });

  renderPesos();
  renderVeredito();
  renderChart();
  renderChartContrib();
  renderTabela();
  renderSensibilidade();
}

async function carregarMedida(medidaBruta, { refresh = false, silencioso = false } = {}) {
  const medida = normalizarMedida(medidaBruta);
  if (!medida) {
    $("#search-msg").className = "search-msg err";
    $("#search-msg").textContent = "Marcação inválida. Use o formato 205/55R16.";
    toast("Marcação inválida. Exemplo: 205/55R16", "err");
    return;
  }
  if (estado.carregando) return;

  estado.carregando = true;
  const botao = $("#btn-analisar");
  const rotulo = botao.textContent;
  botao.disabled = true;
  botao.innerHTML = '<span class="spin"></span> Buscando…';
  if (!silencioso) setStatus("busy", `Consultando ${medida}…`);

  try {
    const params = new URLSearchParams({ medida });
    if (refresh) params.set("refresh", "1");
    const dados = await api(`/api/pneus?${params}`);
    if (!dados.produtos?.length) {
      throw new Error(`Nenhum pneu encontrado para ${medida}.`);
    }
    $("#medida").value = medida;
    aplicarDados(dados, { preservarMarcacao: refresh });
    if (refresh) {
      toast(
        silencioso
          ? `${dados.produtos.length} pneus atualizados do site.`
          : `Dados recarregados do site: ${dados.produtos.length} pneus.`,
        "ok"
      );
    }
  } catch (erro) {
    setStatus("off", "Falha na coleta");
    $("#search-msg").className = "search-msg err";
    $("#search-msg").textContent = erro.message;
    if (!silencioso) toast(erro.message, "err");
  } finally {
    estado.carregando = false;
    botao.disabled = false;
    botao.textContent = rotulo;
  }
}

async function carregarMedidas() {
  try {
    const dados = await api("/api/medidas");
    $("#medidas-lista").innerHTML = (dados.medidas || [])
      .map((m) => `<option value="${escapar(m)}"></option>`)
      .join("");
  } catch {
    /* catálogo é opcional */
  }
}

/* =======================================================================
   Exportação
   ===================================================================== */

function exportarCsv() {
  const a = estado.analise;
  if (!a?.ranking?.length) {
    toast("Nada para exportar ainda.", "err");
    return;
  }
  const cabecalho = [
    "Posicao",
    "Modelo",
    "Marca",
    "Marcacao",
    "Preco_R",
    "Eficiencia",
    "Chuva",
    "Ruido_dB",
    "UTQG",
    "AHP",
    "TOPSIS",
    "Custo_1000km_R",
    "Consumo_L_100km",
    "Cenario",
    "URL",
  ];
  const linhas = a.ranking.map((r) => [
    r.topsisRank,
    r.nome,
    r.marca,
    r.marcacao,
    num(r.preco),
    r.eficiencia || "",
    r.chuva || "",
    r.ruido ?? "",
    r.vidaUtil || "",
    num(r.ahpScore, 4),
    num(r.topsisScore, 4),
    num(r.custoTotalMilKm),
    num(r.consumo),
    a.cenario.nome,
    r.url || "",
  ]);
  const csv = [cabecalho, ...linhas]
    .map((linha) => linha.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";"))
    .join("\r\n");
  const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `tiredecision_${estado.medida.replace("/", "-")}_${a.cenario.id}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  toast("Ranking exportado em CSV.", "ok");
}

/* =======================================================================
   Eventos
   ===================================================================== */

function ligarEventos() {
  $("#btn-analisar").addEventListener("click", () => carregarMedida($("#medida").value));

  $("#medida").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      carregarMedida(e.target.value);
    }
  });

  $("#medida").addEventListener("blur", () => {
    const norm = normalizarMedida($("#medida").value);
    if (norm && norm !== estado.medida) carregarMedida(norm);
  });

  $("#variants").addEventListener("click", (e) => {
    const chip = e.target.closest("[data-marcacao]");
    if (!chip) return;
    estado.marcacao = chip.dataset.marcacao || null;
    renderVariants();
    recomputar();
  });

  $("#cenarios").addEventListener("click", (e) => {
    const card = e.target.closest("[data-cenario]");
    if (!card) return;
    selecionarCenario(card.dataset.cenario);
  });

  $("#sort-btns").addEventListener("click", (e) => {
    const botao = e.target.closest("[data-sort]");
    if (!botao) return;
    estado.sort = botao.dataset.sort;
    $$("#sort-btns button").forEach((b) => b.classList.toggle("on", b === botao));
    renderChart();
  });

  $("#btn-refresh").addEventListener("click", () => carregarMedida(estado.medida, { refresh: true }));

  $("#btn-export").addEventListener("click", exportarCsv);

  $("#auto-refresh").addEventListener("change", (e) => {
    clearInterval(estado.autoTimer);
    estado.autoTimer = null;
    if (e.target.checked) {
      estado.autoTimer = setInterval(() => carregarMedida(estado.medida, { refresh: true, silencioso: true }), 10 * 60 * 1000);
      toast("Atualização automática a cada 10 minutos ativada.", "ok");
    }
  });

  for (const crit of CRITERIOS) {
    const slider = $(`#sl-${crit.id}`);
    slider?.addEventListener("input", (e) => {
      const valor = Number(e.target.value);
      estado.pesosCustom = { ...(estado.pesosCustom || {}), [crit.id]: valor / 100 };
      $(`#sl-${crit.id}-val`).textContent = `${valor}%`;
      recomputar();
    });
  }

  const premissasMap = [
    ["#p-base", "baseL100", 1, 30],
    ["#p-litro", "precoLitro", 1, 20],
    ["#p-utqg", "kmPorUtqg", 20, 500],
  ];
  for (const [seletor, chave, min, max] of premissasMap) {
    $(seletor)?.addEventListener("change", (e) => {
      const valor = Math.min(max, Math.max(min, Number(e.target.value) || PREMISSAS_PADRAO[chave]));
      e.target.value = valor;
      estado.premissas[chave] = valor;
      renderMetodologia();
      recomputar();
    });
  }

  $("#p-passo")?.addEventListener("change", (e) => {
    const valor = Math.min(30, Math.max(0, Number(e.target.value) || 8)) / 100;
    e.target.value = (valor * 100).toFixed(1);
    estado.premissas.passoEficiencia = valor;
    renderMetodologia();
    recomputar();
  });

  if (typeof window !== "undefined") {
    let temporizador;
    window.addEventListener("resize", () => {
      clearTimeout(temporizador);
      temporizador = setTimeout(() => {
        if (estado.analise) renderChart();
      }, 180);
    });
  }
}

/* =======================================================================
   Inicialização
   ===================================================================== */

async function iniciar() {
  renderCenarios();
  renderMetodologia();
  ligarEventos();
  await carregarMedidas();
  await carregarMedida(estado.medida);
}

iniciar().catch((erro) => {
  console.error(erro);
  setStatus("off", "Erro ao iniciar");
  toast(`Erro ao iniciar: ${erro.message}`, "err");
});
