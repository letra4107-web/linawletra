import akingUnangTagumpay from '../assets/badges/aking_unang_tagumpay.png';
import alamatNgPagbasa from '../assets/badges/alamat_ng_pagbasa.png';
import batangMambabasa from '../assets/badges/batang_mambabasa.png';
import bigkasChampion from '../assets/badges/bigkas_champion.png';
import bosesNgTagumpay from '../assets/badges/boses_ng_tagumpay.png';
import buwanNgPagsisikap from '../assets/badges/buwan_ng_pagsisikap.png';
import dalubhasaSaPagbasa from '../assets/badges/dalubhasa_sa_pagbasa.png';
import hindiAkoSusuko from '../assets/badges/hindi_ako_susuko.png';
import kampeonSaPagbasa from '../assets/badges/kampeon_sa_pagbasa.png';
import lakasNgLoob from '../assets/badges/lakas_ng_loob.png';
import lingguhangBayani from '../assets/badges/lingguhang_bayani.png';
import malinawMagsalita from '../assets/badges/malinaw_magsalita.png';
import masigasigNaMambabasa from '../assets/badges/masigasig_na_mambabasa.png';
import matalinongMagAaral from '../assets/badges/matalinong_mag_aaral.png';
import patuloyNaUmuunlad from '../assets/badges/patuloy_na_umuunlad.png';
import tamangBigkas from '../assets/badges/tamang_bigkas.png';
import tuloyTuloy from '../assets/badges/tuloy_tuloy.png';
import unangAraw from '../assets/badges/unang_araw.png';
import unangBigkas from '../assets/badges/unang_bigkas.png';
import unangHakbang from '../assets/badges/unang_hakbang.png';

const DIFFICULT_WORD_ATTEMPTS = 5;
const CHALLENGING_WORD_ATTEMPTS = 3;
const CHALLENGING_WORDS_REQUIRED = 5;
const MIN_ATTEMPTS_FOR_AVERAGE_BADGE = 10;
const MIN_ATTEMPTS_FOR_IMPROVEMENT_BADGE = 5;
const IMPROVEMENT_POINTS_REQUIRED = 20;
const CASCADE_BADGE_ID = 'aking_unang_tagumpay';
const FINAL_BADGE_ID = 'alamat_ng_pagbasa';

const normalizeWord = (value = '') =>
  String(value).toLowerCase().replace(/\s+/g, ' ').trim();

const averageAccuracy = (stats = {}) => {
  const totalAttempts = Number(stats.totalAttempts ?? stats.total_attempts ?? stats.history?.length ?? 0);
  const accuracySum = Number(stats.accuracySum ?? stats.accuracy_sum);
  if (totalAttempts > 0 && Number.isFinite(accuracySum) && accuracySum > 0) {
    return accuracySum / totalAttempts;
  }
  return Number(stats.accuracy ?? 0);
};

const buildPronunciationStats = (stats = {}) => {
  const history = Array.isArray(stats.history) ? stats.history : [];
  const perfectWords = new Set((stats.perfectWords || stats.perfect_words || []).map(normalizeWord).filter(Boolean));
  const attemptsByWord = new Map();
  let maxSingleAccuracy = Number(stats.maxSingleAccuracy || 0);

  history.forEach((entry) => {
    const score = Number(entry?.score ?? entry?.accuracy ?? entry?.accuracy_percentage ?? 0);
    const word = normalizeWord(entry?.word || entry?.target || entry?.expectedText);
    if (score > maxSingleAccuracy) maxSingleAccuracy = score;
    if (score === 100 && word) perfectWords.add(word);
    if (word) {
      const current = attemptsByWord.get(word) || { count: 0, hasCorrect: false };
      current.count += 1;
      current.hasCorrect = current.hasCorrect || score >= 80 || Boolean(entry?.correct || entry?.is_correct);
      attemptsByWord.set(word, current);
    }
  });

  const masteryRows = [
    ...(stats.wordMasteryDetail?.mastered || []),
    ...(stats.wordMasteryDetail?.needsPractice || []),
    ...(stats.wordMasteryDetail?.difficult || []),
  ];
  masteryRows.forEach((row) => {
    const word = normalizeWord(row.word);
    if (!word) return;
    const current = attemptsByWord.get(word) || { count: 0, hasCorrect: false };
    current.count = Math.max(current.count, Number(row.attempt_count || row.attempts_count || 0));
    current.hasCorrect = current.hasCorrect || Number(row.correct_count || 0) > 0 || row.mastery_status === 'mastered';
    attemptsByWord.set(word, current);
  });

  let hasDifficultWordRetried = Boolean(stats.hasDifficultWordRetried);
  let challengingWordsMastered = Number(stats.challengingWordsMastered || 0);
  let derivedChallengingWordsMastered = 0;
  attemptsByWord.forEach(({ count, hasCorrect }) => {
    if (count >= DIFFICULT_WORD_ATTEMPTS) hasDifficultWordRetried = true;
    if (count >= CHALLENGING_WORD_ATTEMPTS && hasCorrect) derivedChallengingWordsMastered += 1;
  });

  challengingWordsMastered = Math.max(challengingWordsMastered, derivedChallengingWordsMastered);

  return {
    maxSingleAccuracy,
    perfectWordCount: Number(stats.perfectWordCount || perfectWords.size),
    hasDifficultWordRetried,
    challengingWordsMastered,
  };
};

