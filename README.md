# 🏆 Bolão da Copa do Mundo 2026 - Bandidos Apostados

Bolão entre amigos para a Copa 2026. Frontend React (design premium mobile-first) hospedado no **Netlify**, dados e autenticação no **Supabase**, e jogos/placares reais sincronizados automaticamente da **football-data.org** (com horários convertidos para o horário de Brasília).

---

## 🛠️ Stack

- **Frontend**: React 19 + TypeScript + Vite + CSS puro (`src/index.css`)
- **Banco & Auth**: [Supabase](https://supabase.com) (Postgres + RLS + Auth)
- **Hospedagem & Cron**: [Netlify](https://netlify.com) (site estático + Functions)
- **Jogos da Copa**: [football-data.org](https://www.football-data.org) (plano gratuito, competição `WC`)

## 🧱 Arquitetura

```
Netlify (site estático)
 ├── React app  ──────────────► Supabase (matches, bets, participants, submissions)
 │                                 ▲ RLS: participantes autenticados veem os palpites lançados
 │                                 ▲ RPC submit_bets: rejeita aposta após o início do jogo
 └── Functions
      ├── sync-matches       (HTTP: chamada quando o app abre, com throttle de 3 min)
      └── sync-matches-cron  (agendada: a cada 1 min)
            └─► football-data.org ──► jogos, IDs, fases e resultado oficial (fonte/fallback)
            └─► ESPN (API pública) ──► placar/tempo AO VIVO sobrepõe o football-data
                                  └─► upsert na tabela matches
                                  └─► compara estado antigo × novo
                                        └─► Evolution API ──► grupo do WhatsApp
```

---

## 🚀 Setup do zero

### 1. Supabase
1. Crie um projeto em [supabase.com](https://supabase.com).
2. No **SQL Editor**, rode [`supabase/schema.sql`](supabase/schema.sql) (tabelas, segurança, regras).
3. Rode [`supabase/realtime.sql`](supabase/realtime.sql) (atualizações ao vivo de placares, palpites e fiados).
4. Rode as migrations em ordem (`supabase/update-00X-*.sql`):
   - [`update-005-notificacoes-whatsapp.sql`](supabase/update-005-notificacoes-whatsapp.sql) cria a tabela `sent_notifications` usada pelas notificações do WhatsApp (sem ela, **nenhuma** mensagem é enviada — proteção contra spam).
   - [`update-005-fiados.sql`](supabase/update-005-fiados.sql) cria a caderneta de fiados (`debts`) com RLS: cada um só pendura/quita o **próprio** fiado.
   - [`update-006-debts-realtime.sql`](supabase/update-006-debts-realtime.sql) coloca os fiados no Realtime (só precisa se você rodou o `realtime.sql` antigo, sem `debts`).
   - [`update-007-espn-ao-vivo.sql`](supabase/update-007-espn-ao-vivo.sql) adiciona a coluna `live_clock` usada pelo placar/tempo ao vivo da ESPN.
5. Edite as 4 senhas em [`supabase/seed.sql`](supabase/seed.sql) e rode-o (cria os usuários pedro/alex/rodrigo/neto).
   - Se der erro, crie os usuários manualmente em **Authentication > Users > Add user** com e-mails `pedro@bolao.app` etc. e "Auto Confirm" — o perfil é criado sozinho.

### 2. football-data.org
1. Registre-se grátis em <https://www.football-data.org/client/register>.
2. A API key chega por e-mail na hora.

### 3. Evolution API (notificações no WhatsApp)
1. Tenha uma instância da [Evolution API](https://github.com/EvolutionAPI/evolution-api) rodando (self-host) com **seu número** conectado.
2. Descubra o **JID do grupo** de destino (formato `1203...@g.us`; pode usar `GET /group/fetchAllGroups/{instance}`). Só o número antes do `@` já basta — o código acrescenta o `@g.us`.

### 4. Variáveis de ambiente
Copie `.env.example` para `.env` e preencha (instruções de onde achar cada valor estão no próprio arquivo). **Nunca commite o `.env`.** Além das chaves do Supabase e da football-data, as notificações usam:

| Variável | Para quê |
|---|---|
| `EVOLUTION_API_URL` | URL base da sua Evolution API |
| `EVOLUTION_API_KEY` | API key (header `apikey`) |
| `EVOLUTION_INSTANCE_NAME` | nome da instância conectada ao seu WhatsApp |
| `id_grupo` | JID/ID do grupo de destino |
| `url_bolao` | URL pública do app (entra nos lembretes) |

### 5. Netlify
1. Conecte o repositório no Netlify (build já configurado via `netlify.toml`).
2. Em **Site configuration > Environment variables**, cadastre TODAS as variáveis do `.env` (inclusive as da Evolution — o `.env` só vale localmente).
3. Deploy. A function agendada popula a tabela `matches` em até 2 minutos (ou acesse `/.netlify/functions/sync-matches` para popular na hora).

### 6. Rodar localmente
```bash
npm install
npx netlify dev   # roda o Vite + as Functions juntos (recomendado)
# ou: npm run dev (só o front; os jogos vêm do que já está no Supabase)

npm run lint      # ESLint (app + Netlify Functions)
npx tsc -b        # type-check do app e das funções (.mts)
npm test          # testes das regras de pontuação e do pote (Vitest)
npm run build     # build de produção (tsc -b + vite build)
```

---

## 📝 Regras do Bolão

- **Login**: nome (pedro/alex/rodrigo/neto) + senha. Internamente vira `nome@bolao.app` no Supabase Auth.
- **Palpites**: só para os jogos de **hoje** que ainda não começaram. O servidor rejeita palpites após o kickoff (não adianta mexer no relógio 😄).
- **Lançamento**: o botão habilita quando todos os jogos do dia estão preenchidos; depois de lançar, trava (`submissions`).
- **Palpites compartilhados**: todos veem os palpites lançados imediatamente, com atualização via Supabase Realtime.
- **Pontuação** (`src/utils/rules.ts`): placar exato **3 pts** · empate certo **2 pts** · vencedor certo **1 pt** · errou **0 pt**.
- **Palpites especiais** (aba Palpites): campeão da Copa e até onde o Brasil vai — **5 pts cada**, confirmados pelos resultados reais da API. Editáveis até 28/06 (início do mata-mata) e **não pagam taxa**.
- **Desempate no ranking**: pontos > placares exatos > empates certos > vencedores certos > nome.
- **Prêmio**: R$ 2,50 por pessoa por dia com jogos finalizados; o card do Ranking soma tudo.

## 📡 Dados dos jogos (fonte híbrida)

Para ter **ao vivo rápido sem pagar**, o app usa duas fontes que se complementam:

- **football-data.org** (oficial, com chave): é a **fonte da verdade** — define a lista de jogos, os **IDs** (que as apostas referenciam), as fases e o **resultado oficial**. É também o **fallback**.
- **ESPN** (API pública, sem chave): entra **só como turbo do ao vivo**. A cada sincronização, o backend busca o scoreboard da Copa na ESPN (muito mais rápido que o football-data free) e **sobrepõe o placar, o status e o minuto** (`live_clock`, ex.: `28'`) nos jogos que casam por **par de seleções + dia**.

Se a ESPN cair, sair do ar ou mudar o formato, o `mergeEspnLive` simplesmente devolve os dados do football-data — **nada quebra** e o ranking continua correto. Toda a lógica da ESPN fica isolada em [`netlify/shared/espn-core.mts`](netlify/shared/espn-core.mts).

> ⚠️ A API da ESPN é **não documentada** (pode mudar sem aviso) — por isso ela **nunca** é a fonte única: é só uma camada de velocidade por cima da fonte oficial.

## 📲 Notificações no WhatsApp

A cada sincronização (cron de ~2 min), o backend compara o estado **anterior** dos jogos com o **novo** e dispara mensagens no grupo via Evolution API. Cada mensagem tem uma chave única em `sent_notifications`, então **nunca é enviada duas vezes** (ex.: "Gol 1x0" não repete).

| Notificação | Quando dispara | Confiabilidade |
|---|---|---|
| ⏰ **Falta ~1h** pro palpite fechar (lista quem ainda não palpitou) | a partir de 60 min antes do kickoff — **só se ainda houver alguém sem palpitar** | alta (baseada no horário) |
| 🟢 **Jogo começou** | status `SCHEDULED/TIMED → IN_PLAY` | depende do "ao vivo" da API |
| ⚽ **Gol** (de qual time) | o placar sobe durante `IN_PLAY` | depende do "ao vivo" |
| 🔴 **Fim de jogo** + quem pontuou | status `→ FINISHED` | alta |
| 🏁 **Pontuação final do dia** + ranking geral | quando o último jogo do dia termina | alta |
| 📅 **Próxima rodada** (jogos do dia seguinte; inclui os de madrugada com 🌙) | **30 min após** a pontuação final do dia | alta |

> As notificações de **fim de jogo**, **pontuação final do dia** e **próxima rodada** usam o **dia de calendário** (físico). Por isso um jogo de madrugada (ex.: 01h), que pode ser **apostado junto com a rodada do dia anterior**, aparece na mensagem de **próxima rodada** — afinal ele acontece no dia seguinte.

> ⚠️ Gol mostra **o time** que marcou (detectado pela variação do placar), não o nome do artilheiro — o plano gratuito da football-data.org não fornece o autor do gol.
>
> Toda a lógica vive em [`netlify/shared/notify-core.mts`](netlify/shared/notify-core.mts) e é acionada por [`netlify/shared/sync-core.mts`](netlify/shared/sync-core.mts).

## 🔒 Segurança

A regra de ouro: **o navegador nunca é confiável**. A chave que o front usa (`VITE_SUPABASE_ANON_KEY`) é **pública por design** — quem protege os dados é o Postgres, não o app.

- **Row Level Security (RLS)** em todas as tabelas: participantes autenticados só leem o que devem e só escrevem o que é seu. Apostas entram **apenas** pela RPC `submit_bets` (que revalida o lockout com a hora do **servidor** — não adianta mexer no relógio). Fiados: cada um só pendura/quita o próprio (reforçado também no [App.tsx](src/App.tsx)).
- **Chave secreta (`service_role`)** vive só nas variáveis de ambiente do Netlify, nunca no bundle do navegador. As Functions a usam server-side.
- **Headers de segurança** no [`netlify.toml`](netlify.toml): `Content-Security-Policy`, `Strict-Transport-Security`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy` e `Permissions-Policy`. A CSP libera só as origens que o app realmente usa (Supabase, flagcdn, ícones); recurso novo de outra origem precisa ser liberado ali.
- **Endpoint público `sync-matches`**: tem throttle de 3 min (tabela `sync_state`) e devolve erro genérico (o detalhe técnico fica só no log do servidor).
- **`.env` nunca é commitado** (ver `.gitignore`); use `.env.example` como referência.

## ✅ Qualidade

- **Lint**: ESLint cobre o app (React) e as Netlify Functions (`.mts`).
- **Type-check**: `tsc -b` valida o app **e** as funções (via `tsconfig.netlify.json`).
- **Testes** (Vitest): `src/utils/rules.test.ts` (pontuação/ranking/palpites especiais) e `src/utils/pot.test.ts` (pote acumulado) — a "regra do dinheiro" não pode ter bug.
- **Antes de cada push**, rode os checks localmente:
  ```bash
  npm run lint && npx tsc -b && npm test && npm run build
  ```

## 📁 Estrutura

- `src/App.tsx` — telas (login/splash/app) e camada de dados (Supabase + Realtime).
- `src/lib/supabase.ts` — cliente Supabase.
- `src/lib/teamMaps.ts` — tradução de seleções, bandeiras (flagcdn) e fases.
- `src/utils/rules.ts` — pontuação e ranking · `src/utils/specials.ts` — palpites especiais · `src/utils/pot.ts` — pote acumulado.
- `src/utils/shareRanking.ts` — gera/compartilha a imagem do ranking (canvas).
- `src/components/` — abas (`StandingsTable`, `PixTab`, `PalpitesTab`) e fundos WebGL vendados (`Aurora`, `LightRays`).
- `netlify/functions/` — sincronização dos jogos (HTTP + cron a cada 2 min).
- `netlify/shared/sync-core.mts` — busca jogos na football-data.org, mescla o ao vivo da ESPN, faz upsert e aciona as notificações.
- `netlify/shared/espn-core.mts` — placar/tempo ao vivo da API pública da ESPN (turbo do ao vivo, com fallback).
- `netlify/shared/notify-core.mts` — monta e envia as mensagens do WhatsApp (Evolution API).
- `supabase/` — SQL de schema, seed e migrations (`update-00X-*.sql`).
- `docs/` — documentação de arquitetura. Ver [`docs/ESCALABILIDADE.md`](docs/ESCALABILIDADE.md) (plano para virar plataforma multi-grupo com parceiros, prêmios e infra por fases).
- Detalhes de funcionalidades específicas (fiados, "On Fire", deck, ranking) em [`README_BACKEND.md`](README_BACKEND.md).
