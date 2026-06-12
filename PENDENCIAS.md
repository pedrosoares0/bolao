# 📋 Pendências para o Bolão ficar 100% Funcional

> ✅ **ATUALIZAÇÃO 12/06/2026**: Todos os itens P0 e a maioria dos P1 foram resolvidos com a arquitetura Netlify + Supabase + football-data.org. Veja o README para o setup. Restam os itens P2/P3 (admin de resultados, regra de mata-mata, testes de `rules.ts`, PWA).

> Diagnóstico original feito em 12/06/2026. O app hoje é um protótipo frontend-only: tudo vive no `localStorage` do navegador de cada pessoa, a API externa de jogos está fora do ar e os palpites dos outros participantes são **inventados por código** (`generateDeterministicBet`). Abaixo, tudo que falta, em ordem de prioridade.

---

## 🔴 P0 — Bloqueadores (sem isso o bolão não funciona de verdade)

### 1. API de jogos está MORTA
- `https://worldcup26.ir/get/games` e `/get/teams` **não respondem mais** (timeout — verificado em 12/06/2026). Hoje o app abre com "Erro ao carregar dados" e nenhum jogo aparece.
- Não existe fallback: `initialMatches` em `src/data/initialData.ts` existe mas **não é usado** quando a API falha.

**Opções de substituição (escolher uma):**

| Opção | Prós | Contras |
|---|---|---|
| **Backend próprio + cadastro manual de resultados** | Zero dependência externa, controle total, são só ~104 jogos | Alguém precisa lançar os placares (pode ser tela de admin) |
| **football-data.org** | Gratuito (tier free cobre Copa), dados confiáveis | Precisa de API key + proxy backend (bloqueia CORS do browser) |
| **API-Football (api-sports.io)** | Dados ricos (escalações, ao vivo) | Free = 100 req/dia; precisa de key + proxy |

> Recomendação: backend próprio que **busca de uma API externa e cacheia**, com tela de admin para corrigir/lançar resultado manualmente se a API falhar. Melhor dos dois mundos.

### 2. Não existe backend — dados não são compartilhados
Hoje cada navegador tem seu próprio "bolão". O Pedro não vê os palpites reais do Neto; vê palpites **fabricados** pelo gerador determinístico. Isso invalida o ranking inteiro.

**Backend mínimo necessário** (sugestão: Node + Express/Fastify + SQLite ou Postgres; alternativa rápida: Supabase):

```
POST /api/auth/login          → login real, retorna JWT
GET  /api/users               → participantes (substitui initialParticipants)
GET  /api/matches             → jogos (substitui worldcup26.ir, com cache)
GET  /api/matches?date=...    → jogos por data
GET  /api/bets?matchId=...    → palpites (só revela os dos outros após o kickoff!)
POST /api/bets                → salvar palpites do dia (valida lockout no servidor)
GET  /api/standings           → ranking calculado no servidor (portar rules.ts)
PUT  /api/admin/matches/:id   → lançar/corrigir resultado (rota de admin)
```

### 3. Remover palpites falsos (`generateDeterministicBet`)
- `src/App.tsx:137-146` + o `useEffect` em `App.tsx:294-347` **inventam apostas** para todos os participantes (e até para o usuário logado em jogos que já começaram).
- Com backend real, esse bloco inteiro morre. O ranking deve refletir só apostas reais; quem não apostou fica "Sem Palpite" / 0 pts.

### 4. Autenticação real
- O campo senha em `App.tsx` é puramente decorativo — qualquer um digita "neto" e vira o Neto, podendo lançar apostas no nome dele.
- Necessário: senha com hash (bcrypt) no backend, JWT na resposta, frontend guarda token e envia em `Authorization`. Como são 4 amigos, um simples seed de 4 usuários + senha resolve.

### 5. Lockout de apostas validado no SERVIDOR
- Hoje a regra "apostar até 1 min antes do jogo" (`isGameInFuture`, `App.tsx:9-28`) roda só no cliente — basta mudar o relógio do PC para burlar.
- O `POST /api/bets` deve rejeitar palpite se `now() >= kickoff` usando a hora do servidor, em UTC.

---

## 🟠 P1 — Bugs e problemas reais no código atual

