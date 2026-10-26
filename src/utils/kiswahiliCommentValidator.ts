/**
 * Kiswahili Learning Area Comment Validator & Utility
 * 
 * Enforces:
 * 1. Authoritative identification of the Kiswahili learning area across all education tiers.
 * 2. Compulsory non-empty comment enforcement for Kiswahili.
 * 3. Linguistic validation ensuring Kiswahili learning-area remarks are written in Kiswahili.
 * 4. Authentic CBE Kiswahili default assessment remarks.
 */

export interface SubjectIdentifier {
  id?: string;
  subject_code?: string;
  subject_name?: string;
  name?: string;
  code?: string;
}

export type KiswahiliLearningAreaType = 'insha' | 'lugha' | 'activities' | 'general';

export interface KiswahiliCommentOptions {
  subject?: SubjectIdentifier | null;
  student?: { id?: string; admission_number?: string; full_name?: string } | null;
  seed?: string | number;
  learningAreaType?: KiswahiliLearningAreaType;
  educationLevel?: string;
}

/**
 * Reliably identifies whether a learning area / subject is Kiswahili.
 * Checks authoritative attributes:
 * - subject_name: contains "kiswahili" (case-insensitive) or "insha"
 * - subject_code: starts with "KIS" (e.g. KIS, KISW, KIS-07, KIS-JS, KIS UP), "INSHA", "KIS INSHA" or is "LP-KSL"
 * - id: matches standard seeded Kiswahili identifiers (e.g. sb_kis, sb_up_kis, sb_lp_kis, sb_up_insha)
 */
export function isKiswahiliSubject(subject: SubjectIdentifier | null | undefined): boolean {
  if (!subject) return false;
  
  const name = (subject.subject_name || subject.name || '').trim().toLowerCase();
  if (name.includes('kiswahili')) return true;

  const code = (subject.subject_code || subject.code || '').trim().toUpperCase();
  if (
    code.startsWith('KIS') ||
    code === 'LP-KSL' ||
    code === 'KISW' ||
    code === 'KIS-JS' ||
    code === 'KIS UP' ||
    code === 'INSHA' ||
    code === 'KIS INSHA'
  ) {
    return true;
  }

  const id = (subject.id || '').trim().toLowerCase();
  if (
    id === 'sb_kis' ||
    id === 'sb_up_kis' ||
    id === 'sb_lp_kis' ||
    id.startsWith('sub-kisw') ||
    id.startsWith('sub_kis') ||
    id.includes('insha')
  ) {
    return true;
  }

  if (name.includes('insha')) {
    return true;
  }

  return false;
}

/**
 * Distinguishes between Kiswahili learning areas:
 * - insha: written composition, creative writing
 * - activities: early years / language activities
 * - lugha: grammar, language mechanics
 * - general: composite or general Kiswahili
 */
export function resolveKiswahiliLearningAreaType(
  subject?: SubjectIdentifier | null,
  educationLevel?: string
): KiswahiliLearningAreaType {
  if (!subject) return 'general';
  const name = (subject.subject_name || subject.name || '').trim().toLowerCase();
  const code = (subject.subject_code || subject.code || '').trim().toUpperCase();
  const id = (subject.id || '').trim().toLowerCase();

  if (name.includes('insha') || code === 'INSHA' || code === 'KIS INSHA' || id.includes('insha')) {
    return 'insha';
  }

  if (
    name.includes('activities') ||
    name.includes('shughuli') ||
    code === 'LP-KSL' ||
    educationLevel === 'Pre-Primary' ||
    educationLevel === 'Lower Primary' ||
    id.includes('lp_kis')
  ) {
    return 'activities';
  }

  if (name.includes('lugha') || name.includes('sarufi') || code.includes('LUGHA')) {
    return 'lugha';
  }

  return 'general';
}

/**
 * Authentic Kenyan CBE Kiswahili teacher remark pools organized by CBE performance level and area type.
 * All remarks are short (2–5 words), natural, and idiomatic for printed school report forms.
 */
export const KISWAHILI_COMMENT_POOLS: Record<
  'EE1' | 'EE2' | 'ME' | 'AE' | 'BE1' | 'BE2' | 'BE3' | 'BE4',
  Record<KiswahiliLearningAreaType, string[]>
