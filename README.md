# Mock API

APIs com dados fictícios seguindo **OpenAPI 3.1**, com autenticação, documentação Swagger e um painel para configurar tudo. Serve para testes, demos e protótipos de front.

- **3 módulos prontos**: RH Trabalhista, Filmes (com pôster e backdrop) e Livros (com capa). Dados coerentes, com CPF, CNPJ, PIS e ISBN válidos, gerados por semente.
- **Gerar com IA**: descreva um domínio ("clínica veterinária com tutores, pets e consultas") e a IA desenha recursos, campos, gráficos, diagramas e ações. O servidor gera os dados e publica CRUD, views e OpenAPI na hora. Funciona com Anthropic (Claude) ou qualquer API compatível com OpenAI (OpenAI, OpenRouter, Groq, Ollama).
- **7 views para o front**, com formato fixo em todo módulo: `table`, `card`, `form`, `plan` (ação com confirmação), `map` (GeoJSON), `chart` e `diagram`.
- **Swagger UI** em `/docs` e spec em `/openapi.json` / `/openapi.yaml` (tudo) ou `/openapi/<módulo>.json`.
- **Configurações na tela**: tudo que seria variável de ambiente fica em Configurações e vale na hora (precedência: tela > env > padrão).
- **Login criado no primeiro acesso** e cadastro de usuários (admin, editor, viewer) pela tela.
- **Deploy no Dokploy** com um único container e SQLite em volume.

## Rodar local

Pré-requisitos: Node 24+ e pnpm.

```bash
pnpm install
pnpm dev          # servidor em :4310 e painel (Vite) em :5173
```

Abra http://localhost:5173, crie o admin e pronto. Os dados ficam em `apps/server/data` (SQLite); para outro lugar, defina `DATA_DIR` num `.env` na raiz (veja `.env.example`).

Ou com Docker:

```bash
docker compose up --build   # http://localhost:4310
```

Testes: `pnpm test` (Vitest: cálculos, query, auth, CRUD, as 7 views, planos, OpenAPI válida, IA com provedor falso). Tipos: `pnpm typecheck`.

## Usando as APIs

Crie uma chave em **API Keys** e envie no header, ou troque por um JWT:

```bash
curl -H "X-API-Key: mk_..." "http://localhost:4310/api/v1/filmes/filmes?limit=5&sort=-ano"

curl -X POST http://localhost:4310/api/v1/auth/token \
  -H "content-type: application/json" -d '{"apiKey":"mk_..."}'
# → { "access_token": "...", "token_type": "Bearer", "expires_in": 3600 }
```

Também aceita `{ "email", "password" }` de um usuário do painel. Chaves têm scopes: `*`, `*:read`, `<módulo>:read`, `<módulo>:write`.

### Listagens

`GET /api/v1/<módulo>/<recurso>` aceita:

| Parâmetro | Exemplo |
| --- | --- |
| `page`, `limit` | `?page=2&limit=50` (total em `X-Total-Count`, links em `Link`) |
| `sort` | `?sort=-preco,titulo` |
| `q` | `?q=farol` (sem acento, sem diferenciar maiúsculas) |
| filtros | `?status=Ativo`, `?preco[gte]=50`, `?generos=Fantasia`, `?uf[in]=SP,RJ`, `?nome[like]=silva` |
| `fields` | `?fields=titulo,ano` |
| `expand` | `?expand=diretor_id,elenco_ids` (embute os registros referenciados) |

Erros seguem `application/problem+json` (RFC 9457), com `errors[]` por campo quando o corpo não segue o schema.

### Views

| View | Endpoint | Formato |
| --- | --- | --- |
| table | `GET …/<recurso>/_views/table` | colunas + página de dados com rótulos das referências |
| card | `GET …/<recurso>/_views/card[?id=]` | `{ title, subtitle, image, badges, description, fields }` |
| form | `GET …/<recurso>/_views/form?mode=create\|edit&id=` | JSON Schema + uiSchema (widgets, máscaras, opções, etapas) + valores iniciais |
| plan | `POST …/<módulo>/plans` → `POST …/plans/{id}/confirm` | impacto (excluir, alterar, desvincular, criar, com diff) + confirmação |
| map | `GET …/<recurso>/_views/map` | GeoJSON `FeatureCollection` (Point, LineString, Polygon) |
| chart | `GET …/<módulo>/_views/charts/<nome>` ou `…/<recurso>/_views/chart?groupBy=&metric=` | `{ type, labels, series[] }` |
| diagram | `GET …/<módulo>/_views/diagrams/<nome>` | `{ kind: tree\|graph\|flow, nodes, edges }` |

