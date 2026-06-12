import { useState, useEffect, useMemo } from 'react';
import { Trophy, Calendar, CheckSquare, PencilLine } from 'lucide-react';
import type { Match, Bet, Participant, ParticipantStanding } from './types';
import { initialParticipants } from './data/initialData';
import { calculateStandings, analyzeBet } from './utils/rules';
import { StandingsTable } from './components/StandingsTable';

// Função para verificar se o jogo está no futuro (antes do horário de início)
const isGameInFuture = (localDateStr: string): boolean => {
  if (!localDateStr) return false;
  const parts = localDateStr.split(' ');
  if (parts.length < 2) return false;
  const dateParts = parts[0].split('/'); // [MM, DD, YYYY]
  const timeParts = parts[1].split(':'); // [HH, mm]
  if (dateParts.length < 3 || timeParts.length < 2) return false;
  
  const month = parseInt(dateParts[0], 10) - 1;
  const day = parseInt(dateParts[1], 10);
  const year = parseInt(dateParts[2], 10);
  const hour = parseInt(timeParts[0], 10);
  const minute = parseInt(timeParts[1], 10);
  
  const gameTime = new Date(year, month, day, hour, minute);
  const currentTime = new Date();
  
  // Pode apostar até 1 minuto antes (se gameTime for 16:00, currentTime deve ser < 16:00)
  return currentTime.getTime() < gameTime.getTime();
};

