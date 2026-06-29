# Documentação Técnica: Regra do Ladrão (Thief) 🥷

Esta documentação descreve o funcionamento de negócios, a modelagem de banco de dados no Supabase e a integração da habilidade **Ladrão** no sistema do Bolão.

---

## 1. Regras de Negócio

A habilidade **Ladrão** é calculada de forma dinâmica ao final de cada rodada diária (agrupada pela data local de Brasília, `isoDate`).

### Critérios de Elegibilidade:
1. **Pontuação Mínima:** O participante deve ser o maior pontuador do dia e ter feito **5 ou mais pontos** na rodada específica.
2. **Não ser o Líder:** O líder geral do campeonato (1º colocado na classificação acumulada até o término daquela rodada) **não pode** ser eleito o Ladrão.
3. **Regra de Anulação por Empate:** Caso dois ou mais participantes façam 5 ou mais pontos na mesma rodada (independentemente de quem fez mais), a habilidade é **anulada** para aquela rodada. Ninguém se torna o Ladrão.

### O Efeito:
* O participante eleito Ladrão pode escolher **qualquer adversário** para roubar **1 ponto** dele.
* O roubo é associado à rodada em que o Ladrão conquistou o direito.
* Cada rodada concluída pode gerar, no máximo, **um único roubo** de pontos no campeonato inteiro.

---

## 2. Modelagem do Banco de Dados (Supabase)

Para persistir a ação de roubo, foi criada a tabela `public.thief_steals` no banco de dados.

### DDL da Tabela:

```sql
create table public.thief_steals (
  id         uuid primary key default gen_random_uuid(),
  thief_id   uuid not null references public.participants (id) on delete cascade,
  victim_id  uuid not null references public.participants (id) on delete cascade,
  round_date date not null unique, -- Garante no máximo um roubo por data/rodada
  created_at timestamptz not null default now(),
  constraint thief_no_self_steal check (thief_id <> victim_id)
);
```

### Segurança de Linha (RLS - Row Level Security):
* **Leitura (`SELECT`):** Permitida para qualquer usuário autenticado, pois todos precisam ver quem roubou quem para auditar a tabela de classificação.
* **Escrita (`INSERT`):** Apenas o próprio usuário autenticado pode declarar um roubo em seu nome. O banco valida se o `thief_id` é igual ao `auth.uid()`.
* **Alteração/Exclusão (`UPDATE`/`DELETE`):** Desabilitadas. Uma vez que o roubo é executado, ele é permanente.

```sql
alter table public.thief_steals enable row level security;

create policy "thief_steals_select_authenticated"
  on public.thief_steals for select
  to authenticated
  using (true);

create policy "thief_steals_insert_own"
  on public.thief_steals for insert
  to authenticated
  with check (
    thief_id = auth.uid()
  );
```

### Sincronização em Tempo Real (Realtime):
A tabela foi adicionada à publicação do Supabase Realtime para que a classificação de todos os usuários conectados seja atualizada no exato segundo em que um roubo é realizado:

```sql
alter publication supabase_realtime add table public.thief_steals;
```

---

## 3. Cálculo de Pontuação e Classificação

O cálculo de pontos é feito no frontend (dentro da função `calculateStandings` em `src/utils/rules.ts`), garantindo dinamismo e auditoria rápida.

### Algoritmo de Cálculo:
1. Calcula-se a pontuação base de todos os participantes baseada nos palpites normais, bônus de artilheiro e palpites especiais.
2. Varre-se a lista de registros da tabela `thief_steals`.
3. Para cada registro de roubo:
   - **Ladrão (`thief_id`):** Recebe $+1$ ponto na classificação geral.
   - **Vítima (`victim_id`):** Recebe $-1$ ponto na classificação geral.
4. Os participantes são reordenados na classificação geral com base em suas novas pontuações ajustadas.

> [!NOTE]
> A pontuação de um participante pode ficar negativa na classificação geral caso ele sofra um roubo tendo 0 pontos acumulados.

---

## 4. Fluxo de Telas (Frontend)

O aplicativo gerencia a exibição de avisos e ações na aba principal de **Jogos** (`activeTab === 'jogos'`) com base em dois estados calculados em tempo real:

### A. Fluxo do Ladrão (Atacante)
1. O frontend calcula quais rodadas foram finalizadas e quem foi o Ladrão qualificado.
2. Se o usuário logado for o Ladrão da rodada `X` e **não houver** nenhum registro em `thief_steals` com `round_date = X` e `thief_id = usuario`, significa que ele tem um **roubo pendente**.
3. É exibido um card com borda neon roxa no topo da tela:
   - *"Você foi o maior pontuador da rodada de DD/MM com Y pontos! Escolha um adversário para roubar 1 ponto dele."*
   - O usuário seleciona o adversário em um dropdown e clica em **"Roubar Ponto 🎯"**.
   - Isso dispara um `INSERT` na tabela `thief_steals`. O card desaparece assim que a gravação é concluída com sucesso.

### B. Fluxo da Vítima
1. Se houver algum registro na tabela `thief_steals` onde `victim_id` corresponde ao ID do usuário logado:
2. O sistema verifica se o ID deste roubo já foi dispensado pelo usuário (consultando o `dismissed_steals` armazenado no `localStorage`).
3. Se não foi dispensado, exibe um card vermelho de alerta no topo da tela:
   - *"PONTO ROUBADO! O participante [Ladrão] roubou 1 ponto seu referente à rodada de DD/MM!"*
   - O usuário pode clicar no botão "✕" para dispensar o aviso. Isso adiciona o ID do roubo à lista de dispensados no `localStorage`, ocultando o banner de forma definitiva.