A **Galeria de views** do painel desenha cada uma delas a partir desses endpoints.

**Plan** é a ação que pede confirmação do usuário: nada muda até o `confirm`. Exclusões calculam a cascata pelas referências (cascade, unlink ou restrict, este último bloqueia). Há ações em lote (reajuste de preço ou salário com diff por registro) e ações do domínio (no RH: desligar colaborador, que calcula a rescisão, cria o S-2299, encerra benefícios e cancela escalas). Ações graves exigem uma frase (`EXCLUIR 12 REGISTROS`, `CONFIRMAR`). O confirm responde 409 se os dados mudaram depois do plano e 410 se ele expirou. Com **Exigir plano para excluir** ligado, um `DELETE` direto responde 428 trazendo o plano; repita com `X-Confirm-Plan: <id>`.

### Imagens

Pôsteres, backdrops, capas e fotos são desenhados pelo servidor, determinísticos por registro: `…/filmes/filmes/1/poster.svg`, `…/livros/livros/1/capa.png?w=300`. Por padrão abrem sem autenticação (para usar em `<img>`); desligue em Configurações → Autenticação.

### Simulação

Em qualquer chamada: `X-Mock-Delay: 1500` (atraso em ms) e `X-Mock-Status: 503` (força o erro). Em Configurações → Comportamento do mock: latência mínima e máxima, taxa de erro aleatória e limite de requisições por minuto.

## Módulos prontos

| Módulo | Recursos | Destaques |
| --- | --- | --- |
| **RH Trabalhista** (`/api/v1/rh`) | empresas, departamentos, cargos, postos-trabalho, colaboradores, escalas, marcações de ponto, rondas, holerites, férias, afastamentos, benefícios, rescisões, eventos eSocial | Organograma (tree), postos com cerca virtual (Polygon), ponto geolocalizado dentro ou fora da cerca, rondas (LineString), holerites com INSS e IRRF, turnover; cálculos em `POST /calculos/{inss,irrf,ferias,rescisao}`; planos: desligar colaborador, excluir departamento realocando pessoas, aprovar férias, reajuste salarial |
| **Filmes** (`/api/v1/filmes`) | gêneros, pessoas, filmes, avaliações, locações, cinemas | Pôster, backdrop e fotos gerados; títulos fictícios; locações de filmagem e cinemas no mapa; grafo elenco e direção; bilheteria por ano e gênero |
| **Livros** (`/api/v1/livros`) | editoras, autores, séries, livros, avaliações, livrarias, vendas | Capas geradas; ISBN-10/13 válidos (`GET /livros/isbn/{isbn}`); livrarias e bibliotecas no mapa; vendas por mês e canal; grafo autor, livro e editora; reajuste de preço em lote |

As tabelas de INSS e IRRF ficam em Configurações → RH Trabalhista. Os valores são ilustrativos e servem para teste, não para cálculos reais.

## Gerar com IA

1. Em **Configurações → IA generativa**, escolha o provedor e informe a chave (fica cifrada no banco). Use **Testar conexão** para conferir.
   - **Anthropic**: modelo padrão `claude-opus-5-5`, com esforço configurável e fallback automático em caso de recusa.
   - **OpenAI-compatível**: base URL e modelo livres. Se o provedor não aceitar `json_schema`, desligue "Saída estruturada".
2. Em **Gerar com IA**, descreva o domínio. A prévia mostra os recursos, quais das 7 views o módulo cobre (com um botão para pedir à IA que cubra as que faltam), uma amostra de dados e a definição em JSON, que dá para editar.
3. **Refine** em linguagem natural quantas vezes quiser e clique em **Salvar e publicar**. Os endpoints entram no ar e na documentação na hora.

A IA só desenha a estrutura (campos, tipos, dicas de geração); os registros são gerados no servidor, então dá para pedir milhares sem custo extra. Se a definição vier incoerente (ex.: referência a um recurso que não existe), o servidor devolve os erros à IA e pede a correção uma vez antes de mostrar a prévia.