> = {
  EE1: {
    general: [
      'Hongera kwa kazi nzuri!',
      'Umefanya vizuri sana.',
      'Kazi nzuri, endelea hivyo.',
      'Hongera, kazi bora sana.',
      'Uwezo wa juu sana.',
    ],
    lugha: [
      'Hongera kwa kazi nzuri!',
      'Umefanya vizuri sana.',
      'Kazi nzuri, matumizi fasaha.',
      'Hongera, kazi bora sana.',
      'Uwezo wa juu sana.',
    ],
    insha: [
      'Hongera, insha nzuri sana.',
      'Insha nzuri, mtiririko mzuri.',
      'Utunzi mzuri sana, hongera.',
      'Uandishi mzuri na msamiati.',
    ],
    activities: [
      'Hongera, kazi nzuri sana!',
      'Umefanya vizuri sana.',
      'Kazi nzuri, anashiriki kikamilifu.',
      'Uwezo wa juu, anafanya vizuri.',
    ],
  },
  EE2: {
    general: [
      'Kazi bora, zidisha bidii.',
      'Umefanya vizuri sana.',
      'Kazi nzuri, endelea hivyo.',
      'Unaendelea kupiga hatua nzuri.',
      'Kazi bora, dumisha bidii.',
    ],
    lugha: [
      'Kazi bora, zidisha bidii.',
      'Umefanya vizuri katika sarufi.',
      'Kazi nzuri, endelea hivyo.',
      'Unaendelea kupiga hatua nzuri.',
      'Kazi bora, dumisha bidii.',
    ],
    insha: [
      'Insha nzuri, endelea hivyo.',
      'Utunzi mzuri, boresha mwandiko.',
      'Kazi nzuri, ongeza msamiati.',
      'Mawazo mazuri na msamiati.',
    ],
    activities: [
      'Kazi nzuri, anashiriki vyema.',
      'Kazi bora, anajitahidi vizuri.',
      'Umefanya vizuri, hongera!',
      'Anaelewa maagizo vizuri.',
    ],
  },
  ME: {
    general: [
      'Kazi nzuri, anafikia matarajio.',
      'Vizuri, jitahidi zaidi.',
      'Unaendelea vizuri, ongeza bidii.',
      'Vizuri, zidisha bidii.',
      'Kazi nzuri, ongeza bidii.',
    ],
    lugha: [
      'Kazi nzuri, anafikia matarajio.',
      'Vizuri, boresha sarufi.',
      'Unaendelea vizuri, ongeza bidii.',
      'Vizuri, zidisha bidii.',
      'Kazi nzuri, ongeza bidii.',
    ],
    insha: [
      'Insha nzuri, ongeza msamiati.',
      'Vizuri, zingatia mpangilio wa aya.',
      'Unaendelea vizuri, fanya mazoezi.',
      'Jitahidi kuboresha uandishi.',
    ],
    activities: [
      'Kazi nzuri, anashiriki vizuri.',
      'Unaendelea vizuri, ongeza bidii.',
      'Vizuri, anashiriki darasani.',
      'Ana uelewa mzuri, azidi kufanya.',
    ],
  },
  AE: {
    general: [
      'Kazi ya wastani, jitahidi.',
      'Unaweza kufanya vizuri zaidi.',
      'Boresha matumizi ya lugha.',
      'Vizuri, jitahidi zaidi.',
      'Zidisha bidii katika masomo.',
    ],
    lugha: [
      'Kazi ya wastani, jitahidi.',
      'Unaweza kufanya vizuri zaidi.',
      'Boresha matumizi ya lugha.',
      'Zidisha bidii katika sarufi.',
      'Fanya mazoezi ya sarufi.',
    ],
    insha: [
      'Boresha mwandiko na aya.',
      'Unaweza kufanya vizuri zaidi.',
      'Fanya mazoezi ya insha.',
      'Zingatia tahajia na aya.',
    ],
    activities: [
      'Unaweza kufanya vizuri zaidi.',
      'Jitahidi kusikiliza na kuzungumza.',
      'Fanya mazoezi ya kutamka.',
      'Anakaribia matarajio, ongeza bidii.',
    ],
  },
  BE1: {
    general: [
      'Anahitaji mazoezi zaidi.',
      'Fanya mazoezi zaidi.',
      'Jitahidi kufanya marudio.',
      'Zidisha bidii katika masomo.',
    ],
    lugha: [
      'Anahitaji mazoezi zaidi.',
      'Fanya mazoezi ya sarufi.',
      'Jitahidi kufanya marudio.',
      'Zidisha bidii katika sarufi.',
    ],
    insha: [
      'Anahitaji mazoezi ya insha.',
      'Fanya mazoezi ya kuandika.',
      'Jitahidi kuandika sentensi sahihi.',
    ],
    activities: [
      'Anahitaji mazoezi ya lugha.',
      'Fanya mazoezi ya kutamka.',
      'Jitahidi kusikiliza kwa makini.',
    ],
  },
  BE2: {
    general: [
      'Anahitaji mwongozo na mazoezi.',
      'Anahitaji mazoezi zaidi.',
      'Jitahidi kuelewa misingi.',
      'Mwongozo zaidi unahitajika.',
    ],
    lugha: [
      'Anahitaji mwongozo na mazoezi.',
      'Anahitaji mazoezi ya sarufi.',
      'Jitahidi kuelewa misingi.',
      'Mwongozo zaidi unahitajika.',
    ],
    insha: [
      'Anahitaji mwongozo wa uandishi.',
      'Fanya mazoezi ya mwandiko.',
      'Mazoezi zaidi yanahitajika.',
    ],
    activities: [
      'Anahitaji mwongozo zaidi.',
      'Mwongozo na mazoezi yanahitajika.',
      'Anahitaji mazoezi zaidi.',
    ],
  },
  BE3: {
    general: [
      'Anahitaji msaada zaidi.',
      'Anahitaji mwongozo wa karibu.',
      'Msaada wa ziada unahitajika.',
      'Jitahidi kupata mwongozo.',
    ],
    lugha: [
      'Anahitaji msaada zaidi.',
      'Anahitaji mwongozo wa karibu.',
      'Msaada wa ziada unahitajika.',
      'Jitahidi kupata mwongozo.',
    ],
    insha: [
      'Anahitaji msaada wa uandishi.',
      'Mazoezi ya tahajia yanahitajika.',
      'Anahitaji mwongozo wa karibu.',
    ],
    activities: [
      'Anahitaji msaada zaidi.',
      'Anahitaji msaada wa herufi.',
      'Msaada wa karibu unahitajika.',
    ],
  },
  BE4: {
    general: [
      'Usaidizi wa haraka unahitajika.',
      'Anahitaji usaidizi wa karibu.',
      'Anahitaji msaada wa kimsingi.',
    ],
    lugha: [
      'Usaidizi wa haraka unahitajika.',
      'Anahitaji usaidizi wa karibu.',
      'Anahitaji msaada wa kimsingi.',
    ],
    insha: [
      'Usaidizi wa haraka unahitajika.',
      'Anahitaji usaidizi wa kuandika.',
    ],
    activities: [
      'Usaidizi wa haraka unahitajika.',
      'Anahitaji usaidizi wa kimsingi.',
    ],
  },
};

