/**
 * Função serverless da Vercel.
 *
 * O arquivo `api/[...rota].js` captura qualquer caminho /api/* e delega para o
 * mesmo handler usado pelo servidor local. A interface é servida estaticamente
 * a partir de `public/`.
 */

import { tratarApi, responderJson } from "../lib/api.js";

export default async function handler(req, res) {
  const url = new URL(req.url || "/", `http://${req.headers?.host || "localhost"}`);

  try {
    if (!url.pathname.startsWith("/api/")) {
      return responderJson(res, 404, { erro: "Rota não encontrada." });
    }
    await tratarApi(req, url, res);
  } catch (erro) {
    console.error(`[vercel] ${erro.stack || erro.message}`);
    if (!res.headersSent) {
      const status = erro.codigo === "MEDIDA_INVALIDA" ? 400 : 502;
      responderJson(res, status, { erro: erro.message, codigo: erro.codigo || "ERRO" });
    } else {
      res.end();
    }
  }
}
