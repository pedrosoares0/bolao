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
      └── sync-matches-cron  (agendada: a cada 10 min)
            └────────────────► football-data.org ──► upsert na tabela matches
```

---

## 🚀 Setup do zero

### 1. Supabase
1. Crie um projeto em [supabase.com](https://supabase.com).
2. No **SQL Editor**, rode [`supabase/schema.sql`](supabase/schema.sql) (tabelas, segurança, regras).
3. Rode [`supabase/realtime.sql`](supabase/realtime.sql) (atualizações ao vivo de placares e palpites).
4. Edite as 4 senhas em [`supabase/seed.sql`](supabase/seed.sql) e rode-o (cria os usuários pedro/alex/rodrigo/neto).
   - Se der erro, crie os usuários manualmente em **Authentication > Users > Add user** com e-mails `pedro@bolao.app` etc. e "Auto Confirm" — o perfil é criado sozinho.

### 2. football-data.org
1. Registre-se grátis em <https://www.football-data.org/client/register>.
2. A API key chega por e-mail na hora.

### 3. Variáveis de ambiente
Copie `.env.example` para `.env` e preencha (instruções de onde achar cada valor estão no próprio arquivo). **Nunca commite o `.env`.**

### 4. Netlify
1. Conecte o repositório no Netlify (build já configurado via `netlify.toml`).
2. Em **Site configuration > Environment variables**, cadastre TODAS as variáveis do `.env`.
3. Deploy. A function agendada popula a tabela `matches` em até 10 minutos (ou acesse `/.netlify/functions/sync-matches` para popular na hora).

### 5. Rodar localmente
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

## 📁 Estrutura

- `src/App.tsx` — telas (login/splash/app) e camada de dados (Supabase).
- `src/lib/supabase.ts` — cliente Supabase.
- `src/lib/teamMaps.ts` — tradução de seleções, bandeiras (flagcdn) e fases.
- `src/utils/rules.ts` — pontuação e ranking.
- `src/components/StandingsTable.tsx` — aba Ranking (slideshow + prêmio + pílulas).
- `netlify/functions/` — sincronização dos jogos (HTTP + cron).
- `supabase/` — SQL de schema e seed.
