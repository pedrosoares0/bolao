import type { Match, Bet, Participant, ParticipantStanding, SpecialPrediction, ThiefSteal, Challenge } from '../types';
import { computeChampion, computeBrazilStage, SPECIAL_POINTS } from './specials';
import { goalsByPlayer } from './players';

// Pontos extras do palpite de artilheiro: +1 por GOL marcado pelo jogador
// escolhido (gol contra não conta). Só faz sentido em jogo com placar conhecido.
export function scorerBonus(bet: Bet | undefined, match: Match): number {
  if (!bet?.scorerId) return 0;
  if (match.homeScore === null || match.awayScore === null) return 0;
  return goalsByPlayer(match.goals, bet.scorerId);
}

// Bônus do palpite de CLASSIFICAÇÃO no mata-mata (quem avança + se vai a pênaltis).
// Só conta quando o jogo passou dos 90' — ou seja, foi à PRORROGAÇÃO ou aos
// PÊNALTIS (match.duration). Decidido no tempo normal NÃO pontua nem desconta:
// nesse caso o palpite de empate simplesmente errou o placar (tratado lá no
// analyzeBet) e o palpite de classificação fica neutro (0). Pontos:
//   • forma de decisão (pênaltis x prorrogação): +1 se acertar, 0 se errar.
//   • quem avança: +1 se acertar, −1 se errar.
// Só se aplica se o usuário palpitou EMPATE (é quando o app pede a classificação).
// Contabilizado à parte do placar, igual ao bônus de artilheiro.
export function pensBonus(bet: Bet | undefined, match: Match): number {
  if (!bet) return 0;
  if (match.status !== 'finished') return 0;
  if (match.homeScore === null || match.awayScore === null) return 0;
  if (match.stage === 'GROUP_STAGE') return 0;

  // Só se aplica se o usuário palpitar empate no placar
  if (bet.homeScore !== bet.awayScore) return 0;

  // Duração do jogo. Fallback: sem a coluna `duration` (dado antigo/atrasado),
  // a presença de pênaltis (homePens) já identifica a disputa.
  const duration = match.duration
    ?? (match.homePens != null && match.awayPens != null ? 'PENALTY_SHOOTOUT' : null);
  const wasPens = duration === 'PENALTY_SHOOTOUT';
  const wentBeyond90 = wasPens || duration === 'EXTRA_TIME';

  // Decidido no tempo normal (ou duração desconhecida): classificação não conta.
  if (!wentBeyond90) return 0;

  const matchWinnerSide = match.winner === 'HOME_TEAM' ? 'HOME' : 'AWAY';

  let points = 0;

  // 1. Forma de decisão: marcou "vai pra pênaltis" e foi (ou "não vai" e foi à
  //    prorrogação) => +1. Errar a forma não pune (0).
  if (bet.pensPick === wasPens) {
    points += 1;
  }

  // 2. Quem se classifica (+1 se acertar, −1 se errar).
  if (bet.pensWinner === matchWinnerSide) {
    points += 1;
  } else {
    points -= 1;
  }

  return points;
}

export type BetResultType = 'exact' | 'draw' | 'winner' | 'wrong' | 'pending';

interface BetAnalysis {
  points: number;
  type: BetResultType;
}