1. **Fuso horário ignorado**: `local_date` da API antiga era hora local do estádio (EUA/México/Canadá). `isGameInFuture` compara com a hora do Brasil → lockout abre/fecha na hora errada. Solução: backend entrega kickoff em **UTC ISO 8601** (`2026-06-12T19:00:00Z`) e o front converte com `new Date()`.
2. **Datas sem ano** (`"12/06"`): chaves de agrupamento, seletor de datas e a flag `submitted_<user>_<date>` quebram se houver virada de mês/ano e impedem reuso do app em outra edição. Usar `YYYY-MM-DD`.
3. **Flag de "aposta lançada" não confiável**: `submitted_${userId}_${date}` no `localStorage` — limpar o cache "deslança" a aposta. Deve vir do backend.
4. **Erro da API = tela morta**: se o fetch falha, fica só a mensagem de erro. Adicionar botão "Tentar novamente" e/ou fallback.
5. **Novo usuário ganha avatar do Pedro**: `handleLoginSubmit` (`App.tsx:404`) usa `/imagens/pedro.png` como fallback para qualquer nome digitado. Com login fechado em 4 usuários isso some; senão, precisa de avatar genérico.
6. **`parseInt(g.home_score)`** sem base e sem guarda contra `NaN` — se a API mandar vazio, vira `NaN` e quebra a pontuação silenciosamente.
7. **Grupo com fallback errado**: jogo sem grupo vira `"Grupo A"` (`App.tsx:247`) — errado para mata-mata. Usar a fase real (Oitavas, Quartas...).
8. **Código morto**: `src/components/GameCard.tsx` e `src/components/Header.tsx` não são importados em lugar nenhum; `initialMatches`/`initialBets`/`availableTeams` em `initialData.ts` idem. Deletar ou usar.
9. **`package.json` com `"name": "temp-project"`** — renomear (ex: `bolao-bandidos-apostados`).
10. **README desatualizado**: links apontam para `c:/Users/Pedro/Desktop/apostados/...` (máquina de outra pessoa) e descrevem a API morta.

---

## 🟡 P2 — Funcionalidades faltantes para "100%"

- [ ] **Tela de admin** para lançar/corrigir resultados e travar rodadas (essencial se optar por cadastro manual).
- [ ] **Mata-mata**: pontuação hoje só considera placar do jogo; definir regra para empate + pênaltis (vale o placar dos 90/120 min? quem passa conta ponto?). Documentar em `rules.ts`.
- [ ] **Prêmio acumulado real**: hoje é `dias finalizados × R$ 2,50` calculado no front. Mover para o backend e permitir registrar quem pagou (controle de caixa).
- [ ] **Histórico/extrato por participante**: ver todos os palpites passados de uma pessoa e os pontos jogo a jogo.
- [ ] **Notificação/lembrete de apostar** (ex: WhatsApp/Telegram bot ou push) antes do primeiro jogo do dia — evita esquecer e zerar o dia.
- [ ] **PWA** (manifest + service worker) para instalar no celular — o design já é mobile-first.
- [ ] **Tratamento de empate no ranking final** e regra de divisão do prêmio (documentar).

---

## 🟢 P3 — Qualidade e deploy

- [ ] **Testes**: zero testes hoje. Mínimo: testes unitários de `analyzeBet`/`calculateStandings` (`src/utils/rules.ts`) com Vitest — é a regra de dinheiro do bolão, não pode ter bug.
- [ ] **Variáveis de ambiente**: URL da API em `.env` (`VITE_API_URL`), nunca hardcoded.
- [ ] **Deploy**:
  - Frontend: Vercel/Netlify (estático, `npm run build`).
  - Backend: Railway/Render/Fly.io + Postgres (ou Supabase, que já inclui auth + banco + API).
  - Configurar CORS no backend para o domínio do front.
- [ ] **CI simples**: GitHub Actions rodando `npm run lint` + `tsc -b` + testes a cada push.
- [ ] **Refatorar `App.tsx`** (852 linhas): extrair tela de login, lista de jogos e lógica de fetch para componentes/hooks (`useMatches`, `useBets`). Os componentes `GameCard`/`Header` órfãos podem ser reaproveitados aqui.
- [ ] **Atualizar README** com a nova arquitetura e instruções de backend.

---

## 🗺️ Ordem de ataque sugerida

1. **Backend mínimo** (Express + SQLite): tabelas `users`, `matches`, `bets`; seed dos 4 participantes e dos jogos da fase de grupos.
2. **Fonte de jogos**: integrar football-data.org no backend (com cache) **ou** tela de admin para lançar placares — destravando o item nº 1.
3. **Login real + JWT** e remover o gerador de palpites falsos.
4. **Migrar palpites do `localStorage` para a API**, com lockout validado no servidor.
5. **Ranking calculado no servidor** (portar `rules.ts`) + testes.
6. **Deploy** (front + back) e teste com os 4 participantes em celulares diferentes.
7. Itens P2/P3 conforme sobrar fôlego antes dos próximos jogos.
