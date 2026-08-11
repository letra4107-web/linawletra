import React, { useState, useEffect, useMemo, useRef, useContext } from 'react';
import { AuthContext } from '../context/AuthContext';
import { speechService, studentService, readingService, curriculumService, progressService } from '../services/api';
import { evaluateWord as evaluateWordPhonetics, syllabify } from '../utils/tagalogPhonetics';
import { useSyllableHighlight } from '../hooks/useSyllableHighlight';
import {
  FiBell,
  FiLogOut,
  FiStar,
  FiHome,
  FiBookOpen,
  FiMic,
  FiTrendingUp,
  FiSettings,
  FiZap,
  FiUser,
  FiCheck,
  FiCheckCircle,
  FiX,
  FiAlertTriangle,
  FiAward,
  FiVolume2,
  FiRepeat,
  FiLock,
  FiTarget,
} from 'react-icons/fi';
import { subscribeToCanonicalStudentStats, subscribeToTeacherUploadsByGradeLevel } from '../services/supabaseService';
import { ACHIEVEMENTS, getAchievementById } from '../services/achievementService';
import AchievementBadge from '../components/AchievementBadge';
import AchievementUnlockModal from '../components/AchievementUnlockModal';
import './StudentDashboard.css';

// ============================================================================
// CONSTANTS: Activity & Gamification
// ============================================================================
const XP_PER_CORRECT_WORD = 50;
const XP_BONUS_PERFECT_WORD = 25;
const PRONUNCIATION_XP = {
  perfect: XP_PER_CORRECT_WORD + XP_BONUS_PERFECT_WORD,
  correct: XP_PER_CORRECT_WORD,
  close: 0,
  practice: 0,
};
const DAILY_GOAL = 5;
const ENCOURAGEMENT_MESSAGES = ['YOU DID WELL!', 'GOOD JOB!', 'NICE TRY!', 'KEEP GOING!', 'GREAT EFFORT!'];
const normalizeText = (text = '') =>
  text
    .toString()
    .toLowerCase()
    .replace(/[^a-z0-9à-ÿ\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
const normalizeGradeLevel = (value) => {
  if (!value) return '';
  const raw = String(value).trim();
  const numericMatch = raw.match(/^(\d+)$/);
  if (numericMatch) return `Grade ${numericMatch[1]}`;
  const gradeMatch = raw.match(/grade[\s_-]*(\d+)/i);
  if (gradeMatch) return `Grade ${gradeMatch[1]}`;
  return raw;
};
const getAttemptTimestamp = (entry = {}) =>
  entry.timestamp || entry.created_at || entry.createdAt || entry.completed_at || entry.completedAt || entry.date || null;
const getAttemptDateLabel = (entry = {}) => {
  const raw = getAttemptTimestamp(entry);
  const time = typeof raw === 'number' ? raw : new Date(raw).getTime();
  if (!Number.isFinite(time)) return 'Recent';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(time));
};
const getAttemptScore = (entry = {}) => Number(entry.score ?? entry.accuracy ?? entry.accuracy_percentage ?? 0) || 0;
const getActivityTitle = (entry = {}) => entry.lessonTitle || entry.lesson_name || entry.word || entry.target || 'Reading practice';
const countWeeklyPracticeDays = (history = [], nowDate = new Date()) => {
  const now = nowDate.getTime();
  const weekAgo = now - (7 * 24 * 60 * 60 * 1000);
  const days = new Set();
  history.forEach((entry) => {
    const raw = getAttemptTimestamp(entry);
    const time = typeof raw === 'number' ? raw : new Date(raw).getTime();
    if (!Number.isFinite(time) || time < weekAgo) return;
    days.add(new Date(time).toISOString().slice(0, 10));
  });
  return days.size;
};
const getTierFromXp = (xp = 0) => {
  if (xp >= 200) return 'Champion';
  if (xp >= 120) return 'Expert';
  if (xp >= 70) return 'Rising Star';
  if (xp >= 35) return 'Apprentice';
  return 'Beginner';
};
const levelNames = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
};
const curriculumItemToPracticeWord = (item = {}) => ({
  id: item.id,
  curriculumItemId: item.id,
  word: item.content,
  accentedSpelling: item.syllable_hyphenation || item.display_text || item.content,
  meaning: item.definition || '',
  example: null,
  isHomograph: false,
  homographGroup: null,
  difficulty: item.reading_level || 'beginner',
  itemType: item.item_type || 'word',
  sequenceNo: item.sequence_no,
});
const recommendationToPracticeWord = (row = {}) => ({
  id: row.id || row.word,
  word: row.word,
  accentedSpelling: row.syllableHyphenation || row.syllable_hyphenation || row.accentedSpelling || row.word,
  meaning: row.definition || row.meaning || '',
  example: row.example || null,
  isHomograph: Boolean(row.isHomograph || row.is_homograph),
  homographGroup: row.homographGroup || row.homograph_group || null,
  difficulty: row.reading_level || row.difficulty || 'beginner',
  itemType: row.item_type || 'word',
  recommendationScore: row.recommendation_score,
});
// ============================================================================
// GAMIFICATION HELPER FUNCTIONS
// ============================================================================
// Educational feedback messages for incorrect pronunciations
const StudentDashboard = () => {
  const { user: authUser, logout } = useContext(AuthContext);
  const [dateTime, setDateTime] = useState(new Date());
  const [accessibilitySettings, setAccessibilitySettings] = useState({
    darkMode: false,
    largeText: false,
    highContrast: false,
    fontFamily: 'Comic Sans',
    textSize: 16,
    letterSpacing: 'normal',
    wordHighlighting: true,
  });
  const [userRole, setUserRole] = useState('student');
  const [activeSection, setActiveSection] = useState('home');
  const [progress, setProgress] = useState({
    completed: 0,
    accuracy: 0,
    streak: 0,
    totalLessons: 7,
    history: [],
  });
  const [feedback, setFeedback] = useState('');
  const [studentName, setStudentName] = useState('Student');
  const [studentGrade, setStudentGrade] = useState('');
  const [studentRoom, setStudentRoom] = useState('');
  const [teacherUploads, setTeacherUploads] = useState([]);
  const [uploadsLoading, setUploadsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [expectedText, setExpectedText] = useState('');
  const [activePracticeWord, setActivePracticeWord] = useState(null);
  const [activeCurriculumItem, setActiveCurriculumItem] = useState(null);
  const [curriculumSummary, setCurriculumSummary] = useState(null);
  const [curriculumLoading, setCurriculumLoading] = useState(false);
  const [homographPanelOpenId, setHomographPanelOpenId] = useState(null);
  const [transcribedText, setTranscribedText] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [recognitionResult, setRecognitionResult] = useState('neutral');
  const [recognitionDistance, setRecognitionDistance] = useState(null);
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [practiceLevel, setPracticeLevel] = useState('beginner');
  const [practiceLevelSaving, setPracticeLevelSaving] = useState(false);
  const [currentStudentId, setCurrentStudentId] = useState(null);
  const [completedWords, setCompletedWords] = useState([]);
  const [perfectWords, setPerfectWords] = useState([]);
  const [xp, setXp] = useState(0);
  const [achievements, setAchievements] = useState(0);
  const [wordsCompleted, setWordsCompleted] = useState(0);
  const [recordedAudio, setRecordedAudio] = useState(null);
  const [status, setStatus] = useState('idle');
  const [accuracy, setAccuracy] = useState(null);
  const [accuracyExplanation, setAccuracyExplanation] = useState('');
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [canAdvanceCurrentWord, setCanAdvanceCurrentWord] = useState(false);
  const [currentPhoneticLevel, setCurrentPhoneticLevel] = useState('Easy');
  const [progressInCurrentLevel, setProgressInCurrentLevel] = useState(0);
  const [highestPhoneticLevel, setHighestPhoneticLevel] = useState('Easy');
  const [hardCyclesCompleted, setHardCyclesCompleted] = useState(0);
  const [hadStreakBreak, setHadStreakBreak] = useState(false);
  const [unlockedAchievementIds, setUnlockedAchievementIds] = useState([]);
  const [newlyUnlockedAchievements, setNewlyUnlockedAchievements] = useState([]);
  const [xpGainPopup, setXpGainPopup] = useState(null);
  const [reassurancePopup, setReassurancePopup] = useState(null);
  const [confettiPopup, setConfettiPopup] = useState(false);
  const mediaRecorderRef = useRef(null);
  const recognitionRef = useRef(null);
  const ttsAudioRef = useRef(null);
  const {
    activeSyllableIndex: activePracticeSyllableIndex,
    prepare: prepareSyllableHighlight,
    prepareFromTimepoints: prepareSyllableTimepoints,
    updateFromProgress: updateSyllableHighlight,
    reset: resetSyllableHighlight,
  } = useSyllableHighlight(syllabify);
  // Gates the save effect (and the achievement recompute) so neither runs
  // against default/zeroed state while the real saved progress is still
  // being fetched on load. Must be real state, not a ref: the achievement
  // effect needs this flip to actually re-trigger it once loading finishes,
  // not just be readable the next time something else happens to change.
  const [hasLoadedProgress, setHasLoadedProgress] = useState(false);
  // Date (YYYY-MM-DD) the student last successfully pronounced the Word of
  // the Day. The streak only increments off this, not off merely opening
  // the app -- see completeWordOfDayStreak().
  const [wordOfDayCompletedDate, setWordOfDayCompletedDate] = useState(null);
  const [longestStreak, setLongestStreak] = useState(0);
  const [wordMasterySummary, setWordMasterySummary] = useState({ mastered: 0, needsPractice: 0, difficult: 0 });
  const [wordMasteryDetail, setWordMasteryDetail] = useState({ mastered: [], needsPractice: [], difficult: [] });
  const [topConfusions, setTopConfusions] = useState([]);
  const [recommendedPracticeWords, setRecommendedPracticeWords] = useState([]);
  const fontFamilies = {
    'Comic Sans': '"Comic Sans MS", "Trebuchet MS", Verdana, Arial, sans-serif',
    'DM Sans': '"DM Sans", sans-serif',
    'Josefin Sans': '"Josefin Sans", sans-serif',
  };
  useEffect(() => {
    const timer = setInterval(() => setDateTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!authUser) {
      setFeedback('Please log in to use your learning dashboard.');
      return;
    }
    const userId = authUser.uid || authUser.id;
    setHasLoadedProgress(false);
    const loadStudentDashboard = async () => {
      try {
        // Fetch user data via API
        const userResponse = await studentService.getStudent(userId);
        const userData = userResponse?.data?.student || userResponse?.data || userResponse || {};
        const profile = userData.user || userData.users || {};
        const profileMetadata = profile.metadata || userData.metadata || {};
        setStudentName(userData.name || profile.name || profileMetadata.displayName || userData.fullName || 'Student');
        setUserRole(profile.role || userData.role || 'student');
        setCurrentStudentId(userData.studentId || userData.student_id || userData.id || null);
        setStudentGrade(
          normalizeGradeLevel(userData.gradeLevel || userData.grade_level || userData.classId || userData.className || '')
        );
        setStudentRoom(userData.room || userData.classRoom || userData.class_room || '');
        setAccessibilitySettings({
          darkMode: (userData.accessibilitySettings || profileMetadata.accessibilitySettings)?.darkMode ?? false,
          largeText: (userData.accessibilitySettings || profileMetadata.accessibilitySettings)?.largeText ?? false,
          highContrast: (userData.accessibilitySettings || profileMetadata.accessibilitySettings)?.highContrast ?? false,
          fontFamily: (userData.accessibilitySettings || profileMetadata.accessibilitySettings)?.fontFamily || 'Comic Sans',
          textSize: (userData.accessibilitySettings || profileMetadata.accessibilitySettings)?.textSize || 16,
          letterSpacing: (userData.accessibilitySettings || profileMetadata.accessibilitySettings)?.letterSpacing || 'normal',
          wordHighlighting: (userData.accessibilitySettings || profileMetadata.accessibilitySettings)?.wordHighlighting ?? true,
        });
        // Fetch supplementary dashboard data via API. This call is best-effort:
        // it must never block restoring xp/badges/level, which live directly on
        // the students row (userData) and are the real source of truth.
        let dashboardData = {};
        try {
          const dashboardResponse = await progressService.getCanonicalStats(userData.studentId || userData.student_id || userData.id || userId);
          dashboardData = dashboardResponse?.data?.data ?? dashboardResponse?.data ?? dashboardResponse ?? {};
        } catch (dashboardError) {
          console.warn('Dashboard summary fetch failed (non-fatal):', dashboardError);
        }
        const progressData = {
          ...(userData || {}),
          ...(dashboardData || {}),
        };
        let assignedLevel = 'beginner';
        if (progressData && Object.keys(progressData).length > 0) {
          setProgress({
            completed: progressData.completed || 0,
            accuracy: progressData.accuracy || 0,
            streak: progressData.streak || 0,
            totalLessons: progressData.totalLessons || 7,
            history: progressData.history || [],
            ...progressData,
          });
          assignedLevel = progressData.practiceLevel || progressData.practice_level || progressData.currentLevel || assignedLevel;
          setCompletedWords(progressData.completedWords || progressData.completed_words || []);
          setPerfectWords(progressData.perfectWords || progressData.perfect_words || []);
          setXp(progressData.xp || 0);
          setWordsCompleted(progressData.wordsCompleted || progressData.completed_words?.length || 0);
          setAchievements(progressData.achievements || progressData.badges?.length || progressData.unlockedAchievementIds?.length || 0);
          // Load phonetic progression
          setCurrentPhoneticLevel(progressData.currentPhoneticLevel || 'Easy');
          setProgressInCurrentLevel(progressData.progressInCurrentLevel || 0);
          // Load achievement tracking fields
          setHighestPhoneticLevel(progressData.highestPhoneticLevel || progressData.currentPhoneticLevel || 'Easy');
          setHardCyclesCompleted(progressData.hardCyclesCompleted || 0);
          setHadStreakBreak(Boolean(progressData.hadStreakBreak));
          setUnlockedAchievementIds(progressData.unlockedAchievementIds || progressData.unlocked_achievement_ids || []);
          // Streak is driven entirely by Word of the Day completions (see
          // completeWordOfDayStreak) -- just restore the saved streak value
          // and the last completed date, no recalculation on mount.
          setWordOfDayCompletedDate(progressData.wordOfDayCompletedDate || progressData.word_of_day_completed_date || null);
          setLongestStreak(progressData.longestStreak || progressData.longest_streak || progressData.streak || 0);
        }
        const studentRecordId = userData.studentId || userData.student_id || userData.id;
        if (studentRecordId) {
          try {
            const practiceResponse = await studentService.getPracticeLevel(studentRecordId);
            if (practiceResponse?.data?.level) {
              assignedLevel = practiceResponse.data.level;
            }
          } catch (practiceError) {
            console.warn('Practice level fetch failed:', practiceError);
          }
        }
        const nextLevel = userData.readingLevel || assignedLevel || 'beginner';
        setPracticeLevel(nextLevel);
        // Only now is it safe to let the save effect write to the backend, and
        // for the achievement check to run -- every real saved value has been
        // restored into state at this point.
        setHasLoadedProgress(true);
      } catch (error) {
        console.error('Student dashboard load error:', error);
        setFeedback('Cannot load progress right now. Please refresh the page.');
      }
    };
    loadStudentDashboard();
  }, [authUser]);
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
        recognitionRef.current.abort();
      }
    };
  }, []);
  useEffect(() => {
    setAchievements(unlockedAchievementIds.length);
  }, [unlockedAchievementIds.length]);
  useEffect(() => {
    if (!studentGrade || userRole !== 'student') {
      setTeacherUploads([]);
      setUploadsLoading(false);
      return undefined;
    }
    setUploadsLoading(true);
    const unsubscribe = subscribeToTeacherUploadsByGradeLevel(
      studentGrade,
      (uploads) => {
        setTeacherUploads(uploads);
        setUploadsLoading(false);
      },
      (error) => {
        console.error('Teacher uploads subscription failed:', error);
        setUploadsLoading(false);
      }
    );
    return () => unsubscribe();
  }, [studentGrade, userRole]);
  useEffect(() => {
    if (!hasLoadedProgress || !currentStudentId || userRole !== 'student') return undefined;
    const userId = authUser?.uid || authUser?.id;
    return subscribeToCanonicalStudentStats(
      { studentId: currentStudentId, userId },
      () => {
        refreshCanonicalStats().catch((error) => {
          console.warn('Canonical stats realtime refresh failed:', error);
        });
      },
      (error) => console.warn('Canonical stats realtime subscription failed:', error)
    );
  }, [hasLoadedProgress, currentStudentId, userRole, authUser]);
  const persistAccessibilitySettings = async (updates) => {
    const previous = accessibilitySettings;
    const next = { ...previous, ...updates };
    setAccessibilitySettings(next);
    if (currentStudentId) {
      try {
        await studentService.updateStudent(currentStudentId, {
          accessibilitySettings: next,
        });
      } catch (error) {
        console.error('Failed to save accessibility settings:', error);
        setAccessibilitySettings(previous);
        setFeedback('Could not save your display settings. Please try again.');
      }
    }
  };
  const handleLogout = async () => {
    console.log('[Logout] clicked. currentStudentId:', currentStudentId, 'hasLoadedProgress:', hasLoadedProgress);
    try {
      await logout();
    } catch (error) {
      console.error('Logout error:', error);
      setFeedback('Unable to log out right now.');
    }
  };
  // Word mastery / confusion-pattern summary for the Progress tab. Best
  // effort -- these tables only start filling in once a student has made
  // a few attempts, so an empty result just means "not enough data yet".
  useEffect(() => {
    if (!hasLoadedProgress || !currentStudentId) return;
    readingService.getWordMastery(currentStudentId)
      .then((res) => {
        const payload = res?.data || res || {};
        if (payload.counts) setWordMasterySummary(payload.counts);
        setWordMasteryDetail({
          mastered: payload.mastered || [],
          needsPractice: payload.needsPractice || [],
          difficult: payload.difficult || [],
        });
      })
      .catch((error) => console.warn('Failed to load word mastery summary:', error.message));
    readingService.getConfusionPatterns(currentStudentId)
      .then((res) => {
        const patterns = res?.data?.patterns || res?.patterns || [];
        setTopConfusions(patterns.slice(0, 3));
      })
      .catch((error) => console.warn('Failed to load confusion patterns:', error.message));
    readingService.getPracticeRecommendations(currentStudentId)
      .then((res) => {
        const words = res?.data?.words || res?.words || [];
        const recommendations = words.slice(0, 5);
        setRecommendedPracticeWords(recommendations);
        if (!activePracticeWord && !activeCurriculumItem && recommendations[0]) {
          const practiceItem = recommendationToPracticeWord(recommendations[0]);
          setActivePracticeWord(practiceItem);
          setExpectedText(practiceItem.word);
        }
      })
      .catch((error) => console.warn('Failed to load practice recommendations:', error.message));
  }, [hasLoadedProgress, currentStudentId, wordsCompleted, activePracticeWord, activeCurriculumItem]);
  const handleNav = (section) => {
    setActiveSection(section);
    const target = document.getElementById(`${section}-section`);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };
  const isParentUser = userRole === 'parent';
  const canEditPracticeLevel = isParentUser && !!currentStudentId;
  const handlePracticeLevelChange = async (event) => {
    const selectedLevel = event.target.value;
    setPracticeLevel(selectedLevel);
    if (!canEditPracticeLevel) return;
    setPracticeLevelSaving(true);
    try {
      await studentService.setPracticeLevel(currentStudentId, { level: selectedLevel });
    } catch (error) {
      console.error('Practice level save failed:', error);
      setFeedback('Unable to save reading level right now. Please try again later.');
    } finally {
      setPracticeLevelSaving(false);
    }
  };
  const getSpeechRecognition = () => {
    if (typeof window === 'undefined') return null;
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    return SpeechRecognition ? new SpeechRecognition() : null;
  };
  const getBestTagalogVoice = () => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return null;
    const voices = window.speechSynthesis.getVoices();
    const scoredVoices = voices
      .map((voice) => {
        const lang = String(voice.lang || '').toLowerCase();
        const name = String(voice.name || '').toLowerCase();
        let score = 0;
        if (lang === 'fil-ph') score += 100;
        if (lang === 'tl-ph') score += 95;
        if (lang === 'en-ph') score += 60;
        if (lang.startsWith('fil')) score += 80;
        if (lang.startsWith('tl')) score += 75;
        if (lang.includes('ph')) score += 20;
        if (name.includes('filipino') || name.includes('tagalog')) score += 40;
        if (name.includes('google')) score += 18;
        if (name.includes('microsoft')) score += 12;
        if (name.includes('natural') || name.includes('online')) score += 10;
        if (name.includes('female') || name.includes('zira') || name.includes('heera')) score += 4;
        return { voice, score };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score);
    return scoredVoices[0]?.voice || null;
  };

  const formatForTagalogSpeech = (text = '') =>
    String(text)
      .replace(/-/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/\./g, '. ')
      .trim();

  const speakTagalogFallback = (text, options = {}) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    const utterance = new SpeechSynthesisUtterance(formatForTagalogSpeech(text));
    const tagalogVoice = getBestTagalogVoice();
    if (tagalogVoice) {
      utterance.voice = tagalogVoice;
      utterance.lang = tagalogVoice.lang;
    } else {
      utterance.lang = 'fil-PH';
    }
    utterance.rate = options.rate || 0.68;
    utterance.pitch = options.pitch || 1.02;
    utterance.volume = 1;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  };

  const speakTagalog = async (text, options = {}) => {
    if (!text) return;

    ttsAudioRef.current?.pause?.();
    window.speechSynthesis?.cancel?.();
    if (options.trackSyllables) prepareSyllableHighlight(text, 0);
    else resetSyllableHighlight();

    try {
      const { data } = await speechService.textToSpeech(formatForTagalogSpeech(text), {
        speed: options.speed || options.rate || 0.82,
      });
      if (options.trackSyllables) prepareSyllableTimepoints(data.timepoints);
      const audio = new Audio(data.audioUrl);
      ttsAudioRef.current = audio;
      if (options.trackSyllables) {
        audio.ontimeupdate = () => updateSyllableHighlight(audio.currentTime, audio.duration);
      }
      audio.onended = () => {
        if (options.trackSyllables) resetSyllableHighlight();
      };
      audio.onerror = () => {
        speakTagalogFallback(text, options);
      };
      await audio.play();
    } catch (error) {
      speakTagalogFallback(text, options);
    }
  };

  const playTone = (frequency, duration, delay = 0, type = 'sine', gainValue = 0.08) => {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, ctx.currentTime + delay);
    gain.gain.setValueAtTime(0, ctx.currentTime + delay);
    gain.gain.linearRampToValueAtTime(gainValue, ctx.currentTime + delay + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + duration);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start(ctx.currentTime + delay);
    oscillator.stop(ctx.currentTime + delay + duration);
    setTimeout(() => ctx.close().catch(() => {}), (delay + duration + 0.2) * 1000);
  };

  const playClapSound = () => {
    [0, 0.12, 0.24].forEach((delay) => playTone(900, 0.08, delay, 'square', 0.06));
    setTimeout(() => speakTagalog('Congratulations!', { rate: 0.9, pitch: 1.1 }), 260);
  };

  const playYeheySound = () => {
    playTone(520, 0.12, 0, 'triangle', 0.07);
    playTone(740, 0.16, 0.12, 'triangle', 0.07);
    setTimeout(() => speakTagalog('Yehey!', { rate: 0.88, pitch: 1.18 }), 160);
  };

  const showReassurance = (message, variant = 'encourage') => {
    setReassurancePopup({ message, variant });
    setTimeout(() => setReassurancePopup(null), 2200);
  };

  const showConfetti = () => {
    setConfettiPopup(true);
    setTimeout(() => setConfettiPopup(false), 2400);
  };

  const loadNextCurriculumItem = async ({ speak = false } = {}) => {
    if (!currentStudentId) return null;
    setCurriculumLoading(true);
    try {
      const response = await curriculumService.getNextItem({ studentId: currentStudentId });
      const payload = response?.data || response || {};
      const item = payload.item || null;
      setCurriculumSummary(payload.summary || null);

      if (!item) {
        setActiveCurriculumItem(null);
        setFeedback(payload.summary?.completedProgram
          ? 'Natapos mo na ang buong curriculum. Magaling!'
          : 'No curriculum item is ready yet.');
        return null;
      }

      const practiceItem = curriculumItemToPracticeWord(item);
      setActiveCurriculumItem(item);
      setActivePracticeWord(practiceItem);
      setHomographPanelOpenId(null);
      setExpectedText(item.content);
      resetPracticeAttemptState();
      if (speak) {
        setTimeout(() => {
          speakTagalog(practiceItem.accentedSpelling || practiceItem.word, { trackSyllables: true });
        }, 150);
      }
      return item;
    } catch (error) {
      console.warn('Curriculum next item fetch failed; using legacy practice words:', error.message);
      setActiveCurriculumItem(null);
      return null;
    } finally {
      setCurriculumLoading(false);
    }
  };

  useEffect(() => {
    if (!hasLoadedProgress || !currentStudentId || userRole !== 'student') return;
    let isMounted = true;
    loadNextCurriculumItem().then((item) => {
      if (!isMounted || item) return;
      setFeedback('No curriculum item is ready yet. Loading a recommended practice word if one is available.');
    });
    return () => {
      isMounted = false;
    };
  }, [hasLoadedProgress, currentStudentId, userRole]);

  const awardPronunciationXp = (amount) => {
    if (!amount) return;
    setXp((prev) => (Number(prev) || 0) + amount);
    setXpGainPopup(amount);
    setTimeout(() => setXpGainPopup(null), 2500);
  };
  const applyServerStudentProgress = (studentProgress) => {
    if (!studentProgress) return null;

    const serverXp = Number(studentProgress.xp || 0);
    let gainedXp = 0;
    setXp((previousXp) => {
      gainedXp = Math.max(0, serverXp - (Number(previousXp) || 0));
      return serverXp;
    });
    if (gainedXp > 0) {
      setXpGainPopup(gainedXp);
      setTimeout(() => setXpGainPopup(null), 2500);
    }

    setWordsCompleted(Number(studentProgress.wordsCompleted ?? studentProgress.words_completed ?? 0));
    setCompletedWords(Array.isArray(studentProgress.completedWords) ? studentProgress.completedWords : Array.isArray(studentProgress.completed_words) ? studentProgress.completed_words : []);
    setAchievements(Number(studentProgress.achievements || studentProgress.badges?.length || studentProgress.unlockedAchievementIds?.length || 0));
    setAccuracy(Number(studentProgress.accuracy || 0));
    setProgressInCurrentLevel(Number(studentProgress.progress?.completed ?? studentProgress.progressInCurrentLevel ?? studentProgress.progress_in_level ?? 0));
    setCurrentPhoneticLevel(studentProgress.progress?.currentLevel || studentProgress.currentPhoneticLevel || studentProgress.current_phonetic_level || 'Easy');
    setHighestPhoneticLevel(studentProgress.highestPhoneticLevel || studentProgress.highest_phonetic_level || 'Easy');
    setHardCyclesCompleted(Number(studentProgress.hardCyclesCompleted ?? studentProgress.hard_cycles_completed ?? 0));
    setHadStreakBreak(Boolean(studentProgress.hadStreakBreak ?? studentProgress.had_streak_break));
    setUnlockedAchievementIds(
      Array.isArray(studentProgress.unlockedAchievementIds)
        ? studentProgress.unlockedAchievementIds
        : Array.isArray(studentProgress.unlocked_achievement_ids)
          ? studentProgress.unlocked_achievement_ids
          : []
    );
    setWordOfDayCompletedDate(studentProgress.wordOfDayCompletedDate || studentProgress.word_of_day_completed_date || studentProgress.wordOfTheDay?.completedAt || null);
    setLongestStreak(Number(studentProgress.longestStreak ?? studentProgress.longest_streak ?? studentProgress.streak ?? 0));
    setProgress((prev) => ({
      ...prev,
      completed: Number(studentProgress.activitiesCompleted ?? studentProgress.activities_completed ?? studentProgress.completed ?? prev.completed ?? 0),
      accuracy: Number(studentProgress.accuracy ?? prev.accuracy ?? 0),
      streak: Number(studentProgress.streak ?? prev.streak ?? 0),
      totalAttempts: Number(studentProgress.totalAttempts ?? studentProgress.total_attempts ?? prev.totalAttempts ?? 0),
      accuracySum: Number(studentProgress.accuracySum ?? studentProgress.accuracy_sum ?? prev.accuracySum ?? 0),
      activitiesCompleted: Number(studentProgress.activitiesCompleted ?? studentProgress.activities_completed ?? prev.activitiesCompleted ?? 0),
      dailyGoal: studentProgress.dailyGoal || prev.dailyGoal,
      history: Array.isArray(studentProgress.history) ? studentProgress.history : prev.history,
      recentActivities: Array.isArray(studentProgress.recentActivities) ? studentProgress.recentActivities : Array.isArray(studentProgress.recentActivity) ? studentProgress.recentActivity : prev.recentActivities,
    }));

    return { gainedXp };
  };
  const refreshCanonicalStats = async () => {
    if (!currentStudentId) return null;
    const response = await progressService.getCanonicalStats(currentStudentId);
    const stats = response?.data?.data ?? response?.data ?? response ?? null;
    applyServerStudentProgress(stats);
    return stats;
  };
  const normalizeForEvaluation = (text = '') =>
    text
      .toString()
      .toLowerCase()
      .replace(/[^a-z\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  // AI-style accuracy scoring system (0-100%)
  const getTagalogPronunciationFeedback = (score, spoken, target, phoneme) => {
    if (score === 100) {
      return 'Magaling! Tama ang bigkas mo.';
    }
    const badSyllable = phoneme?.syllableBreakdown?.find((s) => s.status !== 'correct');
    if (badSyllable) {
      const subOp = badSyllable.phonemeOps?.find((op) => op.type === 'substitute' && op.confusion);
      if (subOp) {
        return `Napalitan ang tunog na "${subOp.expected}" ng "${subOp.spoken}". Subukan ulit ang "${target}".`;
      }
      if (badSyllable.status === 'skipped') {
        return `Kulang ang pantig na "${badSyllable.syllable}". Sabihin nang buo ang "${target}".`;
      }
    }
    const normalizedSpoken = normalizeForEvaluation(spoken);
    const normalizedTarget = normalizeForEvaluation(target);
    const targetTokens = normalizedTarget.split(' ').filter(Boolean);
    const spokenTokens = normalizedSpoken.split(' ').filter(Boolean);
    const missingToken = targetTokens.find((token) =>
      !spokenTokens.some((word) => word.includes(token) || token.includes(word))
    );
    if (score >= 70) {
      return missingToken
        ? `Malapit na! Kulang ang '${missingToken}' na tunog.`
        : 'Malapit na! Subukang linawin ang tunog.';
    }
    if (score >= 40) {
      return missingToken
        ? `Medyo tama, pero kulang ang '${missingToken}' na tunog.`
        : 'Medyo tama. Subukang ulitin nang mas malinaw.';
    }
    return 'Mali ang bigkas. Pakinggan at ulitin.';
  };
  const evaluatePronunciation = (spoken, target) => {
    const phoneme = evaluateWordPhonetics(target, spoken);
    const score = phoneme.pronunciationScore;
    return {
      score,
      feedback: getTagalogPronunciationFeedback(score, spoken, target, phoneme),
      distance: null,
      phoneme,
    };
  };
  // Get accuracy explanation based on score
  const getAccuracyExplanation = (accuracyScore, spoken, target) => {
    if (accuracyScore === 100) {
      return "Perfect pronunciation! ??";
    } else if (accuracyScore >= 80) {
      return "Great pronunciation, just minor differences";
    } else if (accuracyScore >= 60) {
      return "Good attempt! Focus on key sounds";
    } else if (accuracyScore >= 40) {
      return "Close! Try saying it more slowly";
    } else if (accuracyScore >= 20) {
      return "Needs improvement in sound matching";
    } else {
      return "Listen carefully and try again";
    }
  };
  // Level progression logic
  const advanceLevel = () => {
    const levels = ['Easy', 'Medium', 'Hard'];
    const currentIndex = levels.indexOf(currentPhoneticLevel);
    const completingHardCycle = currentIndex === levels.length - 1;
    const nextLevel = completingHardCycle ? 'Easy' : levels[currentIndex + 1];
    setCurrentPhoneticLevel(nextLevel);
    setProgressInCurrentLevel(0);
    setHighestPhoneticLevel((prev) => {
      const reachedLevel = completingHardCycle ? 'Hard' : nextLevel;
      return levels.indexOf(reachedLevel) > levels.indexOf(prev) ? reachedLevel : prev;
    });
    if (completingHardCycle) {
      setHardCyclesCompleted((prev) => prev + 1);
    }
    return nextLevel;
  };
  // Count threshold alone no longer advances the level -- the student must
  // also have met real mastery/accuracy criteria (level_requirements table,
  // checked server-side against word_mastery). Called once progressInCurrentLevel
  // hits the count threshold; may fire again on later attempts if not ready yet.
  const attemptLevelAdvance = async () => {
    try {
      const response = await readingService.checkLevelReadiness(currentStudentId, []);
      const result = response?.data || response || {};
      if (result.ready) {
        const nextLevel = advanceLevel();
        showReassurance('LEVEL UP!', 'perfect');
        showConfetti();
        playClapSound();
        setFeedback(`Level up! Ngayon ay ${nextLevel}.`);
      } else {
        const failedCheck = Object.entries(result.checks || {}).find(([, check]) => !check.pass);
        const hint = failedCheck?.[0] === 'difficultWords'
          ? 'May ilang salitang kailangan mo pang paghusayin bago tumaas ng level.'
          : failedCheck?.[0] === 'avgAccuracy'
            ? 'Subukang bigkasin nang mas malinaw ang mga salita para tumaas ang iyong accuracy.'
            : 'Magsanay pa ng ilang salita hanggang ganap mong ma-master ang mga ito.';
        setFeedback(hint);
      }
    } catch (error) {
      console.warn('Level readiness check failed:', error.message);
    }
  };
  const resetPracticeAttemptState = () => {
    setCanAdvanceCurrentWord(false);
    setStatus('idle');
    setAccuracy(null);
    setAccuracyExplanation('');
    setTranscribedText('');
    setStatusMessage('');
    setRecognitionResult('neutral');
    setRecognitionDistance(null);
    setRecordedAudio(null);
    resetSyllableHighlight();
  };

  const moveToNextPracticeWord = async () => {
    if (!canAdvanceCurrentWord || isEvaluating) return;

    if (activeCurriculumItem || activePracticeWord?.curriculumItemId) {
      await loadNextCurriculumItem({ speak: true });
      return;
    }

    if (progressInCurrentLevel >= phoneticThreshold) {
      await attemptLevelAdvance();
      resetPracticeAttemptState();
      return;
    }

    const curriculumItem = await loadNextCurriculumItem({ speak: true });
    if (curriculumItem) return;

    const nextRecommendation = recommendedPracticeWords
      .map(recommendationToPracticeWord)
      .find((word) => word.word && word.word !== activePracticeWord?.word);
    if (nextRecommendation) {
      setActivePracticeWord(nextRecommendation);
      setHomographPanelOpenId(null);
      setExpectedText(nextRecommendation.word);
      resetPracticeAttemptState();
      setTimeout(() => {
        speakTagalog(nextRecommendation.accentedSpelling || nextRecommendation.word, { trackSyllables: true });
      }, 150);
      return;
    }

    setActivePracticeWord(null);
    setExpectedText('');
    resetPracticeAttemptState();
    setFeedback('No backend practice item is ready yet.');
  };
  // Only successfully pronouncing the Word of the Day advances the streak --
  // opening the app, listening to it, or reading it does not count. Called
  // from comparePronunciation only when the word just answered correctly
  // was actually today's Word of the Day.
  const completeWordOfDayStreak = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];
    if (wordOfDayCompletedDate === todayStr) return; // already counted today

    let updatedStreak = 1;
    if (wordOfDayCompletedDate) {
      const lastCompleted = new Date(wordOfDayCompletedDate);
      lastCompleted.setHours(0, 0, 0, 0);
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      if (lastCompleted.getTime() === yesterday.getTime()) {
        updatedStreak = (progress.streak || 0) + 1;
      } else if (lastCompleted.getTime() < yesterday.getTime()) {
        if ((progress.streak || 0) >= 3) setHadStreakBreak(true);
        updatedStreak = 1;
      }
    }
    setWordOfDayCompletedDate(todayStr);
    setProgress((prev) => ({ ...prev, streak: updatedStreak }));
    setLongestStreak((prev) => Math.max(prev, updatedStreak));
  };
  const comparePronunciation = async (spoken) => {
    if (isEvaluating) return;
    setIsEvaluating(true);
    const expected = expectedText;
    const evaluation = evaluatePronunciation(spoken, expected);
    let { score } = evaluation;
    const { feedback: tagalogFeedback, distance } = evaluation;
    const isCurriculumAttempt = Boolean(activeCurriculumItem || activePracticeWord?.curriculumItemId);
    const isWordOfDayAttempt = Boolean(wordOfTheDay) && activePracticeWord?.id === wordOfTheDay?.id;
    let curriculumAttempt = null;
    let readingAttempt = null;
    if (isCurriculumAttempt) {
      try {
        const response = await curriculumService.submitAttempt({
          curriculumItemId: activePracticeWord?.curriculumItemId || activeCurriculumItem?.id,
          spokenText: spoken,
        });
        curriculumAttempt = response?.data || response || {};
        if (typeof curriculumAttempt.result?.accuracyScore === 'number') {
          score = curriculumAttempt.result.accuracyScore;
        }
        if (curriculumAttempt.summary) {
          setCurriculumSummary(curriculumAttempt.summary);
          if (curriculumAttempt.summary.updatedLevel) {
            setPracticeLevel(curriculumAttempt.summary.updatedLevel);
          }
        }
      } catch (error) {
        console.error('Failed to record curriculum attempt:', error);
        setRecognitionResult('error');
        setStatus('incorrect');
        setFeedback('Could not save your curriculum attempt. Please try again.');
        setStatusMessage('Your answer was not saved.');
        setTimeout(() => {
          setStatus('idle');
          setIsEvaluating(false);
        }, 3000);
        return;
      }
    } else {
      try {
        const response = await readingService.saveAttempt({
          wordTarget: expected,
          expectedText: expected,
          spokenText: spoken,
          mode: 'word',
          activityType: isWordOfDayAttempt ? 'word_of_day' : 'word_practice',
        });
        readingAttempt = response?.data || response || {};
        if (typeof readingAttempt.result?.accuracyScore === 'number') {
          score = readingAttempt.result.accuracyScore;
        }
      } catch (error) {
        console.error('Failed to record word attempt:', error);
        setRecognitionResult('error');
        setStatus('incorrect');
        setFeedback('Could not save your practice attempt. Please try again.');
        setStatusMessage('Your answer was not saved.');
        setTimeout(() => {
          setStatus('idle');
          setIsEvaluating(false);
        }, 3000);
        return;
      }
    }
    const passedAttempt = score >= 80;
    const isClose = score >= 70 && score < 80;
    const serverAttemptXp = readingAttempt?.studentProgress?.history?.at?.(-1)?.xp;
    const attemptXp = Number.isFinite(Number(serverAttemptXp)) ? Number(serverAttemptXp) : score === 100
      ? PRONUNCIATION_XP.perfect
      : passedAttempt
        ? PRONUNCIATION_XP.correct
        : isClose
          ? PRONUNCIATION_XP.close
          : PRONUNCIATION_XP.practice;
    const serverProgressAvailable = !isCurriculumAttempt && Boolean(readingAttempt?.studentProgress);
    setTranscribedText(spoken);
    setRecognitionDistance(distance);
    setAccuracy(score);
    setFeedback(tagalogFeedback);
    setAccuracyExplanation(getAccuracyExplanation(score, spoken, expected));
    if (score < 80) {
      setCanAdvanceCurrentWord(false);
    }
    const attemptRecord = {
      word: expected,
      spoken,
      score,
      correct: passedAttempt,
      xp: attemptXp,
      activityType: isCurriculumAttempt ? 'curriculum_practice' : isWordOfDayAttempt ? 'word_of_day' : 'word_practice',
      playedTTS: score < 80,
      timestamp: Date.now(),
    };
    if (serverProgressAvailable) {
      applyServerStudentProgress(readingAttempt.studentProgress);
    } else {
      setProgress((prev) => ({
        ...prev,
        history: [...(prev.history || []), attemptRecord],
      }));
    }
    await refreshCanonicalStats().catch((error) => {
      console.warn('Canonical stats refresh failed:', error);
    });
    if (score < 80) {
      const encouragement = ENCOURAGEMENT_MESSAGES[Math.floor(Math.random() * ENCOURAGEMENT_MESSAGES.length)];
      showReassurance(encouragement, 'encourage');
      playYeheySound();
      setTimeout(() => speakTagalog(expected, { trackSyllables: true }), 900);
      setFeedback(`${tagalogFeedback} Pakinggan mo ito.`);
    }
    if (passedAttempt) {
      if (!serverProgressAvailable) {
        awardPronunciationXp(attemptXp);
      }
      if (isWordOfDayAttempt && !serverProgressAvailable) completeWordOfDayStreak();
      if (score === 100) {
        setPerfectWords((prev) => prev.includes(expected) ? prev : [...prev, expected]);
      }
      setStatus('correct');
      setRecognitionResult('success');
      if (score === 100) {
        showReassurance('CONGRATULATIONS!', 'perfect');
        showConfetti();
        playClapSound();
      } else {
        showReassurance('GOOD JOB!', 'success');
      }
      const alreadyCompleted = completedWords.includes(expected);
      const newProgress = alreadyCompleted ? progressInCurrentLevel : progressInCurrentLevel + 1;
      const threshold = currentPhoneticLevel === 'Easy' ? 5 : currentPhoneticLevel === 'Medium' ? 3 : 2;
      const eligibleToAdvance = isCurriculumAttempt
        ? Boolean(curriculumAttempt?.summary?.readyForNextLevel || curriculumAttempt?.summary?.nextLevel)
        : newProgress >= threshold;
      const cappedProgress = Math.min(newProgress, threshold);
      if (!alreadyCompleted && !serverProgressAvailable) {
        if (!isCurriculumAttempt) {
          setProgressInCurrentLevel(cappedProgress);
        }
        setWordsCompleted((prev) => {
          const newCount = prev + 1;
          if (newCount % 5 === 0) {
            setAchievements((prevAch) => prevAch + 1);
          }
          return newCount;
        });
        setCompletedWords((prev) => [...prev, expected]);
        setProgress((prev) => ({
          ...prev,
          completed: (prev.completed || 0) + 1,
          accuracy: Math.round(
            ((Number(prev.accuracy) || 0) * (prev.completed || 0) + score) /
            ((prev.completed || 0) + 1)
          ),
        }));
      } else {
        setProgress((prev) => ({
          ...prev,
          accuracy: Math.round(((Number(prev.accuracy) || 0) + score) / 2),
        }));
      }
      setCanAdvanceCurrentWord(true);
      setFeedback(
        score === 100
          ? `${tagalogFeedback} Perfect! You earned extra XP.`
          : eligibleToAdvance
            ? `${tagalogFeedback} You can move to the next level, or try again for 100%.`
            : `${tagalogFeedback} You can go to the next word, or try again for 100%.`
      );
      setStatusMessage(`You said: ${spoken}`);
      setTimeout(() => {
        setStatus('idle');
        setIsEvaluating(false);
      }, 3000);
      return;
    }
    if (isClose) {
      setStatus('almost');
      setRecognitionResult('almost');
      showReassurance('YOU DID WELL!', 'encourage');
      setStatusMessage(`Malapit na! Sinabi mo: ${spoken}`);
      setTimeout(() => {
        setStatus('idle');
        setIsEvaluating(false);
      }, 3000);
      return;
    }
    setProgressInCurrentLevel(0);
    setStatus('incorrect');
    setRecognitionResult('error');
    setStatusMessage(`Mali ang bigkas. Sinabi mo: ${spoken}`);
    setTimeout(() => {
      setStatus('idle');
      setIsEvaluating(false);
    }, 3000);
  };
  const handleMicClick = async () => {
    const recognition = getSpeechRecognition();
    if (!recognition) {
      setRecognitionResult('error');
      setFeedback('Speech recognition is not supported by your browser.');
      setStatusMessage('Try a modern browser like Chrome.');
      return;
    }
    if (isListening) {
      recognitionRef.current?.stop();
      mediaRecorderRef.current?.stop();
      setStatus('idle');
      return;
    }
    setIsProcessing(true);
    recognition.lang = 'tl-PH';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.continuous = false;
    // Start MediaRecorder for audio recording
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      const chunks = [];
      mediaRecorder.ondataavailable = (event) => {
        chunks.push(event.data);
      };
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        setRecordedAudio(blob);
        stream.getTracks().forEach(track => track.stop());
      };
      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
    } catch (error) {
      console.error('Error starting audio recording:', error);
      // Continue without recording if audio access fails
    }
    recognition.onstart = () => {
      setIsListening(true);
      setStatus('listening');
      setFeedback('Listening... Say the word clearly.');
      setStatusMessage('Listening for Tagalog pronunciation.');
    };
    recognition.onresult = (event) => {
      setIsListening(false);
      mediaRecorderRef.current?.stop();
      const spokenWord = event.results[0][0].transcript.toLowerCase().trim();
      comparePronunciation(spokenWord);
      setIsProcessing(false);
    };
    recognition.onerror = (event) => {
      setIsListening(false);
      setIsProcessing(false);
      setStatus('idle');
      mediaRecorderRef.current?.stop();
      setRecognitionResult('error');
      setFeedback("We couldn't hear you clearly. Let's try again!");
      setStatusMessage('Please try again.');
    };
    recognition.onend = () => {
      setIsListening(false);
      setIsProcessing(false);
      setStatus('idle');
      mediaRecorderRef.current?.stop();
    };
    recognitionRef.current = recognition;
    recognition.start();
  };
  const replayRecognizedWord = () => {
    if (!recordedAudio) {
      setFeedback('No recorded audio available. Please record your voice first.');
      return;
    }
    const audio = new Audio(URL.createObjectURL(recordedAudio));
    audio.play().catch((error) => {
      console.error('Error playing recorded audio:', error);
      setFeedback('Unable to play recorded audio.');
    });
  };
  const renderWordHighlight = () => {
    const expectedWords = normalizeText(expectedText).split(' ').filter(Boolean);
    const spokenWords = normalizeText(transcribedText).split(' ').filter(Boolean);
    return expectedWords.map((word, index) => {
      const isWrong = spokenWords[index] !== word;
      return (
        <span
          key={`${word}-${index}`}
          className={`highlight-word ${isWrong ? 'wrong-word' : 'correct-word'}`}
        >
          {word}
        </span>
      );
    });
  };
  const sharedLessons = useMemo(
    () => teacherUploads.filter((item) => (item.type || item.contentType) !== 'assessment'),
    [teacherUploads]
  );
  const assessments = useMemo(
    () => teacherUploads.filter((item) => (item.type || item.contentType) === 'assessment'),
    [teacherUploads]
  );
  const searchValue = searchTerm.toLowerCase();
  const filteredLessons = useMemo(
    () => sharedLessons.filter((item) => {
      const text = `${item.title} ${item.description} ${item.teacherName}`.toLowerCase();
      return text.includes(searchValue);
    }),
    [searchValue, sharedLessons]
  );
  const filteredAssessments = useMemo(
    () => assessments.filter((item) => {
      const text = `${item.title} ${item.description} ${item.teacherName}`.toLowerCase();
      return text.includes(searchValue);
    }),
    [searchValue, assessments]
  );
  const nextLesson = filteredLessons[0] || null;
  const openNextLesson = () => {
    if (nextLesson?.fileUrl) {
      window.open(nextLesson.fileUrl, '_blank');
    }
  };
  const xpHistory = useMemo(() => {
    const history = progress.history || [];
    if (Array.isArray(history) && history.length > 0) {
      return history.slice(-7).map((entry) => ({
        label: entry.date,
        value: entry.xp,
      }));
    }
    return [];
  }, [progress.history]);
  const previewSentence = 'Aa Bb Cc';
  const formattedDate = new Intl.DateTimeFormat('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  }).format(dateTime);
  const formattedTime = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric', minute: 'numeric', hour12: true,
  }).format(dateTime);
  const progressXp = useMemo(() => Number(xp) || 0, [xp]);
  const tier = useMemo(() => getTierFromXp(progressXp), [progressXp]);
  const lessonsGoal = progress.totalLessons || 7;
  const completionPercent = Math.min(100, Math.round((Number(progress.completed || 0) / Number(lessonsGoal || 1)) * 100));
  const history = Array.isArray(progress.history) ? progress.history : [];
  const totalAttempts = Number(progress.totalAttempts || progress.total_attempts || history.length || 0);
  const accuracySum = Number(progress.accuracySum || progress.accuracy_sum || history.reduce((sum, entry) => sum + getAttemptScore(entry), 0));
  const allTimeAccuracy = totalAttempts > 0
    ? Math.round(accuracySum / totalAttempts)
    : Number(progress.accuracy || 0);
  const activitiesCompleted = Number(progress.activitiesCompleted || progress.activities_completed || progress.completed || 0);
  // Parity note: this intentionally mirrors mobile's current X/5 formula.
  // It is not a true midnight-reset daily counter; it rolls over every 5 attempts.
  const todayGoalDone = Math.min(totalAttempts % DAILY_GOAL, DAILY_GOAL);
  const weeklyPracticeDays = countWeeklyPracticeDays(history, dateTime);
  const recentReadingActivity = useMemo(
    () => [...history]
      .sort((a, b) => {
        const aTime = typeof getAttemptTimestamp(a) === 'number' ? getAttemptTimestamp(a) : new Date(getAttemptTimestamp(a)).getTime();
        const bTime = typeof getAttemptTimestamp(b) === 'number' ? getAttemptTimestamp(b) : new Date(getAttemptTimestamp(b)).getTime();
        return (Number.isFinite(bTime) ? bTime : 0) - (Number.isFinite(aTime) ? aTime : 0);
      })
      .slice(0, 3),
    [history]
  );
  const streakDays = progress.streak || 0;
  const greetingHour = dateTime.getHours();
  const timeGreeting = greetingHour < 12 ? 'Magandang umaga' : greetingHour < 18 ? 'Magandang hapon' : 'Magandang gabi';
  const recentAchievement = unlockedAchievementIds.length > 0
    ? getAchievementById(unlockedAchievementIds[unlockedAchievementIds.length - 1])
    : null;
  const phoneticThreshold = currentPhoneticLevel === 'Easy' ? 5 : currentPhoneticLevel === 'Medium' ? 3 : 2;
  const isCurrentCurriculumPractice = Boolean(activeCurriculumItem || activePracticeWord?.curriculumItemId);
  const curriculumProgressTotals = useMemo(() => {
    const counts = curriculumSummary?.counts || {};
    const values = Object.values(counts);
    const required = values.reduce((sum, item) => sum + (Number(item.required) || 0), 0);
    const passed = values.reduce((sum, item) => sum + (Number(item.passed) || 0), 0);
    return { required, passed };
  }, [curriculumSummary]);
  const practiceProgressCurrent = isCurrentCurriculumPractice && curriculumProgressTotals.required > 0
    ? curriculumProgressTotals.passed
    : progressInCurrentLevel;
  const practiceProgressTarget = isCurrentCurriculumPractice && curriculumProgressTotals.required > 0
    ? curriculumProgressTotals.required
    : phoneticThreshold;
  const practiceProgressPercent = Math.min(
    100,
    (practiceProgressCurrent / Math.max(practiceProgressTarget, 1)) * 100
  );
  const rootStyles = {
    fontFamily: fontFamilies[accessibilitySettings.fontFamily] || fontFamilies['Comic Sans'],
    fontSize: `${accessibilitySettings.textSize}px`,
    letterSpacing: accessibilitySettings.letterSpacing === 'wide' ? '0.08em' : 'normal',
  };
  const wordOfTheDay = activePracticeWord || null;
  const wordOfTheDayAttempts = useMemo(() => {
    if (!wordOfTheDay) return [];
    return (progress.history || []).filter((entry) =>
      entry.activityType === 'word_of_day' ||
      String(entry.word || '').toLowerCase() === String(wordOfTheDay.word || '').toLowerCase()
    );
  }, [progress.history, wordOfTheDay]);
  const latestWordOfTheDayAttempt = wordOfTheDayAttempts[wordOfTheDayAttempts.length - 1] || null;
  const hasPracticedWordOfTheDay = Boolean(latestWordOfTheDayAttempt) || completedWords.includes(wordOfTheDay?.word);
  const selectPracticeWord = (practiceWord) => {
    setActiveCurriculumItem(null);
    setActivePracticeWord(practiceWord);
    setHomographPanelOpenId(null);
    setExpectedText(practiceWord.word);
    resetPracticeAttemptState();
  };
  const hasPracticePrompt = Boolean(activePracticeWord?.word || expectedText);
  const visiblePracticeLabel = hasPracticePrompt
    ? (activePracticeWord ? activePracticeWord.accentedSpelling : expectedText)
    : 'Practice item loading';
  const heroCopy = {
    home: {
      title: `Kumusta,\n${studentName?.split(' ')[0] || 'Student'}!`,
      subtitle: 'Handa ka na bang matuto ngayon?',
    },
    content: {
      title: `Matuto tayo,\n${studentName?.split(' ')[0] || 'Student'}!`,
      subtitle: 'Piliin ang aralin at ipagpatuloy ang iyong paglalakbay sa pagbasa.',
    },
    practice: {
      title: 'Voice Reading\nPractice',
      subtitle: 'Basahin nang malakas at hayaan ang AI na suriin ang bigkas mo.',
    },
    progress: {
      title: 'My Reading\nProgress',
      subtitle: 'See how much you have improved on your reading journey.',
    },
    badges: {
      title: 'My Learning\nBadges',
      subtitle: 'Celebrate every reading milestone you achieve.',
    },
    profile: {
      title: 'My\nProfile',
      subtitle: 'Review your learning account and reading stats.',
    },
    settings: {
      title: 'Settings',
      subtitle: 'Make LinawLetra work best for you.',
    },
  };
  const activeHero = heroCopy[activeSection] || heroCopy.home;
  return (
    <div
      className={`dashboard-page ${accessibilitySettings.darkMode ? 'dark-mode' : ''} ${accessibilitySettings.highContrast ? 'high-contrast' : ''}`}
      style={rootStyles}
    >
    <div className="student-shell">
      <aside className="student-sidebar">
        <div className="student-sidebar-top">
          <div className="student-sidebar-brand">
            <img src="/logo.png" alt="LinawLetra logo" />
            <span className="student-sidebar-brand-name">LinawLetra</span>
          </div>
          <nav className="student-sidebar-nav">
            <button
              type="button"
              className={`student-sidebar-link ${activeSection === 'home' ? 'active' : ''}`}
              onClick={() => handleNav('home')}
            >
              <span className="student-sidebar-link-icon"><FiHome aria-hidden="true" /></span> Home
            </button>
            <button
              type="button"
              className={`student-sidebar-link ${activeSection === 'content' ? 'active' : ''}`}
              onClick={() => handleNav('content')}
            >
              <span className="student-sidebar-link-icon"><FiBookOpen aria-hidden="true" /></span> Learn
            </button>
            <button
              type="button"
              className={`student-sidebar-link ${activeSection === 'practice' ? 'active' : ''}`}
              onClick={() => handleNav('practice')}
            >
              <span className="student-sidebar-link-icon"><FiMic aria-hidden="true" /></span> Practice
            </button>
            <button
              type="button"
              className={`student-sidebar-link ${activeSection === 'progress' ? 'active' : ''}`}
              onClick={() => handleNav('progress')}
            >
              <span className="student-sidebar-link-icon"><FiTrendingUp aria-hidden="true" /></span> Progress
            </button>
            <button
              type="button"
              className={`student-sidebar-link ${activeSection === 'badges' ? 'active' : ''}`}
              onClick={() => handleNav('badges')}
            >
              <span className="student-sidebar-link-icon"><FiAward aria-hidden="true" /></span> Badges
            </button>
            <button
              type="button"
              className={`student-sidebar-link ${activeSection === 'profile' ? 'active' : ''}`}
              onClick={() => handleNav('profile')}
            >
              <span className="student-sidebar-link-icon"><FiUser aria-hidden="true" /></span> Profile
            </button>
            <button
              type="button"
              className={`student-sidebar-link ${activeSection === 'settings' ? 'active' : ''}`}
              onClick={() => handleNav('settings')}
            >
              <span className="student-sidebar-link-icon"><FiSettings aria-hidden="true" /></span> Settings
            </button>
          </nav>
        </div>
        <div className="student-sidebar-bottom">
          <button className="student-sidebar-logout" type="button" onClick={handleLogout}>
            <FiLogOut aria-hidden="true" /> Logout
          </button>
        </div>
      </aside>
      <main className="student-main" id="main-content" style={{ position: 'relative' }}>
        {newlyUnlockedAchievements.length > 0 && (
          <AchievementUnlockModal
            achievements={newlyUnlockedAchievements}
            onClose={() => setNewlyUnlockedAchievements([])}
          />
        )}
        {xpGainPopup && (
          <div
            className="xp-gain-popup"
            role="status"
            aria-live="polite"
          >
            <span>+{xpGainPopup} XP</span>
            {xpGainPopup > XP_PER_CORRECT_WORD && (
              <small>Perfect! Bonus XP!</small>
            )}
          </div>
        )}
        {reassurancePopup && (
          <div className={`reassurance-popup reassurance-popup--${reassurancePopup.variant}`}>
            {reassurancePopup.message}
          </div>
        )}
        {confettiPopup && (
          <div className="confetti-popup" aria-hidden="true">
            {Array.from({ length: 28 }, (_, index) => (
              <span
                key={index}
                className="confetti-piece"
                style={{
                  left: `${(index * 37) % 100}%`,
                  animationDelay: `${(index % 8) * 0.08}s`,
                  backgroundColor: ['#4f46e5', '#10b981', '#f59e0b', '#ef4444'][index % 4],
                }}
              />
            ))}
          </div>
        )}
        <section className={`student-mobile-hero student-mobile-hero--${activeSection}`}>
          <div className="student-mobile-hero-top">
            <div className="student-mobile-hero-brand">
              <img src="/logo.png" alt="" />
              <span>LinawLetra</span>
            </div>
            <button type="button" className="student-mobile-hero-bell" onClick={() => handleNav('settings')} aria-label="Open settings">
              <FiBell aria-hidden="true" />
            </button>
          </div>
          <h1>{activeHero.title.split('\n').map((line, index) => (
            <React.Fragment key={`${line}-${index}`}>
              {line}
              {index < activeHero.title.split('\n').length - 1 && <br />}
            </React.Fragment>
          ))}</h1>
          <p>{activeHero.subtitle}</p>
          <div className="student-mobile-hero-art" aria-hidden="true">
            {activeSection === 'practice' ? <FiMic /> : activeSection === 'progress' ? <FiTrendingUp /> : activeSection === 'badges' ? <FiAward /> : activeSection === 'settings' ? <FiSettings /> : <FiBookOpen />}
          </div>
        </section>
        {activeSection === 'home' && (
          <>
            <div className="home-greeting">
              <h2>{timeGreeting}, {studentName}!</h2>
              <p>Keep learning today!</p>
            </div>

            {wordOfTheDay && (
              <article className="word-of-the-day-card word-of-the-day-featured">
                <span className="word-of-the-day-kicker">Salita Ngayon</span>
                <span className={`word-of-the-day-word ${hasPracticedWordOfTheDay ? '' : 'is-hidden'}`}>
                  {hasPracticedWordOfTheDay ? wordOfTheDay.accentedSpelling : '---'}
                </span>
                {hasPracticedWordOfTheDay ? (
                  <>
                    <span className="word-of-the-day-meaning">{wordOfTheDay.meaning}</span>
                    {latestWordOfTheDayAttempt?.score !== undefined && (
                      <span className="word-of-the-day-meaning">
                        Accuracy: {latestWordOfTheDayAttempt.score}%
                      </span>
                    )}
                    {wordOfTheDay.example && (
                      <span className="word-of-the-day-example">"{wordOfTheDay.example}"</span>
                    )}
                  </>
                ) : (
                  <span className="word-of-the-day-meaning">Practice today's hidden word to reveal it.</span>
                )}
                <div className="word-of-the-day-actions">
                  {hasPracticedWordOfTheDay && (
                    <button
                      type="button"
                      className="button-large button-secondary"
                      onClick={() => speakTagalog(wordOfTheDay.accentedSpelling)}
                    >
                      <FiVolume2 aria-hidden="true" /> Listen
                    </button>
                  )}
                  <button
                    type="button"
                    className="button-large button-primary"
                    onClick={() => { selectPracticeWord(wordOfTheDay); handleNav('practice'); }}
                  >
                    <FiTarget aria-hidden="true" />
                    {hasPracticedWordOfTheDay ? 'Try for 100%' : 'Start Word of the Day'}
                  </button>
                </div>
              </article>
            )}

            <section className="detail-block">
              <div className="detail-block-title">Continue Learning</div>
              {nextLesson ? (
                <div className="continue-learning-card">
                  <p className="continue-learning-title">{nextLesson.title}</p>
                  <p className="continue-learning-copy">{nextLesson.description || nextLesson.category || 'Continue your assigned lesson.'}</p>
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${completionPercent}%` }} />
                  </div>
                  <button className="button-large button-primary" type="button" onClick={openNextLesson}>
                    Continue {nextLesson.title}
                  </button>
                </div>
              ) : (
                <div className="empty-state-card">
                  <p>No reading path is available yet.</p>
                  <p>Ask your teacher to assign your first lesson so progress appears here.</p>
                </div>
              )}
            </section>

            <section className="detail-block">
              <div className="detail-block-title">Today's progress</div>
              <div className="home-summary-grid">
                <article className="stat-card">
                  <p className="stat-title">Lessons completed</p>
                  <p className="stat-value">{activitiesCompleted}</p>
                </article>
                <article className="stat-card">
                  <p className="stat-title">Total XP</p>
                  <p className="stat-value">{xp}</p>
                </article>
                <article className="stat-card">
                  <p className="stat-title">Streak</p>
                  <p className="stat-value">{streakDays} days</p>
                  <p className="stat-note">Consecutive days using LinawLetra</p>
                </article>
                <article className="stat-card">
                  <p className="stat-title">Words mastered</p>
                  <p className="stat-value">{wordMasterySummary.mastered}</p>
                </article>
                <article className="stat-card">
                  <p className="stat-title">All-time accuracy</p>
                  <p className="stat-value">{allTimeAccuracy}%</p>
                </article>
                <article className="stat-card">
                  <p className="stat-title">Practice sessions</p>
                  <p className="stat-value">{totalAttempts}</p>
                </article>
                <article className="stat-card">
                  <p className="stat-title">Longest streak</p>
                  <p className="stat-value">{longestStreak} days</p>
                </article>
                <article className="stat-card">
                  <p className="stat-title">Today's reading goal</p>
                  <p className="stat-value">{todayGoalDone}/{DAILY_GOAL}</p>
                  <p className="stat-note">Daily reading target</p>
                </article>
                <article className="stat-card">
                  <p className="stat-title">Practice days this week</p>
                  <p className="stat-value">{weeklyPracticeDays}</p>
                </article>
              </div>
            </section>

            <section className="detail-block">
              <div className="detail-block-title">Recent reading activity</div>
              {recentReadingActivity.length > 0 ? (
                <div className="student-activity-list">
                  {recentReadingActivity.map((entry, index) => (
                    <div key={`${getActivityTitle(entry)}-${getAttemptTimestamp(entry)}-${index}`} className="student-activity-row">
                      <div>
                        <div className="student-activity-title">{getActivityTitle(entry)}</div>
                        <div className="student-activity-meta">{getAttemptDateLabel(entry)} &middot; Accuracy {getAttemptScore(entry)}%</div>
                      </div>
                      <span className={`student-activity-status ${entry.correct ? 'is-passed' : ''}`}>{entry.correct ? 'Passed' : 'Practice'}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-state-card">
                  <p>No recent reading activity yet.</p>
                </div>
              )}
            </section>

            <section className="detail-block">
              <div className="detail-block-title">Achievements</div>
              {recentAchievement ? (
                <div className="home-achievement-card">
                  <AchievementBadge achievement={recentAchievement} unlocked />
                  <div>
                    <strong>{recentAchievement.name}</strong>
                    <p>{recentAchievement.description}</p>
                  </div>
                  <button type="button" className="button-secondary button-small" onClick={() => handleNav('badges')}>
                    View all
                  </button>
                </div>
              ) : (
                <div className="empty-state-card">
                  <p>No badges yet — keep practicing to earn your first one!</p>
                </div>
              )}
            </section>
          </>
        )}
        {activeSection === 'practice' && (
          <section id="practice-section" className="detail-block practice-page">
            <div className="practice-header">
              <div>
                <div className="detail-block-title">Voice practice</div>
                <h3>Practice your reading</h3>
                <p className="practice-sub">Say the word clearly into your microphone and get instant feedback.</p>
              </div>
              <div className="practice-header-controls">
                <span className="tier-pill-large">{levelNames[practiceLevel]}</span>
                <div className="settings-block practice-level-select">
                  <label htmlFor="practiceLevel">Reading level</label>
                  <select
                    id="practiceLevel"
                    value={practiceLevel}
                    onChange={handlePracticeLevelChange}
                    disabled={!canEditPracticeLevel || practiceLevelSaving}
                  >
                    <option value="beginner">Beginner</option>
                    <option value="intermediate">Intermediate</option>
                    <option value="advanced">Advanced</option>
                  </select>
                </div>
              </div>
            </div>
            <p className="practice-level-note">
              {canEditPracticeLevel
                ? 'This level is used for practice sessions.'
                : 'Only a parent can change the reading level.'}
            </p>

            <div className="practice-hero">
              <div className="word-card">
                <div className="word-card-top">
                  <span className="word-card-kicker">Current word</span>
                  <div className="lesson-progress-inline">
                    <span>{practiceProgressCurrent} / {practiceProgressTarget}</span>
                    <div className="progress-bar progress-bar-compact">
                      <div
                        className="progress-fill"
                        style={{ width: `${practiceProgressPercent}%` }}
                      />
                    </div>
                  </div>
                </div>
                <div className="word-display">
                  <div
                    className={`practice-word ${status === 'listening' ? 'is-listening' : ''}`}
                    aria-label={visiblePracticeLabel}
                  >
                    {syllabify(visiblePracticeLabel).map((syllable, index, arr) => (
                      <span className={`practice-syllable ${index === activePracticeSyllableIndex ? 'syllable-active' : ''}`} key={`${syllable}-${index}`}>
                        {syllable}
                        {index < arr.length - 1 && <span className="syllable-divider" aria-hidden="true">&middot;</span>}
                      </span>
                    ))}
                  </div>
                  {activePracticeWord ? (
                    <>
                      {activePracticeWord.meaning && activePracticeWord.isHomograph && (
                        <p className="word-meaning">{activePracticeWord.meaning}</p>
                      )}
                      {activePracticeWord.isHomograph && (
                        <>
                          <button
                            type="button"
                            className="homograph-toggle"
                            onClick={() => setHomographPanelOpenId(
                              homographPanelOpenId === activePracticeWord.id ? null : activePracticeWord.id
                            )}
                          >
                            <span className={`homograph-toggle-chevron ${homographPanelOpenId === activePracticeWord.id ? 'is-open' : ''}`} aria-hidden="true">▸</span>
                            {' '}Ano ang ibig sabihin?
                          </button>
                          {homographPanelOpenId === activePracticeWord.id && (
                            <div className="homograph-panel">
                              {activePracticeWord.example && (
                                <p className="homograph-example">Halimbawa: "{activePracticeWord.example}"</p>
                              )}
                              <p className="homograph-note">
                                Pareho ang baybay ng salitang ito pero iba ang ibig sabihin.
                                Tingnan ang marka sa itaas ng salita para malaman kung alin
                                ang ginagamit dito.
                              </p>
                            </div>
                          )}
                        </>
                      )}
                      {activePracticeWord.meaning && !activePracticeWord.isHomograph && (
                        <>
                          <button
                            type="button"
                            className="homograph-toggle"
                            onClick={() => setHomographPanelOpenId(
                              homographPanelOpenId === activePracticeWord.id ? null : activePracticeWord.id
                            )}
                          >
                            <span className={`homograph-toggle-chevron ${homographPanelOpenId === activePracticeWord.id ? 'is-open' : ''}`} aria-hidden="true">▸</span>
                            {' '}Ano ang ibig sabihin?
                          </button>
                          {homographPanelOpenId === activePracticeWord.id && (
                            <p className="word-meaning">{activePracticeWord.meaning}</p>
                          )}
                        </>
                      )}
                    </>
                  ) : (
                    <div className="word-hint">{`${levelNames[practiceLevel]} level practice`}</div>
                  )}
                </div>
                <div className="word-actions">
                  <button
                    className={`button-large ${status === 'listening' ? 'button-danger listening-pulse' : status === 'correct' ? 'button-primary correct-highlight' : status === 'incorrect' ? 'button-danger incorrect-shake' : 'button-primary'}`}
                    onClick={handleMicClick}
                    disabled={isProcessing || !hasPracticePrompt}
                  >
                    <FiMic aria-hidden="true" />
                    {status === 'listening' ? 'Listening…' : status === 'correct' ? 'Correct!' : status === 'incorrect' ? 'Try again' : 'Say the word'}
                  </button>
                  <button
                    className="button-large button-secondary"
                    type="button"
                    onClick={() => speakTagalog(activePracticeWord ? activePracticeWord.accentedSpelling : expectedText, { trackSyllables: true })}
                    disabled={!hasPracticePrompt}
                  >
                    <FiVolume2 aria-hidden="true" /> Listen
                  </button>
                  <button className="button-large button-secondary" type="button" onClick={replayRecognizedWord}>
                    <FiRepeat aria-hidden="true" /> Replay Voice
                  </button>
                  <button
                    className="button-large button-primary"
                    type="button"
                    onClick={moveToNextPracticeWord}
                    disabled={!canAdvanceCurrentWord || isEvaluating || curriculumLoading}
                  >
                    <FiCheck aria-hidden="true" /> {curriculumLoading ? 'Loading...' : 'Next Word'}
                  </button>
                </div>
                {canAdvanceCurrentWord && accuracy < 100 && (
                  <p className="next-word-note">
                    You reached 80%. Move on now, or try this word again for 100% and more XP.
                  </p>
                )}
                {activePracticeWord?.isHomograph && (
                  <p className="tts-caveat">
                    Baka magkatunog ang dalawa kapag pinindot ang "Listen". Ang marka sa itaas
                    ng salita ang gabay mo kung alin ang tama.
                  </p>
                )}
              </div>
              <div className="feedback-panel">
                <h4>Pronunciation check</h4>
                <div className={`feedback-result ${recognitionResult}`}>
                  <div className="feedback-icon">
                    {recognitionResult === 'success' ? (
                      <FiCheckCircle aria-hidden="true" />
                    ) : recognitionResult === 'almost' ? (
                      <FiAlertTriangle aria-hidden="true" />
                    ) : recognitionResult === 'error' ? (
                      <FiX aria-hidden="true" />
                    ) : (
                      <FiMic aria-hidden="true" />
                    )}
                  </div>
                  <div className="feedback-text">
                    <p>{statusMessage || 'Press Say the word and speak the Tagalog word clearly.'}</p>
                    {accuracy !== null && (
                      <div className="accuracy-display">
                        <div className="accuracy-score">
                          <strong>Accuracy: {accuracy}%</strong>
                        </div>
                        <div className="accuracy-explanation">
                          {accuracyExplanation}
                        </div>
                      </div>
                    )}
                    <span>
                      {recognitionDistance !== null
                        ? `Distance: ${recognitionDistance}`
                        : feedback || (transcribedText ? 'Your pronunciation was evaluated.' : 'Say the word to get started.')}
                    </span>
                  </div>
                </div>
                {status === 'listening' && (
                  <div className="mic-waveform" role="status" aria-label="Listening">
                    {Array.from({ length: 7 }).map((_, index) => (
                      <span key={index} className="mic-waveform-bar" style={{ animationDelay: `${index * 0.08}s` }} />
                    ))}
                  </div>
                )}
                {isProcessing && (
                  <div className="processing-row">
                    <span className="processing-spinner" aria-hidden="true" />
                    Checking your voice...
                  </div>
                )}
              </div>
            </div>

            <div className="highlight-row">{renderWordHighlight()}</div>

            <div className="current-practice-panel">
              <h4>Current practice item</h4>
              <p>
                {activePracticeWord
                  ? `${activePracticeWord.itemType || 'word'} - ${levelNames[practiceLevel] || practiceLevel}`
                  : 'Loading your next recommended item...'}
              </p>
              {activePracticeWord?.recommendationScore != null && (
                <span className="student-activity-status">Recommendation {activePracticeWord.recommendationScore}</span>
              )}
            </div>

            <div className="practice-stats">
              <div className="metric-card">
                <FiStar className="metric-icon" aria-hidden="true" />
                <strong>{Number(xp) || 0}</strong>
                <span>XP</span>
              </div>
              <div className="metric-card">
                <FiCheck className="metric-icon" aria-hidden="true" />
                <strong>{Number(wordsCompleted) || 0}</strong>
                <span>Words completed</span>
              </div>
              <div className="metric-card">
                <FiAward className="metric-icon" aria-hidden="true" />
                <strong>{unlockedAchievementIds.length}</strong>
                <span>Achievements</span>
              </div>
              <div className="metric-card">
                <FiZap className="metric-icon" aria-hidden="true" />
                <strong>{streakDays}</strong>
                <span>Streak</span>
              </div>
            </div>
          </section>
        )}
        {activeSection === 'content' && (
          <>
            <section id="content-section" className="detail-block">
              <div className="detail-block-title">Shared lessons</div>
              <div className="top-search-box" style={{ marginBottom: 16 }}>
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search lessons, assessments..."
                />
              </div>
              <div className="practice-header" style={{ marginBottom: 16 }}>
                <div>
                  <h3>PDF Reading Assistant</h3>
                  <p className="practice-sub">Open assigned PDF stories, listen sentence by sentence, and read aloud for feedback.</p>
                </div>
                <a href="/student/learn" className="button-large button-primary" style={{ textDecoration: 'none' }}>
                  Open Learn
                </a>
              </div>
              {uploadsLoading ? (
                <p className="learning-path-text">Loading lessons...</p>
              ) : filteredLessons.length === 0 ? (
                <p className="learning-path-text">Your teacher will share lessons for your class here.</p>
              ) : (
                <div className="student-content-grid">
                  {filteredLessons.map((item) => (
                    <div key={item.id} className="content-card">
                      <div className="content-card-header">
                        <span className="content-status">{item.status || 'Not started'}</span>
                        <span className="content-type">{item.type || item.contentType || 'Lesson'}</span>
                      </div>
                      <h4>{item.title || item.fileName || 'Shared resource'}</h4>
                      <p>{item.description || item.category || item.pageSource || 'Open the file to view details.'}</p>
                      <div className="content-meta">Uploaded by {item.teacherName || 'Teacher'}</div>
                      <a href={item.fileUrl} target="_blank" rel="noreferrer" className="button-small button-secondary">
                        Open lesson
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </section>
            <section className="detail-block">
              <div className="detail-block-title">Assessments</div>
              {uploadsLoading ? (
                <p className="learning-path-text">Loading assessments...</p>
              ) : filteredAssessments.length === 0 ? (
                <p className="learning-path-text">No assessments have been shared for your class yet.</p>
              ) : (
                <div className="student-assessment-grid">
                  {filteredAssessments.map((item) => {
                    const dueDate = item.dueDate ? new Date(item.dueDate).toLocaleDateString() : 'No due date';
                    const isOverdue = item.dueDate && new Date(item.dueDate) < new Date();
                    const scoreLabel = item.score != null ? `${item.score}%` : 'Awaiting grade';
                    return (
                      <div key={item.id} className="assessment-card">
                        <div className="content-card-header">
                          <span className={`assignment-status ${isOverdue ? 'status-overdue' : 'status-pending'}`}>
                            {isOverdue ? 'Overdue' : 'Assigned'}
                          </span>
                          <span className="score-tag">{scoreLabel}</span>
                        </div>
                        <h4>{item.title || item.fileName || 'Shared assessment'}</h4>
                        <p>{item.description || item.category || item.pageSource || 'Open the file to view details.'}</p>
                        <div className="content-meta">Uploaded by {item.teacherName || 'Teacher'}</div>
                        <div className="assessment-footer">
                          <span>Due {dueDate}</span>
                          <a href={item.fileUrl} target="_blank" rel="noreferrer" className="button-small button-secondary">
                            Download
                          </a>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </>
        )}
        {activeSection === 'progress' && (
          <section id="progress-section" className="detail-block">
            <div className="detail-block-title">Progress summary</div>
            <div className="progress-metrics">
              <div className="metric-card">
                <strong>{activitiesCompleted}</strong>
                <span>Lessons completed</span>
              </div>
              <div className="metric-card">
                <strong>{streakDays}</strong>
                <span>Daily streak</span>
              </div>
              <div className="metric-card">
                <strong>{progressXp}</strong>
                <span>Total XP</span>
              </div>
              <div className="metric-card">
                <strong>{allTimeAccuracy}%</strong>
                <span>All-time accuracy</span>
              </div>
              <div className="metric-card">
                <strong>{totalAttempts}</strong>
                <span>Practice sessions</span>
              </div>
              <div className="metric-card">
                <strong>{longestStreak}</strong>
                <span>Longest streak</span>
              </div>
              <div className="metric-card">
                <strong>{todayGoalDone}/{DAILY_GOAL}</strong>
                <span>Today's reading goal</span>
              </div>
              <div className="metric-card">
                <strong>{weeklyPracticeDays}</strong>
                <span>Practice days this week</span>
              </div>
            </div>
            <div className="chart-card">
              <div className="detail-block-title">XP progress this week</div>
              <div className="progress-chart">
                {xpHistory.length > 0 ? (
                  xpHistory.map((point) => (
                    <div key={point.label} className="chart-column">
                      <div className="chart-bar" style={{ height: `${Math.max(point.value, 16)}%` }}>
                        <span className="chart-value">{point.value}</span>
                      </div>
                      <div className="chart-label">{point.label}</div>
                    </div>
                  ))
                ) : (
                  <div className="empty-chart-state">
                    <p>No progress chart is available yet.</p>
                    <p>Complete a few lessons to visualize your growth.</p>
                  </div>
                )}
              </div>
            </div>
            <div className="progress-metrics word-mastery-summary">
              <div className="metric-card">
                <strong>{wordMasterySummary.mastered}</strong>
                <span>Mastered words</span>
              </div>
              <div className="metric-card">
                <strong>{wordMasterySummary.needsPractice}</strong>
                <span>Needs practice</span>
              </div>
              <div className="metric-card">
                <strong>{wordMasterySummary.difficult}</strong>
                <span>Difficult words</span>
              </div>
            </div>
            {topConfusions.length > 0 && (
              <div className="chart-card">
                <div className="detail-block-title">Sounds to work on</div>
                <p className="confusion-hint">
                  These are the sound mix-ups that come up most often when you read aloud.
                </p>
                <div className="confusion-tag-list">
                  {topConfusions.map((pattern) => (
                    <span key={pattern.pattern_type} className="confusion-tag">
                      {pattern.pattern_type.replace(/_/g, ' ')} · {pattern.occurrence_count}x
                    </span>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}
        {activeSection === 'badges' && (
          <section id="badges-section" className="detail-block">
            <div className="detail-block-title">Badges</div>
            <div className="achievements-section">
              <h4>Mga Badge ({unlockedAchievementIds.length}/{ACHIEVEMENTS.length})</h4>
              <div className="achievement-badge-grid">
                {ACHIEVEMENTS.map((achievement) => (
                  <AchievementBadge
                    key={achievement.id}
                    achievement={achievement}
                    unlocked={unlockedAchievementIds.includes(achievement.id)}
                  />
                ))}
              </div>
            </div>
          </section>
        )}
        {activeSection === 'settings' && (
          <section id="settings-section" className="detail-block">
            <div className="detail-block-title">Settings</div>
            <div className="settings-panel">
              <div className="settings-group-title">Accessibility</div>
              <div className="settings-row">
                <label className="settings-switch">
                  <span>
                    <strong>Dyslexia-Friendly Font</strong>
                    <small>Use an easier-to-read font</small>
                  </span>
                  <input
                    type="checkbox"
                    checked={accessibilitySettings.fontFamily === 'Comic Sans'}
                    onChange={(e) => persistAccessibilitySettings({ fontFamily: e.target.checked ? 'Comic Sans' : 'DM Sans' })}
                  />
                </label>
                <div className="settings-block">
                  <label>Text Size</label>
                  <input
                    type="range"
                    min="12"
                    max="28"
                    value={accessibilitySettings.textSize}
                    onChange={(e) => persistAccessibilitySettings({ textSize: Number(e.target.value) })}
                  />
                  <div className="slider-value">{accessibilitySettings.textSize}px</div>
                </div>
              </div>
              <div className="settings-row">
                <label className="settings-switch">
                  <span>
                    <strong>High Contrast</strong>
                    <small>Increase text and panel contrast</small>
                  </span>
                  <input
                    type="checkbox"
                    checked={accessibilitySettings.highContrast}
                    onChange={(e) => persistAccessibilitySettings({ highContrast: e.target.checked })}
                  />
                </label>
                <label className="settings-switch">
                  <span>
                    <strong>Reading Guide Overlay</strong>
                    <small>Highlight text while reading</small>
                  </span>
                  <input
                    type="checkbox"
                    checked={accessibilitySettings.wordHighlighting}
                    onChange={(e) => persistAccessibilitySettings({ wordHighlighting: e.target.checked })}
                  />
                </label>
              </div>
              <div className="settings-group-title">Appearance</div>
              <div className="settings-theme-row">
                <button
                  type="button"
                  className={`settings-theme-card ${!accessibilitySettings.darkMode ? 'is-active' : ''}`}
                  onClick={() => persistAccessibilitySettings({ darkMode: false })}
                >
                  Light
                </button>
                <button
                  type="button"
                  className={`settings-theme-card ${accessibilitySettings.darkMode ? 'is-active' : ''}`}
                  onClick={() => persistAccessibilitySettings({ darkMode: true })}
                >
                  Dark
                </button>
              </div>
              <div className="preview-box">
                <p>Preview</p>
                <div className={`preview-text ${accessibilitySettings.wordHighlighting ? 'preview-highlight' : ''}`}>
                  {previewSentence.split(' ').map((word, index) => (
                    <span key={`${word}-${index}`} className="preview-word">
                      {word}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}
        {activeSection === 'profile' && (
          <section id="profile-section" className="detail-block">
            <div className="profile-header">
              <span className="profile-avatar">{studentName?.charAt(0) || 'S'}</span>
              <div>
                <h2 className="profile-name">{studentName}</h2>
                <p className="profile-meta">
                  {studentGrade}{studentRoom ? ` · ${studentRoom}` : ''}
                </p>
              </div>
            </div>
            <div className="detail-block-title">Statistics</div>
            <div className="home-summary-grid">
              <article className="stat-card">
                <p className="stat-title">Lessons completed</p>
                <p className="stat-value">{activitiesCompleted}</p>
              </article>
              <article className="stat-card">
                <p className="stat-title">Total XP</p>
                <p className="stat-value">{xp}</p>
              </article>
              <article className="stat-card">
                <p className="stat-title">Streak</p>
                <p className="stat-value">{streakDays} days</p>
              </article>
              <article className="stat-card">
                <p className="stat-title">Learning tier</p>
                <p className="stat-value">{tier}</p>
              </article>
              <article className="stat-card">
                <p className="stat-title">All-time accuracy</p>
                <p className="stat-value">{allTimeAccuracy}%</p>
              </article>
              <article className="stat-card">
                <p className="stat-title">Practice sessions</p>
                <p className="stat-value">{totalAttempts}</p>
              </article>
              <article className="stat-card">
                <p className="stat-title">Longest streak</p>
                <p className="stat-value">{longestStreak} days</p>
              </article>
              <article className="stat-card">
                <p className="stat-title">Today's reading goal</p>
                <p className="stat-value">{todayGoalDone}/{DAILY_GOAL}</p>
              </article>
            </div>
            <div className="achievements-section">
              <h4>Mga Badge ({unlockedAchievementIds.length}/{ACHIEVEMENTS.length})</h4>
              <div className="achievement-badge-grid">
                {ACHIEVEMENTS.map((achievement) => (
                  <AchievementBadge
                    key={achievement.id}
                    achievement={achievement}
                    unlocked={unlockedAchievementIds.includes(achievement.id)}
                  />
                ))}
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
    </div>
  );
};
export default StudentDashboard;
