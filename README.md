# TireDecision

Aplicativo local que **coleta pneus do pneufree.com.br**, cruza com a **etiqueta
INMETRO**, calcula **AHP + TOPSIS** e mostra, em tempo real, qual pneu é a melhor
escolha para o cenário de uso selecionado.

![Tela principal](docs/tela.png)

## O que ele faz

1. **Busca automática** — você digita a marcação (ex.: `205/55R16`) e o programa
   consulta o catálogo do site, extraindo preço, classe de eficiência, aderência
   em piso molhado, ruído (dB), índice UTQG e estoque.
2. **Seleção por marcação** — as variações de carga/velocidade (`91V`, `94V`,
   `91H`…) aparecem em chips; o padrão é a mais ofertada.
3. **Cenário de decisão** — seis perfis prontos (custo-benefício, segurança na
   chuva, economia, durabilidade, conforto, orçamento) + modo personalizado.
   Cada cenário define uma matriz AHP de comparação par a par.
4. **AHP** — calcula os pesos dos cinco fatores e a razão de consistência (CR).
5. **TOPSIS** — ranqueia as alternativas pela proximidade da solução ideal.
6. **Resposta final** — card com o pneu recomendado, justificativas, pódio,
   gráfico comparativo AHP × TOPSIS, tabela completa e análise de sensibilidade
   entre cenários.
7. **Atualização** — botão para recoletar do site na hora e opção de atualização
   automática a cada 10 minutos.

## Como rodar

Requisito: **Node.js 18 ou superior** (testado no Node 26). Não há dependências
para instalar.

### Windows (mais fácil)

Dê um duplo clique em **`INICIAR.bat`**. Ele sobe o servidor e abre o navegador
em `http://127.0.0.1:7791`.

### Manual

```bash
cd TireDecision
node server.js
```

Depois abra `http://127.0.0.1:7791`.

> `PORT=8080 node server.js` troca a porta. Se a 7791 estiver ocupada, o
> programa tenta as próximas automaticamente.

## Como usar

1. Digite a medida do pneu (ex.: `205/55R16`) e clique em **Analisar pneus**.
2. Escolha a variação de carga/velocidade nos chips.
3. Selecione o **cenário** que combina com o seu uso.
4. Leia a **resposta final** no card verde; confira o ranking e a tabela.
5. Quer ajustar na mão? Selecione **Personalizado** e mova os pesos.
6. **CSV** exporta o ranking; **Atualizar do site** recoleta os dados.

## Rodar online: GitHub + Vercel

Dá sim — o projeto já vem preparado para os dois modos. O `server.js` atende
localmente e a função `api/[...rota].js` atende a Vercel usando exatamente o
mesmo código de API.

### Passo a passo

1. Crie um repositório no GitHub e envie a pasta:

   ```bash
   git init
   git add .
   git commit -m "TireDecision"
   git branch -M main
   git remote add origin https://github.com/SEU-USUARIO/tire-decision.git
   git push -u origin main
   ```