/**
 * Returns available comments for a given CBE performance level and learning area type.
 */
export function getKiswahiliCommentPool(
  level: 'EE1' | 'EE2' | 'ME' | 'AE' | 'BE1' | 'BE2' | 'BE3' | 'BE4',
  areaType: KiswahiliLearningAreaType = 'general'
): string[] {
  const levelPools = KISWAHILI_COMMENT_POOLS[level];
  if (!levelPools) return KISWAHILI_COMMENT_POOLS.ME.general;
  return levelPools[areaType] || levelPools.general;
}

function getPerformanceBandKey(score: number): 'EE1' | 'EE2' | 'ME' | 'AE' | 'BE1' | 'BE2' | 'BE3' | 'BE4' {
  if (score >= 90) return 'EE1';
  if (score >= 75) return 'EE2';
  if (score >= 58) return 'ME';
  if (score >= 41) return 'AE';
  if (score >= 31) return 'BE1';
  if (score >= 21) return 'BE2';
  if (score >= 11) return 'BE3';
  return 'BE4';
}

function getDeterministicHash(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return hash;
}

/**
 * Returns authentic Kenya CBE Kiswahili assessment performance remarks.
 * Supports natural variation across performance levels and learning area types (Insha, Lugha, Activities, General).
 */
export function getKiswahiliDefaultComment(
  scoreOrPercentage: number | null | undefined,
  status?: string,
  irregularityReason?: string,
  options?: KiswahiliCommentOptions
): string {
  if (status === 'X') {
    return 'Hajafanya Tathmini (X)';
  }
  if (status === 'Y') {
    return irregularityReason ? `Hitilafu (${irregularityReason})` : 'Hitilafu ya Mtihani (Y)';
  }
  if (scoreOrPercentage === null || scoreOrPercentage === undefined || isNaN(scoreOrPercentage)) {
    return 'Hajathibitishwa';
  }

  const score = Math.round(scoreOrPercentage);

  // If no options or learner seed is supplied (legacy unit test compatibility),
  // return the canonical string:
  if (!options?.seed && !options?.student && !options?.learningAreaType) {
    if (score >= 90) return 'Uwezo wa Juu Zaidi - Kazi Nzuri Sana';
    if (score >= 75) return 'Kazi Bora Sana - Amepita Matarajio';
    if (score >= 58) return 'Kazi Nzuri - Anafikia Matarajio';
    if (score >= 41) return 'Kazi ya Wastani - Anakaribia Matarajio';
    if (score >= 31) return 'Anahitaji Mazoezi Zaidi';
    if (score >= 21) return 'Anahitaji Mazoezi na Mwongozo Zaidi';
    if (score >= 11) return 'Anahitaji Msaada Zaidi';
    return 'Usaidizi wa Haraka Unahitajika';
  }

  const band = getPerformanceBandKey(score);
  const areaType =
    options?.learningAreaType ||
    resolveKiswahiliLearningAreaType(options?.subject, options?.educationLevel);
  const pool = getKiswahiliCommentPool(band, areaType);

  let seedKey: string | undefined = undefined;
  if (options?.seed !== undefined && options?.seed !== null) {
    seedKey = String(options.seed);
  } else if (options?.student) {
    const s = options.student;
    const baseId = s.admission_number || s.id || s.full_name || '';
    const subjId =
      options.subject?.id ||
      options.subject?.subject_code ||
      (options.subject as any)?.code ||
      '';
    seedKey = subjId ? `${baseId}_${subjId}` : baseId;
  }

  if (seedKey && seedKey.trim()) {
    const hash = getDeterministicHash(seedKey.trim());
    return pool[hash % pool.length];
  }

  return pool[0];
}