Também é possível criar ou editar um módulo colando o JSON da definição (botão **Definição** no módulo).

## Configurações

Só estas precisam ser variáveis de ambiente (existem antes de o app subir):

| Variável | Padrão | O quê |
| --- | --- | --- |
| `APP_SECRET` | gerado e salvo em `DATA_DIR/.app-secret` | Assina sessões e JWT e cifra os segredos guardados. **Defina em produção.** Trocar desloga todo mundo e invalida as chaves de IA salvas. |
| `PORT` | `4310` | Porta HTTP. |
| `DATA_DIR` | `./data` (no Docker, `/app/data`) | Onde ficam o SQLite e o segredo gerado. |
| `SETUP_TOKEN` | — | Se definido, o primeiro acesso exige este token. |
| `TRUST_PROXY` | `1` | Quantos proxies confiar (Traefik = 1; com Cloudflare na frente, 2). |
| `LOG_LEVEL` | `info` | Nível do log. |

Todo o resto (nome do app, URL pública, CORS, exigir autenticação, validade de JWT e sessão, latência, taxa de erro, rate limit, paginação, idioma e semente dos dados, provedor, chave e modelo de IA, tabelas de INSS e IRRF…) está em **Configurações**. Cada item mostra de onde vem o valor (tela, env ou padrão). Qualquer um deles também aceita uma env como valor inicial (ex.: `PUBLIC_URL`, `ANTHROPIC_API_KEY`, `MOCK_LATENCY_MAX_MS`); o botão **Exportar .env** gera o arquivo com os nomes.

## Deploy no Dokploy

O `docker-compose.dokploy.yml` sobe um único serviço com o SQLite no volume `appdata`. O Traefik do Dokploy cuida do domínio e do HTTPS; o app entra na rede `dokploy-network` para ser alcançado.

1. **Criar o serviço**: no projeto, *Create Service → Compose*. Em *Provider*, aponte para o repositório e o branch. Em *Compose Path*, use `./docker-compose.dokploy.yml`.
2. **Environment**:

   | Variável | Obrigatória | O quê |
   | --- | --- | --- |
   | `APP_SECRET` | sim | Gere com `openssl rand -base64 48`. |
   | `SETUP_TOKEN` | não | Protege a criação do primeiro admin. Recomendado se o domínio for público. |
   | `PUBLIC_URL` | não | `https://seu-dominio`. Pode ser definido depois, na tela. |
   | `TRUST_PROXY` | não | `1` (padrão). Com Cloudflare em modo proxy, `2`. |
   | `ANTHROPIC_API_KEY`, `OPENAI_*`, `AI_PROVIDER` | não | Valores iniciais da IA; também configuráveis na tela. |

3. **Domains**: serviço `app`, porta `4310`, path `/`, HTTPS com Let's Encrypt.
4. **Deploy**. Abra o domínio e crie o admin (com o `SETUP_TOKEN`, se definido).

Funciona também como *Application* com build type *Dockerfile*: mesma env, porta 4310 e um volume montado em `/app/data`.

**Backup**: o banco é o arquivo `/app/data/mock-api.db` (modo WAL). Ligue o *Volume Backups* do Dokploy no volume `appdata` com destino S3. Os módulos prontos sempre podem ser recriados com **Resetar dados**; o que importa guardar são os usuários, chaves, configurações e módulos gerados.

## Estrutura

```
apps/server   Fastify + TypeScript (roda direto no Node 24, sem build), SQLite nativo (node:sqlite)
  src/engine    motor genérico: definições → CRUD, consulta, validação (ajv), views, planos
  src/modules   rh, filmes, livros (definição, seed, rotas e planos próprios)
  src/openapi   spec 3.1 montada das definições + Swagger UI
  src/ai        provedores (Anthropic, OpenAI-compatível), prompt, saída estruturada
  src/images    SVG de pôster, backdrop, capa e avatar; PNG via resvg
  src/settings  catálogo de configurações da tela, precedência e criptografia
apps/web      React + Vite + Tailwind + TanStack Query (painel), Leaflet, Recharts, React Flow
```

Todo módulo, pronto ou gerado, é um conjunto de definições de recurso (campos tipados + dicas de view). O mesmo motor tira dali o CRUD, a validação, as views e a OpenAPI. Por isso os módulos gerados por IA têm a mesma qualidade dos prontos sem código novo.
