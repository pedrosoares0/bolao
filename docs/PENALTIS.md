# Pênaltis no mata-mata — documentação de handoff

Documento de tudo que foi implementado em torno de **pênaltis** (disputa por pênaltis no mata-mata). São **três** entregas independentes, em camadas diferentes:

1. **Placar dos pênaltis** (exibição) — mostrar `1 (4)` no card do mata-mata.
2. **Regra de pontuação automática** — quando um jogo empata e é decidido nos pênaltis, quem apostou no time que **avançou** ganha 1 ponto.
3. **Palpite de pênaltis** (input do usuário) — um check "vai pra pênaltis?" e, se sim, quem vence a disputa, com pontuação própria.

> **Contexto importante de dados:** a **football-data.org v4** (fonte oficial dos jogos/IDs) só informa `winner` e `duration: "PENALTY_SHOOTOUT"`. Ela **não fornece o placar** da disputa de pênaltis. Os **números** dos pênaltis (ex.: 4×2) vêm da **ESPN** (`shootoutScore`). Quem **venceu** já vem da football-data na coluna `winner`.

---

## ⚠️ Ordem de deploy (ler antes de subir)

Existem duas migrations. **Rode-as no Supabase ANTES de subir o front/funções**, senão quebra:

| Migration | O que faz | Por que antes |
|-----------|-----------|---------------|
| [`supabase/update-013-penaltis.sql`](../supabase/update-013-penaltis.sql) | Cria `matches.home_pens` / `matches.away_pens` | O `sync` faz `upsert` dessas colunas. Sem elas → erro `column "home_pens" does not exist` e a sincronização para. |
| [`supabase/update-014-palpite-penaltis.sql`](../supabase/update-014-palpite-penaltis.sql) | Cria `bets.pens_pick` / `bets.pens_winner` + atualiza a função `submit_bets` | O `SELECT` de apostas no front pede essas colunas. Sem elas → o carregamento de apostas quebra. |

Como rodar: Supabase Dashboard → SQL Editor → New query → cole o arquivo inteiro → Run. Cada um é idempotente (`IF NOT EXISTS` / `create or replace`).

---

## 1) Placar dos pênaltis (exibição)

**Objetivo:** mostrar os gols da disputa entre parênteses no card do mata-mata, ex.: `1 (4)` × `1 (2)`.

### Fluxo de dados
ESPN (`shootoutScore`) → sync grava em `matches.home_pens`/`away_pens` → front lê → `BracketTab` exibe.

### Arquivos tocados
- **[`supabase/update-013-penaltis.sql`](../supabase/update-013-penaltis.sql)** — colunas `home_pens` / `away_pens` (`smallint`, nulas quando não houve disputa).
- **[`netlify/shared/espn-core.mts`](../netlify/shared/espn-core.mts)**
  - `interface EspnCompetitor` ganhou `shootoutScore?: string | number`.
  - `EspnOverride` ganhou `homePens` / `awayPens` (`number | null`).
  - `fetchEspnOverrides` parseia o `shootoutScore` (string/número/ausente → `null`, nunca `0`).
- **[`netlify/shared/sync-core.mts`](../netlify/shared/sync-core.mts)**
  - `MatchUpsertRow` ganhou `home_pens` / `away_pens`.
  - Linhas vindas da football-data nascem com `home_pens: null` / `away_pens: null`.
  - `mergeEspnLive` e `syncLive` gravam os pênaltis **alinhando mandante/visitante** ao football-data (a ESPN pode listar os times na ordem inversa — usa o mesmo `fdHomeIsEspnHome` que já alinhava o placar). O subset `dbUpdates` do `syncLive` também inclui as colunas.
- **[`src/types.ts`](../src/types.ts)** — `Match.homePens?` / `Match.awayPens?` (`number | null`).
- **[`src/App.tsx`](../src/App.tsx)** — `MatchDbRow` + o `SELECT` de `matches` incluem `home_pens, away_pens`; `mapRowToMatch` mapeia para `homePens`/`awayPens`.
- **[`src/components/BracketTab.tsx`](../src/components/BracketTab.tsx)** — `TeamLine` recebe `pens` e renderiza `<span className="brk2-pens">({pens})</span>` (só quando `pens !== null`), à direita do placar → lê-se `1 (4)`.
- **[`src/index.css`](../src/index.css)** — `.brk2-pens` (menor, esmaecido; versão `.brk2-row.lose .brk2-pens` mais apagada).

