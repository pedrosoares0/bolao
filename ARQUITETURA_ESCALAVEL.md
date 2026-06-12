# Plano para um bolão escalável por ligas e grupos

## Visão geral

Sim, o projeto pode evoluir para uma plataforma maior, com Brasileirão e outras competições, cadastro aberto de usuários, criação de grupos privados ou públicos e convites entre amigos.

O conceito atual funciona bem como prova de produto: existem partidas, palpites, pontuação, ranking e atualização em tempo real. Porém, a estrutura foi feita para um único bolão com poucos participantes fixos. Para crescer, o sistema precisa separar claramente usuários, competições, temporadas, grupos, membros, regras e palpites.

## Experiência esperada

1. O usuário cria uma conta e configura seu perfil.
2. Escolhe uma competição disponível, como Brasileirão Série A, Copa do Brasil ou Champions League.
3. Cria um grupo ou entra em um grupo existente por convite.
4. O criador configura nome, imagem, privacidade, limite de participantes, regra de pontuação e prazo dos palpites.
5. Os membros fazem palpites nas rodadas da competição.
6. O ranking é calculado separadamente para cada grupo.
7. Placares, palpites e classificação são atualizados em tempo real.
8. O mesmo usuário pode participar de vários grupos e campeonatos com um único palpite por partida, ou com palpites diferentes por grupo, conforme a regra definida pelo produto.

## Decisão central de produto

Antes da implementação, é necessário decidir como o palpite se relaciona com os grupos.

### Opção A: um palpite por competição

O usuário palpita uma vez em cada partida e esse palpite vale para todos os seus grupos daquela competição.

Vantagens:

- experiência mais simples;
- menos dados e menos trabalho para o usuário;
- evita palpites contraditórios em grupos diferentes;
- facilita notificações e fechamento das rodadas.

### Opção B: um palpite por grupo

O usuário pode registrar um placar diferente para a mesma partida em cada grupo.

Vantagens:

- cada grupo pode ter regras e estratégias próprias;
- maior flexibilidade para grupos pagos ou temáticos.

Desvantagens:

- experiência mais trabalhosa;
- mais armazenamento e processamento;
- maior risco de confusão.

Para a primeira versão escalável, a recomendação é a Opção A: um palpite por usuário, partida e competição. Os grupos apenas calculam rankings diferentes sobre os mesmos palpites.

## O que pode ser reaproveitado

- frontend React e TypeScript;
- autenticação do Supabase;
- componentes visuais de partidas, palpites e ranking;
- regras atuais de pontuação como base;
- Supabase Realtime;
- sincronização de partidas por função agendada;
- conversão de fuso horário e bloqueio antes do jogo;
- estrutura de testes das regras.

## O que precisa ser redesenhado

### 1. Cadastro aberto de usuários

O login atual pressupõe participantes cadastrados previamente. A plataforma precisará de:

- cadastro por e-mail e senha;
- confirmação de e-mail;
- recuperação de senha;
- login social opcional;
- nome público e nome de usuário únicos;
- avatar enviado pelo usuário;
- aceite de termos e política de privacidade;
- bloqueio, exclusão e exportação da conta;
- proteção contra criação automatizada de contas.

### 2. Competições e temporadas

As partidas não podem pertencer implicitamente a uma única Copa. Será necessário modelar:

- esporte;
- país ou região;
- competição;
- temporada;
- fase;
- rodada;
- clubes ou seleções;
- partidas e resultados.

Uma competição deve possuir um identificador interno estável, independentemente do identificador usado pela API externa.

### 3. Grupos de bolão

Cada grupo deve ter:

- proprietário;
- administradores;
- competição e temporada associadas;
- nome, descrição e imagem;
- visibilidade pública ou privada;
- código ou link de convite;
- limite de participantes;
- status ativo, encerrado ou arquivado;
- regra de pontuação;
- prazo de entrada;
- política de exibição dos palpites;
- configurações de cobrança, caso exista pagamento.

### 4. Membros e permissões

É necessário substituir a lista global de participantes por associações entre usuários e grupos.

Papéis sugeridos:

- `owner`: proprietário do grupo;
- `admin`: administra membros e configurações permitidas;
- `member`: participa e palpita;
- `removed` ou `banned`: perdeu acesso ao grupo.

As políticas RLS do Supabase devem garantir que um usuário somente veja e altere dados dos grupos aos quais possui acesso.

### 5. Convites

O sistema de convites precisa suportar:

- link com token difícil de adivinhar;
- código curto para compartilhamento;
- data de expiração;
- limite de usos;
- cancelamento pelo administrador;
- entrada automática ou aprovação manual;
- prevenção de uso após banimento;
- convites por e-mail ou compartilhamento em WhatsApp.

O token original não deve ser armazenado em texto puro. O banco deve guardar um hash, assim como ocorre com senhas.

### 6. Regras configuráveis

As regras não devem ficar fixas no frontend. Cada grupo ou competição poderá definir:

