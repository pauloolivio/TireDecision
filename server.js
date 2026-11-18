/**
 * Servidor local do TireDecision — sem dependências externas.
 *
 *   node server.js            (porta 7791 por padrão)
 *   PORT=8080 node server.js
 *
 * Serve a interface em public/ e delega /api/* para lib/api.js (o mesmo
 * handler usado pela função serverless da Vercel).
 */

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tratarApi, responderJson } from "./lib/api.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLICO = path.join(__dirname, "public");
const PORTA_INICIAL = Number(process.env.PORT) || 7791;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
};

async function servirArquivo(resposta, caminhoAbsoluto, cache = "no-cache") {
  try {
    const info = await stat(caminhoAbsoluto);
    if (!info.isFile()) return false;
    const conteudo = await readFile(caminhoAbsoluto);
    const ext = path.extname(caminhoAbsoluto).toLowerCase();
    resposta.writeHead(200, {
      "content-type": MIME[ext] || "application/octet-stream",
      "cache-control": cache,
      "content-length": conteudo.length,
    });
    resposta.end(conteudo);
    return true;
  } catch {
    return false;
  }
}

/** Resolve um caminho dentro de um diretório permitido, bloqueando traversal. */
function caminhoSeguro(base, relativo) {
  const destino = path.resolve(base, "." + decodeURIComponent(relativo));
  if (destino !== base && !destino.startsWith(base + path.sep)) return null;
  return destino;
}

const servidor = createServer(async (req, resposta) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const metodo = req.method || "GET";

  if (metodo !== "GET" && metodo !== "HEAD") {
    return responderJson(resposta, 405, { erro: "Método não permitido." });
  }

  try {
    if (url.pathname.startsWith("/api/")) {
      await tratarApi(req, url, resposta);
      return;
    }

    if (url.pathname === "/" || url.pathname === "/index.html") {
      const ok = await servirArquivo(resposta, path.join(PUBLICO, "index.html"), "no-cache");
      if (!ok) responderJson(resposta, 500, { erro: "index.html não encontrado." });
      return;
    }

    const destino = caminhoSeguro(PUBLICO, url.pathname);
    if (destino && (await servirArquivo(resposta, destino, "no-cache"))) return;

    // fallback para a SPA
    if (await servirArquivo(resposta, path.join(PUBLICO, "index.html"), "no-cache")) return;
    responderJson(resposta, 404, { erro: "Recurso não encontrado." });
  } catch (erro) {
    console.error(`[${new Date().toISOString()}] ${erro.stack || erro.message}`);
    if (!resposta.headersSent) {
      const status = erro.codigo === "MEDIDA_INVALIDA" ? 400 : 502;
      responderJson(resposta, status, { erro: erro.message, codigo: erro.codigo || "ERRO" });
    } else {
      resposta.end();
    }
  }
});

function escutar(porta, tentativasRestantes) {
  servidor.once("error", (erro) => {
    if (erro.code === "EADDRINUSE" && tentativasRestantes > 0) {
      console.warn(`Porta ${porta} ocupada; tentando ${porta + 1}...`);
      escutar(porta + 1, tentativasRestantes - 1);
    } else {
      console.error("Falha ao iniciar o servidor:", erro.message);
      process.exit(1);
    }
  });
  servidor.listen(porta, process.env.HOST || "127.0.0.1", () => {
    const url = `http://127.0.0.1:${porta}`;
    console.log("");
    console.log("  TireDecision  —  AHP + TOPSIS para seleção de pneus");
    console.log(`  Interface: ${url}`);
    console.log(`  API:       ${url}/api/status`);
    console.log("  Encerre com Ctrl+C.");
    console.log("");
  });
}

const executadoDiretamente =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (executadoDiretamente) {
  escutar(PORTA_INICIAL, 10);

  for (const sinal of ["SIGINT", "SIGTERM"]) {
    process.on(sinal, () => {
      servidor.close(() => process.exit(0));
      setTimeout(() => process.exit(0), 1500);
    });
  }
}

export { servidor, PORTA_INICIAL };
