# 🏆 Bolão da Copa do Mundo 2026 - Bandidos Apostados

Plataforma mobile-first completa para bolão da Copa do Mundo 2026, com placares ao vivo, sistema de pontuação e notificações integradas.

- **Demonstração**: [bandidosapostados.netlify.app](https://bandidosapostados.netlify.app/)
- **Hospedagem**: Netlify (Frontend + Serverless Functions)
- **Banco de Dados & Realtime**: Supabase (PostgreSQL)

---

## 🛠️ Tecnologias & API Integrations

- **Frontend**: React 19, TypeScript, Vite, CSS puro
- **Backend & Banco**: Supabase (Auth, Realtime, RLS)
- **Serverless**: Netlify Functions (HTTPS + Cron de sincronização)
- **Fontes de Dados**:
  - `football-data.org` (fonte oficial de jogos, IDs e fases)
  - `ESPN` (API pública sem chave para turbo de placar ao vivo e minuto de jogo)
  - `Evolution API` (integração para envio de mensagens no grupo de WhatsApp)

---

## 🚀 Funcionalidades Principais

- **Placares Híbridos & Ao Vivo**: Combina a confiabilidade da fonte oficial (`football-data.org`) com a velocidade de tempo real da ESPN. Em caso de queda de uma API, o sistema faz o fallback automático.
- **Notificações Inteligentes no WhatsApp**: Lembretes de palpites para quem esqueceu, alertas de início de partida, gols em tempo real com indicação do time, fim de jogo com atualização de pontos, e fechamento da rodada com ranking atualizado.
- **Gestão de Fiados & Pote**: Caderneta digital integrada para controle individual de saldo pendente e cálculo dinâmico do prêmio diário acumulado.
- **Segurança de Regras (Lockout)**: O sistema de apostas valida o horário de encerramento diretamente no servidor, impedindo palpites retroativos.
- **Compartilhamento no Canvas**: Geração instantânea de imagem do ranking atualizado gerada via HTML5 Canvas para compartilhamento em redes sociais.

---

## 🧱 Arquitetura de Integração

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

## 🔒 Segurança

- **Row Level Security (RLS)**: Todas as tabelas no Supabase são protegidas; usuários só acessam ou modificam seus próprios registros.
- **Servidor como Fonte da Verdade**: Regras cruciais (como rejeição de palpites após o início de um jogo) são validadas em banco via Database Functions (RPC), eliminando fraudes através do relógio do cliente.
- **Segurança da Informação**: CSP (Content Security Policy) estrito configurado no Netlify para evitar injeções de scripts e chaves sensíveis mantidas estritamente no backend.

---

## ✅ Qualidade & Desenvolvimento

- **TypeScript Strict**: Tipagem estática consistente de ponta a ponta (frontend e serverless functions).
- **Testes Unitários (Vitest)**: Cobertura de testes automatizados para regras matemáticas críticas do app (cálculo de pontos, regras de desempate e partilha de pote).
- **Linting & Formatação**: Configurações robustas com ESLint validando boas práticas de código no app e nas funções.

---

## 📁 Estrutura do Projeto

- `/src` — Telas do aplicativo React, componentes visuais, abas e lógica de pontuação no cliente.
- `/netlify/functions` — Funções serverless que rodam tarefas cron e chamadas HTTP de atualização de jogos.
- `/supabase` — Scripts SQL contendo a estrutura de tabelas, triggers de realtime, segurança de banco e dados iniciais (seeds).
- `/docs` — Documentações de engenharia e planos de escalabilidade.