2. Em [vercel.com](https://vercel.com) → **Add New… → Project** → importe o
   repositório.
3. Configuração de build: **Framework Preset: Other**, *Build Command* vazio e
   *Output Directory* `public` (já definido no `vercel.json`).
4. **Deploy**. A URL sai como `https://seu-projeto.vercel.app`.

### O que já está adaptado

- `api/[...rota].js` captura `/api/*` e reutiliza `lib/api.js`.
- Cache em `os.tmpdir()` (a Vercel só permite escrita em `/tmp`).
- `vercel.json` inclui `data/semente` e `data/medidas.json` no bundle da função
  e define `maxDuration: 30` (uma coleta leva ~1 s).
- Limite de 120 requisições por minuto por IP (`RATE_LIMIT=0` desativa).
- Fallback: se o site recusar a requisição, a função responde com a semente.

### Variáveis de ambiente (opcionais, em Settings → Environment Variables)

| Variável | Padrão | Para que serve |
| --- | --- | --- |
| `ALLOW_SCRAPE` | `1` | `0` desliga a coleta ao vivo e serve só cache/semente |
| `RATE_LIMIT` | `120` | requisições por minuto por IP (`0` desativa) |
| `CACHE_DIR` | `/tmp/tiredecision-cache` | diretório de cache |
| `PORT` / `HOST` | `7791` / `127.0.0.1` | usados apenas no modo local |

### Limitações do modo online

- **IP de datacenter**: o pneufree pode bloquear requisições vindas da AWS (onde
  a Vercel roda). Se isso acontecer, o app continua funcionando com os dados
  semente, mas sem atualizar preços sozinho. Uma saída é rodar `npm run coletar`
  no seu PC e commitar os arquivos de `data/semente/`.
- **Cache por instância**: cada função tem seu próprio `/tmp`; não há cache
  compartilhado entre instâncias. Para um cache global seria preciso um Redis
  (Upstash) — não é necessário para uso pessoal.
- **Plano Hobby** da Vercel é para uso pessoal/não comercial.
- Funções têm limite de execução (aqui, 30 s). Uma medida costuma levar ~1 s.

### Se preferir não usar serverless

Render, Railway, Fly.io e VPS rodam o `server.js` atual sem nenhuma mudança:
basta `HOST=0.0.0.0 node server.js` (a porta vem de `PORT`).

## De onde vêm os dados

O site é uma aplicação Next.js. Em vez de raspar o HTML renderizado com regex
(como no script antigo, que confundia preço com vida útil), o coletor decodifica
o payload RSC da página e lê o objeto `initialProducts`, que já traz os campos
estruturados:

| Campo do site            | Uso no programa                   |
| ------------------------ | --------------------------------- |
| `prices[0].value`        | Preço à vista (R$)                |
| `inmetroEfficiency`      | Classe de eficiência A–G          |
| `inmetroWetBraking`      | Classe de aderência na chuva A–G  |
| `inmetroSound`           | Ruído em dB                       |
| `utqgDurability`         | Vida útil (UTQG)                  |
| `inStock` / `Stock[].Qty`| Disponibilidade                   |
| `Seo.permalink`          | Link direto do produto            |

- **Cache**: cada medida fica 30 minutos em `data/cache/`.
- **Reserva offline**: se o site estiver fora do ar, o programa usa a última
  coleta salva ou os arquivos de `data/semente/`.
- **Paginação**: o coletor lê `totalPages` e busca as páginas restantes.

## Metodologia

### Eficiência de rolamento (INMETRO)

A etiqueta vai de **A** (melhor) a **G**. A premissa adotada é de **8% de perda
por classe, de forma composta**:

| Classe | Eficiência relativa | RRC (kg/t) | Consumo estimado* |
| ------ | ------------------- | ---------- | ----------------- |
| A      | 100,0%              | ≤ 6,5      | 7,00 L/100 km     |
| B      | 92,0%               | 6,6 – 7,7  | 7,61 L/100 km     |
| C      | 84,6%               | 7,8 – 9,0  | 8,27 L/100 km     |
| D      | 77,9%               | 9,1 – 10,5 | 8,99 L/100 km     |
| E      | 71,6%               | 10,6 – 12,0| 9,77 L/100 km     |
| F      | 65,9%               | 12,1 – 13,5| 10,62 L/100 km    |
| G      | 60,6%               | ≥ 13,6     | 11,55 L/100 km    |

\* consumo do rolamento = consumo da classe A ÷ índice de eficiência, com base
de 7,0 L/100 km ajustável na interface. A perda por classe também é ajustável.

### Aderência na chuva

Escala ordinal: A→G convertida em notas igualmente espaçadas (A = 100%,
B = 83,3%, …, G = 0%). As faixas do índice G da etiqueta (ex.: A ≥ 1,55) ficam
disponíveis como referência.

### Vida útil

Índice UTQG (treadwear). Quando o site não informa, o valor é imputado pela
mediana do conjunto e sinalizado como **estimado** na tabela.

### AHP

- Matriz de comparação par a par (escala de Saaty 1–9) definida por cenário.
- Pesos pelo autovetor aproximado (média geométrica das linhas), normalizados.
- Consistência: `CR = CI / RI`, `CI = (λmax − n)/(n − 1)`, `RI = 1,12` para n = 5.
  Todos os cenários ficam abaixo de 5% (limite recomendado: 10%).
- Agregação das alternativas por soma ponderada (MAVT), com critérios de
  benefício (chuva, eficiência, vida) e de custo (preço, ruído).

### TOPSIS

1. Normalização vetorial `rᵢⱼ = xᵢⱼ / √(Σ xᵢⱼ²)`.
2. Matriz ponderada `vᵢⱼ = wⱼ · rᵢⱼ`.
3. Ideal positivo/negativo respeitando o sentido do critério.
4. Distâncias `S+` e `S−` e coeficiente `C = S− / (S+ + S−)`.

O **veredito usa o TOPSIS**; o AHP aparece como conferência de robustez e é o
método que gera os pesos.

### Custo por 1.000 km (estimativa)

`preço ÷ vida_estimada + combustível por 1.000 km`, com vida estimada
`UTQG × 150 km` e gasolina a R$ 6,20/L (ambos ajustáveis). É uma estimativa de
apoio, não parte do score AHP/TOPSIS.

## Estrutura

```
TireDecision/
├─ server.js              servidor local (estáticos + delega /api)
├─ api/
│  └─ [...rota].js        função serverless da Vercel (mesmo handler)
├─ lib/
│  ├─ scraper.js          coleta e normalização dos dados do site
│  └─ api.js              rotas /api, limite por IP e respostas JSON
├─ public/
│  ├─ index.html          interface
│  ├─ app.js              controlador
│  ├─ styles.css          tema
│  └─ lib/                módulos compartilhados (também usados no navegador)
│     ├─ eficiencia.js    modelo INMETRO (classes A–G)
│     ├─ ahp.js           matriz, pesos, consistência e agregação
│     ├─ topsis.js        cálculo TOPSIS
│     ├─ cenarios.js      critérios e cenários
│     └─ analise.js       orquestra tudo e monta o veredito
├─ data/
│  ├─ cache/              cache das coletas (30 min)
│  └─ semente/            dados de reserva offline
├─ scripts/               CLI de análise e coleta
├─ tests/                 testes automatizados
├─ vercel.json            configuração de deploy
└─ .vercelignore
```

> Os módulos em `public/lib/` são isomórficos: o navegador importa
> `/lib/analise.js` e o servidor importa o mesmo arquivo do disco. Uma única
> implementação de AHP/TOPSIS para os dois lados.

## API

As rotas funcionam iguais no modo local e na Vercel (`/api/status` informa o
`ambiente` em uso).

| Rota | Descrição |
| ---- | --------- |
| `GET /api/status` | Versão, uptime e cenários |
| `GET /api/medidas` | Medidas conhecidas |
| `GET /api/pneus?medida=205/55R16&refresh=1` | Produtos + marcações |
| `GET /api/analise?medida=205/55R16&cenario=chuva` | Ranking completo |

## Testes

```bash
npm test
# ou
node --test --test-isolation=none tests/
```

Cobrem o modelo INMETRO, o AHP (incluindo o exemplo clássico de Saaty com
CR ≈ 3,3%), o TOPSIS (caso 2×2 calculado à mão), a análise completa e um teste
de fumaça que executa a interface real contra o servidor real.

Teste de coleta ao vivo:

```bash
TD_LIVE=1 node --test --test-isolation=none tests/scraper.test.js
```

## Avisos

- Ferramenta de apoio à decisão; **confirme preço e estoque no site** antes de
  comprar.
- Os dados e imagens pertencem ao pneufree.com.br. O coletor faz requisições
  espaçadas e mantém cache para não sobrecarregar o site.
- Classes INMETRO e UTQG são informadas pelos fabricantes; o programa não
  realiza ensaios.