- pontos por placar exato;
- pontos por vencedor correto;
- pontos por empate correto;
- bônus por saldo ou gols de uma equipe;
- palpites especiais;
- prazo de bloqueio antes da partida;
- critérios de desempate;
- visibilidade dos palpites antes do jogo;
- tratamento de partidas adiadas, canceladas ou decididas nos pênaltis.

As configurações precisam ser versionadas. Alterar uma regra depois do início não pode recalcular o passado de forma inesperada.

## Modelo de dados sugerido

```text
profiles
  id, username, display_name, avatar_url, status, created_at

sports
  id, name

competitions
  id, sport_id, provider_id, name, country, logo_url, active

seasons
  id, competition_id, provider_id, name, starts_at, ends_at, status

teams
  id, provider_id, name, short_name, crest_url

matches
  id, season_id, provider_id, round_id, home_team_id, away_team_id,
  kickoff_at, status, home_score, away_score, winner, updated_at

rounds
  id, season_id, number, name, starts_at, ends_at

groups
  id, owner_id, season_id, name, description, image_url,
  visibility, ruleset_id, member_limit, status, created_at

group_members
  group_id, user_id, role, status, joined_at

group_invites
  id, group_id, token_hash, created_by, expires_at,
  max_uses, uses, status

rulesets
  id, version, exact_points, outcome_points, draw_points,
  lock_minutes, reveal_policy, tiebreakers, config_json

predictions
  id, user_id, match_id, home_score, away_score,
  submitted_at, updated_at

group_standings
  group_id, user_id, points, exact_count, outcome_count,
  rank, calculated_at

notifications
  id, user_id, type, payload, read_at, created_at

audit_logs
  id, actor_id, group_id, action, entity_type, entity_id,
  metadata, created_at
```

Se for escolhida a opção de palpites diferentes por grupo, `predictions` também deverá conter `group_id` e possuir uma restrição única em `(group_id, user_id, match_id)`.

## Segurança e integridade

### Regras obrigatórias no servidor

- bloquear palpites usando o horário do banco, nunca o relógio do navegador;
- impedir alteração de palpites após o prazo;
- verificar se o usuário participa de um grupo antes de exibir dados privados;
- impedir que administradores alterem palpites de outros membros;
- validar resultados recebidos da API externa;
- registrar ações administrativas importantes em auditoria;
- aplicar limites de requisições em cadastro, login, convites e palpites;
- impedir enumeração de usuários e tokens de convite;
- usar funções transacionais para operações críticas.

### Políticas de exibição dos palpites

Cada grupo poderá escolher uma política:

- sempre visíveis;
- visíveis somente depois que o usuário também palpitar;
- visíveis após o prazo de apostas;
- visíveis após o início da partida.

A política deve ser aplicada por RLS ou por uma função segura no banco. Esconder apenas no React não protege os dados.

## Fonte de partidas e resultados

Para Brasileirão e várias ligas, a fonte de dados passa a ser uma dependência central. É necessário avaliar:

- cobertura das competições desejadas;
- frequência de atualização ao vivo;
- limites de requisições;
- estabilidade e suporte;
- licença para uso comercial;
- custo por volume;
- identificadores consistentes de times, partidas e rodadas.

O sistema deve armazenar os dados localmente e tratar a API somente como provedora. A interface do aplicativo nunca deve depender diretamente da disponibilidade dela.

Também será necessária uma tela administrativa para corrigir resultados, horários, partidas adiadas e inconsistências da API.

## Processamento de pontuação

Calcular todo o ranking no navegador deixa de ser adequado em grande escala. A pontuação deve ser processada no backend quando:

- o resultado de uma partida mudar;
- uma correção administrativa for feita;
- uma regra versionada exigir recálculo.

Estratégia recomendada:

1. atualizar o resultado da partida;
2. colocar um trabalho de pontuação em uma fila;
3. calcular os pontos de todos os palpites daquela partida;
4. atualizar os totais dos grupos afetados;
5. publicar a mudança em tempo real;
6. manter o processamento idempotente para evitar pontos duplicados.

Para começar, uma função SQL ou Edge Function pode atender. Em volume maior, será necessária uma fila de trabalhos com tentativas automáticas e monitoramento.

## Escalabilidade técnica

O Supabase continua sendo uma escolha viável para uma primeira versão pública, desde que o banco seja bem modelado e indexado.

Índices essenciais incluem:

- partidas por temporada, rodada e horário;
- palpites por usuário e partida;
- membros por grupo e usuário;
- grupos por temporada;
- ranking por grupo e posição;
- convites por hash e status.

Outras necessidades:

- paginação de grupos, membros e rankings;
- consultas que retornem apenas os dados necessários;
- cache para competições, rodadas e rankings populares;
- imagens em storage com transformação e CDN;
- jobs assíncronos para sincronização e pontuação;
- ambientes separados de desenvolvimento, homologação e produção;
- backups automáticos e procedimento de restauração;
- logs centralizados, métricas e alertas;
- rastreamento de erros do frontend e backend;
- testes de carga antes de grandes rodadas.

## Limitações da estrutura atual