// stats shape mirrors mobile's child_progress where possible, with aliases for
// the web students row: activitiesCompleted, totalAttempts, accuracySum,
// baselineAccuracy, streak, lastPracticeDate, readingLevel, history.
export const ACHIEVEMENTS = [
  {
    id: 'unang_hakbang',
    name: 'Unang Hakbang',
    description: 'Tapusin ang unang lesson.',
    image: unangHakbang,
    check: (stats) => (stats.activitiesCompleted || stats.activities_completed || stats.completed || 0) >= 1,
  },
  {
    id: 'unang_araw',
    name: 'Unang Araw',
    description: 'Tapusin ang unang araw ng pag-aaral.',
    image: unangAraw,
    check: (stats) => Boolean(stats.lastPracticeDate || stats.last_practice_date || stats.lastLoginDate),
  },
  {
    id: 'unang_bigkas',
    name: 'Unang Bigkas',
    description: 'Subukan ang unang pagsasanay sa pagbigkas.',
    image: unangBigkas,
    check: (stats) => (stats.totalAttempts || stats.total_attempts || stats.history?.length || 0) >= 1,
  },
  {
    id: 'aking_unang_tagumpay',
    name: 'Aking Unang Tagumpay',
    description: 'Awtomatikong makukuha kapag nakuha mo ang una mong badge.',
    image: akingUnangTagumpay,
    check: () => false,
  },
  {
    id: 'batang_mambabasa',
    name: 'Batang Mambabasa',
    description: 'Tapusin ang 5 lessons.',
    image: batangMambabasa,
    check: (stats) => (stats.activitiesCompleted || stats.activities_completed || stats.completed || 0) >= 5,
  },
  {
    id: 'masigasig_na_mambabasa',
    name: 'Masigasig na Mambabasa',
    description: 'Tapusin ang 10 lessons.',
    image: masigasigNaMambabasa,
    check: (stats) => (stats.activitiesCompleted || stats.activities_completed || stats.completed || 0) >= 10,
  },
  {
    id: 'matalinong_mag_aaral',
    name: 'Matalinong Mag-aaral',
    description: 'Pagbutihin ang accuracy nang 20 points.',
    image: matalinongMagAaral,
    check: (stats) => {
      const totalAttempts = Number(stats.totalAttempts || stats.total_attempts || stats.history?.length || 0);
      const baseline = Number(stats.baselineAccuracy ?? stats.baseline_accuracy);
      if (totalAttempts < MIN_ATTEMPTS_FOR_IMPROVEMENT_BADGE || !Number.isFinite(baseline)) return false;
      return averageAccuracy(stats) - baseline >= IMPROVEMENT_POINTS_REQUIRED;
    },
  },
  {
    id: 'malinaw_magsalita',
    name: 'Malinaw Magsalita',
    description: 'Makakuha ng 90%+ accuracy sa isang pagsasanay.',
    image: malinawMagsalita,
    check: (stats) => buildPronunciationStats(stats).maxSingleAccuracy >= 90,
  },
  {
    id: 'tamang_bigkas',
    name: 'Tamang Bigkas',
    description: 'Makakuha ng 100% accuracy sa 5 salita.',
    image: tamangBigkas,
    check: (stats) => buildPronunciationStats(stats).perfectWordCount >= 5,
  },
  {
    id: 'bigkas_champion',
    name: 'Bigkas Champion',
    description: 'Makamit ang 90%+ average accuracy.',
    image: bigkasChampion,
    check: (stats) => (stats.totalAttempts || stats.total_attempts || stats.history?.length || 0) >= MIN_ATTEMPTS_FOR_AVERAGE_BADGE && averageAccuracy(stats) >= 90,
  },
  {
    id: 'boses_ng_tagumpay',
    name: 'Boses ng Tagumpay',
    description: 'Tapusin ang 25 pagsasanay sa pagbigkas.',
    image: bosesNgTagumpay,
    check: (stats) => (stats.totalAttempts || stats.total_attempts || stats.history?.length || 0) >= 25,
  },
  {
    id: 'patuloy_na_umuunlad',
    name: 'Patuloy na Umuunlad',
    description: 'Umakyat sa susunod na reading level.',
    image: patuloyNaUmuunlad,
    check: (stats) => String(stats.level || stats.readingLevel || stats.practiceLevel || 'Beginner').toLowerCase() !== 'beginner',
  },
  {
    id: 'tuloy_tuloy',
    name: 'Tuloy-Tuloy!',
    description: '3 araw na streak.',
    image: tuloyTuloy,
    check: (stats) => (stats.streak || 0) >= 3,
  },
  {
    id: 'lingguhang_bayani',
    name: 'Lingguhang Bayani',
    description: '7 araw na streak.',
    image: lingguhangBayani,
    check: (stats) => (stats.streak || 0) >= 7,
  },
  {
    id: 'buwan_ng_pagsisikap',
    name: 'Buwan ng Pagsisikap',
    description: '30 araw na streak.',
    image: buwanNgPagsisikap,
    check: (stats) => (stats.streak || 0) >= 30,
  },
  {
    id: 'hindi_ako_susuko',
    name: 'Hindi Ako Susuko',
    description: 'Ulitin ang isang mahirap na salita ng 5 beses.',
    image: hindiAkoSusuko,
    check: (stats) => buildPronunciationStats(stats).hasDifficultWordRetried,
  },
  {
    id: 'lakas_ng_loob',
    name: 'Lakas ng Loob',
    description: 'Matutunan ang 5 mahihirap na salita.',
    image: lakasNgLoob,
    check: (stats) => buildPronunciationStats(stats).challengingWordsMastered >= CHALLENGING_WORDS_REQUIRED,
  },
  {
    id: 'dalubhasa_sa_pagbasa',
    name: 'Dalubhasa sa Pagbasa',
    description: 'Tapusin ang 50 lessons.',
    image: dalubhasaSaPagbasa,
    check: (stats) => (stats.activitiesCompleted || stats.activities_completed || stats.completed || 0) >= 50,
  },
  {
    id: 'kampeon_sa_pagbasa',
    name: 'Kampeon sa Pagbasa',
    description: 'Tapusin ang 25 lessons.',
    image: kampeonSaPagbasa,
    check: (stats) => (stats.activitiesCompleted || stats.activities_completed || stats.completed || 0) >= 25,
  },
  {
    id: 'alamat_ng_pagbasa',
    name: 'Alamat ng Pagbasa',
    description: 'I-unlock ang lahat ng 19 na badge.',
    image: alamatNgPagbasa,
    check: () => false,
  },
];