// Analisa e calcula os pontos de uma aposta individual em relação ao resultado real de um jogo
export function analyzeBet(bet: Bet | undefined, match: Match): BetAnalysis {
  if (!bet || match.homeScore === null || match.awayScore === null) {
    return { points: 0, type: 'pending' };
  }

  const { homeScore: bHome, awayScore: bAway } = bet;
  const { homeScore: mHome, awayScore: mAway } = match;
  const betDiff = bHome - bAway;

  // 1. Placar Exato (3 pontos)
  if (bHome === mHome && bAway === mAway) {
    return { points: 3, type: 'exact' };
  }

  // 2. Acertou Empate, mas errou o placar exato (2 pontos)
  if (mHome === mAway && bHome === bAway) {
    return { points: 2, type: 'draw' };
  }

  // 3. Mata-mata decidido nos PÊNALTIS: o placar empatou (mHome === mAway) mas
  // há um vencedor que AVANÇOU (winner = HOME_TEAM/AWAY_TEAM, nunca DRAW). Quem
  // apostou um vencedor e cravou o time que avançou leva 1 ponto; quem apostou
  // o eliminado leva 0. (Na fase de grupos o empate vem com winner = 'DRAW', que
  // não cai aqui — segue valendo só os 2 pts do empate acima.)
  if (mHome === mAway && (match.winner === 'HOME_TEAM' || match.winner === 'AWAY_TEAM')) {
    const advance = match.winner === 'HOME_TEAM' ? 1 : -1;
    if (Math.sign(betDiff) === advance) {
      return { points: 1, type: 'winner' };
    }
    return { points: 0, type: 'wrong' };
  }

  // 4. Acertou o Vencedor, mas errou o placar exato (1 ponto)
  const realDiff = mHome - mAway;
  if (Math.sign(realDiff) === Math.sign(betDiff)) {
    return { points: 1, type: 'winner' };
  }

  // 5. Errou tudo (0 pontos)
  return { points: 0, type: 'wrong' };
}

// Profeta = cravou o resultado por completo (vale o selo 🔮 no card e a contagem
// de desempate). No tempo normal basta o placar exato. Mas se o jogo foi
// decidido na PRORROGAÇÃO ou nos PÊNALTIS, só o placar não basta: é preciso
// também cravar a forma (prorrogação x pênaltis) E quem se classifica — ou seja,
// o bônus de classificação máximo (pensBonus === 2). Como só dá pra prever a
// classificação quando se aposta empate (e empate decidido fora dos 90' = jogo
// foi a pênaltis), na prática a exigência extra recai sobre os jogos de pênaltis.
// NÃO altera os pontos do placar (ver analyzeBet) nem o ON FIRE (que é por
// pontuação) — só define quando um acerto conta como Profeta.
export function isProfeta(bet: Bet | undefined, match: Match): boolean {
  if (!bet) return false;
  if (analyzeBet(bet, match).type !== 'exact') return false;

  const duration = match.duration
    ?? (match.homePens != null && match.awayPens != null ? 'PENALTY_SHOOTOUT' : null);
  // Só os pênaltis coincidem placar-exato (empate cravado) COM um palpite de
  // classificação. Prorrogação decidida por gol tem placar não-empate (aposta de
  // vencedor, sem classificação) — aí o placar exato já é o "acertou tudo".
  if (duration !== 'PENALTY_SHOOTOUT') return true;

  return pensBonus(bet, match) === 2;
}

// Time que o participante acha que AVANÇA num jogo de mata-mata (o "classificado"):
// se cravou um vencedor no placar, é o lado vencedor; se apostou empate e escolheu
// quem se classifica, é o pensWinner. Fora do mata-mata (ou sem palpite), null.
// Base do "Desafio dos Molhados" — dois participantes com classificados diferentes.
export function predictedAdvancer(bet: Bet | undefined, match: Match): 'HOME' | 'AWAY' | null {
  if (!bet) return null;
  if (match.stage === 'GROUP_STAGE') return null;
  if (bet.homeScore !== bet.awayScore) return bet.homeScore > bet.awayScore ? 'HOME' : 'AWAY';
  return bet.pensWinner ?? null;
}

// Quem AVANÇOU de verdade no mata-mata (coluna winner; cobre pênaltis/prorrogação).
function matchAdvancer(match: Match): 'HOME' | 'AWAY' | null {
  if (match.winner === 'HOME_TEAM') return 'HOME';
  if (match.winner === 'AWAY_TEAM') return 'AWAY';
  return null;
}

