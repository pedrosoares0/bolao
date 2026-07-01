# Documentação do Sistema de Desafios (Desafio dos Molhados)

Esta documentação detalha a arquitetura, regras de negócio e integrações necessárias para o desenvolvimento/manutenção do backend do **Desafio dos Molhados**.

---

## 1. Modelo de Dados (Tabela no Supabase/Banco de Dados)

A tabela de desafios (sugerido: `challenges`) deve conter a seguinte estrutura de campos:

| Campo | Tipo | Descrição |
| :--- | :--- | :--- |
| `id` | `UUID` (Primary Key) | Identificador único do desafio. |
| `match_id` | `BigInt` / `Int` (Foreign Key) | ID do jogo correspondente (ex: vindo da tabela de partidas/jogos). |
| `challenger_id` | `UUID` / `Text` (Foreign Key) | UID do participante desafiante (quem disparou o desafio). |
| `challenged_id` | `UUID` / `Text` (Foreign Key) | UID do participante desafiado (quem recebeu o desafio). |
| `challenger_pick` | `VARCHAR` (`HOME` / `AWAY`) | Palpite do desafiante de quem se classifica no jogo na hora da criação. |
| `challenged_pick` | `VARCHAR` (`HOME` / `AWAY`) | Palpite do desafiado de quem se classifica no jogo na hora da criação. |
| `status` | `VARCHAR` | Estado atual do desafio: `'pending'` (pendente), `'accepted'` (aceito), `'declined'` (recusado/galinha). |
| `created_at` | `Timestamp` | Data e hora de criação do registro. |
| `updated_at` | `Timestamp` | Data e hora da última atualização do registro. |

---

## 2. Endpoints e Funções Serverless (Netlify Functions)

Foram integradas duas funções do Netlify no frontend que chamam o backend:

### 2.1. Criar Desafio (`/.netlify/functions/create-challenge`)
Disparado pelo desafiante ao confirmar o convite.
*   **Método**: `POST`
*   **Payload (JSON)**:
    ```json
    {
      "matchId": 45,
      "challengerUid": "UID_DO_DESAFIANTE",
      "challengedUid": "UID_DO_DESAFIADO"
    }
    ```
*   **Ações do Backend**:
    1.  Verificar se a partida é de mata-mata.
    2.  Verificar se o jogo já começou e não está finalizado.
    3.  Buscar a aposta (`bet`) de ambos os participantes para este jogo.
    4.  Determinar quem cada um marcou para avançar (usando placar + se houver empate, o vencedor dos pênaltis).
    5.  **Validação**: O desafiante e o desafiado devem ter palpites de classificados **diferentes**.
    6.  **Validação**: Nenhum dos dois pode estar em outro desafio ativo (`pending` ou `accepted`) para esta mesma partida (regra de 1 desafio por pessoa por jogo).
    7.  Salvar o registro com `status: 'pending'`, `challenger_pick` e `challenged_pick` preenchidos.

### 2.2. Responder Desafio (`/.netlify/functions/respond-challenge`)
Disparado pelo desafiado ao aceitar ou recusar (galinha) um desafio pendente recebido.
*   **Método**: `POST`
*   **Payload (JSON)**:
    ```json
    {
      "challengeId": "UUID_DO_DESAFIO",
      "uid": "UID_DO_DESAFIADO",
      "accept": true / false
    }
    ```
*   **Ações do Backend**:
    1.  Validar se a requisição partiu do `challenged_id` correto.
    2.  Se `accept` for `true`, atualizar o status para `'accepted'`.
    3.  Se `accept` for `false`, atualizar o status para `'declined'`.

---

## 3. Regra de Pontuação (Mata-mata)

Quando o jogo termina (`match.status === 'finished'`), os pontos dos desafios devem ser processados:
1.  **Apenas desafios no status `'accepted'` (aceitos)** geram pontuação.
2.  Determina-se quem de fato se classificou na partida real (Mandante `HOME` ou Visitante `AWAY`).
3.  Compara-se com as escolhas `challenger_pick` e `challenged_pick`:
    *   O participante que **acertou** quem avançou ganha **+1 ponto**.
    *   O participante que **errou** quem avançou perde **-1 ponto** (roubo de ponto).
    *   Exemplo: Se o desafiante acertou e o desafiado errou, o desafiante ganha 1 ponto e o desafiado perde 1 ponto.

---

## 4. Fluxo e Regras Visuais do Frontend

*   **Validação Visual (canChallenge)**:
    O botão de espada (`⚔️`) só é exibido ao lado de outros participantes se:
    1.  O usuário estiver logado.
    2.  For jogo de mata-mata.
    3.  O jogo já tiver começado (`kickoff` no passado).
    4.  O jogo não estiver finalizado.
    5.  Ambos tiverem palpites salvos no banco.
    6.  Os palpites de classificação forem opostos.
    7.  Nenhum dos dois participantes tiver outro desafio pendente ou aceito ativo para a mesma partida.
*   **Modal de Confirmação**:
    Ao clicar na espada, o frontend renderiza um modal premium contendo os dados dos dois jogadores, a indicação dinâmica de quem cada um escolheu, a cor de aurora dos times correspondentes, faíscas visuais e a mensagem de confirmação para disparo da Netlify Function.
*   **Badges Visuais**:
    *   `⚔️` Desafio pendente enviado (aguardando o outro).
    *   `🛡️` Desafio pendente recebido (com botões de Aceitar/Recusar).
    *   `🐔` Desafio recusado (galinha).
    *   `🏆` Desafio vencido (acertou o classificado).
    *   `💀` Desafio perdido (errou o classificado).
    *   `⌛` Desafio expirou sem aceite antes da partida acabar.
