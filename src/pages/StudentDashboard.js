import React, { useState, useEffect, useMemo, useRef, useContext } from 'react';
import { AuthContext } from '../context/AuthContext';
import { speechService, studentService, readingService, curriculumService, progressService } from '../services/api';
import { evaluateWord as evaluateWordPhonetics, syllabify } from '../utils/tagalogPhonetics';
import { useSyllableHighlight } from '../hooks/useSyllableHighlight';
import {
  FiBell,
  FiBarChart2,
  FiLogOut,
  FiStar,
  FiHome,
  FiBookOpen,
  FiCalendar,
  FiChevronLeft,
  FiChevronRight,
  FiMic,
  FiPlayCircle,
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
  FiSearch,
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
const getLessonTitle = (item = {}) => item.title || item.fileName || 'Shared resource';
const getLessonCategory = (item = {}) => item.category || item.lessonCategory || item.skill || item.type || item.contentType || 'Lessons';
const getLessonLevel = (item = {}) => item.level || item.readingLevel || item.difficulty || item.gradeLevel || 'Beginner';
const getLessonProgress = (item = {}) => {
  const raw = item.progress ?? item.progressPercentage ?? item.completionPercent ?? item.percentComplete ?? item.score;
  const value = Number(raw);
  if (Number.isFinite(value)) return Math.max(0, Math.min(100, Math.round(value)));
  const status = String(item.status || '').toLowerCase();
  return status.includes('complete') ? 100 : status.includes('progress') ? 60 : 0;
};
const getLessonStatus = (item = {}) => {
  const progressValue = getLessonProgress(item);
  const status = String(item.status || item.assignmentStatus || '').toLowerCase();
  if (status.includes('lock')) return 'Locked';
  if (status.includes('complete') || progressValue >= 100) return 'Completed';
  if (status.includes('progress') || progressValue > 0) return 'In Progress';
  return 'Not Started';
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
  // Brief, dismissible message shown only when TTS playback fails completely
  // (cloud synthesis AND the browser speechSynthesis fallback both failed) --
  // kept separate from `feedback`/`statusMessage` above, which are for the
  // Say-the-word/STT pronunciation-check flow, not TTS.
  const [ttsError, setTtsError] = useState('');
  const [studentName, setStudentName] = useState('Student');
  const [studentGrade, setStudentGrade] = useState('');
  const [studentRoom, setStudentRoom] = useState('');
  const [teacherUploads, setTeacherUploads] = useState([]);
  const [uploadsLoading, setUploadsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [learnFilter, setLearnFilter] = useState('All');
  const [libraryFilter, setLibraryFilter] = useState('All Modules');
  const [selectedLibraryLevel, setSelectedLibraryLevel] = useState('Beginner');
  const [selectedModuleNumber, setSelectedModuleNumber] = useState(null);
  const [equippedModuleNumber, setEquippedModuleNumber] = useState(null);
  const [assessmentPreview, setAssessmentPreview] = useState(null);
  const [expectedText, setExpectedText] = useState('');
  const [activePracticeWord, setActivePracticeWord] = useState(null);
  const [activeCurriculumItem, setActiveCurriculumItem] = useState(null);
  const [curriculumSummary, setCurriculumSummary] = useState(null);
  const [curriculumModulesByLevel, setCurriculumModulesByLevel] = useState({});
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
  // Bumped at the start of every speakTagalog*() call. A request only gets to
  // touch shared audio/highlight state if it's still the latest one when its
  // network call resolves -- otherwise an older, slower request finishing
  // after a newer one (rapid clicking, quick word-to-word navigation) would
  // start playing stale audio on top of what's already playing.
  const ttsRequestIdRef = useRef(0);
  const {
    activeSyllableIndex: activePracticeSyllableIndex,
    prepare: prepareSyllableHighlight,
    prepareFromTimepoints: prepareSyllableTimepoints,
    updateFromProgress: updateSyllableHighlight,
    reset: resetSyllableHighlight,
  } = useSyllableHighlight(syllabify);
  // Stops any in-flight/playing TTS audio and invalidates in-flight TTS
  // requests on navigation away from this page (or unmount for any other
  // reason) -- without this, a slow /tts or /tts-syllables call that resolves
  // after the student has already left could still start playing audio.
  useEffect(() => () => {
    ttsRequestIdRef.current += 1;
    const audio = ttsAudioRef.current;
    if (audio) {
      audio.onended = null;
      audio.onerror = null;
      audio.ontimeupdate = null;
      try { audio.pause(); } catch (e) { /* already stopped/released */ }
    }
    window.speechSynthesis?.cancel?.();
  }, []);
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
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
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
  useEffect(() => {
    if (!currentStudentId || typeof window === 'undefined') return;
    const stored = window.localStorage.getItem(`linawletra:equipped-module:${currentStudentId}`);
    if (stored) setEquippedModuleNumber(stored);
  }, [currentStudentId]);
  useEffect(() => {
    if (!currentStudentId || !equippedModuleNumber || typeof window === 'undefined') return;
    window.localStorage.setItem(`linawletra:equipped-module:${currentStudentId}`, equippedModuleNumber);
  }, [currentStudentId, equippedModuleNumber]);
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

  // Shown only when BOTH TTS layers (cloud + browser fallback) failed --
  // clears itself so it doesn't linger once the student moves on.
  const showTtsError = (message) => {
    setTtsError(message);
    setTimeout(() => setTtsError((current) => (current === message ? '' : current)), 4000);
  };

  // Stops/detaches whatever is currently in ttsAudioRef so its onended/onerror/
  // ontimeupdate handlers can never fire again -- without this, an audio
  // element superseded by a newer speakTagalog*() call could still fire a
  // late event (e.g. onended) that clobbers highlight/loading state set up
  // by the request that replaced it.
  const stopTtsAudio = () => {
    const audio = ttsAudioRef.current;
    ttsAudioRef.current = null;
    if (!audio) return;
    audio.onended = null;
    audio.onerror = null;
    audio.ontimeupdate = null;
    try { audio.pause(); } catch (e) { /* already stopped/released */ }
  };

  // Only fires the browser TTS fallback if this request is still current --
  // callers pass their captured requestId so a superseded request (e.g. the
  // student already tapped a different word) can't start narrating over
  // whatever is now playing. Surfaces a real, user-facing error only when
  // this fallback itself is unavailable/fails too, i.e. BOTH TTS layers
  // failed -- matches requirement to never fail silently, and never spam an
  // error for the common case where the fallback covers the failure fine.
  const speakTagalogFallback = (text, options = {}, requestId = ttsRequestIdRef.current) => {
    if (requestId !== ttsRequestIdRef.current) return;
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      console.error('[TTS] both cloud synthesis and browser speechSynthesis are unavailable');
      showTtsError('Unable to play the pronunciation. Please try again.');
      return;
    }
    try {
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
      utterance.onerror = (event) => {
        console.error('[TTS] browser speechSynthesis fallback failed', { error: event?.error });
        if (requestId === ttsRequestIdRef.current) {
          showTtsError('Unable to play the pronunciation. Please try again.');
        }
      };
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    } catch (error) {
      console.error('[TTS] browser speechSynthesis fallback threw', { message: error?.message });
      showTtsError('Unable to play the pronunciation. Please try again.');
    }
  };

  // Plain (non-karaoke) cloud synthesis, used both directly (no highlighting
  // requested) and as the fallback when syllable karaoke below fails --
  // mirrors the mobile app's plain speakWordCloud path. `requestId` guards
  // against this call's async work landing after a newer request started.
  const speakTagalogPlain = async (text, requestId, options = {}) => {
    if (options.trackSyllables) prepareSyllableHighlight(text, 0);
    else resetSyllableHighlight();

    try {
      const { data } = await speechService.textToSpeech(formatForTagalogSpeech(text), {
        speed: options.speed || options.rate || 0.82,
      });
      if (requestId !== ttsRequestIdRef.current) return; // superseded while the request was in flight

      if (options.trackSyllables) prepareSyllableTimepoints(data.timepoints);
      const audio = new Audio(data.audioUrl);
      stopTtsAudio();
      ttsAudioRef.current = audio;
      if (options.trackSyllables) {
        audio.ontimeupdate = () => {
          if (requestId === ttsRequestIdRef.current) updateSyllableHighlight(audio.currentTime, audio.duration);
        };
      }
      audio.onended = () => {
        if (requestId === ttsRequestIdRef.current && options.trackSyllables) resetSyllableHighlight();
      };
      audio.onerror = () => {
        console.warn('[TTS] audio element playback error', {
          code: audio.error?.code,
          message: audio.error?.message,
        });
        if (requestId === ttsRequestIdRef.current) speakTagalogFallback(text, options, requestId);
      };
      // Browsers can reject play() for autoplay-policy reasons even after a
      // direct user click in some edge cases (e.g. a delayed setTimeout-driven
      // call, used for the "try again" replay below) -- treated the same as
      // any other playback failure: fall back rather than leaving the UI
      // stuck with a loaded-but-silent audio element.
      await audio.play();
    } catch (error) {
      console.warn('[TTS] /tts request failed', {
        status: error?.response?.status,
        message: error?.response?.data?.error || error?.message,
      });
      if (requestId === ttsRequestIdRef.current) speakTagalogFallback(text, options, requestId);
    }
  };

  // Single-word syllable karaoke, mirroring the mobile app's speakSyllablesCloud
  // (cloudTtsService.ts) -- real per-syllable Google timepoints, not an
  // estimate. `syllabify` here is the SAME function used to render the
  // syllable spans on screen (word-display below), so the syllable indices
  // the server returns always line up with what's actually on screen.
  const speakTagalogSyllables = async (text, requestId, options = {}) => {
    const syllableParts = syllabify(text);
    if (syllableParts.length < 2) {
      // Nothing meaningful to highlight for a single-syllable word -- mirrors
      // mobile's playSyllableKaraoke early-out.
      return speakTagalogPlain(text, requestId, options);
    }

    prepareSyllableHighlight(text, 0);

    try {
      const { data } = await speechService.textToSpeechSyllables(syllableParts, {
        speed: options.speed || options.rate,
      });
      if (requestId !== ttsRequestIdRef.current) return;

      prepareSyllableTimepoints(data.timepoints);
      const audio = new Audio(data.audioUrl);
      stopTtsAudio();
      ttsAudioRef.current = audio;
      audio.ontimeupdate = () => {
        if (requestId === ttsRequestIdRef.current) updateSyllableHighlight(audio.currentTime, audio.duration);
      };
      audio.onended = () => {
        if (requestId === ttsRequestIdRef.current) resetSyllableHighlight();
      };
      audio.onerror = () => {
        console.warn('[TTS] syllable karaoke audio element playback error', {
          code: audio.error?.code,
          message: audio.error?.message,
        });
        // No highlighting-capable fallback for this path (same reasoning as
        // mobile: an alternate voice carries no per-syllable timing) -- fall
        // back to plain playback so the student still hears the word.
        if (requestId === ttsRequestIdRef.current) speakTagalogPlain(text, requestId, options);
      };
      await audio.play();
    } catch (error) {
      console.warn('[TTS] /tts-syllables request failed, falling back to plain playback', {
        status: error?.response?.status,
        message: error?.response?.data?.error || error?.message,
      });
      if (requestId === ttsRequestIdRef.current) await speakTagalogPlain(text, requestId, options);
    }
  };

  const speakTagalog = async (text, options = {}) => {
    if (!text) return;

    const requestId = ++ttsRequestIdRef.current;
    setTtsError('');
    stopTtsAudio();
    window.speechSynthesis?.cancel?.();

    if (options.trackSyllables) {
      await speakTagalogSyllables(text, requestId, options);
    } else {
      await speakTagalogPlain(text, requestId, options);
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

  const loadCurriculumModules = async ({ level = selectedLibraryLevel, silent = false } = {}) => {
    if (!currentStudentId || userRole !== 'student') return [];
    if (!silent) setCurriculumLoading(true);
    try {
      const response = await curriculumService.getModules({ level: String(level).toLowerCase() });
      const payload = response?.data || response || {};
      const modules = Array.isArray(payload.modules) ? payload.modules : [];
      setCurriculumModulesByLevel((prev) => ({ ...prev, [level]: modules }));
      return modules;
    } catch (error) {
      console.warn('Curriculum modules fetch failed; using local module preview:', error.message);
      return [];
    } finally {
      if (!silent) setCurriculumLoading(false);
    }
  };

  useEffect(() => {
    if (!hasLoadedProgress || !currentStudentId || userRole !== 'student') return;
    let isMounted = true;
    loadNextCurriculumItem().then((item) => {
      if (!isMounted || item) return;
      setFeedback('No curriculum item is ready yet. Loading a recommended practice word if one is available.');
    });
    ['Beginner', 'Intermediate', 'Advanced'].forEach((level) => {
      loadCurriculumModules({ level, silent: true });
    });
    return () => {
      isMounted = false;
    };
  }, [hasLoadedProgress, currentStudentId, userRole]);

  useEffect(() => {
    if (!hasLoadedProgress || !currentStudentId || userRole !== 'student') return;
    loadCurriculumModules({ level: selectedLibraryLevel, silent: true });
  }, [hasLoadedProgress, currentStudentId, userRole, selectedLibraryLevel]);

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
        await loadCurriculumModules({ level: selectedLibraryLevel, silent: true });
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
    // Web Speech API fires `result` then `end` almost immediately after for
    // continuous=false. `end` used to unconditionally reset isProcessing and
    // status back to idle right after `result` fired the (unawaited)
    // comparePronunciation call — so the "Checking your voice..." spinner
    // disappeared and the mic button went idle instantly, while the actual
    // check (network round trip) was still running for another 1-3+ seconds
    // with nothing on screen showing that. This flag lets `end` know a
    // result (or error) already took over the processing state, so it only
    // resets to idle for the no-speech-detected case where neither fired.
    let resultHandled = false;
    recognition.onstart = () => {
      setIsListening(true);
      setStatus('listening');
      setFeedback('Listening... Say the word clearly.');
      setStatusMessage('Listening for Tagalog pronunciation.');
    };
    recognition.onresult = async (event) => {
      resultHandled = true;
      setIsListening(false);
      setStatus('idle');
      mediaRecorderRef.current?.stop();
      const spokenWord = event.results[0][0].transcript.toLowerCase().trim();
      try {
        await comparePronunciation(spokenWord);
      } finally {
        setIsProcessing(false);
      }
    };
    recognition.onerror = (event) => {
      resultHandled = true;
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
      mediaRecorderRef.current?.stop();
      if (!resultHandled) {
        setIsProcessing(false);
        setStatus('idle');
      }
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
  const searchedLessons = useMemo(
    () => sharedLessons.filter((item) => {
      const text = `${getLessonTitle(item)} ${item.description || ''} ${item.teacherName || ''} ${getLessonCategory(item)} ${getLessonLevel(item)}`.toLowerCase();
      return text.includes(searchValue);
    }),
    [searchValue, sharedLessons]
  );
  const lessonLevels = useMemo(() => {
    const values = Array.from(new Set(sharedLessons.map((item) => getLessonLevel(item)).filter(Boolean)));
    return ['All', ...values, 'Completed'];
  }, [sharedLessons]);
  const filteredLessons = useMemo(
    () => searchedLessons.filter((item) => {
      if (learnFilter === 'All') return true;
      if (learnFilter === 'Completed') return getLessonStatus(item) === 'Completed';
      return getLessonLevel(item) === learnFilter;
    }),
    [learnFilter, searchedLessons]
  );
  const filteredAssessments = useMemo(
    () => assessments.filter((item) => {
      const text = `${item.title} ${item.description} ${item.teacherName}`.toLowerCase();
      return text.includes(searchValue);
    }),
    [searchValue, assessments]
  );
  const lessonsGoal = progress.totalLessons || 7;
  const completionPercent = Math.min(100, Math.round((Number(progress.completed || 0) / Number(lessonsGoal || 1)) * 100));
  const nextLesson = filteredLessons[0] || null;
  const recommendedLesson = sharedLessons.find((item) => getLessonStatus(item) !== 'Completed') || sharedLessons[0] || null;
  const completedLessonCount = sharedLessons.filter((item) => getLessonStatus(item) === 'Completed').length;
  const lessonCompletionPercent = sharedLessons.length > 0
    ? Math.round((completedLessonCount / sharedLessons.length) * 100)
    : completionPercent;
  const learningCategories = useMemo(() => {
    const grouped = new Map();
    sharedLessons.forEach((item) => {
      const category = getLessonCategory(item);
      const current = grouped.get(category) || { name: category, total: 0, completed: 0, inProgress: 0, sample: item };
      current.total += 1;
      if (getLessonStatus(item) === 'Completed') current.completed += 1;
      if (getLessonStatus(item) === 'In Progress') current.inProgress += 1;
      if (!current.sample?.fileUrl && item.fileUrl) current.sample = item;
      grouped.set(category, current);
    });
    return Array.from(grouped.values());
  }, [sharedLessons]);
  const recentLessons = useMemo(
    () => [...sharedLessons]
      .filter((item) => getLessonStatus(item) === 'Completed' || item.updatedAt || item.createdAt || item.uploadedAt || item.created_at)
      .sort((a, b) => {
        const aTime = new Date(a.updatedAt || a.createdAt || a.uploadedAt || a.created_at || 0).getTime();
        const bTime = new Date(b.updatedAt || b.createdAt || b.uploadedAt || b.created_at || 0).getTime();
        return (Number.isFinite(bTime) ? bTime : 0) - (Number.isFinite(aTime) ? aTime : 0);
      })
      .slice(0, 4),
    [sharedLessons]
  );
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
  const todayGoalPercent = Math.min(100, Math.round((todayGoalDone / Math.max(DAILY_GOAL, 1)) * 100));
  const todayGoalRemaining = Math.max(DAILY_GOAL - todayGoalDone, 0);
  const learnGoalDone = todayGoalDone;
  const learnGoalTarget = DAILY_GOAL;
  const learnGoalPercent = todayGoalPercent;
  const firstName = studentName?.split(' ')[0] || 'Student';
  const wordsPracticed = Number(wordsCompleted || completedWords.length || wordMasterySummary.mastered || 0);
  const weeklyPracticeDays = countWeeklyPracticeDays(history, dateTime);
  const weeklyActivity = useMemo(() => {
    const start = new Date(dateTime);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - start.getDay() + 1);
    const days = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return {
        key: date.toISOString().slice(0, 10),
        label: new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(date).slice(0, 3),
        value: 0,
      };
    });
    history.forEach((entry) => {
      const raw = getAttemptTimestamp(entry);
      const time = typeof raw === 'number' ? raw : new Date(raw).getTime();
      if (!Number.isFinite(time)) return;
      const key = new Date(time).toISOString().slice(0, 10);
      const day = days.find((item) => item.key === key);
      if (day) day.value += 1;
    });
    return days;
  }, [dateTime, history]);
  const weeklyMaxActivity = Math.max(1, ...weeklyActivity.map((day) => day.value));
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
  const moduleDefinitionsByLevel = {
    Beginner: [
      { number: 1, title: 'Mga Patinig', subtitle: 'A, E, I, O, U', type: 'Phonetics', accent: 'violet', items: ['A', 'E', 'I', 'O', 'U'] },
      { number: 2, title: 'Ba-Be-Bi-Bo-Bu', subtitle: 'Unang hanay ng pantig', type: 'Phonetics', accent: 'green', items: ['Ba', 'Be', 'Bi', 'Bo', 'Bu'] },
      { number: 3, title: 'Ka-Ke-Ki-Ko-Ku', subtitle: 'Ikalawang hanay ng pantig', type: 'Phonetics', accent: 'sun', items: ['Ka', 'Ke', 'Ki', 'Ko', 'Ku'] },
      { number: 4, title: 'Da-De-Di-Do-Du', subtitle: 'Ikatlong hanay ng pantig', type: 'Phonetics', accent: 'blue', items: ['Da', 'De', 'Di', 'Do', 'Du'] },
      { number: 5, title: 'Bumuo ng mga Salita', subtitle: 'Ba-Ka, Ku-Ko, Bu-Ko, A-Ko', type: 'Words', accent: 'coral', items: ['Ba-Ka', 'Ku-Ko', 'Bu-Ko', 'A-Ko'] },
    ],
    Intermediate: [
      { number: 1, title: 'Words to Phrases', subtitle: 'Workbook content mapping needed', type: 'Phrases', accent: 'violet', items: [], needsContent: true },
      { number: 2, title: 'Simple Phrases', subtitle: 'Workbook content mapping needed', type: 'Phrases', accent: 'green', items: [], needsContent: true },
      { number: 3, title: 'Short Phrases', subtitle: 'Workbook content mapping needed', type: 'Phrases', accent: 'sun', items: [], needsContent: true },
      { number: 4, title: 'Phrase Practice', subtitle: 'Workbook content mapping needed', type: 'Phrases', accent: 'blue', items: [], needsContent: true },
      { number: 5, title: 'Phrase Assessment', subtitle: 'Assessment content needed', type: 'Assessment', accent: 'coral', items: [], needsContent: true },
    ],
    Advanced: [
      { number: 1, title: 'Phrase Reading', subtitle: 'Story content pending', type: 'Phrases', accent: 'violet', items: [], needsContent: true },
      { number: 2, title: 'Connecting Phrases', subtitle: 'Story content pending', type: 'Phrases', accent: 'green', items: [], needsContent: true },
      { number: 3, title: 'Story Preparation', subtitle: 'Story content pending', type: 'Sentences', accent: 'sun', items: [], needsContent: true },
      { number: 4, title: 'Short Story Reading', subtitle: 'Client story content pending', type: 'Story', accent: 'blue', items: [], needsContent: true },
      { number: 5, title: 'Story Assessment', subtitle: 'Assessment content needed', type: 'Assessment', accent: 'coral', items: [], needsContent: true },
    ],
  };
  const moduleProgressDriver = Math.max(
    lessonCompletionPercent,
    curriculumProgressTotals.required > 0
      ? Math.round((curriculumProgressTotals.passed / Math.max(curriculumProgressTotals.required, 1)) * 100)
      : 0
  );
  const activeReadingLevelLabel = levelNames[practiceLevel] || 'Beginner';
  const levelOrder = ['Beginner', 'Intermediate', 'Advanced'];
  const activeLevelIndex = levelOrder.indexOf(activeReadingLevelLabel);
  const normalizeServerModule = (module) => ({
    ...module,
    level: module.level || levelNames[module.readingLevel] || selectedLibraryLevel,
    number: module.number || module.moduleNumber,
    subtitle: module.description || module.subtitle || '',
    type: module.type || ({
      phonetic: 'Phonetics',
      word: 'Words',
      phrase: 'Phrases',
      sentence: 'Sentences',
      paragraph: 'Reading',
    }[module.contentType] || module.contentType),
    accent: module.accent || 'violet',
    progress: Number(module.progress || 0),
    status: ({
      unlocked: 'available',
      in_progress: 'in-progress',
      assessment_ready: 'assessment-ready',
      completed: 'completed',
      locked: 'locked',
    }[module.status] || module.status || 'available'),
    helper: module.helper || 'Ready to start',
    items: (module.items || []).map((item) => ({
      ...item,
      label: item.displayText || item.syllableHyphenation || item.content || String(item),
      practiceText: item.content || item.displayText || String(item),
      curriculumItemId: item.id || item.curriculumItemId,
      itemType: item.itemType || module.contentType || 'word',
      passed: Boolean(item.passed),
    })),
  });
  const getLevelProgressDriver = (level) => {
    const levelIndex = levelOrder.indexOf(level);
    if (activeLevelIndex > levelIndex) return 100;
    if (activeLevelIndex === levelIndex) return moduleProgressDriver;
    return 0;
  };
  const buildModuleRoadmapForLevel = (level) => {
    const serverModules = curriculumModulesByLevel[level];
    if (Array.isArray(serverModules) && serverModules.length > 0) {
      return serverModules.map(normalizeServerModule);
    }

    const levelProgressDriver = getLevelProgressDriver(level);
    return (moduleDefinitionsByLevel[level] || moduleDefinitionsByLevel.Beginner).map((module, index) => {
      const segmentStart = index * 20;
      const segmentProgress = Math.max(0, Math.min(100, Math.round(((levelProgressDriver - segmentStart) / 20) * 100)));
      const status = segmentProgress >= 100
        ? 'completed'
        : segmentProgress > 0
          ? 'in-progress'
          : index === 0 || levelProgressDriver >= segmentStart
            ? 'available'
            : 'locked';
      return {
        ...module,
        level,
        items: module.items.map((item) => ({
          label: item,
          practiceText: item,
          curriculumItemId: null,
          itemType: module.type === 'Words' ? 'word' : 'phonetic',
          passed: false,
        })),
        progress: segmentProgress,
        status,
        helper: status === 'locked' ? `Complete Module ${module.number - 1} first` : status === 'completed' ? 'Completed' : status === 'in-progress' ? `${segmentProgress}% complete` : 'Ready to start',
      };
    });
  };
  const moduleRoadmap = buildModuleRoadmapForLevel(selectedLibraryLevel);
  const activeLevelRoadmap = buildModuleRoadmapForLevel(activeReadingLevelLabel);
  const activeCurrentModule = activeLevelRoadmap.find((module) => module.status === 'in-progress')
    || activeLevelRoadmap.find((module) => module.status === 'assessment-ready')
    || activeLevelRoadmap.find((module) => module.status === 'available')
    || activeLevelRoadmap[activeLevelRoadmap.length - 1];
  const currentModule = moduleRoadmap.find((module) => module.status === 'in-progress')
    || moduleRoadmap.find((module) => module.status === 'assessment-ready')
    || moduleRoadmap.find((module) => module.status === 'available')
    || moduleRoadmap[moduleRoadmap.length - 1];
  const completedModules = moduleRoadmap.filter((module) => module.status === 'completed');
  const allCompletedModules = levelOrder.flatMap((level) => buildModuleRoadmapForLevel(level).filter((module) => module.status === 'completed'));
  const equippedModule = allCompletedModules.find((module) => `${module.level}-${module.number}` === equippedModuleNumber)
    || allCompletedModules[allCompletedModules.length - 1]
    || null;
  const selectedModule = moduleRoadmap.find((module) => module.number === selectedModuleNumber && module.status !== 'locked')
    || currentModule;
  const filteredModuleRoadmap = moduleRoadmap.filter((module) => {
    if (libraryFilter === 'Phonetics') return module.type === 'Phonetics';
    if (libraryFilter === 'Words') return module.type === 'Words';
    if (libraryFilter === 'Phrases') return module.type === 'Phrases';
    if (libraryFilter === 'Reading') return ['Sentences', 'Reading'].includes(module.type);
    if (libraryFilter === 'Assessments') return module.status === 'assessment-ready' || module.number === moduleRoadmap.length;
    return true;
  });
  const selectedModuleCompletedItems = Math.min(
    selectedModule.items.length,
    Math.round((selectedModule.progress / 100) * selectedModule.items.length)
  );
  const selectedLevelComplete = moduleRoadmap.length > 0 && completedModules.length === moduleRoadmap.length;
  const beginnerModulesComplete = buildModuleRoadmapForLevel('Beginner').every((module) => module.status === 'completed');
  const openAssessmentPreview = async (module) => {
    if (!module || module.items.length === 0) return;
    setCurriculumLoading(true);
    try {
      const response = module.id
        ? await curriculumService.submitModuleAssessment(module.id)
        : null;
      const payload = response?.data || response || {};
      if (Array.isArray(payload.modules)) {
        setCurriculumModulesByLevel((prev) => ({ ...prev, [selectedLibraryLevel]: payload.modules }));
      }
      const assessment = payload.assessment || {};
      const score = Number(assessment.score ?? (module.progress >= 100 ? 92 : Math.max(45, Math.min(88, module.progress + 12))));
      setAssessmentPreview({
        moduleNumber: module.number,
        title: module.title,
        score,
        passed: Boolean(assessment.passed ?? score >= 80),
        items: (assessment.items || module.items.map((item) => item.label || item.practiceText)).slice(0, 12),
      });
    } catch (error) {
      console.error('Failed to submit module assessment:', error);
      setAssessmentPreview({
        moduleNumber: module.number,
        title: module.title,
        score: 0,
        passed: false,
        items: module.items.map((item) => item.label || item.practiceText).slice(0, 12),
      });
    } finally {
      setCurriculumLoading(false);
    }
  };
  const todayActivity = useMemo(() => {
    const todayKey = dateTime.toISOString().slice(0, 10);
    const entries = history
      .filter((entry) => {
        const raw = getAttemptTimestamp(entry);
        const time = typeof raw === 'number' ? raw : new Date(raw).getTime();
        return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === todayKey;
      })
      .slice(-3)
      .reverse()
      .map((entry, index) => ({
        id: `${getActivityTitle(entry)}-${getAttemptTimestamp(entry)}-${index}`,
        icon: entry.correct ? <FiCheckCircle aria-hidden="true" /> : <FiMic aria-hidden="true" />,
        label: getActivityTitle(entry),
        detail: `Accuracy ${getAttemptScore(entry)}%`,
      }));
    if (wordOfDayCompletedDate === todayKey) {
      entries.unshift({
        id: 'word-of-day',
        icon: <FiTarget aria-hidden="true" />,
        label: 'Word of the Day completed',
        detail: 'Great daily practice',
      });
    }
    if (streakDays > 0) {
      entries.push({
        id: 'streak',
        icon: <FiZap aria-hidden="true" />,
        label: `${streakDays} day streak`,
        detail: 'Keep it going',
      });
    }
    return entries.slice(0, 4);
  }, [dateTime, history, streakDays, wordOfDayCompletedDate]);
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
  const startModulePractice = (module, item) => {
    if (!module || !item) return;
    const practiceText = item.practiceText || item.content || item.label || String(item);
    selectPracticeWord({
      id: item.curriculumItemId || `module-${module.number}-${practiceText}`,
      word: practiceText,
      accentedSpelling: item.label || practiceText,
      meaning: module.type === 'Words'
        ? item.kind === 'syllable_practice'
          ? 'Syllable practice from your current module.'
          : item.definition || 'Practice word from your current module.'
        : module.type === 'Phrases'
          ? 'Practice phrase from your current module.'
          : ['Sentences', 'Reading'].includes(module.type)
            ? 'Reading practice from your current module.'
            : 'Practice sound from your current phonetics module.',
      example: null,
      isHomograph: false,
      homographGroup: null,
      difficulty: practiceLevel,
      itemType: item.itemType || (module.type === 'Words' ? 'word' : 'phonetic'),
      moduleNumber: module.number,
      moduleId: module.id,
      curriculumItemId: item.curriculumItemId,
    });
    handleNav('practice');
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
    <div className={`student-shell ${isSidebarCollapsed ? 'student-shell--nav-collapsed' : ''}`}>
      <header className="student-topbar">
        <button type="button" className="student-topbar-brand" onClick={() => handleNav('home')} aria-label="Go to dashboard">
          <img src="/logo.png" alt="LinawLetra logo" />
          <span>LinawLetra</span>
        </button>
        <nav className="student-topbar-nav" aria-label="Student dashboard">
          {[
            { key: 'home', label: 'Dashboard', icon: <FiHome aria-hidden="true" /> },
            { key: 'practice', label: 'Practice', icon: <FiMic aria-hidden="true" /> },
            { key: 'content', label: 'Library + Badges', icon: <FiBookOpen aria-hidden="true" /> },
            { key: 'progress', label: 'Activity', icon: <FiTrendingUp aria-hidden="true" /> },
            { key: 'profile', label: 'Profile', icon: <FiUser aria-hidden="true" /> },
          ].map((item) => (
            <button
              key={item.key}
              type="button"
              className={`student-topbar-link ${activeSection === item.key || (item.key === 'content' && activeSection === 'badges') ? 'active' : ''}`}
              onClick={() => handleNav(item.key)}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="student-topbar-actions">
          <button type="button" className="student-topbar-streak" onClick={() => handleNav('progress')}>
            {streakDays} araw na sunod-sunod! <FiZap aria-hidden="true" />
          </button>
          <button type="button" className="student-topbar-avatar" onClick={() => handleNav('profile')} aria-label="Open profile">
            <span>{firstName.charAt(0)}</span>
            {equippedModule && <small>M{equippedModule.number}</small>}
          </button>
          <button type="button" className="student-topbar-logout" onClick={handleLogout} aria-label="Logout">
            <FiLogOut aria-hidden="true" />
          </button>
        </div>
      </header>
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
        {assessmentPreview && (
          <div className="student-assessment-preview" role="dialog" aria-modal="true" aria-labelledby="student-assessment-preview-title">
            <div className="student-assessment-preview-card">
              <button
                type="button"
                className="student-assessment-close"
                onClick={() => setAssessmentPreview(null)}
                aria-label="Close assessment result"
              >
                <FiX aria-hidden="true" />
              </button>
              <div className={`student-assessment-medal ${assessmentPreview.passed ? 'is-passed' : 'is-practice'}`}>
                {assessmentPreview.passed ? <FiAward aria-hidden="true" /> : <FiRepeat aria-hidden="true" />}
              </div>
              <span className="student-library-kicker">Module {assessmentPreview.moduleNumber} Assessment</span>
              <h3 id="student-assessment-preview-title">
                {assessmentPreview.passed ? 'Module Complete!' : 'Almost there!'}
              </h3>
              <p>
                {assessmentPreview.passed
                  ? 'Great work. This module has been completed and the next module can unlock.'
                  : "Let's practice a little more before unlocking the next module."}
              </p>
              <div className="student-assessment-score">
                <strong>{assessmentPreview.score}%</strong>
                <span>Preview score</span>
              </div>
              <div className="student-assessment-items">
                {assessmentPreview.items.map((item) => <span key={item}>{item}</span>)}
              </div>
              <div className="student-assessment-actions">
                <button
                  type="button"
                  className="button-large button-primary"
                  onClick={() => {
                    const previewModule = moduleRoadmap.find((module) => module.number === assessmentPreview.moduleNumber) || selectedModule;
                    setAssessmentPreview(null);
                    startModulePractice(previewModule, previewModule.items[0]);
                  }}
                >
                  {assessmentPreview.passed ? 'Review Module' : 'Practice Again'} <FiChevronRight aria-hidden="true" />
                </button>
                {assessmentPreview.passed && (
                  <button
                    type="button"
                    className="button-large button-secondary"
                    onClick={() => {
                      const nextModule = moduleRoadmap.find((module) => module.number === assessmentPreview.moduleNumber + 1 && module.status !== 'locked');
                      setAssessmentPreview(null);
                      if (nextModule) setSelectedModuleNumber(nextModule.number);
                    }}
                  >
                    Continue Roadmap
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
        {activeSection !== 'home' && (
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
        )}
        {activeSection === 'home' && (
          <section className="student-home-redesign">
            <div className="home-greeting">
              <div>
                <span className="student-home-eyebrow">{timeGreeting}</span>
                <h2>Good Day, {firstName}</h2>
                <p>Ready to practice reading today?</p>
              </div>
              <div className="student-home-header-actions">
                <button type="button" className="student-home-icon-button" onClick={() => handleNav('settings')} aria-label="Open settings">
                  <FiBell aria-hidden="true" />
                </button>
                <span className="student-home-avatar" aria-hidden="true">{firstName.charAt(0)}</span>
                <span className="student-home-date"><FiCalendar aria-hidden="true" /> {formattedDate}</span>
              </div>
            </div>

            <section className="student-home-hero-card">
              <div className="student-home-hero-copy">
                <span className="student-home-hero-kicker">LinawLetra reading path</span>
                <h3>Keep Learning, {firstName}!</h3>
                <p>Every word you practice brings you one step closer to becoming a stronger reader.</p>
                <button type="button" className="button-large button-primary student-home-hero-button" onClick={nextLesson ? openNextLesson : () => handleNav('content')}>
                  Continue Learning <FiChevronRight aria-hidden="true" />
                </button>
              </div>
              <div className="student-home-progress-ring" style={{ '--progress': `${completionPercent}%` }}>
                <div>
                  <strong>{completionPercent}%</strong>
                  <span>Reading Progress</span>
                </div>
              </div>
              <div className="student-home-hero-art" aria-hidden="true">
                <FiBookOpen />
              </div>
              <img className="student-home-hero-image" src="/bg.png" alt="" aria-hidden="true" />
            </section>

            <div className="student-home-stats-grid">
              <article className="student-home-stat-card accent-blue">
                <span className="student-home-stat-icon"><FiBookOpen aria-hidden="true" /></span>
                <div>
                  <p>Lessons Completed</p>
                  <strong>{activitiesCompleted} / {lessonsGoal}</strong>
                  <small>{completionPercent}% complete</small>
                </div>
              </article>
              <article className="student-home-stat-card accent-green">
                <span className="student-home-stat-icon"><FiMic aria-hidden="true" /></span>
                <div>
                  <p>Practice Sessions</p>
                  <strong>{totalAttempts}</strong>
                  <small>{weeklyPracticeDays} practice days this week</small>
                </div>
              </article>
              <article className="student-home-stat-card accent-yellow">
                <span className="student-home-stat-icon"><FiStar aria-hidden="true" /></span>
                <div>
                  <p>Words Practiced</p>
                  <strong>{wordsPracticed}</strong>
                  <small>{wordMasterySummary.mastered} mastered</small>
                </div>
              </article>
              <article className="student-home-stat-card accent-coral">
                <span className="student-home-stat-icon"><FiZap aria-hidden="true" /></span>
                <div>
                  <p>Reading Streak</p>
                  <strong>{streakDays} Days</strong>
                  <small>{longestStreak} days longest</small>
                </div>
              </article>
            </div>

            <div className="student-home-layout-grid">
              <div className="student-home-main-column">
                <section className="student-home-card student-home-goal-card">
                  <div className="student-home-card-heading">
                    <span className="student-home-card-icon"><FiTarget aria-hidden="true" /></span>
                    <div>
                      <h3>Today's Reading Goal</h3>
                      <p>Keep up your reading practice</p>
                    </div>
                  </div>
                  <div className="student-home-goal-value">
                    <strong>{todayGoalDone}/{DAILY_GOAL}</strong>
                    <span>Words</span>
                  </div>
                  <div className="progress-bar student-home-progress-bar">
                    <div className="progress-fill" style={{ width: `${todayGoalPercent}%` }} />
                  </div>
                  <div className="student-home-goal-meta">
                    <span>{todayGoalPercent}% Complete</span>
                    <span>{todayGoalRemaining} more {todayGoalRemaining === 1 ? 'word' : 'words'} to reach your goal</span>
                  </div>
                  <button type="button" className="button-large button-primary student-home-full-button" onClick={() => handleNav('practice')}>
                    Practice Now <FiChevronRight aria-hidden="true" />
                  </button>
                </section>

                <section className="student-home-card student-home-learning-card">
                  <div className="student-home-card-heading">
                    <span className="student-home-card-icon"><FiBookOpen aria-hidden="true" /></span>
                    <div>
                      <h3>Continue Learning</h3>
                      <p>{nextLesson ? nextLesson.title : 'No reading path is available yet.'}</p>
                    </div>
                  </div>
                  {nextLesson ? (
                    <>
                      <p className="student-home-muted">{nextLesson.description || nextLesson.category || 'Continue your assigned lesson.'}</p>
                      <div className="progress-bar student-home-progress-bar">
                        <div className="progress-fill" style={{ width: `${completionPercent}%` }} />
                      </div>
                      <button className="button-secondary button-small" type="button" onClick={openNextLesson}>
                        Continue <FiChevronRight aria-hidden="true" />
                      </button>
                    </>
                  ) : (
                    <p className="student-home-muted">Ask your teacher to assign your first lesson so progress appears here.</p>
                  )}
                </section>

                <section className="student-home-card student-home-module-card">
                  <div className="student-home-card-heading">
                    <span className="student-home-card-icon"><FiAward aria-hidden="true" /></span>
                    <div>
                      <h3>Current Module</h3>
                      <p>{activeReadingLevelLabel} Module {activeCurrentModule.number}</p>
                    </div>
                  </div>
                  <strong>{activeCurrentModule.title}</strong>
                  <p className="student-home-muted">{activeCurrentModule.subtitle}</p>
                  <div className="student-library-progress-row">
                    <div className="progress-bar student-home-progress-bar">
                      <div className="progress-fill" style={{ width: `${Math.max(4, activeCurrentModule.progress)}%` }} />
                    </div>
                    <strong>{activeCurrentModule.progress}%</strong>
                  </div>
                  <button
                    type="button"
                    className="button-secondary button-small"
                    onClick={() => {
                      setSelectedLibraryLevel(activeReadingLevelLabel);
                      setSelectedModuleNumber(activeCurrentModule.number);
                      handleNav('content');
                    }}
                  >
                    Open Library <FiChevronRight aria-hidden="true" />
                  </button>
                </section>

                <div className="student-home-action-grid">
                  <section className="student-home-card student-home-practice-card">
                    <span className="student-home-large-icon"><FiMic aria-hidden="true" /></span>
                    <h3>Quick Practice</h3>
                    <p>Practice your reading and pronunciation.</p>
                    <button type="button" className="button-large button-primary" onClick={() => handleNav('practice')}>
                      Start Practice <FiPlayCircle aria-hidden="true" />
                    </button>
                  </section>

                  {wordOfTheDay && (
                    <section className="student-home-card student-home-word-card">
                      <span className="student-home-card-icon"><FiVolume2 aria-hidden="true" /></span>
                      <h3>Salita Ngayon</h3>
                      <strong className={hasPracticedWordOfTheDay ? '' : 'is-hidden'}>
                        {hasPracticedWordOfTheDay ? wordOfTheDay.accentedSpelling : '---'}
                      </strong>
                      <p>{hasPracticedWordOfTheDay ? wordOfTheDay.meaning : "Practice today's hidden word to reveal it."}</p>
                      <button
                        type="button"
                        className="button-secondary button-small"
                        onClick={() => { selectPracticeWord(wordOfTheDay); handleNav('practice'); }}
                      >
                        {hasPracticedWordOfTheDay ? 'Try Again' : 'Start'} <FiChevronRight aria-hidden="true" />
                      </button>
                    </section>
                  )}
                </div>
              </div>

              <aside className="student-home-side-column">
                <section className="student-home-card student-home-weekly-card">
                  <div className="student-home-card-heading">
                    <span className="student-home-card-icon"><FiBarChart2 aria-hidden="true" /></span>
                    <div>
                      <h3>Weekly Progress</h3>
                      <p>{weeklyPracticeDays} active {weeklyPracticeDays === 1 ? 'day' : 'days'} this week</p>
                    </div>
                  </div>
                  <div className="student-home-weekly-bars">
                    {weeklyActivity.map((day) => (
                      <div key={day.key} className="student-home-weekly-day">
                        <span className="student-home-weekly-bar">
                          <span style={{ height: `${Math.max(8, (day.value / weeklyMaxActivity) * 100)}%` }} />
                        </span>
                        <small>{day.label}</small>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="student-home-card student-home-achievement-card">
                  <div className="student-home-card-heading">
                    <span className="student-home-card-icon"><FiAward aria-hidden="true" /></span>
                    <div>
                      <h3>Recent Achievement</h3>
                      <p>{recentAchievement ? 'New badge unlocked' : 'Keep practicing'}</p>
                    </div>
                  </div>
                  {recentAchievement ? (
                    <div className="student-home-achievement-body">
                      <AchievementBadge achievement={recentAchievement} unlocked />
                      <div>
                        <strong>{recentAchievement.name}</strong>
                        <p>{recentAchievement.description}</p>
                      </div>
                    </div>
                  ) : (
                    <p className="student-home-muted">Keep practicing to unlock your first badge!</p>
                  )}
                  <button type="button" className="button-secondary button-small" onClick={() => handleNav('badges')}>
                    View Badges <FiChevronRight aria-hidden="true" />
                  </button>
                </section>

                <section className="student-home-card student-home-today-card">
                  <div className="student-home-card-heading">
                    <span className="student-home-card-icon"><FiCalendar aria-hidden="true" /></span>
                    <div>
                      <h3>Today</h3>
                      <p>{formattedTime}</p>
                    </div>
                  </div>
                  {todayActivity.length > 0 ? (
                    <div className="student-home-today-list">
                      {todayActivity.map((item) => (
                        <div key={item.id} className="student-home-today-item">
                          <span>{item.icon}</span>
                          <div>
                            <strong>{item.label}</strong>
                            <small>{item.detail}</small>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="student-home-muted">No activity yet today. Start practicing!</p>
                  )}
                </section>

                <section className="student-home-card student-home-motivation-card">
                  <span className="student-home-card-icon"><FiStar aria-hidden="true" /></span>
                  <h3>You're Doing Great!</h3>
                  <p>Every little bit helps you become a stronger reader.</p>
                </section>
              </aside>
            </div>

            <section className="detail-block student-home-legacy-achievements">
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
          </section>
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
                {ttsError && <p className="tts-error-note" role="alert">{ttsError}</p>}
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
          <section id="content-section" className="student-library-redesign">
            <header className="student-library-hero">
              <div className="student-library-hero-icon" aria-hidden="true">
                <FiBookOpen />
              </div>
              <div>
                <h2>My Library</h2>
                <p>Great job, {firstName}! You're currently learning Module {currentModule.number}.</p>
              </div>
              <div className="student-library-hero-art" aria-hidden="true">
                <span>A</span>
                <span>B</span>
                <span>C</span>
                <FiBookOpen />
              </div>
            </header>

            <div className="student-library-layout">
              <div className="student-library-main">
                <section className="student-library-panel student-library-toolbar">
                  <div className="student-library-tabs" aria-label="Library filters">
                    {['All Modules', 'Phonetics', 'Words', 'Phrases', 'Reading', 'Assessments'].map((filter) => (
                      <button
                        key={filter}
                        type="button"
                        className={libraryFilter === filter ? 'active' : ''}
                        onClick={() => {
                          setLibraryFilter(filter);
                          const firstMatchingModule = moduleRoadmap.find((module) => {
                            if (module.status === 'locked') return false;
                            if (filter === 'Phonetics') return module.type === 'Phonetics';
                            if (filter === 'Words') return module.type === 'Words';
                            if (filter === 'Phrases') return module.type === 'Phrases';
                            if (filter === 'Reading') return ['Sentences', 'Reading'].includes(module.type);
                            if (filter === 'Assessments') return module.status === 'assessment-ready' || module.number === moduleRoadmap.length;
                            return true;
                          });
                          if (firstMatchingModule) setSelectedModuleNumber(firstMatchingModule.number);
                        }}
                      >
                        <FiBookOpen aria-hidden="true" />
                        {filter}
                      </button>
                    ))}
                  </div>
                  <label className="student-library-search">
                    <FiSearch aria-hidden="true" />
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Search lessons..."
                    />
                  </label>
                </section>

                <section className="student-level-switcher" aria-label="Reading level modules">
                  {levelOrder.map((level) => {
                    const index = levelOrder.indexOf(level);
                    const targetRoadmap = buildModuleRoadmapForLevel(level);
                    const hasServerModules = Array.isArray(curriculumModulesByLevel[level]) && curriculumModulesByLevel[level].length > 0;
                    const locked = hasServerModules
                      ? targetRoadmap.length > 0 && targetRoadmap.every((module) => module.status === 'locked')
                      : index > activeLevelIndex + (beginnerModulesComplete ? 1 : 0);
                    return (
                      <button
                        key={level}
                        type="button"
                        className={selectedLibraryLevel === level ? 'active' : ''}
                        disabled={locked}
                        onClick={() => {
                          setSelectedLibraryLevel(level);
                          setSelectedModuleNumber(null);
                          setLibraryFilter('All Modules');
                        }}
                      >
                        {locked ? <FiLock aria-hidden="true" /> : <FiBookOpen aria-hidden="true" />}
                        <span>{level}</span>
                      </button>
                    );
                  })}
                </section>

                <section className="student-library-continue">
                  <div className={`student-module-cover accent-${currentModule.accent}`} aria-hidden="true">
                    <strong>{currentModule.type === 'Words' ? 'Ba' : String(currentModule.subtitle || currentModule.title).split(',')[0]}</strong>
                    <span>{currentModule.type}</span>
                  </div>
                  <div className="student-library-continue-copy">
                    <span className="student-library-kicker">Continue Learning</span>
                    <h3>{selectedLibraryLevel} Module {currentModule.number}: {currentModule.title}</h3>
                    <p>{currentModule.subtitle}</p>
                    <div className="student-library-progress-row">
                      <div className="progress-bar student-home-progress-bar">
                        <div className="progress-fill" style={{ width: `${Math.max(4, currentModule.progress)}%` }} />
                      </div>
                      <strong>{currentModule.progress}%</strong>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="button-large button-primary"
                    disabled={currentModule.needsContent}
                    onClick={() => {
                      const nextItemIndex = Math.min(
                        Math.round((currentModule.progress / 100) * currentModule.items.length),
                        currentModule.items.length - 1
                      );
                      startModulePractice(currentModule, currentModule.items[nextItemIndex] || currentModule.items[0]);
                    }}
                  >
                    {currentModule.needsContent ? 'Content Pending' : 'Continue Module'} <FiChevronRight aria-hidden="true" />
                  </button>
                </section>

                <section className="student-module-roadmap">
                  <div className="student-library-section-title">
                    <div>
                      <span className="student-library-kicker">{selectedLibraryLevel}</span>
                      <h3>Module Roadmap</h3>
                    </div>
                    <span>{completedModules.length}/{moduleRoadmap.length} completed</span>
                  </div>
                  {selectedLevelComplete && (
                    <div className="student-level-complete-callout">
                      <FiAward aria-hidden="true" />
                      <div>
                        <strong>{selectedLibraryLevel} Complete!</strong>
                        <span>Great work. The next path unlocks when the server requirements are met.</span>
                      </div>
                    </div>
                  )}
                  <div className="student-module-grid">
                    {filteredModuleRoadmap.map((module) => (
                      <article key={module.number} className={`student-module-card status-${module.status} accent-${module.accent} ${selectedModule.number === module.number ? 'is-selected' : ''}`}>
                        <div className="student-module-card-art" aria-hidden="true">
                          {module.status === 'completed' ? <FiCheck /> : module.status === 'locked' ? <FiLock /> : <FiBookOpen />}
                        </div>
                        <div className="student-module-card-body">
                          <span className="student-module-card-kicker">Module {module.number}</span>
                          <h4>{module.title}</h4>
                          <p>{module.subtitle}</p>
                          <span className={`student-learn-status ${module.status}`}>{module.helper}</span>
                          <div className="progress-bar student-home-progress-bar">
                            <div className="progress-fill" style={{ width: `${Math.max(4, module.progress)}%` }} />
                          </div>
                          <button
                            type="button"
                            className="student-module-open-button"
                            disabled={module.status === 'locked'}
                            onClick={() => setSelectedModuleNumber(module.number)}
                          >
                            {module.status === 'locked' ? 'Locked' : module.status === 'completed' ? 'Review' : 'Open Module'}
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>

                <section className={`student-module-detail ${libraryFilter === 'Assessments' ? 'is-assessment-focused' : ''}`}>
                  <div className="student-module-detail-header">
                    <div>
                      <span className="student-library-kicker">Module {selectedModule.number} Content</span>
                      <h3>{selectedModule.title}</h3>
                      <p>
                        {selectedModule.type === 'Words'
                          ? 'Words only. These use sounds introduced in earlier modules.'
                          : selectedModule.type === 'Phrases'
                            ? 'Phrases only. Practice each phrase clearly before the assessment.'
                            : ['Sentences', 'Reading'].includes(selectedModule.type)
                              ? 'Reading only. Practice the passage carefully before the assessment.'
                              : 'Phonetics only. Practice each sound clearly before the assessment.'}
                      </p>
                    </div>
                    <span className={`student-learn-status ${selectedModule.status}`}>{selectedModule.helper}</span>
                  </div>
                  <div className={`student-module-item-grid ${selectedModule.type === 'Words' ? 'is-words' : 'is-phonetics'}`}>
                    {selectedModule.items.length === 0 ? (
                      <div className="student-module-content-missing">
                        <FiAlertTriangle aria-hidden="true" />
                        <strong>Content mapping needed</strong>
                        <span>This module is ready for the workbook content once the curriculum scope is approved.</span>
                      </div>
                    ) : selectedModule.items.map((item, index) => {
                      const completed = item.passed || index < selectedModuleCompletedItems;
                      const label = item.label || item.practiceText || String(item);
                      return (
                        <button
                          key={item.curriculumItemId || label}
                          type="button"
                          className={`student-module-item ${completed ? 'is-complete' : ''}`}
                          onClick={() => startModulePractice(selectedModule, item)}
                        >
                          {completed ? <FiCheck aria-hidden="true" /> : <FiVolume2 aria-hidden="true" />}
                          <strong>{label}</strong>
                          {item.kind === 'syllable_practice' && <span>Syllable Practice</span>}
                        </button>
                      );
                    })}
                  </div>
                  <div className="student-module-assessment-card">
                    <div>
                      <span className="student-library-kicker">Assessment</span>
                      <h4>Let's see what you learned!</h4>
                      <p>{selectedModule.progress >= 100 ? 'Module requirements completed.' : 'Finish the module practice before the next module unlocks.'}</p>
                    </div>
                    <button
                      type="button"
                      className="button-large button-primary"
                      disabled={selectedModule.items.length === 0}
                      onClick={() => openAssessmentPreview(selectedModule)}
                    >
                      {selectedModule.items.length === 0 ? 'Content Pending' : selectedModule.progress >= 100 ? 'Review Assessment' : 'Start Assessment'} <FiChevronRight aria-hidden="true" />
                    </button>
                  </div>
                </section>

                <section className="student-library-lessons">
                  <div className="student-library-section-title">
                    <div>
                      <span className="student-library-kicker">Teacher Lessons</span>
                      <h3>Shared Library</h3>
                    </div>
                    <div className="student-learn-filters">
                      {lessonLevels.slice(0, 4).map((filter) => (
                        <button
                          key={filter}
                          type="button"
                          className={learnFilter === filter ? 'active' : ''}
                          onClick={() => setLearnFilter(filter)}
                        >
                          {filter}
                        </button>
                      ))}
                    </div>
                  </div>

                  {uploadsLoading ? (
                    <p className="learning-path-text">Loading lessons...</p>
                  ) : filteredLessons.length === 0 ? (
                    <p className="learning-path-text">No lessons match this view yet.</p>
                  ) : (
                    <div className="student-library-card-grid">
                      {filteredLessons.slice(0, 8).map((item, index) => {
                        const status = getLessonStatus(item);
                        const progressValue = getLessonProgress(item);
                        return (
                          <article key={item.id} className={`student-book-card accent-${index % 5}`}>
                            <div className="student-book-cover" aria-hidden="true">
                              <FiBookOpen />
                              <strong>{getLessonTitle(item).slice(0, 2).toUpperCase()}</strong>
                            </div>
                            <div className="student-book-body">
                              <h4>{getLessonTitle(item)}</h4>
                              <span className={`student-learn-status ${status.toLowerCase().replace(/\s+/g, '-')}`}>{status}</span>
                              <div className="student-library-progress-row">
                                <div className="progress-bar student-home-progress-bar">
                                  <div className="progress-fill" style={{ width: `${Math.max(4, progressValue)}%` }} />
                                </div>
                                <strong>{progressValue}%</strong>
                              </div>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  )}
                </section>
              </div>

              <aside className="student-library-side">
                <section className="student-reading-progress-card">
                  <div className="student-library-side-title">
                    <FiBarChart2 aria-hidden="true" />
                    <h3>Reading Progress</h3>
                  </div>
                  <div className="student-library-ring" style={{ '--progress': moduleProgressDriver }}>
                    <strong>{moduleProgressDriver}%</strong>
                  </div>
                  <h4>Module Progress</h4>
                  <p>Great job! Keep it up!</p>
                  <img src="/bg.png" alt="" aria-hidden="true" />
                </section>

                <section className="student-my-badges-card">
                  <div className="student-library-side-title">
                    <FiAward aria-hidden="true" />
                    <h3>My Badges</h3>
                  </div>
                  <div className="student-mini-badge-grid">
                    {ACHIEVEMENTS.slice(0, 5).map((achievement) => (
                      <AchievementBadge
                        key={achievement.id}
                        achievement={achievement}
                        unlocked={unlockedAchievementIds.includes(achievement.id)}
                      />
                    ))}
                  </div>
                  <button type="button" className="button-small button-secondary" onClick={() => handleNav('badges')}>
                    View all badges
                  </button>
                </section>

                <section className="student-completed-modules-card">
                  <div className="student-library-side-title">
                    <FiCheckCircle aria-hidden="true" />
                    <h3>Completed Modules</h3>
                  </div>
                  {completedModules.length ? (
                    <div className="student-completed-module-list">
                      {completedModules.map((module) => (
                        <button
                          key={module.number}
                          type="button"
                          className={`student-completed-module-row accent-${module.accent} ${equippedModule && `${equippedModule.level}-${equippedModule.number}` === `${module.level}-${module.number}` ? 'is-equipped' : ''}`}
                          onClick={() => setEquippedModuleNumber(`${module.level}-${module.number}`)}
                        >
                          <FiCheck aria-hidden="true" />
                          <span>{module.level} Module {module.number}</span>
                          <strong>{module.title}</strong>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="student-home-muted">Finish Module 1 to add it here.</p>
                  )}
                </section>
              </aside>
            </div>
          </section>
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
            <div className="student-profile-modules">
              <div className="detail-block-title">My Completed Modules</div>
              {equippedModule && (
                <div className={`student-profile-equipped-module accent-${equippedModule.accent}`}>
                  <FiAward aria-hidden="true" />
                  <div>
                    <span>Equipped Module</span>
                    <strong>{equippedModule.level} Module {equippedModule.number}: {equippedModule.title}</strong>
                  </div>
                </div>
              )}
              {allCompletedModules.length ? (
                <div className="student-profile-module-grid">
                  {allCompletedModules.map((module) => (
                    <button
                      key={`${module.level}-${module.number}`}
                      type="button"
                      className={`student-profile-module-chip accent-${module.accent} ${equippedModule && `${equippedModule.level}-${equippedModule.number}` === `${module.level}-${module.number}` ? 'is-equipped' : ''}`}
                      onClick={() => setEquippedModuleNumber(`${module.level}-${module.number}`)}
                    >
                      <FiCheck aria-hidden="true" />
                      <span>{module.level} Module {module.number}</span>
                      <strong>{module.title}</strong>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="student-home-muted">Complete your first module to show it here.</p>
              )}
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