// Gera a tabela de classificação/ranking ordenada e calcula os pagamentos.
// Os palpites especiais (campeão + até onde o Brasil vai) somam 5 pontos
// cada quando confirmados pelos resultados reais.
// Gera a tabela de classificação/ranking ordenada e calcula os pagamentos.
// Os palpites especiais (campeão + até onde o Brasil vai) somam 5 pontos
// cada quando confirmados pelos resultados reais.
export function calculateStandings(
  participants: Participant[],
  matches: Match[],
  bets: Bet[],
  specials: SpecialPrediction[] = [],
  steals: ThiefSteal[] = [],
  challenges: Challenge[] = []
): ParticipantStanding[] {
  const champion = computeChampion(matches);
  const brazilStage = computeBrazilStage(matches);
  // Encontra todas as datas únicas de jogos que já foram finalizados (finished)
  const finishedDates = Array.from(new Set(
    matches.filter(m => m.status === 'finished').map((m) => m.date)
  ));
  const totalDays = Math.max(1, finishedDates.length);
  const pricePerDay = 2.50;
  const totalPaidPerParticipant = totalDays * pricePerDay;

  // Índice O(1) das apostas por (participante + jogo). Montado uma única vez,
  // evita o filter()+find() por participante×jogo (custo O(n²)) no loop abaixo.
  const betIndex = new Map<string, Bet>();
  bets.forEach((b) => betIndex.set(`${b.participantId}|${b.matchId}`, b));

  const standings: ParticipantStanding[] = participants.map((p) => {
    let points = 0;
    let scorerPoints = 0;
    let exactScoreCount = 0;
    let correctDrawCount = 0;
    let correctWinnerCount = 0;
    let wrongCount = 0;
    let totalBets = 0;

    matches.forEach((match) => {
      // Encontra a aposta deste participante para este jogo
      const bet = betIndex.get(`${p.id}|${match.id}`);

      if ((match.status === 'finished' || match.isLive) && match.homeScore !== null && match.awayScore !== null) {
        totalBets++;
        const analysis = analyzeBet(bet, match);

        points += analysis.points;
        // Bônus do artilheiro: +1 por gol do jogador escolhido (jogos do Brasil).
        // Não altera o "type" do palpite (profeta/on fire seguem só pelo placar).
        // Contabilizado à parte (scorerPoints) para poder auditar/exibir separado.
        const bonus = scorerBonus(bet, match);
        points += bonus;
        scorerPoints += bonus;
        // Bônus dos pênaltis (mata-mata): +1 acertar que foi à disputa, +2 a
        // mais pelo vencedor. Soma no total; não muda o "type" do placar.
        points += pensBonus(bet, match);

        // Profeta (desempate): em jogo de pênaltis exige cravar também a forma e
        // quem passa; no tempo normal basta o placar exato (ver isProfeta).
        if (isProfeta(bet, match)) exactScoreCount++;
        else if (analysis.type === 'draw') correctDrawCount++;
        else if (analysis.type === 'winner') correctWinnerCount++;
        else if (analysis.type === 'wrong') wrongCount++;
      }
    });

    // Bônus dos palpites especiais (5 pts cada, quando o resultado é conhecido)
    const special = specials.find((s) => s.participantId === p.id);
    if (special) {
      if (champion && special.championTeam === champion) points += SPECIAL_POINTS;
      if (brazilStage && special.brazilStage === brazilStage) points += SPECIAL_POINTS;
    }

    return {
      participantId: p.id,
      name: p.name,
      avatarUrl: p.avatarUrl,
      points,
      scorerPoints,
      exactScoreCount,
      correctDrawCount,
      correctWinnerCount,
      wrongCount,
      totalBets,
      totalPaid: totalPaidPerParticipant,
    };
  });

  const fireCounts = calculateFireCounts(matches, bets, participants);
  const peFrioCounts = calculatePeFrioCounts(matches, bets, participants);

  // Aplicar roubos da habilidade Ladrão (Thief)
  steals.forEach((steal) => {
    const thiefStanding = standings.find((s) => s.participantId === steal.thiefId);
    const victimStanding = standings.find((s) => s.participantId === steal.victimId);
    if (thiefStanding) thiefStanding.points += 1;
    if (victimStanding) victimStanding.points -= 1;
  });

  // Desafio dos Molhados: ao terminar o jogo, quem cravou o classificado que
  // AVANÇOU rouba 1 ponto do outro (transferência de 1, igual ao Ladrão).
  const matchById = new Map(matches.map((m) => [m.id, m]));
  challenges.forEach((ch) => {
    if (ch.status !== 'accepted') return; // pendente/recusado não vale ponto
    const match = matchById.get(ch.matchId);
    if (!match || match.status !== 'finished') return;
    const adv = matchAdvancer(match);
    if (!adv) return; // sem vencedor definido ainda
    const winnerId = ch.challengerPick === adv ? ch.challengerId : ch.challengedId;
    const loserId = winnerId === ch.challengerId ? ch.challengedId : ch.challengerId;
    const winner = standings.find((s) => s.participantId === winnerId);
    const loser = standings.find((s) => s.participantId === loserId);
    if (winner) winner.points += 1;
    if (loser) loser.points -= 1;
  });

  // Ordena por:
  // 1. Pontos (decrescente)
  // 2. Mais ON FIRE (fires) (decrescente)
  // 3. Mais Profeta (exactScoreCount) (decrescente)
  // 4. Menos Pé Frio (peFrioCounts) (crescente)
  return standings.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;

    const firesA = fireCounts[a.participantId]?.fires || 0;
    const firesB = fireCounts[b.participantId]?.fires || 0;
    if (firesB !== firesA) return firesB - firesA;

    if (b.exactScoreCount !== a.exactScoreCount) return b.exactScoreCount - a.exactScoreCount;

    const peFrioA = peFrioCounts[a.participantId] || 0;
    const peFrioB = peFrioCounts[b.participantId] || 0;
    if (peFrioA !== peFrioB) return peFrioA - peFrioB; // Menos Pé Frio prevalece (ordem crescente)

    return 0;
  });
}