// Common English educational remarks & stop words that must be rejected for Kiswahili
const ENGLISH_COMMENT_PATTERNS = [
  /\b(outstanding|excellent|good|satisfactory|developing|competency)\b/i,
  /\b(needs|requires|intervention|immediate|support|practice)\b/i,
  /\b(exceeding|meeting|approaching|below)\s+expectations\b/i,
  /\b(keep\s+it\s+up|well\s+done|good\s+work|good\s+job|work\s+hard)\b/i,
  /\b(improvement|progress|effort|performance|learner|student|pupil)\b/i,
  /\b(missing\s+assessment|irregularity|not\s+assessed)\b/i,
];

const ENGLISH_WORDS = new Set([
  'the', 'is', 'are', 'was', 'were', 'and', 'in', 'on', 'at', 'to', 'for', 'with',
  'a', 'an', 'of', 'by', 'from', 'has', 'have', 'had', 'do', 'does', 'did',
  'good', 'very', 'well', 'done', 'great', 'excellent', 'outstanding', 'satisfactory',
  'performance', 'progress', 'improvement', 'needs', 'practice', 'more', 'work', 'hard',
  'keep', 'it', 'up', 'student', 'learner', 'pupil', 'teacher', 'class', 'subject',
  'score', 'grade', 'marks', 'exceeding', 'meeting', 'approaching', 'below', 'expectations',
  'requires', 'intervention', 'support', 'effort', 'fair', 'poor', 'weak', 'better', 'best'
]);

// Kiswahili pedagogical keywords, descriptors, and vocabulary
const KISWAHILI_WORDS = new Set([
  'kazi', 'nzuri', 'bora', 'sana', 'amepita', 'anapita', 'matarajio', 'anafikia', 'anakaribia',
  'chini', 'ya', 'uwezo', 'juu', 'zaidi', 'wastani', 'bidii', 'ongeza', 'aongeze', 'kuelewa',
  'kusoma', 'kuandika', 'stadi', 'msaada', 'mazoezi', 'shughuli', 'mwanafunzi', 'maendeleo',
  'vizuri', 'inahitajika', 'inastahili', 'lugha', 'kusikiliza', 'kuzungumza', 'ufahamu', 'insha',
  'sarufi', 'kusifu', 'pongezi', 'jitihada', 'kuimarisha', 'mashairi', 'fasihi', 'msamiati',
  'kuthamini', 'nidhamu', 'ushirikiano', 'hajafanya', 'hitilafu', 'tathmini', 'matokeo', 'alama',
  'daraja', 'kufanya', 'kushiriki', 'akifanya', 'akijitahidi', 'mwongozo', 'usaidizi', 'haraka',
  'anahitaji', 'anajua', 'anaweza', 'amejitahidi', 'ameimarika', 'ameweka', 'kufikia', 'kuzidi',
  'kupita', 'hodari', 'mwenendo', 'tabia', 'aendelee', 'kuendelea', 'kujitahidi', 'vyema',
  'kamili', 'jumla', 'tuzo', 'mwalimu', 'somo', 'masomo', 'mwanzo', 'mwisho', 'muhula', 'shule',
  'darasa', 'mtihani', 'mjarabu', 'hongera', 'vizuri', 'heshima', 'ustadi', 'kamilifu', 'makini',
  'taratibu', 'kielelezo', 'mifano', 'marudio', 'kuhesabu', 'kutunga', 'hadithi', 'methali',
  'nahau', 'vitendawili', 'fumbo', 'msingi', 'uhodari', 'kujiamini', 'kushirikiana', 'kupendeza',
  'aya', 'uandishi', 'mwandiko', 'tahajia', 'utunzi', 'mtiririko', 'umahiri', 'fasaha', 'dharura',
  'mno', 'ajabu', 'ari', 'maagizo', 'furaha', 'kutamka', 'kuitikia', 'picha', 'uangalizi',
  'shughulini', 'kimsingi', 'misingi', 'thabiti', 'maalum', 'siku', 'fupi', 'miundo', 'sahihi',
  'vitabu', 'mpangilio', 'kuridhisha', 'kukuza', 'wako', 'unavutia', 'dumisha', 'elewa', 'anaelewa',
  'azidi', 'kufikia', 'kuimarisha', 'muundo'
]);