### Observação
Quem **venceu** a disputa já é destacado corretamente: o `winnerSide` do `BracketTab` usa a coluna `winner`, que cobre pênalti. Os números são só informativos.

---

## 2) Pontuação automática: acertar quem avançou nos pênaltis

**Objetivo:** num jogo de mata-mata que empatou no tempo normal/prorrogação e foi decidido nos pênaltis, o palpite de **placar** que escolheu um vencedor cravando o time que **avançou** passa a valer **1 ponto** (antes valia 0, porque "deu empate").

### Regra (em [`src/utils/rules.ts`](../src/utils/rules.ts), função `analyzeBet`)
Ordem de avaliação:
1. Placar exato → **3** (inclusive empate exato, ex.: cravou 1-1).
2. Previu empate (placar errado) e deu empate → **2**.
3. **(NOVO)** Placar empatado **mas** `winner` é `HOME_TEAM`/`AWAY_TEAM` (ou seja, foi a pênaltis): se o palpite escolheu um vencedor e ele é o que **avançou** → **1** (`type: 'winner'`); se escolheu o eliminado → **0**.
4. Acertou o vencedor no tempo normal → **1**.
5. Errou → **0**.

### Por que isso não afeta a fase de grupos
Na fase de grupos, um empate vem com `winner === 'DRAW'`, que **não** entra no passo 3 (só `HOME_TEAM`/`AWAY_TEAM`). Logo, empate de grupo continua valendo só os 2 pontos do passo 2.

### Importante
Essa regra usa **apenas a coluna `winner`** — não depende das colunas `home_pens`/`away_pens`. Funciona mesmo sem a migration 013.

---

## 3) Palpite de pênaltis (input do usuário)

**Objetivo:** no card de cada jogo do **mata-mata**, o usuário marca um check **"Vai pra pênaltis?"** e, se marcar, escolhe **quem vence** a disputa. Pontua à parte do placar.

### Regra de pontuação (decisão do dono do bolão)
Em [`src/utils/rules.ts`](../src/utils/rules.ts), função **`pensBonus(bet, match)`** — bônus **aditivo** (igual ao bônus de artilheiro). Só pontua se o jogo **realmente** foi a pênaltis:
- Detecção de "foi a pênaltis": `status === 'finished'` **e** `homeScore === awayScore` **e** `winner` é `HOME_TEAM`/`AWAY_TEAM`.
- **+1** se o usuário marcou "vai pra pênaltis" e o jogo foi.
- **+3** (ou seja, +2 a mais) se, além disso, cravou o vencedor da disputa.
- Prever que **não** vai → **0** (caso comum, não premia).
- Máximo **3** por jogo.

Integração: somado em `calculateStandings` logo após o `scorerBonus`, dentro do `points` (não altera o `type`/contadores de profeta/on-fire). Como `pensBonus` exige `status === 'finished'`, jogos ao vivo dão 0 (pênalti só se conhece no fim).

### Persistência
- **[`supabase/update-014-palpite-penaltis.sql`](../supabase/update-014-palpite-penaltis.sql)**
  - `bets.pens_pick boolean NOT NULL DEFAULT false` — previu que vai a pênaltis.
  - `bets.pens_winner text` — `'HOME'` / `'AWAY'` / `NULL`. Constraint `bets_pens_winner_chk` garante só esses valores.
  - Função **`submit_bets`** atualizada: o `jsonb_to_recordset` agora extrai `pens_pick` e `pens_winner`; o `insert ... on conflict` grava/atualiza ambos. `pens_winner` só é salvo se `pens_pick` for true (senão `NULL`).
- **[`src/types.ts`](../src/types.ts)** — `Bet.pensPick?: boolean` e `Bet.pensWinner?: 'HOME' | 'AWAY' | null`.