export interface ThiefStatus {
  roundDate: string; // YYYY-MM-DD
  thiefId: string | null; // ID do Ladrão da rodada se houver (e não for anulado ou líder)
  status: 'active' | 'annulled' | 'leader_ineligible' | 'none';
  pointsScored: number;
}

// Calcula quem tem o direito de ser o "Ladrão" em cada rodada diária completada (isoDate)
export function calculateThiefRounds(
  matches: Match[],
  bets: Bet[],
  participants: Participant[]
): Record<string, ThiefStatus> {
  const result: Record<string, ThiefStatus> = {};
  if (!matches || !bets || participants.length === 0) return result;

  // Encontra todas as datas únicas de jogos
  const allDates = Array.from(new Set(matches.map((m) => m.isoDate))).sort();

  // Filtra as datas onde todos os jogos estão finalizados (FINISHED)
  const completedDates = allDates.filter((iso) => {
    const dayMatches = matches.filter((m) => m.isoDate === iso);
    return dayMatches.length > 0 && dayMatches.every(
      (m) => m.status === 'finished' && m.homeScore !== null && m.awayScore !== null
    );
  });

  const betIndex = new Map<string, Bet>();
  bets.forEach((b) => betIndex.set(`${b.participantId}|${b.matchId}`, b));

  completedDates.forEach((iso) => {
    const dayMatches = matches.filter((m) => m.isoDate === iso);
    const dayScores = participants.map((p) => {
      let pts = 0;
      dayMatches.forEach((m) => {
        const bet = betIndex.get(`${p.id}|${m.id}`);
        const a = analyzeBet(bet, m);
        pts += a.points + scorerBonus(bet, m) + pensBonus(bet, m);
      });
      return { id: p.id, pts };
    });

    // Filtra participantes que fizeram 5 ou mais pontos (>= 5)
    const eligibleThiefs = dayScores.filter((x) => x.pts >= 5);

    if (eligibleThiefs.length === 0) {
      result[iso] = { roundDate: iso, thiefId: null, status: 'none', pointsScored: 0 };
      return;
    }

    // Se duas ou mais pessoas fizerem 5 ou mais pontos, a habilidade é anulada
    if (eligibleThiefs.length > 1) {
      const maxPts = Math.max(...eligibleThiefs.map((x) => x.pts));
      result[iso] = { roundDate: iso, thiefId: null, status: 'annulled', pointsScored: maxPts };
      return;
    }

    // Apenas um participante fez 5 ou mais pontos
    const potentialThief = eligibleThiefs[0];

    // O líder do campeonato não pode ser o Ladrão.
    // Calculamos a classificação até essa data (inclusive o dia) para ver quem era o líder
    const matchesUpToDate = matches.filter((m) => Date.parse(m.kickoff) <= Date.parse(dayMatches[dayMatches.length - 1].kickoff));
    const standingsUpToDate = calculateStandings(participants, matchesUpToDate, bets, [], []);
    const leaderId = standingsUpToDate[0]?.participantId;

    if (potentialThief.id === leaderId) {
      result[iso] = { roundDate: iso, thiefId: null, status: 'leader_ineligible', pointsScored: potentialThief.pts };
    } else {
      result[iso] = { roundDate: iso, thiefId: potentialThief.id, status: 'active', pointsScored: potentialThief.pts };
    }
  });

  return result;
}


