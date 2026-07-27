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

const LEVEL_ORDER = ['Easy', 'Medium', 'Hard'];

const countPerfectScores = (history = []) =>
  history.filter((entry) => Number(entry?.score) === 100).length;

const isImprovingStreak = (history = []) => {
  if (history.length < 3) return false;
  const [a, b, c] = history.slice(-3).map((entry) => Number(entry?.score) || 0);
  return a < b && b < c;
};

const hasReachedLevel = (highestLevel, level) =>
  LEVEL_ORDER.indexOf(highestLevel || 'Easy') >= LEVEL_ORDER.indexOf(level);

// stats shape: { xp, streak, accuracy, completed, currentPhoneticLevel,
//                highestPhoneticLevel, hardCyclesCompleted, hadStreakBreak, history }
export const ACHIEVEMENTS = [
  {
    id: 'unang_hakbang',
    name: 'Unang Hakbang',
    description: 'Sumali sa LinawLetra at nagsimula ng iyong pagbasa.',
    image: unangHakbang,
    check: () => true,
  },
  {
    id: 'unang_araw',
    name: 'Unang Araw',
    description: 'Natapos ang iyong unang araw ng pagsasanay.',
    image: unangAraw,
    check: (stats) => (stats.streak || 0) >= 1,
  },
  {
    id: 'unang_bigkas',
    name: 'Unang Bigkas',
    description: 'Ginawa ang iyong unang pagsubok sa pagbigkas.',
    image: unangBigkas,
    check: (stats) => (stats.history?.length || 0) >= 1,
  },
  {
    id: 'aking_unang_tagumpay',
    name: 'Aking Unang Tagumpay',
    description: 'Natapos ang iyong unang aralin.',
    image: akingUnangTagumpay,
    check: (stats) => (stats.completed || 0) >= 1,
  },
  {
    id: 'batang_mambabasa',
    name: 'Batang Mambabasa',
    description: 'Natapos ang 5 aralin.',
    image: batangMambabasa,
    check: (stats) => (stats.completed || 0) >= 5,
  },
  {
    id: 'masigasig_na_mambabasa',
    name: 'Masigasig na Mambabasa',
    description: 'Natapos ang 15 aralin.',
    image: masigasigNaMambabasa,
    check: (stats) => (stats.completed || 0) >= 15,
  },
  {
    id: 'matalinong_mag_aaral',
    name: 'Matalinong Mag-aaral',
    description: 'Nakamit ang 80%+ accuracy sa 10 o higit pang aralin.',
    image: matalinongMagAaral,
    check: (stats) => (stats.accuracy || 0) >= 80 && (stats.completed || 0) >= 10,
  },
  {
    id: 'malinaw_magsalita',
    name: 'Malinaw Magsalita',
    description: 'Nakamit ang 70% na average accuracy.',
    image: malinawMagsalita,
    check: (stats) => (stats.accuracy || 0) >= 70,
  },
  {
    id: 'tamang_bigkas',
    name: 'Tamang Bigkas',
    description: 'Nakamit ang 85% na average accuracy.',
    image: tamangBigkas,
    check: (stats) => (stats.accuracy || 0) >= 85,
  },
  {
    id: 'bigkas_champion',
    name: 'Bigkas Champion',
    description: 'Nakamit ang 95% na average accuracy.',
    image: bigkasChampion,
    check: (stats) => (stats.accuracy || 0) >= 95,
  },
  {
    id: 'boses_ng_tagumpay',
    name: 'Boses ng Tagumpay',
    description: '10 perpektong (100%) na pagbigkas.',
    image: bosesNgTagumpay,
    check: (stats) => countPerfectScores(stats.history) >= 10,
  },
  {
    id: 'patuloy_na_umuunlad',
    name: 'Patuloy na Umuunlad',
    description: 'Tumataas ang marka sa 3 sunod-sunod na pagsubok.',
    image: patuloyNaUmuunlad,
    check: (stats) => isImprovingStreak(stats.history),
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
    description: 'Bumalik at nagpatuloy matapos ang pagkaantala.',
    image: hindiAkoSusuko,
    check: (stats) => Boolean(stats.hadStreakBreak) && (stats.streak || 0) >= 3,
  },
  {
    id: 'lakas_ng_loob',
    name: 'Lakas ng Loob',
    description: 'Umabot sa Hard level sa unang pagkakataon.',
    image: lakasNgLoob,
    check: (stats) => hasReachedLevel(stats.highestPhoneticLevel, 'Hard'),
  },
  {
    id: 'dalubhasa_sa_pagbasa',
    name: 'Dalubhasa sa Pagbasa',
    description: 'Natapos ang buong Hard level.',
    image: dalubhasaSaPagbasa,
    check: (stats) => (stats.hardCyclesCompleted || 0) >= 1,
  },
  {
    id: 'kampeon_sa_pagbasa',
    name: 'Kampeon sa Pagbasa',
    description: 'Nakamit ang Champion XP tier (200+ XP).',
    image: kampeonSaPagbasa,
    check: (stats) => (stats.xp || 0) >= 200,
  },
  {
    id: 'alamat_ng_pagbasa',
    name: 'Alamat ng Pagbasa',
    description: 'Ang pinakamataas na karangalan: 2+ Hard cycle at 300+ XP.',
    image: alamatNgPagbasa,
    check: (stats) => (stats.hardCyclesCompleted || 0) >= 2 && (stats.xp || 0) >= 300,
  },
];

export const getUnlockedAchievementIds = (stats = {}) =>
  ACHIEVEMENTS.filter((achievement) => {
    try {
      return achievement.check(stats);
    } catch (error) {
      console.error(`Achievement check failed for ${achievement.id}:`, error);
      return false;
    }
  }).map((achievement) => achievement.id);

export const getAchievementById = (id) => ACHIEVEMENTS.find((achievement) => achievement.id === id);
