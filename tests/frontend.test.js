/**
 * Teste de fumaça da interface: roda o app.js de verdade contra o servidor de
 * verdade, usando um DOM mínimo. Garante que a inicialização, a coleta, o
 * cálculo e todas as renderizações funcionam sem exceção.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { servidor } from "../server.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(__dirname, "..");

class ElementoFalso {
  constructor(tag = "div") {
    this.tagName = tag;
    this._html = "";
    this.textContent = "";
    this.className = "";
    this.style = {};
    this.dataset = {};
    this.hidden = false;
    this.disabled = false;
    this.value = "";
    this.href = "";
    this.children = [];
    this._listeners = {};
  }
  set innerHTML(v) {
    this._html = String(v);
  }
  get innerHTML() {
    return this._html;
  }
  addEventListener(tipo, fn) {
    (this._listeners[tipo] ||= []).push(fn);
  }
  appendChild(c) {
    this.children.push(c);
    return c;
  }
  remove() {}
  click() {}
  querySelector() {
    return null;
  }
  closest() {
    return null;
  }
  get classList() {
    return { add() {}, remove() {}, toggle() {}, contains: () => false };
  }
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

test("interface inicializa, coleta e renderiza", { timeout: 30000 }, async (t) => {
  await new Promise((r) => servidor.listen(0, "127.0.0.1", r));
  const porta = servidor.address().port;
  const base = `http://127.0.0.1:${porta}`;
  t.after(() => servidor.close());

  const html = readFileSync(path.join(RAIZ, "public", "index.html"), "utf8");
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
  const elementos = new Map(ids.map((id) => [id, new ElementoFalso()]));

  globalThis.document = {
    querySelector(sel) {
      return sel.startsWith("#") ? elementos.get(sel.slice(1)) ?? null : null;
    },
    querySelectorAll() {
      return [];
    },
    createElement: (tag) => new ElementoFalso(tag),
    body: new ElementoFalso("body"),
  };

  const fetchOriginal = globalThis.fetch;
  globalThis.fetch = (url, opcoes) =>
    fetchOriginal(String(url).startsWith("/") ? base + url : url, opcoes);

  // O navegador resolve "/lib/..." pela raiz do site; aqui apontamos para o disco.
  const libUrl = pathToFileURL(path.join(RAIZ, "public", "lib")).href;
  const codigo = readFileSync(path.join(RAIZ, "public", "app.js"), "utf8").replaceAll(
    '"/lib/',
    `"${libUrl}/`
  );
  const arquivoTemporario = path.join(tmpdir(), `td-app-${Date.now()}.mjs`);
  writeFileSync(arquivoTemporario, codigo);

  const erros = [];
  const erroOriginal = console.error;
  console.error = (...args) => {
    erros.push(args.map(String).join(" "));
  };

  try {
    await import(pathToFileURL(arquivoTemporario).href);

    // espera a análise assíncrona terminar
    let limite = Date.now() + 15000;
    while (Date.now() < limite) {
      const atual = elementos.get("v-nome").textContent;
      if (atual && atual !== "—" && !atual.startsWith("Sem dados")) break;
      await dormir(100);
    }

    const nome = elementos.get("v-nome").textContent;
    assert.ok(nome && !nome.startsWith("Sem dados"), `vencedor não renderizado: "${nome}"`);
    assert.match(nome, /[A-Z]{2,}/);

    assert.match(elementos.get("v-preco").textContent, /R\$/);
    assert.equal((elementos.get("pesos").innerHTML.match(/weight-row/g) || []).length, 5);
    assert.equal((elementos.get("cenarios").innerHTML.match(/scenario-card/g) || []).length, 7);
    assert.match(elementos.get("cr-badge").textContent, /CR/);
    assert.ok((elementos.get("tabela-corpo").innerHTML.match(/<tr/g) || []).length >= 10);
    assert.match(elementos.get("chart").innerHTML, /<svg/);
    assert.match(elementos.get("v-razoes").innerHTML, /<li>/);
    assert.match(elementos.get("variants").innerHTML, /data-marcacao/);
    assert.match(elementos.get("tabela-classes").innerHTML, /classe-A/);
    assert.equal(erros.length, 0, `console.error inesperado: ${erros.join(" | ")}`);
  } finally {
    console.error = erroOriginal;
    globalThis.fetch = fetchOriginal;
    delete globalThis.document;
  }
});