### Front (tudo em [`src/App.tsx`](../src/App.tsx))
- `BetRow` + `SELECT` de `bets` incluem `pens_pick, pens_winner`; o `useMemo` de `bets` mapeia para `pensPick`/`pensWinner`.
- Estado `pensDrafts` (rascunho por jogo: `{ pick, winner }`), espelho de `scorerDrafts`.
- `displayPens` — `useMemo` que mescla rascunho (prioridade) com o que está salvo, igual ao `displayScorers`.
- `expandedPens` + `togglePensExpanded` — controlam a seção expansível.
- Helper `isKnockoutMatch(m)` = `m.stage !== 'GROUP_STAGE'`.
- `hasChangesToLaunch` — considera mudança no palpite de pênaltis (habilita relançar).
- `handleLaunchBets` — o payload inclui `pens_pick`/`pens_winner` só para jogos do mata-mata; `pens_winner` vai `null` se o check não estiver marcado. Após lançar, `setPensDrafts({})`.
- **UI** — bloco condicional a `isKnockoutMatch(match)`, logo após o bloco do artilheiro. Reaproveita as classes `scorer-picker-*` (container/header/wrapper) + classes próprias `pens-*`. Mostra:
  - cabeçalho "🥅 VAI PRA PÊNALTIS?" (com resumo quando recolhido);
  - botão-check "Vai pra disputa de pênaltis";
  - se marcado, dois botões (mandante/visitante, com bandeira) para escolher o vencedor;
  - após o jogo: verde (`scored`) se acertou, vermelho (`missed`) se errou. O check só pinta quando `isFinished` (não pinta ao vivo).
- **[`src/index.css`](../src/index.css)** — classes `.pens-check-btn`, `.pens-winner-grid`, `.pens-winner-btn`, `.pens-winner-flag` e variações `.selected` / `.locked` / `.scored` / `.missed` (verde `#009739`, vermelho `#d62828`).

---

## Interação entre as regras 2 e 3 (atenção / decisão em aberto)

As duas pontuações de pênalti **coexistem e somam** de propósito, pois vêm de inputs diferentes:

- A regra **2** (`analyzeBet`) olha o **palpite de placar**: se o usuário cravou um vencedor e esse time avançou nos pênaltis, +1.
- A regra **3** (`pensBonus`) olha o **palpite explícito de pênaltis** (check + vencedor).

**Exemplo:** jogo 1-1 decidido nos pênaltis, a casa avança. Usuário apostou placar `2-1` (casa) **e** marcou o check + vencedor = casa:
- +1 pela regra 2 (cravou quem avançou no placar),
- +3 pela regra 3 (palpite de pênaltis com vencedor),
- mais os pontos do placar em si (no exemplo, 0, porque 2-1 ≠ 1-1).

Se o dono do bolão quiser que uma anule a outra (evitar "ponto dobrado"), o ajuste é só em `calculateStandings`/`rules.ts`. Hoje, por decisão, elas somam.

---

## Testes

Em [`src/utils/rules.test.ts`](../src/utils/rules.test.ts):
- `analyzeBet` — 6 casos novos para empate decidido nos pênaltis (exato ainda 3, empate previsto ainda 2, acertar quem avançou = 1, errar = 0, empate de grupo com `winner: 'DRAW'` não vira vitória).
- `pensBonus` — 7 casos (sem check = 0; foi e sem vencedor = 1; foi e cravou vencedor = 3; foi e errou vencedor = 1; decidido no tempo = 0; jogo não terminado = 0; sem aposta = 0).

Rodar:
```bash
npx vitest run                       # suíte completa (68 testes)
npx tsc -p tsconfig.app.json --noEmit # tipos do front
npx tsc -p tsconfig.netlify.json --noEmit # tipos das functions
npm run build
```

---

## Checklist para o próximo dev

- [ ] Rodar `update-013-penaltis.sql` no Supabase.
- [ ] Rodar `update-014-palpite-penaltis.sql` no Supabase (cria colunas **e** recria `submit_bets`).
- [ ] Deploy do front + Netlify functions.
- [ ] Validar em um jogo de mata-mata: o card mostra `x (y)` quando houver disputa; o palpite de pênaltis aparece só no mata-mata; a classificação soma os bônus após o jogo encerrar.
- [ ] (Opcional) Decidir se as regras 2 e 3 devem somar ou não.