- existe apenas um conjunto global de participantes;
- partidas pertencem implicitamente a uma única competição;
- não existem temporadas nem rodadas normalizadas;
- não existem grupos ou membros;
- regras são fixas no código;
- ranking é calculado no cliente;
- sincronização foi desenhada para uma competição;
- imagens dos participantes são arquivos estáticos do projeto;
- não existe fluxo público de cadastro, convite ou recuperação de conta;
- a autorização atual não cobre isolamento entre grupos;
- não existe painel administrativo nem auditoria;
- não há infraestrutura para notificações ou filas.

## Funcionalidades necessárias para uma versão pública

### Essenciais

- cadastro, login e recuperação de senha;
- perfil e avatar;
- catálogo de competições e temporadas;
- criação e administração de grupos;
- convites por link e código;
- entrada e saída de grupos;
- palpites por rodada;
- bloqueio de palpites no servidor;
- ranking por grupo;
- regras e desempates claramente exibidos;
- atualização de resultados e pontos;
- painel administrativo;
- tratamento de jogos adiados e cancelados;
- termos de uso e política de privacidade.

### Importantes depois do MVP

- notificações por push, e-mail ou WhatsApp;
- comentários ou mural do grupo;
- conquistas e estatísticas pessoais;
- grupos públicos pesquisáveis;
- moderação, denúncias e bloqueio de usuários;
- exportação de ranking;
- PWA ou aplicativo móvel;
- planos pagos e limites por plano;
- suporte a competições simultâneas no mesmo grupo.

## Pagamentos e aspectos legais

Se a plataforma apenas organiza palpites sem administrar dinheiro, a complexidade é menor. Se cobrar entrada, guardar saldo ou distribuir prêmios, será necessário avaliar antes do lançamento:

- legislação aplicável a apostas, concursos e jogos promocionais;
- termos dos provedores de pagamento;
- verificação de idade e identidade;
- responsabilidade fiscal;
- prevenção a fraude e lavagem de dinheiro;
- reembolsos, disputas e prestação de contas;
- segregação de valores de usuários;
- segurança compatível com operações financeiras.

A recomendação inicial é não custodiar dinheiro. O grupo pode registrar regras e pagamentos externamente enquanto a plataforma cuida apenas dos palpites e rankings.

## Testes necessários

- testes unitários para todas as regras de pontuação;
- testes de partidas adiadas, canceladas e corrigidas;
- testes de prazo e fuso horário;
- testes de desempate;
- testes de isolamento entre grupos;
- testes das políticas RLS;
- testes de convites expirados, cancelados e esgotados;
- testes de concorrência ao salvar palpites perto do prazo;
- testes de idempotência da sincronização e da pontuação;
- testes ponta a ponta dos fluxos de cadastro, grupo, convite e palpite;
- testes de carga em horários próximos ao início das partidas.

## Plano de evolução

### Fase 1: fundação multiusuário

- criar cadastro e perfis públicos;
- remover participantes fixos;
- normalizar competições, temporadas, times, rodadas e partidas;
- adaptar o sincronizador para múltiplas competições;
- mover regras críticas para o servidor.

### Fase 2: grupos e convites

- criar grupos, membros, papéis e convites;
- implementar RLS para isolamento dos grupos;
- criar tela de administração do grupo;
- gerar ranking separado por grupo.

### Fase 3: primeira liga real

- integrar uma fonte confiável para o Brasileirão;
- implementar partidas adiadas e correções;
- criar palpites por rodada e lembretes;
- validar a plataforma com grupos pequenos convidados.

### Fase 4: escala e operação

- adicionar fila de processamento;
- materializar rankings;
- implementar observabilidade e alertas;
- executar testes de carga e segurança;
- automatizar backups e recuperação;
- publicar termos, privacidade e ferramentas de suporte.

### Fase 5: expansão

- adicionar novas ligas sem alterar a lógica central;
- oferecer regras personalizadas;
- criar grupos públicos e descoberta;
- avaliar monetização, aplicativo móvel e recursos sociais.

## Arquitetura recomendada para o MVP

```text
React/Vite
  -> Supabase Auth
  -> Supabase Postgres + RLS
  -> Supabase Realtime
  -> Supabase Storage para avatares e imagens de grupos

Netlify Functions ou Supabase Edge Functions
  -> integração com provedores esportivos
  -> validações e operações administrativas
  -> sincronização agendada
  -> processamento inicial de pontuação

Serviço de observabilidade
  -> erros do frontend
  -> logs das funções
  -> falhas de sincronização
```

Essa arquitetura é suficiente para validar o produto e atender milhares de usuários, dependendo do padrão de uso e do plano contratado. A migração para serviços adicionais deve acontecer por necessidade medida, não antecipadamente.

## Conclusão

A ideia é tecnicamente viável e combina bem com a experiência já construída. O maior trabalho não está no layout, mas na transformação do modelo de um bolão único para uma plataforma multiusuário e multigrupo, com autorização rigorosa, dados esportivos confiáveis e pontuação processada no servidor.

O caminho mais seguro é começar com uma única liga, provavelmente o Brasileirão, adotar um palpite por usuário e partida, permitir vários grupos sobre esses palpites e validar o uso antes de adicionar pagamentos, regras muito personalizadas ou dezenas de competições.