// Calcula os fogos (ONFIRE) permanentes e a sequência atual de pontuação.
// Duas regras concedem +1 fogo permanente:
//   1. Pontuar (pontos > 0) em 5 jogos seguidos.
//   2. Acertar o placar EXATO em 3 jogos seguidos.
// IMPORTANTE: ao ganhar um fogo por qualquer regra, AMBAS as sequências zeram
// (reset compartilhado). Assim os mesmos jogos nunca contam para dois fogos —
// ex.: 3 exatos (1 fogo) + 2 jogos pontuando NÃO viram um segundo fogo, pois a
// contagem dos 5 recomeça do zero após o fogo dos exatos. Errar o critério zera
// a sequência rumo ao próximo fogo; os fogos já conquistados nunca somem.
// `currentStreak` reflete a sequência de pontuação (regra 1), usada na UI.
export function calculateFireCounts(
  matches: Match[],
  bets: Bet[],
  participants: Participant[]
): Record<string, { fires: number; currentStreak: number }> {
  const result: Record<string, { fires: number; currentStreak: number }> = {};
  if (!matches || !bets) return result;

  const finishedMatches = [...matches]
    .filter((m) => (m.status === 'finished' || m.isLive) && m.homeScore !== null && m.awayScore !== null)
    .sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff));

  const betIndex = new Map<string, Bet>();
  bets.forEach((b) => betIndex.set(`${b.participantId}|${b.matchId}`, b));

  participants.forEach((p) => {
    let fires = 0;
    let pointStreak = 0; // regra 1: jogos seguidos pontuando
    let exactStreak = 0; // regra 2: placares exatos seguidos
    finishedMatches.forEach((match) => {
      const bet = betIndex.get(`${p.id}|${match.id}`);
      if (!bet) return; // só conta jogos em que apostou
      const analysis = analyzeBet(bet, match);

      // Atualiza as duas sequências
      pointStreak = analysis.points > 0 ? pointStreak + 1 : 0; // regra 1: jogos pontuando
      exactStreak = analysis.type === 'exact' ? exactStreak + 1 : 0; // regra 2: placares exatos

      // Concede no máximo 1 fogo por jogo e zera AMBAS as sequências (reset compartilhado)
      if (pointStreak >= 5 || exactStreak >= 3) {
        fires++;
        pointStreak = 0;
        exactStreak = 0;
      }
    });
    result[p.id] = { fires, currentStreak: pointStreak };
  });

  return result;
}

// Calcula o número de vezes que cada participante foi o "Pé Frio" da rodada (único a zerar o jogo)
export function calculatePeFrioCounts(
  matches: Match[],
  bets: Bet[],
  participants: Participant[]
): Record<string, number> {
  const counts: Record<string, number> = {};
  participants.forEach((p) => { counts[p.id] = 0; });

  const finishedMatches = matches.filter(
    (m) => (m.status === 'finished' || m.isLive) && m.homeScore !== null && m.awayScore !== null
  );

  const betIndex = new Map<string, Bet>();
  bets.forEach((b) => betIndex.set(`${b.participantId}|${b.matchId}`, b));

  finishedMatches.forEach((match) => {
    const bettorTypes = participants
      .map((p) => {
        const bet = betIndex.get(`${p.id}|${match.id}`);
        if (!bet) return null;
        return { id: p.id, type: analyzeBet(bet, match).type };
      })
      .filter((x): x is { id: string; type: BetResultType } => x !== null);

    const wrongBettors = bettorTypes.filter((x) => x.type === 'wrong');
    if (bettorTypes.length >= 2 && wrongBettors.length === 1) {
      const peFrioId = wrongBettors[0].id;
      if (counts[peFrioId] !== undefined) {
        counts[peFrioId]++;
      }
    }
  });

  return counts;
}

