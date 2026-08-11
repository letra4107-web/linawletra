export const DAILY_GOAL = 5;

export const PHONETIC_LEVEL_REQUIREMENTS = {
  Easy: 5,
  Medium: 3,
  Hard: 2,
};

export const READING_LEVEL_LABELS = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
};

export const ACHIEVEMENT_RULES = [
  { id: 'unang_hakbang', check: (stats) => stats.activitiesCompleted >= 1 },
  { id: 'batang_mambabasa', check: (stats) => stats.activitiesCompleted >= 5 },
  { id: 'masigasig_na_mambabasa', check: (stats) => stats.activitiesCompleted >= 10 },
  { id: 'kampeon_sa_pagbasa', check: (stats) => stats.activitiesCompleted >= 25 },
  { id: 'dalubhasa_sa_pagbasa', check: (stats) => stats.activitiesCompleted >= 50 },
  { id: 'unang_bigkas', check: (stats) => stats.totalAttempts >= 1 },
  { id: 'boses_ng_tagumpay', check: (stats) => stats.totalAttempts >= 25 },
  { id: 'bigkas_champion', check: (stats) => stats.totalAttempts >= 10 && stats.accuracy >= 90 },
  { id: 'unang_araw', check: (stats) => stats.streak >= 1 },
  { id: 'tuloy_tuloy', check: (stats) => stats.streak >= 3 },
  { id: 'lingguhang_bayani', check: (stats) => stats.streak >= 7 },
  { id: 'buwan_ng_pagsisikap', check: (stats) => stats.streak >= 30 },
  {
    id: 'matalinong_mag_aaral',
    check: (stats) =>
      stats.totalAttempts >= 10 &&
      stats.baselineAccuracy != null &&
      stats.accuracy - Number(stats.baselineAccuracy) >= 10,
  },
];
