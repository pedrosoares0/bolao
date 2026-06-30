# Desafio dos Molhados — documentação de handoff

Documento de tudo que foi implementado em torno do **Desafio dos Molhados**: uma aposta paralela entre dois participantes, no mata-mata, sobre **quem se classifica**. São camadas independentes:

1. **Criação do desafio** — uma função valida os palpites, grava como **pendente** e avisa no grupo do WhatsApp.
2. **Aceite / recusa** — o **desafiado** precisa entrar no app e aceitar ou recusar. O WhatsApp avisa cada caso (recusa = "fraco, bunda mole"). Só desafio **aceito** vale ponto.
3. **Regra de pontuação** — ao terminar o jogo, quem cravou o classificado que avançou rouba 1 ponto do outro (transferência de 1, igual à habilidade Ladrão).
4. **Resolução / campeão** — no fim do jogo, o WhatsApp anuncia o vencedor do desafio.
5. **UI** — botão "⚔️ Desafiar", botões Aceitar/Recusar e os selos de estado/resultado nas linhas de palpite.

> **Conceito (decisão do dono do bolão):** quando dois participantes escolhem **classificados diferentes** para o mesmo jogo de mata-mata, um pode desafiar o outro. O desafiado **aceita ou recusa** no sistema. Se aceitar e o classificado do **desafiante** avançar, ele rouba 1 ponto do adversário; se o do **desafiado** avançar, o desafiante perde 1 ponto, transferido para o desafiado. Ou seja: **quem cravar quem avança ganha +1; o outro perde −1** (transferência de 1 ponto). Desafio **pendente** ou **recusado** não move pontos.
>
> **Limites:** (1) **um desafio por pessoa por jogo** — quem já está num desafio ativo (pendente ou aceito) naquele jogo não pode criar nem receber outro (recusado libera a vaga). (2) **expira no fim do jogo** — se o desafiado não aceitar até o jogo terminar, o desafio vira **expirado** (não vale ponto; a função de resposta bloqueia aceite após o `FINISHED`).

---

## ⚠️ Ordem de deploy (ler antes de subir)

| Passo | O que faz | Por que antes |
|-------|-----------|---------------|
| [`supabase/update-018-challenges.sql`](../supabase/update-018-challenges.sql) | Cria `public.challenges` (já com a coluna `status`, + RLS + realtime) | O front faz `SELECT` em `challenges` no boot e a função `create-challenge` faz `INSERT`. Sem a tabela → erro e a feature não carrega. |
| [`supabase/update-019-challenge-status.sql`](../supabase/update-019-challenge-status.sql) | Adiciona a coluna `status` | **Só** se você já tinha rodado o 018 ANTES dele ganhar `status`. Se rodar o 018 atual, isto vira no-op. |
| Deploy do front + Netlify functions | Sobe a UI, as funções `create-challenge` e `respond-challenge`, e o aviso de campeão no `notify-core` | A UI chama `/.netlify/functions/create-challenge` e `/respond-challenge`; sem deploy não existem. |

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

Em [`src/utils/rules.ts`](../src/utils/rules.ts), dentro de **`calculateStandings`** (novo parâmetro opcional `challenges: Challenge[] = []`). Aplicada **depois** dos roubos do Ladrão e **só para desafios `accepted`**:

```
para cada challenge ACEITO cujo jogo terminou (status === 'finished') e tem vencedor:
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
- **um desafio por pessoa por jogo**: nenhum dos dois pode já estar em desafio **ativo** (`status in ('pending','accepted')`) nesse jogo (busca os ativos do jogo e checa os dois uids).

Se passar: `INSERT` em `challenges` com `status = 'pending'` (e `challenger_pick`/`challenged_pick` deduzidos) e envia no WhatsApp (best-effort, não derruba a criação):

```
⚔️ *DESAFIO ÉPICO ENTRE OS MOLHADOS* ⚔️

🇳🇱 Holanda x Marrocos 🇲🇦

🌊 *Pedro*: classifica 🇳🇱 *Holanda*
🌊 *Alex*: classifica 🇲🇦 *Marrocos*

