# Desafio dos Molhados — documentação de handoff

Documento de tudo que foi implementado em torno do **Desafio dos Molhados**: uma aposta paralela entre dois participantes, no mata-mata, sobre **quem se classifica**. São camadas independentes:

1. **Regra de pontuação** — ao terminar o jogo, quem cravou o classificado que avançou rouba 1 ponto do outro (transferência de 1, igual à habilidade Ladrão).
2. **Criação do desafio** — uma função que valida os palpites, grava e avisa no grupo do WhatsApp.
3. **Resolução / campeão** — no fim do jogo, o WhatsApp anuncia o vencedor do desafio.
4. **UI** — botão "⚔️ Desafiar" e os selos de estado/resultado nas linhas de palpite.

> **Conceito (decisão do dono do bolão):** quando dois participantes escolhem **classificados diferentes** para o mesmo jogo de mata-mata, um pode desafiar o outro. Se o classificado do **desafiante** avançar, ele rouba 1 ponto do adversário. Se o classificado do **desafiado** avançar, o desafiante perde 1 ponto, transferido para o desafiado. Ou seja: **quem cravar quem avança ganha +1; o outro perde −1** (saldo zero, transferência de 1 ponto).

---

## ⚠️ Ordem de deploy (ler antes de subir)

| Passo | O que faz | Por que antes |
|-------|-----------|---------------|
| [`supabase/update-018-challenges.sql`](../supabase/update-018-challenges.sql) | Cria `public.challenges` (+ RLS + realtime) | O front faz `SELECT` em `challenges` no boot e a função `create-challenge` faz `INSERT`. Sem a tabela → erro e a feature não carrega. |
| Deploy do front + Netlify functions | Sobe a UI, a função `create-challenge` e o aviso de campeão no `notify-core` | A UI chama `/.netlify/functions/create-challenge`; sem deploy não existe. |

Como rodar a migration: Supabase Dashboard → SQL Editor → New query → cole o arquivo → Run. É idempotente (`create table if not exists`, `drop policy if exists`, `add table` protegido por bloco `do $$`).

---

## O que é "classificado" (quem o participante acha que avança)

Função **`predictedAdvancer(bet, match)`** em [`src/utils/rules.ts`](../src/utils/rules.ts) — devolve `'HOME' | 'AWAY' | null`:

- **Fora do mata-mata** (`stage === 'GROUP_STAGE'`) → `null`.
- **Palpite de vencedor** (placar não-empate) → o lado que venceu no palpite (`homeScore > awayScore ? 'HOME' : 'AWAY'`).
- **Palpite de empate** → o `pensWinner` escolhido (o "quem se classifica" do palpite de pênaltis); `null` se não escolheu.

Dois participantes podem se desafiar quando ambos têm um classificado **não nulo** e **diferente**.

A mesma lógica está replicada no servidor, dentro de [`netlify/functions/create-challenge.mts`](../netlify/functions/create-challenge.mts) (`advancerOf`), porque os "picks" são **deduzidos dos palpites no servidor** — o cliente não os envia (evita forjar).

---

## 1) Regra de pontuação

Em [`src/utils/rules.ts`](../src/utils/rules.ts), dentro de **`calculateStandings`** (novo parâmetro opcional `challenges: Challenge[] = []`). Aplicada **depois** dos roubos do Ladrão:

```
para cada challenge cujo jogo terminou (status === 'finished') e tem vencedor:
  adv = lado que avançou (matchAdvancer → coluna winner, cobre pênaltis/prorrogação)
  vencedor do desafio = quem escolheu adv (challengerPick === adv ? challenger : challenged)
  vencedor.points += 1
  perdedor.points -= 1
```

- Usa **apenas a coluna `winner`** (`HOME_TEAM`/`AWAY_TEAM`) para saber quem avançou — funciona para tempo normal, prorrogação e pênaltis.
- Como os dois `pick` são diferentes e um dos lados sempre avança, **sempre há um vencedor**.
- Jogo não encerrado (ou `winner` nulo) → não transfere nada.

A `calculateStandings` é chamada em [`src/App.tsx`](../src/App.tsx) (ranking geral e cálculo de evolução), agora passando `challenges`.

> **Helper auxiliar:** `matchAdvancer(match)` converte `winner` em `'HOME' | 'AWAY' | null`.

---

## 2) Criação do desafio (validação + WhatsApp)

Função Netlify [`netlify/functions/create-challenge.mts`](../netlify/functions/create-challenge.mts):

`POST /.netlify/functions/create-challenge`
```json
{ "matchId": 537418, "challengerUid": "<uuid>", "challengedUid": "<uuid>" }
```

Validações (tudo no servidor, com a **service role**):
- jogo existe, é mata-mata (`stage !== 'GROUP_STAGE'`) e **não** está `FINISHED`;
- desafiante ≠ desafiado;
- ambos têm classificado (palpite) e eles são **diferentes**;
- ainda **não** existe desafio entre os dois nesse jogo (checa as **duas direções** com `.or(and(...),and(...))`).

Se passar: `INSERT` em `challenges` (com `challenger_pick`/`challenged_pick` deduzidos) e envia no WhatsApp (best-effort, não derruba a criação):

