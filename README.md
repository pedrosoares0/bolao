# 🏆 Bolão da Copa do Mundo 2026 - Bandidos Apostados

Este repositório contém o frontend da aplicação **Bandidos Apostados**, um sistema completo e interativo de bolão para a Copa do Mundo de 2026. O projeto foi estruturado com foco em design premium (Mobile-First), carregamento em tempo real de partidas via API pública e interatividade inline de palpites.

---

## 🛠️ Stack Tecnológica

- **Core**: [React 19](https://react.dev/) + [TypeScript](https://www.typescript.org/)
- **Build Tool**: [Vite](https://vite.dev/)
- **Estilização**: Vanilla CSS (CSS puro estruturado em [index.css](file:///c:/Users/Pedro/Desktop/apostados/src/index.css))
- **Ícones**: [Lucide React](https://lucide.dev/)

---

## 📁 Estrutura de Arquivos Principais

- [src/App.tsx](file:///c:/Users/Pedro/Desktop/apostados/src/App.tsx): Ponto de entrada e controlador de estado principal (telas, api, rascunhos, autenticação provisória).
- [src/components/StandingsTable.tsx](file:///c:/Users/Pedro/Desktop/apostados/src/components/StandingsTable.tsx): Componente da aba de Classificação ("Ranking"), incluindo o Slideshow de participantes e o card do Prêmio Acumulado.
- [src/utils/rules.ts](file:///c:/Users/Pedro/Desktop/apostados/src/utils/rules.ts): Implementação das regras de negócio de pontuação e ordenação do ranking.
- [src/index.css](file:///c:/Users/Pedro/Desktop/apostados/src/index.css): Design System da aplicação contendo tokens, variáveis de cores, animações e regras visuais premium.
- [public/imagens/](file:///c:/Users/Pedro/Desktop/apostados/public/imagens/): Assets estáticos, avatares dos participantes (`pedro`, `neto`, `rodrigo`, `alex`), imagens do slide, splash GIF e banner de login.

---

## 📝 Regras de Negócio e Funcionamento do Frontend

### 1. Fluxo de Acesso & Login Provisório
- **Tela de Login**: Atualmente solicita apenas o nome do usuário (`username`). O campo de senha é puramente visual.
- **Splash Screen**: Ao clicar em "ENTRAR", o sistema grava o usuário logado no `localStorage` como `bolao_current_user`, entra no estado `splash` por **3,5 segundos** tocando a animação `intro.gif`, e então redireciona para a tela principal (`app`).

### 2. Integração com a API em Tempo Real
A aplicação consome a API do repositório `github.com/rezarahiminia/worldcup2026` através dos seguintes endpoints (com fallback e normalização de dados no mount):
- **Times**: `https://worldcup26.ir/get/teams`
- **Partidas**: `https://worldcup26.ir/get/games`
- **Traduções e Mapeamentos**:
  - Os nomes dos países são traduzidos em tempo real do inglês para o português usando o dicionário `teamNamesMap` no [App.tsx](file:///c:/Users/Pedro/Desktop/apostados/src/App.tsx).
  - Os códigos das seleções (FIFA) são adaptados para o padrão de 4 letras do protótipo (ex: *South Africa* -> `AFRI`, *Czech Republic* -> `TCH`, *United States* -> `EUA`) via helper `mapFifaCode`.

### 3. Regras de Apostas (Bolão)
- **Data Ativa de Palpites**: O usuário só pode palpitar/editar jogos cuja data seja a data corrente do sistema ("Hoje" no seletor de dias, ex: `12/06`). Navegar por outros dias exibe os jogos de forma estática (apenas para visualização de placares e apostas de outros participantes).
- **Bloqueio de Horário (Lockout)**: A edição é permitida até **1 minuto antes** do início oficial da partida. Se o jogo for às 16:00, o input bloqueia automaticamente a partir das 15:59.
- **Submissão ("Lançar Bolão")**:
  - O botão de envio fica habilitado apenas quando **todos** os campos de placar de jogos editáveis de "Hoje" estiverem preenchidos.
  - Ao clicar em "Lançar Bolão", os palpites são salvos no array `bets` (persistido no `localStorage`). O botão de ação altera seu estado visual para uma pílula bege indicando **APOSTA JÁ LANÇADA** e os inputs daquela data são bloqueados contra alterações.
- **Visualização de Apostas Alheias**:
  - Para jogos que já começaram ou terminaram, ou jogos de outras datas, a lista inline de palpites de cada participante é renderizada abaixo do card do jogo.
  - Cada palpite mostra o avatar do participante, o palpite, a bandeira do time escolhido como vencedor (ou sem bandeira em caso de empate) e o selo de resultado (`exato`, `empate`, `vencedor`, `erro`).

### 4. Sistema de Pontuação e Classificação (`rules.ts`)
Para cada partida finalizada (`finished === "TRUE"`), a pontuação da aposta é avaliada em:
1. **Placar Exato (3 pontos)**: O participante acertou o placar exato do jogo.
2. **Empate Correto (2 pontos)**: O jogo terminou empatado e o participante apostou em empate (mas errou o número exato de gols).
3. **Vencedor Correto (1 ponto)**: O participante acertou qual time venceu a partida (mas errou o placar exato).
4. **Erro (0 pontos)**: Qualquer outro cenário de palpite incorreto.

**Critérios de Desempate na Classificação**:
1. Maior número de pontos totais.
2. Maior número de placares exatos acertados.
3. Maior número de empates corretos acertados.
4. Maior número de vencedores corretos acertados.
5. Ordem alfabética do nome do participante.

### 5. Cálculo do Prêmio Acumulado
- Cada participante contribui com uma taxa diária de **R$ 2,50** por dia jogado.
- O total pago acumulado por pessoa é calculado multiplicando os dias com jogos finalizados (`finishedDates.length`) por R$ 2,50.
- O **VALOR ACUMULADO** geral exibido no card de prêmios do topo da aba de Ranking é a soma do total pago acumulado de todos os participantes.

### 6. Design System e Identidade Visual (`index.css`)
- **Fundo Escuro Principal**: `#15110E` (preto do protótipo).
- **Fundo dos Cards de Jogos**: `#F2ECDD` (bege do protótipo).
- **Card do Prêmio Redesenhado**: Cartão de vidro premium (glassmorphism) contendo gradientes dourados com efeito brilhoso e colunas simétricas em estilo grid de bento. Sem repetição de logo (visto que o slideshow superior já o exibe).
- **Ranking Visual de Pílulas**:
  - **1º Lugar**: Fundo amarelo/dourado linear, texto branco.
  - **2º Lugar**: Fundo verde linear, texto branco.
  - **3º Lugar**: Fundo azul linear, texto branco.
  - **4º+ Lugar**: Fundo bege linear, texto preto escuro (`#15110E`).
  - **Avatares**: Sem bordas e com tamanho expandido para `72px` no Ranking e `44px` nos palpites do jogo.
- **Tipografia**: A fonte principal é `Outfit` (do Google Fonts), e a fonte condensada usada para números e títulos destacados é a fonte customizada `Granika` (configurada via `@font-face` e servida em `/granika.otf`). Para evitar aspect de distorção ou pixelização no Windows, os elementos com `Granika` usam `font-weight: normal` (e não bold/900).

---

## 🚀 Próximos Passos para o Desenvolvedor Backend

Para converter este protótipo funcional em um produto de produção real amanhã, você precisará:

1. **Substituir a Autenticação Provisória**:
   - Modificar o handler `handleLoginSubmit` no `App.tsx` para enviar uma requisição POST de login real para sua API.
   - Tratar o recebimento de JWT tokens e salvá-los de forma segura (e.g., cookie HTTP-only ou localStorage).
2. **Substituir a Persistência no LocalStorage**:
   - Integrar os palpites (`bets`) com o banco de dados. Em vez de ler/escrever diretamente em `localStorage` sob as chaves `bolao_bets` e `submitted_<userId>_<date>`, criar endpoints de:
     - `GET /api/bets`: Obter apostas do usuário logado e de outros participantes para partidas iniciadas.
     - `POST /api/bets/submit`: Enviar e consolidar palpites de uma data específica.
3. **Reforçar a Regra de Bloqueio no Servidor (Crucial)**:
   - A validação de tempo limite de palpites (até 1 minuto antes do início do jogo) é feita atualmente no frontend pelo helper `isGameInFuture`.
   - **Garantir que a API backend rejeite qualquer palpite enviado após o kickoff da partida** comparando com a hora do servidor de forma segura para evitar fraudes via manipulação de relógio do cliente.
4. **Persistência de Usuários & Avatares**:
   - Substituir a lista inicial de participantes estáticos (`initialParticipants`) por chamadas para um endpoint `GET /api/users`.

---

## 🏃 Como Rodar Localmente

1. Certifique-se de ter o Node.js instalado.
2. Instale as dependências:
   ```bash
   npm install
   ```
3. Inicie o servidor de desenvolvimento:
   ```bash
   npm run dev
   ```
4. Gere a build otimizada de produção para deploy:
   ```bash
   npm run build
   ```