*Pedro* desafiou *Alex*! Quem cravar quem avança rouba *+1 ponto*.
⏳ Agora é com você, *Alex* — aceita ou amarela? 👀
```

Reutiliza `sendText`, `ptName` e `flagEmoji` (agora **exportados** de [`netlify/shared/notify-core.mts`](../netlify/shared/notify-core.mts)).

---

## 2.5) Aceite / recusa

Função Netlify [`netlify/functions/respond-challenge.mts`](../netlify/functions/respond-challenge.mts):

`POST /.netlify/functions/respond-challenge`
```json
{ "challengeId": "<uuid>", "uid": "<uuid>", "accept": true }
```

Validações: o desafio existe, está `pending`, quem responde é o **desafiado** (`challenged_id === uid`) e o jogo ainda não terminou. O `UPDATE` é condicionado a `status = 'pending'` (trava contra resposta dupla concorrente). Avisa no WhatsApp:

- **Aceitou:** `🤝 *DESAFIO ACEITO!* … agora é pra valer! 🔥`
- **Recusou:** `🐔 *DESAFIO RECUSADO!* … Fraco, bunda mole! 😂💧`

Só depois de **aceito** o desafio entra na pontuação e na resolução do fim de jogo.

---

## 3) Resolução / campeão (fim do jogo)

Em [`netlify/shared/notify-core.mts`](../netlify/shared/notify-core.mts), dentro do bloco **"fim de jogo"** (`status === 'FINISHED' && prev.status !== 'FINISHED'`), logo após a mensagem de fim de jogo:

- calcula `adv` pela coluna `winner`;
- busca os `challenges` **aceitos** (`status = 'accepted'`) daquele `match_id`;
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
- **Pendente:** o **desafiado** vê **Aceitar / Recusar**; o **desafiante** vê `⏳ Aguardando resposta`.
- **Aceito (jogo rolando):** selo `⚔️ Desafio aceito`.
- **Recusado:** selo `🐔 {fulano} amarelou` (visto pelo desafiante) / `🐔 Você recusou` (visto pelo desafiado).
- **Expirado** (pendente + jogo terminou): selo `⌛ Desafio expirou (sem aceite)` — não vale ponto.
- **Encerrado (aceito):** `⚔️ Você ganhou +1` / `Você perdeu −1` (resultado pela coluna `winner`).

Estado e dados:
- `challenges` (estado) carregado no `loadAll` (mapeando `uuid → username`, igual aos roubos; inclui `status`);
- assinatura Realtime na tabela `challenges` (recarrega ao inserir/responder);
- handlers `handleChallenge(challengedUserId, match)` (cria) e `handleRespondChallenge(challengeId, accept)` (responde) → `fetch` → `loadAll`.

Estilos em [`src/index.css`](../src/index.css): `.challenge-btn-p16`, `.challenge-badge-p16` (`.active` / `.won` / `.lost` / `.declined`), `.challenge-respond-p16` + `.challenge-accept-p16` / `.challenge-decline-p16`.

---

## Persistência

[`supabase/update-018-challenges.sql`](../supabase/update-018-challenges.sql):
- `challenges` com `match_id` (→ `matches`), `challenger_id`/`challenged_id` (→ `participants`, uuid), `challenger_pick`/`challenged_pick` (`'HOME'|'AWAY'`), `status` (`'pending'|'accepted'|'declined'`, default `'pending'`).
- Constraints: `challenge_no_self` (não desafia a si mesmo), `challenge_diff_pick` (picks diferentes), `unique(match_id, challenger_id, challenged_id)` (a direção reversa é barrada na função).
- RLS: `select` para qualquer autenticado; `insert` só com `challenger_id = auth.uid()`. A resposta (aceite/recusa) é feita pela função `respond-challenge` com a service role (não precisa de policy de `update`).
- Adicionada à publicação `supabase_realtime`.
- [`supabase/update-019-challenge-status.sql`](../supabase/update-019-challenge-status.sql): só para quem rodou o 018 antes da coluna `status` existir.

Tipo no front: `Challenge` em [`src/types.ts`](../src/types.ts).

---

## Testes

Em [`src/utils/rules.test.ts`](../src/utils/rules.test.ts):
- `predictedAdvancer` — 4 casos (vencedor cravado, empate com `pensWinner`, empate sem escolha = `null`, fase de grupos = `null`).
- `calculateStandings — Desafio dos Molhados` — 3 casos (transferência de +1/−1 quando aceito e o jogo termina; jogo não encerrado = sem transferência; pendente/recusado = sem transferência).

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

- [ ] Rodar `update-018-challenges.sql` no Supabase (ou `update-019` se o 018 já estava rodado sem `status`).
- [ ] Deploy do front + Netlify functions.
- [ ] Validar em um jogo de mata-mata ao vivo: dois usuários com classificados diferentes → "Desafiar" → cai a mensagem de desafio no WhatsApp.
- [ ] O desafiado entra no app → **Aceitar** (cai "aceito") ou **Recusar** (cai "fraco, bunda mole").
- [ ] Ao encerrar (só se aceito): o ranking transfere +1/−1 e o WhatsApp anuncia o campeão; o card mostra o selo de resultado.
- [ ] (Opcional) Decidir se o ranking do WhatsApp passa a incluir desafios e roubos.