// Calcula o número de títulos de MVP da Rodada para cada participante
export function calculateMvpCounts(
  matches: Match[],
  bets: Bet[],
  participants: Participant[]
): Record<string, number> {
  const counts: Record<string, number> = {};
  participants.forEach((p) => { counts[p.id] = 0; });

  if (!matches || !bets || participants.length === 0) return counts;

  // Datas com jogos
  const allDates = Array.from(new Set(matches.map((m) => m.isoDate)));

  // Filtrar apenas datas completadas
  const completedDates = allDates.filter((iso) => {
    const dayMatches = matches.filter((m) => m.isoDate === iso);
    return dayMatches.length > 0 && dayMatches.every(
      (m) => m.status === 'finished' && m.homeScore !== null && m.awayScore !== null
    );
  });

  const betIndex = new Map<string, Bet>();
  bets.forEach((b) => betIndex.set(`${b.participantId}|${b.matchId}`, b));

  completedDates.forEach((iso) => {
    const dayMatches = matches.filter((m) => m.isoDate === iso);
    const scored = participants
      .map((p) => {
        let pts = 0;
        let exacts = 0;
        dayMatches.forEach((m) => {
          const bet = betIndex.get(`${p.id}|${m.id}`);
          const a = analyzeBet(bet, m);
          // Total da rodada = placar + bônus de artilheiro + bônus de classificação
          // (pênaltis/prorrogação), igual ao ranking geral e ao Ladrão.
          pts += a.points + scorerBonus(bet, m) + pensBonus(bet, m);
          if (isProfeta(bet, m)) exacts++;
        });
        return { id: p.id, pts, exacts };
      })
      .filter((x) => x.pts > 0)
      .sort((a, b) => b.pts - a.pts || b.exacts - a.exacts);

    if (scored.length > 0) {
      const maxPts = scored[0].pts;
      const maxExacts = scored[0].exacts;
      // Todos que empataram na primeira posição ganham MVP
      scored.forEach((x) => {
        if (x.pts === maxPts && x.exacts === maxExacts) {
          counts[x.id]++;
        }
      });
    }
  });

  return counts;
}

export interface Conquest {
  type: 'profeta' | 'pe_frio' | 'on_fire' | 'mvp';
  date: string;
  title: string;
  description: string;
  timestamp: number;
  match?: Match;
  bet?: Bet;
  points?: number;
  exacts?: number;
}