const REGULAR_BADGE_IDS = ACHIEVEMENTS.map((achievement) => achievement.id)
  .filter((id) => id !== CASCADE_BADGE_ID && id !== FINAL_BADGE_ID);

export const getUnlockedAchievementIds = (stats = {}, existingIds = []) => {
  const unlockedIds = new Set(existingIds || []);
  const hadZeroBadgesBefore = unlockedIds.size === 0;
  const newlyUnlockedIds = [];

  REGULAR_BADGE_IDS.forEach((id) => {
    if (unlockedIds.has(id)) return;
    const achievement = ACHIEVEMENTS.find((item) => item.id === id);
    try {
      if (achievement?.check(stats)) {
        newlyUnlockedIds.push(id);
        unlockedIds.add(id);
      }
    } catch (error) {
      console.error(`Achievement check failed for ${id}:`, error);
    }
  });

  if (newlyUnlockedIds.length && hadZeroBadgesBefore && !unlockedIds.has(CASCADE_BADGE_ID)) {
    unlockedIds.add(CASCADE_BADGE_ID);
  }

  const allOthersUnlocked =
    REGULAR_BADGE_IDS.every((id) => unlockedIds.has(id)) && unlockedIds.has(CASCADE_BADGE_ID);
  if (allOthersUnlocked && !unlockedIds.has(FINAL_BADGE_ID)) {
    unlockedIds.add(FINAL_BADGE_ID);
  }

  return ACHIEVEMENTS.map((achievement) => achievement.id).filter((id) => unlockedIds.has(id));
};

export const getAchievementById = (id) => ACHIEVEMENTS.find((achievement) => achievement.id === id);
