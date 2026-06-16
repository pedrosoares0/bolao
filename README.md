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
      └── sync-matches-cron  (agendada: a cada 2 min)
            └─► football-data.org ──► upsert na tabela matches
                                  └─► compara estado antigo × novo
                                        └─► Evolution API ──► grupo do WhatsApp
```

---

## 🚀 Setup do zero

### 1. Supabase
1. Crie um projeto em [supabase.com](https://supabase.com).
2. No **SQL Editor**, rode [`supabase/schema.sql`](supabase/schema.sql) (tabelas, segurança, regras).
3. Rode [`supabase/realtime.sql`](supabase/realtime.sql) (atualizações ao vivo de placares e palpites).
4. Rode as migrations em ordem (`supabase/update-00X-*.sql`). A última, [`update-005-notificacoes-whatsapp.sql`](supabase/update-005-notificacoes-whatsapp.sql), cria a tabela `sent_notifications` usada pelas notificações do WhatsApp (sem ela, **nenhuma** mensagem é enviada — proteção contra spam).
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
npm test          # testes das regras de pontuação (src/utils/rules.test.ts)
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

## 📲 Notificações no WhatsApp

A cada sincronização (cron de ~2 min), o backend compara o estado **anterior** dos jogos com o **novo** e dispara mensagens no grupo via Evolution API. Cada mensagem tem uma chave única em `sent_notifications`, então **nunca é enviada duas vezes** (ex.: "Gol 1x0" não repete). Toda mensagem termina com a assinatura `BANDIDO$ APO$TADO$🤑🏆`.

| Notificação | Quando dispara | Confiabilidade |
|---|---|---|
| ⏰ **Falta ~1h** pro palpite fechar (+ quem ainda não palpitou) | a partir de 60 min antes do kickoff | alta (baseada no horário) |
| 🟢 **Jogo começou** | status `SCHEDULED/TIMED → IN_PLAY` | depende do "ao vivo" da API |
| ⚽ **Gol** (de qual time) | o placar sobe durante `IN_PLAY` | depende do "ao vivo" |
| 🟡 **Intervalo** | status `→ PAUSED` | depende do "ao vivo" |
| 🔴 **Fim de jogo** + quem pontuou | status `→ FINISHED` | alta |
| 🏁 **Pontuação final do dia** + ranking geral | quando o último jogo do dia termina | alta |

> ⚠️ Gol mostra **o time** que marcou (detectado pela variação do placar), não o nome do artilheiro — o plano gratuito da football-data.org não fornece o autor do gol.
>
> Toda a lógica vive em [`netlify/shared/notify-core.mts`](netlify/shared/notify-core.mts) e é acionada por [`netlify/shared/sync-core.mts`](netlify/shared/sync-core.mts).

## 📁 Estrutura

- `src/App.tsx` — telas (login/splash/app) e camada de dados (Supabase).
- `src/lib/supabase.ts` — cliente Supabase.
- `src/lib/teamMaps.ts` — tradução de seleções, bandeiras (flagcdn) e fases.
- `src/utils/rules.ts` — pontuação e ranking.
- `src/components/StandingsTable.tsx` — aba Ranking (slideshow + prêmio + pílulas).
- `netlify/functions/` — sincronização dos jogos (HTTP + cron a cada 2 min).
- `netlify/shared/sync-core.mts` — busca jogos na football-data.org, faz upsert e aciona as notificações.
- `netlify/shared/notify-core.mts` — monta e envia as mensagens do WhatsApp (Evolution API).
- `supabase/` — SQL de schema, seed e migrations (`update-00X-*.sql`).