// Obter a data de hoje no formato DD/MM
const getTodayDateStr = (): string => {
  const d = new Date();
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}`;
};

// Dicionário de tradução dos nomes dos países de Inglês para Português
const teamNamesMap: { [key: string]: string } = {
  "Algeria": "Argélia",
  "Argentina": "Argentina",
  "Australia": "Austrália",
  "Austria": "Áustria",
  "Belgium": "Bélgica",
  "Bosnia and Herzegovina": "Bósnia",
  "Brazil": "Brasil",
  "Canada": "Canadá",
  "Cape Verde": "Cabo Verde",
  "Colombia": "Colômbia",
  "Croatia": "Croácia",
  "Curaçao": "Curaçao",
  "Czech Republic": "República Tcheca",
  "Democratic Republic of the Congo": "RD Congo",
  "Ecuador": "Equador",
  "Egypt": "Egito",
  "England": "Inglaterra",
  "France": "França",
  "Germany": "Alemanha",
  "Ghana": "Gana",
  "Haiti": "Haiti",
  "Iran": "Irã",
  "Iraq": "Iraque",
  "Ivory Coast": "Costa do Marfim",
  "Japan": "Japão",
  "Jordan": "Jordânia",
  "Mexico": "México",
  "Morocco": "Marrocos",
  "Netherlands": "Holanda",
  "New Zealand": "Nova Zelândia",
  "Norway": "Noruega",
  "Panama": "Panamá",
  "Paraguay": "Paraguai",
  "Portugal": "Portugal",
  "Qatar": "Catar",
  "Saudi Arabia": "Arábia Saudita",
  "Scotland": "Escócia",
  "Senegal": "Senegal",
  "South Africa": "África do Sul",
  "South Korea": "Coreia do Sul",
  "Spain": "Espanha",
  "Sweden": "Suécia",
  "Switzerland": "Suíça",
  "Tunisia": "Tunísia",
  "Turkey": "Turquia",
  "United States": "EUA",
  "Uruguay": "Uruguai",
  "Uzbekistan": "Uzbequistão"
};

const translateTeam = (name: string) => {
  return teamNamesMap[name] || name;
};

// Função para mapear o código de time para o padrão do protótipo (ex: RSA -> AFRI, CZE -> TCH)
const mapFifaCode = (teamNameEn: string, originalCode: string): string => {
  const codeMap: { [key: string]: string } = {
    "South Africa": "AFRI",
    "Czech Republic": "TCH",
    "United States": "EUA",
    "Germany": "ALE",
    "Saudi Arabia": "ARA",
    "England": "ING",
    "Curaçao": "CUR",
    "Cape Verde": "CAB",
    "Netherlands": "HOL",
    "Jordan": "JOR",
    "Uzbekistan": "UZB",
    "Tunisia": "TUN",
    "Morocco": "MAR",
    "Senegal": "SEN",
    "Algeria": "ALG",
    "Egypt": "EGI",
    "Ghana": "GAN",
    "Norway": "NOR",
    "Sweden": "SUE",
    "Switzerland": "SUI",
    "Croatia": "CRO",
    "Belgium": "BEL",
    "Austria": "AUT",
    "Bosnia and Herzegovina": "BOS",
    "Iraq": "IRA",
    "Iran": "IRÃ",
    "Japan": "JAP",
    "South Korea": "KOR",
    "Australia": "AUS",
    "New Zealand": "NZL",
    "Haiti": "HAI",
    "Panama": "PAN",
    "Ecuador": "EQU",
    "Uruguay": "URU",
    "Colombia": "COL"
  };
  return codeMap[teamNameEn] || originalCode || (teamNameEn || '').slice(0, 3).toUpperCase();
};

// Gerador determinístico de palpites para popular os pontos do ranking de forma realista
const generateDeterministicBet = (matchId: string, participantId: string): { homeScore: number, awayScore: number } => {
  const seed = `${matchId}-${participantId}`;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  const homeScore = Math.abs(hash) % 4;
  const awayScore = Math.abs(hash >> 3) % 4;
  return { homeScore, awayScore };
};

function App() {
  // 1. Estados de Autenticação e Telas
  const [currentUser, setCurrentUser] = useState<Participant | null>(() => {
    const saved = localStorage.getItem('bolao_current_user');
    return saved ? JSON.parse(saved) : null;
  });
  
  const [currentScreen, setCurrentScreen] = useState<'login' | 'splash' | 'app'>(() => {
    const saved = localStorage.getItem('bolao_current_user');
    return saved ? 'app' : 'login';
  });

  const [usernameInput, setUsernameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');

  // 2. Estados Principais do Bolão
  const [participants, setParticipants] = useState<Participant[]>(() => {
    const saved = localStorage.getItem('bolao_participants');
    return saved ? JSON.parse(saved) : initialParticipants;
  });

  const [matches, setMatches] = useState<Match[]>([]);
  const [bets, setBets] = useState<Bet[]>(() => {
    const saved = localStorage.getItem('bolao_bets');
    return saved ? JSON.parse(saved) : [];
  });

  // Estado para os rascunhos de palpites editados inline
  const [draftBets, setDraftBets] = useState<{ [matchId: string]: { homeScore: string, awayScore: string } }>({});
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Estado da Navegação Principal (Abas da bottom bar)
  const [activeTab, setActiveTab] = useState<'jogos' | 'ranking'>('jogos');
  
  // Estado da data de partidas selecionada
  const [selectedDate, setSelectedDate] = useState<string>('');

  // 3. Salvar participantes ao alterar
  useEffect(() => {
    localStorage.setItem('bolao_participants', JSON.stringify(participants));
  }, [participants]);

  // 4. Carregamento de dados da API Real
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [gamesRes, teamsRes] = await Promise.all([
          fetch('https://worldcup26.ir/get/games'),
          fetch('https://worldcup26.ir/get/teams')
        ]);
        
        if (!gamesRes.ok || !teamsRes.ok) {
          throw new Error('Erro ao carregar dados da API real.');
        }
        
        const gamesData = await gamesRes.json();
        const teamsData = await teamsRes.json();
        
        const teamsList = teamsData.teams || [];
        const gamesList = gamesData.games || [];
        
        const teamMap: { [key: string]: any } = {};
        teamsList.forEach((t: any) => {
          teamMap[t.id] = t;
        });
        
        const parsedMatches: Match[] = gamesList.map((g: any) => {
          const homeTeamObj = teamMap[g.home_team_id];
          const awayTeamObj = teamMap[g.away_team_id];
          
          const homeName = g.home_team_name_en || (homeTeamObj ? homeTeamObj.name_en : '');
          const awayName = g.away_team_name_en || (awayTeamObj ? awayTeamObj.name_en : '');
          
          let formattedDate = '11/06';
          let formattedTime = '13:00';
          if (g.local_date) {
            const parts = g.local_date.split(' ');
            if (parts.length >= 2) {
              formattedTime = parts[1];
              const dateParts = parts[0].split('/');
              if (dateParts.length >= 2) {
                formattedDate = `${dateParts[1]}/${dateParts[0]}`; // MM/DD/YYYY -> DD/MM
              }
            }
          }
          
          return {
            id: String(g.id),
            homeTeam: translateTeam(homeName),
            awayTeam: translateTeam(awayName),
            homeCode: mapFifaCode(homeName, homeTeamObj ? homeTeamObj.fifa_code : ''),
            awayCode: mapFifaCode(awayName, awayTeamObj ? awayTeamObj.fifa_code : ''),
            homeFlag: homeTeamObj ? homeTeamObj.iso2.toLowerCase() : 'un',
            awayFlag: awayTeamObj ? awayTeamObj.iso2.toLowerCase() : 'un',
            date: formattedDate,
            time: formattedTime,
            group: g.group ? `Grupo ${g.group}` : 'Grupo A',
            homeScore: g.finished === 'TRUE' ? parseInt(g.home_score) : null,
            awayScore: g.finished === 'TRUE' ? parseInt(g.away_score) : null,
            status: g.finished === 'TRUE' ? 'finished' : 'scheduled',
            local_date: g.local_date // Manter original para checagem de horário
          };
        });
        
        // Ordenar partidas por data e hora
        parsedMatches.sort((a, b) => {
          const [dayA, monthA] = a.date.split('/').map(Number);
          const [dayB, monthB] = b.date.split('/').map(Number);
          if (monthA !== monthB) return monthA - monthB;
          if (dayA !== dayB) return dayA - dayB;
          return a.time.localeCompare(b.time);
        });

        setMatches(parsedMatches);
      } catch (err: any) {
        console.error(err);
        setError(err.message || 'Erro desconhecido');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // 5. Configurar data inicial baseada em Hoje (se houver partidas) ou na primeira data disponível
  const dates = useMemo(() => {
    const allDates = matches.map((m) => m.date);
    return Array.from(new Set(allDates));
  }, [matches]);

  useEffect(() => {
    if (dates.length > 0 && !selectedDate) {
      const todayStr = getTodayDateStr(); // Ex: "12/06"
      if (dates.includes(todayStr)) {
        setSelectedDate(todayStr);
      } else {
        setSelectedDate(dates[0]);
      }
    }
  }, [dates, selectedDate]);

  // 6. Preencher palpites rascunho (draft) e palpites simulados determinísticos para mock users
  useEffect(() => {
    if (matches.length === 0 || !currentUser) return;

    // Buscar palpites do localStorage
    const savedBets = localStorage.getItem('bolao_bets');
    let currentBetsList: Bet[] = savedBets ? JSON.parse(savedBets) : [];

    const allParticipantIds = ['pedro', 'alex', 'rodrigo', 'neto'];
    // Garantir que o participante atual também esteja na lista
    if (!allParticipantIds.includes(currentUser.id)) {
      allParticipantIds.push(currentUser.id);
    }

    const updatedBets = [...currentBetsList];
    let changed = false;

    matches.forEach((match) => {
      allParticipantIds.forEach((pId) => {
        const hasBet = updatedBets.some((b) => b.matchId === match.id && b.participantId === pId);
        if (!hasBet) {
          const hasGameStarted = match.status === 'finished' || !isGameInFuture(match.local_date || '');
          const isMockUser = pId !== currentUser.id;

          // Se for mock user, ou se for o usuário logado e o jogo já tiver começado/passado:
          if (isMockUser || hasGameStarted) {
            const mockBet = generateDeterministicBet(match.id, pId);
            updatedBets.push({
              matchId: match.id,
              participantId: pId,
              homeScore: mockBet.homeScore,
              awayScore: mockBet.awayScore,
            });
            changed = true;
          }
        }
      });
    });

    if (changed || currentBetsList.length === 0) {
      setBets(updatedBets);
      localStorage.setItem('bolao_bets', JSON.stringify(updatedBets));
    }

    // Inicializar rascunho (draftBets) para as partidas editáveis do usuário logado
    const newDrafts: { [matchId: string]: { homeScore: string, awayScore: string } } = {};
    matches.forEach((match) => {
      const existingBet = updatedBets.find((b) => b.matchId === match.id && b.participantId === currentUser.id);
      newDrafts[match.id] = {
        homeScore: existingBet ? String(existingBet.homeScore) : '',
        awayScore: existingBet ? String(existingBet.awayScore) : '',
      };
    });
    setDraftBets(newDrafts);
  }, [matches, currentUser]);

  // Agrupar partidas por data para renderização eficiente
  const groupedMatches = useMemo(() => {
    const groups: { [key: string]: Match[] } = {};
    matches.forEach((m) => {
      if (!groups[m.date]) {
        groups[m.date] = [];
      }
      groups[m.date].push(m);
    });
    return groups;
  }, [matches]);

  // Partidas do dia selecionado
  const activeDateMatches = useMemo(() => {
    return groupedMatches[selectedDate] || [];
  }, [groupedMatches, selectedDate]);

  // Partidas jogáveis de hoje que ainda não começaram
  const playableMatches = useMemo(() => {
    const todayStr = getTodayDateStr();
    if (selectedDate !== todayStr) return [];
    return activeDateMatches.filter((m) => m.status === 'scheduled' && isGameInFuture(m.local_date || ''));
  }, [activeDateMatches, selectedDate]);

  // Verifica se todos os palpites das partidas jogáveis de hoje foram preenchidos
  const areAllPredictionsFilled = useMemo(() => {
    if (playableMatches.length === 0) return false;
    return playableMatches.every((m) => {
      const draft = draftBets[m.id];
      return draft && draft.homeScore.trim() !== '' && draft.awayScore.trim() !== '';
    });
  }, [playableMatches, draftBets]);

  // Verifica se a aposta já foi lançada para o dia selecionado
  const isSubmittedForSelectedDate = useMemo(() => {
    if (!currentUser || !selectedDate) return false;
    return localStorage.getItem(`submitted_${currentUser.id}_${selectedDate}`) === 'true';
  }, [currentUser, selectedDate, bets]);

  // Handler de Login
  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!usernameInput.trim()) {
      alert('Por favor, digite seu nome!');
      return;
    }

    const id = usernameInput.trim().toLowerCase();
    
    // Verifica se já existe o participante na lista, se não, adiciona
    let matchedParticipant = participants.find((p) => p.id === id);
    if (!matchedParticipant) {
      matchedParticipant = {
        id,
        name: usernameInput.trim(),
        avatarUrl: `/imagens/pedro.png` // Fallback padrão
      };
      setParticipants((prev) => [...prev, matchedParticipant!]);
    }

    // Grava usuário logado no estado e localStorage
    localStorage.setItem('bolao_current_user', JSON.stringify(matchedParticipant));
    setCurrentUser(matchedParticipant);

    // Iniciar fluxo da intro splash
    setCurrentScreen('splash');
    setTimeout(() => {
      setCurrentScreen('app');
    }, 3500); // 3.5 segundos de intro.gif
  };

  // Handler de Logout
  const handleLogout = () => {
    localStorage.removeItem('bolao_current_user');
    setCurrentUser(null);
    setCurrentScreen('login');
    setUsernameInput('');
    setPasswordInput('');
    setActiveTab('jogos');
  };

  // Handler de Lançamento de Apostas
  const handleLaunchBets = () => {
    if (!areAllPredictionsFilled) {
      alert('Por favor, preencha todos os palpites do dia antes de lançar!');
      return;
    }

    const updatedBets = [...bets];
    playableMatches.forEach((m) => {
      const draft = draftBets[m.id];
      if (draft) {
        const homeScore = parseInt(draft.homeScore, 10);
        const awayScore = parseInt(draft.awayScore, 10);
        
        const idx = updatedBets.findIndex((b) => b.matchId === m.id && b.participantId === currentUser?.id);
        if (idx !== -1) {
          updatedBets[idx] = { matchId: m.id, participantId: currentUser!.id, homeScore, awayScore };
        } else {
          updatedBets.push({ matchId: m.id, participantId: currentUser!.id, homeScore, awayScore });
        }
      }
    });

    setBets(updatedBets);
    localStorage.setItem('bolao_bets', JSON.stringify(updatedBets));
    localStorage.setItem(`submitted_${currentUser?.id}_${selectedDate}`, 'true');
    alert('Apostas salvas com sucesso!');
  };

  // Calcular ranking/classificação dos participantes
  const standings = useMemo<ParticipantStanding[]>(() => {
    return calculateStandings(participants, matches, bets);
  }, [participants, matches, bets]);

  // ----------------------------------------------------
  // RENDERIZAÇÃO DA TELA DE LOGIN
  // ----------------------------------------------------
  if (currentScreen === 'login') {
    return (
      <div className="login-screen-container">
        <div className="login-banner-container">
          <img src="/imagens/login.webp" alt="Bandidos Apostados" className="login-banner-img" />
          <div className="login-ribbon-divider"></div>
        </div>

        <form onSubmit={handleLoginSubmit} className="login-form-container">
          <div className="login-form-group">
            <label className="login-field-label">Nome</label>
            <input
              type="text"
              className="login-field-input"
              value={usernameInput}
              onChange={(e) => setUsernameInput(e.target.value)}
              placeholder="Digite seu nome"
            />
          </div>

          <div className="login-form-group">
            <label className="login-field-label">Senha</label>
            <input
              type="password"
              className="login-field-input"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              placeholder="Digite sua senha (provisória)"
            />
          </div>

          <button type="submit" className="login-action-btn">
            ENTRAR
          </button>
        </form>
      </div>
    );
  }

  // ----------------------------------------------------
  // RENDERIZAÇÃO DA TELA DE SPLASH (INTRO.GIF)
  // ----------------------------------------------------
  if (currentScreen === 'splash') {
    return (
      <div className="splash-screen" onClick={() => setCurrentScreen('app')}>
        <img
          src="/imagens/intro.gif"
          alt="Carregando..."
          className="splash-gif"
        />
      </div>
    );
  }

  // ----------------------------------------------------
  // RENDERIZAÇÃO DO APP PRINCIPAL
  // ----------------------------------------------------
  return (
    <div className="app-container">
      {/* HEADER BANNER CARD (Apenas na aba de partidas) */}
      {activeTab === 'jogos' && (
        <div className="app-header-card-wrapper">
          <div className="app-header-card-gradient-border">
            <img src="/imagens/login.webp" alt="Bandidos Apostados Banner" className="app-header-card-img" />
          </div>
        </div>
      )}

      {/* CONTEÚDO PRINCIPAL */}
      <main style={{ flexGrow: 1, paddingBottom: '2.5rem' }}>
        {/* ABA: PARTIDAS & APOSTAS */}
        {activeTab === 'jogos' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            
            {/* HORIZONTAL DATE SELECTOR BAR */}
            {dates.length > 0 && (
              <div className="date-selector-scroll-container">
                {dates.map((dStr) => {
                  const todayStr = getTodayDateStr();
                  const isTodayLabel = dStr === todayStr;
                  const labelText = isTodayLabel ? `Hoje ${dStr}` : dStr;
                  const isSelected = selectedDate === dStr;

                  return (
                    <button
                      key={dStr}
                      className={`date-pill-btn-p16 ${isSelected ? 'active' : ''}`}
                      onClick={() => setSelectedDate(dStr)}
                    >
                      {labelText}
                    </button>
                  );
                })}
              </div>
            )}

            {/* CARD CREME DAS PARTIDAS */}
            <div className="games-beige-card-container">
              {loading ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#15110E', fontWeight: 700 }}>
                  Carregando jogos da API...
                </div>
              ) : error ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#ef4444', fontWeight: 700 }}>
                  Erro ao carregar dados: {error}
                </div>
              ) : activeDateMatches.length > 0 ? (
                <div className="games-grid-layout">
                  {activeDateMatches.map((match) => {
                    // Determinar se o jogo já começou ou terminou
                    const hasGameStarted = match.status === 'finished' || !isGameInFuture(match.local_date || '');
                    
                    // Checar se a aposta pode ser editada (só se for hoje, jogo no futuro e aposta não lançada)
                    const todayStr = getTodayDateStr();
                    const isTodayTab = selectedDate === todayStr;
                    const canEditBet = isTodayTab && !hasGameStarted && !isSubmittedForSelectedDate;

                    return (
                      <div key={match.id} className="game-card-item-p16">
                        
                        {/* Cabeçalho do Jogo (Grupo e Horário) */}
                        <div className="game-card-header-p16">
                          {match.group} - {match.time}
                        </div>

                        {/* Corpo do Confronto */}
                        <div className="game-card-body-p16">
                          {/* Time 1 (Mandante) */}
                          <div className="team-row-p16">
                            <div className="team-flag-badge-p16">
                              <img
                                src={`https://flagcdn.com/w80/${match.homeFlag.toLowerCase()}.png`}
                                alt={match.homeTeam}
                                className="team-flag-img-p16"
                                onError={(e) => {
                                  e.currentTarget.src = 'https://flagcdn.com/w40/un.png';
                                }}
                              />
                            </div>
                            <div className="team-code-badge-p16">
                              {match.homeTeam}
                            </div>
                            
                            {/* Caixa de Score */}
                            {canEditBet ? (
                              <input
                                type="number"
                                min="0"
                                className="score-input-field-p16"
                                value={draftBets[match.id]?.homeScore || ''}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  if (val === '' || parseInt(val) >= 0) {
                                    setDraftBets((prev) => ({
                                      ...prev,
                                      [match.id]: { ...prev[match.id], homeScore: val }
                                    }));
                                  }
                                }}
                              />
                            ) : (
                              <div className="score-display-box-p16">
                                {hasGameStarted ? (match.homeScore !== null ? match.homeScore : '-') : (draftBets[match.id]?.homeScore || '-')}
                              </div>
                            )}
                          </div>

                          {/* Time 2 (Visitante) */}
                          <div className="team-row-p16">
                            <div className="team-flag-badge-p16">
                              <img
                                src={`https://flagcdn.com/w80/${match.awayFlag.toLowerCase()}.png`}
                                alt={match.awayTeam}
                                className="team-flag-img-p16"
                                onError={(e) => {
                                  e.currentTarget.src = 'https://flagcdn.com/w40/un.png';
                                }}
                              />
                            </div>
                            <div className="team-code-badge-p16">
                              {match.awayTeam}
                            </div>
                            
                            {/* Caixa de Score */}
                            {canEditBet ? (
                              <input
                                type="number"
                                min="0"
                                className="score-input-field-p16"
                                value={draftBets[match.id]?.awayScore || ''}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  if (val === '' || parseInt(val) >= 0) {
                                    setDraftBets((prev) => ({
                                      ...prev,
                                      [match.id]: { ...prev[match.id], awayScore: val }
                                    }));
                                  }
                                }}
                              />
                            ) : (
                              <div className="score-display-box-p16">
                                {hasGameStarted ? (match.awayScore !== null ? match.awayScore : '-') : (draftBets[match.id]?.awayScore || '-')}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* LISTA INLINE DE PALPITES DOS PARTICIPANTES (Só exibe se o jogo começou/terminou) */}
                        {hasGameStarted && (
                          <div className="inline-guesses-list-p16">
                            {participants.map((p) => {
                              const bet = bets.find((b) => b.matchId === match.id && b.participantId === p.id);
                              const analysis = analyzeBet(bet, match);
                              
                              // Lógica do Badge de Pontos
                              let pointsBadgeClass = 'wrong';
                              let pointsText = '0 pts';
                              if (analysis.type === 'exact') {
                                pointsBadgeClass = 'exact';
                                pointsText = '+3 pts (Placar)';
                              } else if (analysis.type === 'draw') {
                                pointsBadgeClass = 'draw';
                                pointsText = '+2 pts (Empate)';
                              } else if (analysis.type === 'winner') {
                                pointsBadgeClass = 'winner';
                                pointsText = '+1 pt (Vence)';
                              } else if (analysis.type === 'pending') {
                                pointsBadgeClass = 'pending';
                                pointsText = 'Pendente';
                              }

                              // Lógica da bandeira de quem o participante achou que ia vencer
                              let predictedWinnerFlag: string | null = null;
                              if (bet) {
                                if (bet.homeScore > bet.awayScore) {
                                  predictedWinnerFlag = match.homeFlag;
                                } else if (bet.awayScore > bet.homeScore) {
                                  predictedWinnerFlag = match.awayFlag;
                                }
                              }

                              return (
                                <div key={p.id} className="inline-guess-row-p16">
                                  <div className="inline-guess-user-info-p16">
                                    <div className="inline-guess-avatar-border-p16">
                                      <img
                                        src={`/imagens/ranking ${p.id}.png`}
                                        alt={p.name}
                                        className="inline-guess-avatar-img-p16"
                                        onError={(e) => {
                                          e.currentTarget.src = p.avatarUrl;
                                        }}
                                      />
                                    </div>
                                    <span className="inline-guess-username-p16">{p.name}</span>
                                  </div>

                                  <div className="inline-guess-result-info-p16">
                                    {bet ? (
                                      <div className="inline-guess-scores-container-p16">
                                        <span className="inline-guess-score-text-p16">
                                          {bet.homeScore} x {bet.awayScore}
                                        </span>
                                        {predictedWinnerFlag && (
                                          <img
                                            src={`https://flagcdn.com/w40/${predictedWinnerFlag.toLowerCase()}.png`}
                                            alt="Palpite Vencedor"
                                            className="inline-guess-winner-flag-p16"
                                          />
                                        )}
                                      </div>
                                    ) : (
                                      <span className="inline-guess-none-text-p16">Sem Palpite</span>
                                    )}

                                    <div className={`inline-guess-badge-p16 ${pointsBadgeClass}`}>
                                      {pointsText}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#15110E', fontWeight: 600 }}>
                  Nenhum jogo agendado para esta data.
                </div>
              )}

              {/* ACTION BAR DE LANÇAMENTO (Só exibe se estivermos na aba de Hoje e houver partidas jogáveis) */}
              {selectedDate === getTodayDateStr() && playableMatches.length > 0 && (
                <div className="launch-action-bar-p16">
                  <div className="launch-edit-icon-circle-p16">
                    {isSubmittedForSelectedDate ? <CheckSquare size={18} color="#ffffff" /> : <PencilLine size={18} color="#ffffff" />}
                  </div>
                  
                  {isSubmittedForSelectedDate ? (
                    <button className="launch-bet-btn-p16 submitted" disabled>
                      APOSTA LANÇADA
                    </button>
                  ) : (
                    <button
                      className={`launch-bet-btn-p16 ${areAllPredictionsFilled ? 'active' : ''}`}
                      disabled={!areAllPredictionsFilled}
                      onClick={handleLaunchBets}
                    >
                      LANÇAR APOSTA
                    </button>
                  )}
                </div>
              )}
            </div>
            
            {/* Opção para Logout (Sign Out) rápida no fim da aba de partidas para desenvolvimento */}
            <div style={{ padding: '0 1rem', display: 'flex', justifyContent: 'center' }}>
              <button 
                onClick={handleLogout}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'rgba(255,255,255,0.4)',
                  fontSize: '0.75rem',
                  textDecoration: 'underline',
                  cursor: 'pointer'
                }}
              >
                Sair da Conta ({currentUser?.name})
              </button>
            </div>
          </div>
        )}

        {/* ABA: RANKING */}
        {activeTab === 'ranking' && (
          <div>
            <StandingsTable standings={standings} />
            
            {/* Logout em baixo do Ranking */}
            <div style={{ padding: '2rem 1rem 0 1rem', display: 'flex', justifyContent: 'center' }}>
              <button 
                onClick={handleLogout}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'rgba(255,255,255,0.4)',
                  fontSize: '0.75rem',
                  textDecoration: 'underline',
                  cursor: 'pointer'
                }}
              >
                Sair da Conta ({currentUser?.name})
              </button>
            </div>
          </div>
        )}
      </main>

      {/* BARRA DE NAVEGAÇÃO INFERIOR */}
      <nav className="bottom-nav">
        <button
          className={`nav-item ${activeTab === 'jogos' ? 'active' : ''}`}
          onClick={() => setActiveTab('jogos')}
        >
          <Calendar size={20} />
          <span>Partidas</span>
        </button>
        <button
          className={`nav-item ${activeTab === 'ranking' ? 'active' : ''}`}
          onClick={() => setActiveTab('ranking')}
        >
          <Trophy size={20} />
          <span>Ranking</span>
        </button>
      </nav>
    </div>
  );
}

export default App;