// Compila a linha do tempo cronológica de conquistas de um participante
export function calculateConquestTimeline(
  userId: string,
  matches: Match[],
  bets: Bet[],
  participants: Participant[]
): Conquest[] {
  const conquestTimeline: Conquest[] = [];
  if (!matches || !bets) return conquestTimeline;

  // 1. Profetas e Pé Frios
  const finishedMatches = [...matches]
    .filter((m) => (m.status === 'finished' || m.isLive) && m.homeScore !== null && m.awayScore !== null)
    .sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff));

  const betIndex = new Map<string, Bet>();
  bets.forEach((b) => betIndex.set(`${b.participantId}|${b.matchId}`, b));

  // Para ON FIRE, precisamos rodar as sequências do jogador
  let pointStreak = 0; // regra 1: jogos seguidos pontuando
  let exactStreak = 0; // regra 2: placares exatos seguidos

  finishedMatches.forEach((match) => {
    // aposta deste jogador
    const bet = betIndex.get(`${userId}|${match.id}`);
    const analysis = analyzeBet(bet, match);
    const dateLabel = match.date; // Ex: "12/06"

    // Se acertou exato: Profeta (em jogo de pênaltis, exige forma + quem passa)
    if (isProfeta(bet, match)) {
      conquestTimeline.push({
        type: 'profeta',
        date: dateLabel,
        title: '🔮 Profeta',
        description: `Acertou o placar exato de ${match.homeTeam} ${match.homeScore} x ${match.awayScore} ${match.awayTeam}`,
        timestamp: Date.parse(match.kickoff) + 1, // pequeno offset para ordenação secundária
        match,
        bet,
      });
    }

    // Se foi Pé Frio
    // Todos os apostadores do jogo
    const bettorTypes = participants
      .map((p) => {
        const b = betIndex.get(`${p.id}|${match.id}`);
        if (!b) return null;
        return { id: p.id, type: analyzeBet(b, match).type };
      })
      .filter((x): x is { id: string; type: BetResultType } => x !== null);

    const wrongBettors = bettorTypes.filter((x) => x.type === 'wrong');
    if (bettorTypes.length >= 2 && wrongBettors.length === 1 && wrongBettors[0].id === userId) {
      conquestTimeline.push({
        type: 'pe_frio',
        date: dateLabel,
        title: '💀 Pé Frio',
        description: `Único a zerar a pontuação no jogo ${match.homeTeam} ${match.homeScore} x ${match.awayScore} ${match.awayTeam}`,
        timestamp: Date.parse(match.kickoff) + 2,
        match,
        bet,
      });
    }

    // ON FIRE — duas regras com reset compartilhado (ver calculateFireCounts):
    //   1. pontuar em 5 jogos seguidos; 2. acertar o placar exato em 3 seguidos.
    // Ganhar um fogo zera AMBAS as sequências, então os mesmos jogos não contam duas vezes.
    if (bet) {
      pointStreak = analysis.points > 0 ? pointStreak + 1 : 0;
      exactStreak = analysis.type === 'exact' ? exactStreak + 1 : 0;

      if (pointStreak >= 5 || exactStreak >= 3) {
        const byExact = exactStreak >= 3;
        conquestTimeline.push({
          type: 'on_fire',
          date: dateLabel,
          title: '🔥 ON FIRE!',
          description: byExact
            ? `Acertou o placar exato em 3 jogos seguidos, até o jogo ${match.homeTeam} ${match.homeScore} x ${match.awayScore} ${match.awayTeam}`
            : `Pontuou em 5 jogos seguidos, até o jogo ${match.homeTeam} ${match.homeScore} x ${match.awayScore} ${match.awayTeam}`,
          timestamp: Date.parse(match.kickoff) + 3,
        });
        pointStreak = 0;
        exactStreak = 0;
      }
    }
  });

  // 2. MVPs da Rodada
  const allDates = Array.from(new Set(matches.map((m) => m.isoDate)));
  const completedDates = allDates.filter((iso) => {
    const dayMatches = matches.filter((m) => m.isoDate === iso);
    return dayMatches.length > 0 && dayMatches.every(
      (m) => m.status === 'finished' && m.homeScore !== null && m.awayScore !== null
    );
  });

  completedDates.forEach((iso) => {
    const dayMatches = matches.filter((m) => m.isoDate === iso);
    const scored = participants
      .map((p) => {
        let pts = 0;
        let exacts = 0;
        dayMatches.forEach((m) => {
          const bet = betIndex.get(`${p.id}|${m.id}`);
          const a = analyzeBet(bet, m);
          pts += a.points + scorerBonus(bet, m) + pensBonus(bet, m);
          if (isProfeta(bet, m)) exacts++;
        });
        return { id: p.id, pts, exacts };
      })
      .filter((x) => x.pts > 0)
      .sort((a, b) => b.pts - a.pts || b.exacts - a.exacts);

    if (scored.length > 0) {
      const maxPts = scored[0].pts;
      const maxExacts = scored[0].exacts;
      const winners = scored.filter((x) => x.pts === maxPts && x.exacts === maxExacts);
      const isMvp = winners.some((w) => w.id === userId);

      if (isMvp) {
        const dateLabel = dayMatches[0]?.date ?? '';
        // Kickoff mais recente do dia para ordenar
        const maxKickoff = Math.max(...dayMatches.map((m) => Date.parse(m.kickoff)));
        const exactsText = maxExacts === 1 ? '1 placar exato' : maxExacts > 1 ? `${maxExacts} placares exatos` : 'nenhum placar exato';
        conquestTimeline.push({
          type: 'mvp',
          date: dateLabel,
          title: '🏆 MVP da Rodada',
          description: `Melhor pontuador da rodada: fez ${maxPts} pontos e cravou ${exactsText}.`,
          timestamp: maxKickoff + 4,
          points: maxPts,
          exacts: maxExacts,
        });
      }
    }
  });

  // Ordena por timestamp decrescente (mais recente primeiro)
  return conquestTimeline.sort((a, b) => b.timestamp - a.timestamp);
}