export interface ValidationResult {
  isValid: boolean;
  isLanguageValid: boolean;
  error?: string;
  reason?: 'EMPTY_COMMENT' | 'NOT_IN_KISWAHILI';
}

/**
 * Validates that a Kiswahili comment is:
 * 1. Present and non-empty (compulsory).
 * 2. Written in Kiswahili (rejects English commentary, auto-generated English phrases, and non-Kiswahili text).
 */
export function validateKiswahiliComment(comment: string | null | undefined): ValidationResult {
  if (!comment || typeof comment !== 'string' || !comment.trim()) {
    return {
      isValid: false,
      isLanguageValid: false,
      error: 'Maoni ya somo la Kiswahili yanahitajika. Tafadhali andika maoni kwa lugha ya Kiswahili. (Kiswahili comment is required. Please enter the learner\'s comment in Kiswahili.)',
      reason: 'EMPTY_COMMENT',
    };
  }

  const trimmed = comment.trim();

  // Explicitly check for known English template phrases
  for (const pattern of ENGLISH_COMMENT_PATTERNS) {
    if (pattern.test(trimmed)) {
      return {
        isValid: false,
        isLanguageValid: false,
        error: 'Maoni ya somo la Kiswahili lazima yaandikwe kwa lugha ya Kiswahili. (Kiswahili comment must be written in Kiswahili language.)',
        reason: 'NOT_IN_KISWAHILI',
      };
    }
  }

  // Tokenize words
  const words = trimmed
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 0);

  if (words.length === 0) {
    return {
      isValid: false,
      isLanguageValid: false,
      error: 'Maoni ya somo la Kiswahili yanahitajika. Tafadhali andika maoni kwa lugha ya Kiswahili.',
      reason: 'EMPTY_COMMENT',
    };
  }

  let englishCount = 0;
  let kiswahiliCount = 0;

  for (const word of words) {
    if (ENGLISH_WORDS.has(word)) {
      englishCount++;
    }
    if (KISWAHILI_WORDS.has(word)) {
      kiswahiliCount++;
    } else {
      // Check typical Kiswahili agglutinative verbal prefix/morpheme patterns
      // (e.g. a-na-..., a-me-..., wa-na-..., ki-na-..., a-li-..., ku-..., u-...)
      if (/^(a|wa|ki|vi|m|mi|ji|ma|u|ku|i|zi|ya)(na|li|me|ta|ki|ka|ja|ji)[a-z]{2,}/.test(word)) {
        kiswahiliCount++;
      } else if (/^[a-z]{2,}(ishia|shika|ana|ika|eka|isha|esha|ana|eni|wa)$/.test(word)) {
        kiswahiliCount++;
      }
    }
  }

  // If English words dominate, reject as non-Kiswahili
  if (englishCount > 0 && englishCount >= kiswahiliCount) {
    return {
      isValid: false,
      isLanguageValid: false,
      error: 'Maoni ya somo la Kiswahili lazima yaandikwe kwa lugha ya Kiswahili. (Kiswahili comment must be written in Kiswahili language.)',
      reason: 'NOT_IN_KISWAHILI',
    };
  }

  return {
    isValid: true,
    isLanguageValid: true,
  };
}