```
⚔️ *DESAFIO ÉPICO ENTRE OS MOLHADOS* ⚔️

🇳🇱 Holanda x Marrocos 🇲🇦

🌊 *Pedro*: classifica 🇳🇱 *Holanda*
🌊 *Alex*: classifica 🇲🇦 *Marrocos*

Quem cravar quem avança rouba *+1 ponto* do outro! 🏆
```

Reutiliza `sendText`, `ptName` e `flagEmoji` (agora **exportados** de [`netlify/shared/notify-core.mts`](../netlify/shared/notify-core.mts)).

---

## 3) Resolução / campeão (fim do jogo)

Em [`netlify/shared/notify-core.mts`](../netlify/shared/notify-core.mts), dentro do bloco **"fim de jogo"** (`status === 'FINISHED' && prev.status !== 'FINISHED'`), logo após a mensagem de fim de jogo:

- calcula `adv` pela coluna `winner`;
- busca os `challenges` daquele `match_id`;
- para cada um, decide o vencedor e envia (com dedup `challwin:{id}` em `sent_notifications`):

```
🏆 *CAMPEÃO DO DESAFIO DOS MOLHADOS* 🌊

🇲🇦 *Marrocos* avançou!
*Alex* venceu *Pedro* e leva +1 ponto. 💧
```

Builder: `msgChallengeWin(winnerName, loserName, advTeamEn)`.

> **Atenção (timing):** a resolução roda na **transição** para `FINISHED`. Como a coluna `winner` vem junto do `FINISHED` no sync completo (football-data), na prática está sempre disponível. Se um dia o fim for detectado pela ESPN antes do football-data (sem `winner`), o aviso de campeão pode ser pulado — **os pontos continuam corretos no app** (a `calculateStandings` resolve quando o `winner` chega). O dedup `challwin:{id}` é por desafio, independente do `end:{id}`.

---

## 4) UI (tudo em [`src/App.tsx`](../src/App.tsx))

Na lista **inline de palpites** (que só aparece com o jogo já começado — `hideOpponentPicks`), em cada linha de adversário:

- **Botão `⚔️ Desafiar`** quando: mata-mata, jogo começado e não encerrado, contra outro participante, ambos com classificado **diferente**, e sem desafio existente entre os dois.
- **Selo `⚔️ Em desafio`** enquanto pendente.
- **Selo `⚔️ Você ganhou +1` / `Você perdeu −1`** quando o jogo termina (resultado calculado pela coluna `winner`).

Estado e dados:
- `challenges` (estado) carregado no `loadAll` (mapeando `uuid → username`, igual aos roubos);
- assinatura Realtime na tabela `challenges` (recarrega ao inserir);
- handler `handleChallenge(challengedUserId, match)` → `fetch` para a função → `loadAll`.

Estilos: classes `.challenge-btn-p16` e `.challenge-badge-p16` (`.active` / `.won` / `.lost`) em [`src/index.css`](../src/index.css).

---

## Persistência

[`supabase/update-018-challenges.sql`](../supabase/update-018-challenges.sql):
- `challenges` com `match_id` (→ `matches`), `challenger_id`/`challenged_id` (→ `participants`, uuid), `challenger_pick`/`challenged_pick` (`'HOME'|'AWAY'`).
- Constraints: `challenge_no_self` (não desafia a si mesmo), `challenge_diff_pick` (picks diferentes), `unique(match_id, challenger_id, challenged_id)` (a direção reversa é barrada na função).
- RLS: `select` para qualquer autenticado; `insert` só com `challenger_id = auth.uid()`.
- Adicionada à publicação `supabase_realtime`.

Tipo no front: `Challenge` em [`src/types.ts`](../src/types.ts).

---

## Testes

Em [`src/utils/rules.test.ts`](../src/utils/rules.test.ts):
- `predictedAdvancer` — 4 casos (vencedor cravado, empate com `pensWinner`, empate sem escolha = `null`, fase de grupos = `null`).
- `calculateStandings — Desafio dos Molhados` — 2 casos (transferência de +1/−1 quando o jogo termina; jogo não encerrado = sem transferência).

Rodar:
```bash
npx vitest run                            # suíte completa
npx tsc -p tsconfig.app.json --noEmit     # tipos do front
npx tsc -p tsconfig.netlify.json --noEmit # tipos das functions
npm run build
```

---

## Limitações conhecidas

- O **ranking do dia enviado no WhatsApp** (`msgDayFinal`) soma placar + artilheiro + classificação, mas **não** a transferência do desafio (nem dos roubos do Ladrão — comportamento já existente). O ranking do **app** considera tudo.
- A função `create-challenge` é Netlify Function: localmente precisa do servidor de functions (ex.: `netlify functions:serve` + proxy do vite); em **produção** funciona direto.

---

## Checklist para o próximo dev

- [ ] Rodar `update-018-challenges.sql` no Supabase.
- [ ] Deploy do front + Netlify functions.
- [ ] Validar em um jogo de mata-mata ao vivo: dois usuários com classificados diferentes → botão "Desafiar" aparece → cria → cai a mensagem no WhatsApp.
- [ ] Ao encerrar: o ranking transfere +1/−1 e o WhatsApp anuncia o campeão; o card mostra o selo de resultado.
- [ ] (Opcional) Decidir se o ranking do WhatsApp passa a incluir desafios e roubos.
