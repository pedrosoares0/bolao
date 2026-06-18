// Mapeamentos dos times da Copa 2026 (nomes exatos da football-data.org)

// Tradução Inglês -> Português
const teamNamesMap: { [key: string]: string } = {
  'Algeria': 'Argélia',
  'Argentina': 'Argentina',
  'Australia': 'Austrália',
  'Austria': 'Áustria',
  'Belgium': 'Bélgica',
  'Bosnia-Herzegovina': 'Bósnia',
  'Bosnia and Herzegovina': 'Bósnia',
  'Brazil': 'Brasil',
  'Canada': 'Canadá',
  'Cape Verde Islands': 'Cabo Verde',
  'Cape Verde': 'Cabo Verde',
  'Colombia': 'Colômbia',
  'Congo DR': 'RD Congo',
  'Democratic Republic of the Congo': 'RD Congo',
  'Croatia': 'Croácia',
  'Curaçao': 'Curaçao',
  'Czechia': 'República Tcheca',
  'Czech Republic': 'República Tcheca',
  'Ecuador': 'Equador',
  'Egypt': 'Egito',
  'England': 'Inglaterra',
  'France': 'França',
  'Germany': 'Alemanha',
  'Ghana': 'Gana',
  'Haiti': 'Haiti',
  'Iran': 'Irã',
  'Iraq': 'Iraque',
  'Ivory Coast': 'Costa do Marfim',
  'Japan': 'Japão',
  'Jordan': 'Jordânia',
  'Mexico': 'México',
  'Morocco': 'Marrocos',
  'Netherlands': 'Holanda',
  'New Zealand': 'Nova Zelândia',
  'Norway': 'Noruega',
  'Panama': 'Panamá',
  'Paraguay': 'Paraguai',
  'Portugal': 'Portugal',
  'Qatar': 'Catar',
  'Saudi Arabia': 'Arábia Saudita',
  'Scotland': 'Escócia',
  'Senegal': 'Senegal',
  'South Africa': 'África do Sul',
  'South Korea': 'Coreia do Sul',
  'Spain': 'Espanha',
  'Sweden': 'Suécia',
  'Switzerland': 'Suíça',
  'Tunisia': 'Tunísia',
  'Turkey': 'Turquia',
  'United States': 'EUA',
  'Uruguay': 'Uruguai',
  'Uzbekistan': 'Uzbequistão',
};

// Código de exibição no padrão do protótipo (ex: South Africa -> AFRI)
const codeMap: { [key: string]: string } = {
  'South Africa': 'AFRI',
  'Czechia': 'TCH',
  'United States': 'EUA',
  'Germany': 'ALE',
  'Saudi Arabia': 'ARA',
  'England': 'ING',
  'Curaçao': 'CUR',
  'Cape Verde Islands': 'CAB',
  'Netherlands': 'HOL',
  'Jordan': 'JOR',
  'Uzbekistan': 'UZB',
  'Tunisia': 'TUN',
  'Morocco': 'MAR',
  'Senegal': 'SEN',
  'Algeria': 'ALG',
  'Egypt': 'EGI',
  'Ghana': 'GAN',
  'Norway': 'NOR',
  'Sweden': 'SUE',
  'Switzerland': 'SUI',
  'Croatia': 'CRO',
  'Belgium': 'BEL',
  'Austria': 'AUT',
  'Bosnia-Herzegovina': 'BOS',
  'Iraq': 'IRA',
  'Iran': 'IRÃ',
  'Japan': 'JAP',
  'South Korea': 'KOR',
  'Australia': 'AUS',
  'New Zealand': 'NZL',
  'Haiti': 'HAI',
  'Panama': 'PAN',
  'Ecuador': 'EQU',
  'Uruguay': 'URU',
  'Colombia': 'COL',
  'Mexico': 'MEX',
  'Brazil': 'BRA',
  'Argentina': 'ARG',
  'France': 'FRA',
  'Spain': 'ESP',
  'Portugal': 'POR',
  'Canada': 'CAN',
  'Paraguay': 'PAR',
  'Qatar': 'CAT',
  'Scotland': 'ESC',
  'Turkey': 'TUR',
  'Ivory Coast': 'CIV',
  'Congo DR': 'CON',
};

