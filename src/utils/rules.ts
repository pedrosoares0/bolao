import type { Match, Bet, Participant, ParticipantStanding } from '../types';

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

  // 1. Placar Exato (3 pontos)
  if (bHome === mHome && bAway === mAway) {
    return { points: 3, type: 'exact' };
  }

  // 2. Acertou Empate, mas errou o placar exato (2 pontos)
  if (mHome === mAway && bHome === bAway) {
    return { points: 2, type: 'draw' };
  }

  // 3. Acertou o Vencedor, mas errou o placar exato (1 ponto)
  const realDiff = mHome - mAway;
  const betDiff = bHome - bAway;
  if (Math.sign(realDiff) === Math.sign(betDiff)) {
    return { points: 1, type: 'winner' };
  }

  // 4. Errou tudo (0 pontos)
  return { points: 0, type: 'wrong' };
}

// Gera a tabela de classificação/ranking ordenada e calcula os pagamentos
export function calculateStandings(
  participants: Participant[],
  matches: Match[],
  bets: Bet[]
): ParticipantStanding[] {
  // Encontra todas as datas únicas de jogos que já foram finalizados (finished)
  const finishedDates = Array.from(new Set(
    matches.filter(m => m.status === 'finished').map((m) => m.date)
  ));
  const totalDays = Math.max(1, finishedDates.length);
  const pricePerDay = 2.50;
  const totalPaidPerParticipant = totalDays * pricePerDay;

  const standings: ParticipantStanding[] = participants.map((p) => {
    let points = 0;
    let exactScoreCount = 0;
    let correctDrawCount = 0;
    let correctWinnerCount = 0;
    let wrongCount = 0;
    let totalBets = 0;

    // Filtra palpites deste participante
    const participantBets = bets.filter((b) => b.participantId === p.id);

    matches.forEach((match) => {
      // Encontra a aposta para este jogo
      const bet = participantBets.find((b) => b.matchId === match.id);
      
      if (match.status === 'finished' && match.homeScore !== null && match.awayScore !== null) {
        totalBets++;
        const analysis = analyzeBet(bet, match);
        
        points += analysis.points;
        
        if (analysis.type === 'exact') exactScoreCount++;
        else if (analysis.type === 'draw') correctDrawCount++;
        else if (analysis.type === 'winner') correctWinnerCount++;
        else if (analysis.type === 'wrong') wrongCount++;
      }
    });

    return {
      participantId: p.id,
      name: p.name,
      avatarUrl: p.avatarUrl,
      points,
      exactScoreCount,
      correctDrawCount,
      correctWinnerCount,
      wrongCount,
      totalBets,
      totalPaid: totalPaidPerParticipant,
    };
  });

  // Ordena por:
  // 1. Pontos (decrescente)
  // 2. Número de placares exatos (decrescente)
  // 3. Número de empates corretos (decrescente)
  // 4. Número de vencedores corretos (decrescente)
  // 5. Nome (alfabética)
  return standings.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.exactScoreCount !== a.exactScoreCount) return b.exactScoreCount - a.exactScoreCount;
    if (b.correctDrawCount !== a.correctDrawCount) return b.correctDrawCount - a.correctDrawCount;
    if (b.correctWinnerCount !== a.correctWinnerCount) return b.correctWinnerCount - a.correctWinnerCount;
    return a.name.localeCompare(b.name);
  });
}