// Código de país para a bandeira no flagcdn.com
const iso2Map: { [key: string]: string } = {
  'Algeria': 'dz',
  'Argentina': 'ar',
  'Australia': 'au',
  'Austria': 'at',
  'Belgium': 'be',
  'Bosnia-Herzegovina': 'ba',
  'Bosnia and Herzegovina': 'ba',
  'Brazil': 'br',
  'Canada': 'ca',
  'Cape Verde Islands': 'cv',
  'Cape Verde': 'cv',
  'Colombia': 'co',
  'Congo DR': 'cd',
  'Croatia': 'hr',
  'Curaçao': 'cw',
  'Czechia': 'cz',
  'Czech Republic': 'cz',
  'Ecuador': 'ec',
  'Egypt': 'eg',
  'England': 'gb-eng',
  'France': 'fr',
  'Germany': 'de',
  'Ghana': 'gh',
  'Haiti': 'ht',
  'Iran': 'ir',
  'Iraq': 'iq',
  'Ivory Coast': 'ci',
  'Japan': 'jp',
  'Jordan': 'jo',
  'Mexico': 'mx',
  'Morocco': 'ma',
  'Netherlands': 'nl',
  'New Zealand': 'nz',
  'Norway': 'no',
  'Panama': 'pa',
  'Paraguay': 'py',
  'Portugal': 'pt',
  'Qatar': 'qa',
  'Saudi Arabia': 'sa',
  'Scotland': 'gb-sct',
  'Senegal': 'sn',
  'South Africa': 'za',
  'South Korea': 'kr',
  'Spain': 'es',
  'Sweden': 'se',
  'Switzerland': 'ch',
  'Tunisia': 'tn',
  'Turkey': 'tr',
  'United States': 'us',
  'Uruguay': 'uy',
  'Uzbekistan': 'uz',
};

// Nome das fases do mata-mata
const stageNamesPt: { [key: string]: string } = {
  GROUP_STAGE: 'Fase de Grupos',
  LAST_32: '16 avos de Final',
  LAST_16: 'Oitavas de Final',
  QUARTER_FINALS: 'Quartas de Final',
  SEMI_FINALS: 'Semifinal',
  THIRD_PLACE: 'Disputa do 3º Lugar',
  FINAL: 'Final',
};

export const translateTeam = (name: string): string => teamNamesMap[name] || name;

export const mapFifaCode = (teamNameEn: string, originalCode: string): string =>
  codeMap[teamNameEn] || originalCode || (teamNameEn || '').slice(0, 3).toUpperCase();

// Retorna o código iso2 para o flagcdn ou, se o país não estiver mapeado,
// a URL da bandeira fornecida pela própria API (crest)
export const flagOf = (teamNameEn: string, crestUrl: string): string =>
  iso2Map[teamNameEn] || crestUrl || 'un';

// "GROUP_A" -> "Grupo A"; mata-mata usa o nome da fase.
// Sem fase/grupo (ex.: Brasileirão da ESPN) retorna '' — o cabeçalho do jogo
// mostra só o horário (ver render em App).
export const groupLabel = (stage: string | null, groupName: string | null): string => {
  if (groupName) {
    const letter = groupName.replace('GROUP_', '').replace('Group ', '');
    return `Grupo ${letter}`;
  }
  return stageNamesPt[stage || ''] || '';
};

// Monta a URL da imagem da bandeira (aceita iso2 do flagcdn ou URL completa do crest)
export const flagSrc = (flag: string, size: number): string =>
  flag.startsWith('http') ? flag : `https://flagcdn.com/w${size}/${flag}.png`;
