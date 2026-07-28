import React, { useState, useEffect, useMemo, useRef, useContext } from 'react';
import { AuthContext } from '../context/AuthContext';
import { speechService, studentService, practiceWordService } from '../services/api';
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
} from 'react-icons/fi';
import { subscribeToTeacherUploadsByGradeLevel } from '../services/supabaseService';
import { ACHIEVEMENTS, getUnlockedAchievementIds, getAchievementById } from '../services/achievementService';
import AchievementBadge from '../components/AchievementBadge';
import AchievementUnlockModal from '../components/AchievementUnlockModal';
import './StudentDashboard.css';

// ============================================================================
// CONSTANTS: Activity & Gamification
// ============================================================================
const XP_PER_ACTIVITY = 50; // Normalized XP reward per completed activity/lesson
const PRONUNCIATION_XP = {
  perfect: 50,
  correct: 40,
  close: 25,
  practice: 10,
};
const ENCOURAGEMENT_MESSAGES = ['YOU DID WELL!', 'GOOD JOB!', 'NICE TRY!', 'KEEP GOING!', 'GREAT EFFORT!'];
// Phonetic progression system for LinawLetra
const TAGALOG_PHONETIC_LEVELS = {
  Easy: [
    'pa-pa',
    'ma-ma',
    'sa-pa',
    'la-ta',
    'ma-ta',
  ],
  Medium: [
    'a-so na-ta-kot',
    'ba-ta na-la-ro',
    'may ma-ta ang ta-o',
  ],
  Hard: [
    'Ang ba-ta ay ma-ba-it.',
    'Ma-sa-ya ang a-so.',
  ],
};
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
const getPhoneticWordForProgress = (level = 'Easy', progressCount = 0) => {
  const list = TAGALOG_PHONETIC_LEVELS[level] || TAGALOG_PHONETIC_LEVELS.Easy;
  const normalizedProgress = Math.max(0, progressCount);
  return list[normalizedProgress % list.length];
};
// ============================================================================
// GAMIFICATION HELPER FUNCTIONS
// ============================================================================
/**
 * completeActivity() - Award XP and update activity counters on lesson/activity completion
 * Called ONLY when a full activity completes, not on every pronunciation evaluation
 * @param {Object} params - { userId, currentXp, currentActivitiesCompleted, currentStreak }
 * @returns {Promise<Object>} - Updated stats: { xp, activitiesCompleted, streak }
 */
const completeActivity = async (params) => {
  const { userId, currentXp, currentActivitiesCompleted, currentStreak } = params;
  if (!userId) {
    console.error('completeActivity: userId is required');
    return null;
  }
  try {
    const newXp = currentXp + XP_PER_ACTIVITY;
    const newActivitiesCompleted = currentActivitiesCompleted + 1;
    // Update user via Supabase API
    const { error } = await supabase
      .from('users')
      .update({
        xp: newXp,
        activities_completed: newActivitiesCompleted,
        streak: currentStreak,
        last_activity_date: new Date().toISOString(),
      })
      .eq('id', userId)
      .select()
      .single();
    if (error) throw error;
    console.log(`Activity completed for ${userId}: +${XP_PER_ACTIVITY} XP (Total: ${newXp})`);
    return {
      xp: newXp,
      activitiesCompleted: newActivitiesCompleted,
      streak: currentStreak,
    };
  } catch (error) {
    console.error('completeActivity: Failed to save activity to Firestore', error);
    return null;
  }
};
/**
 * calculateStreak() - Compute streak on app load based on lastLoginDate
 * Runs on component mount; compares lastLoginDate with current date
 * Logic:
 *   - lastLoginDate === yesterday ? streak += 1
 *   - lastLoginDate === today ? streak unchanged
 *   - lastLoginDate < yesterday ? reset streak to 1
 * @param {Object} params - { userId, currentStreak }
 * @returns {Promise<Object>} - Updated: { streak, lastLoginDate }
 */
const calculateStreak = async (params) => {
  const { userId, currentStreak } = params;
  if (!userId) {
    console.error('calculateStreak: userId is required');
    return { streak: currentStreak, lastLoginDate: new Date() };
  }
  try {
    // Fetch user data via API
    const userData = await studentService.getStudent(userId).catch(() => ({}));
    const lastLoginDateString = userData?.last_login_date || userData?.lastLoginDate;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let updatedStreak = currentStreak || 0;
    if (lastLoginDateString) {
      const lastLoginDateParsed = new Date(lastLoginDateString);
      lastLoginDateParsed.setHours(0, 0, 0, 0);
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      if (lastLoginDateParsed.getTime() === yesterday.getTime()) {
        // Last login was yesterday ? increment streak
        updatedStreak = (currentStreak || 0) + 1;
        console.log(`Streak incremented (yesterday login): ${updatedStreak}`);
      } else if (lastLoginDateParsed.getTime() === today.getTime()) {
        // Last login was today ? preserve streak
        updatedStreak = currentStreak || 0;
        console.log(`Streak preserved (already logged in today): ${updatedStreak}`);
      } else if (lastLoginDateParsed.getTime() < yesterday.getTime()) {
        // Last login was before yesterday ? reset streak
        updatedStreak = 1;
        console.log(`Streak reset (gap detected): ${updatedStreak}`);
      }
    } else {
      // First login ever
      updatedStreak = 1;
      console.log(`First login: streak initialized to 1`);
    }
    // Update user via API
    await studentService.updateStudent(userId, {
      streak: updatedStreak,
      last_login_date: today.toISOString(),
    }).catch((error) => {
      console.warn('Failed to update streak via API:', error);
    });
    console.log(`Streak calculation complete: ${updatedStreak}, lastLoginDate updated`);
    return {
      streak: updatedStreak,
      lastLoginDate: today,
    };
  } catch (error) {
    console.error('calculateStreak: Failed to calculate streak', error);
    return { streak: currentStreak || 0, lastLoginDate: new Date() };
  }
};
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
  const [expectedText, setExpectedText] = useState('aso');
  const [practiceWords, setPracticeWords] = useState([]);
  const [activePracticeWord, setActivePracticeWord] = useState(null);
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
  const [xp, setXp] = useState(0);
  const [achievements, setAchievements] = useState(0);
  const [wordsCompleted, setWordsCompleted] = useState(0);
  const [recordedAudio, setRecordedAudio] = useState(null);
  const [status, setStatus] = useState('idle');
  const [accuracy, setAccuracy] = useState(null);
  const [accuracyExplanation, setAccuracyExplanation] = useState('');
  const [isEvaluating, setIsEvaluating] = useState(false);
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
  // Gates the save effect (and the achievement recompute) so neither runs
  // against default/zeroed state while the real saved progress is still
  // being fetched on load. Must be real state, not a ref: the achievement
  // effect needs this flip to actually re-trigger it once loading finishes,
  // not just be readable the next time something else happens to change.
  const [hasLoadedProgress, setHasLoadedProgress] = useState(false);
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
        // it must never block restoring xp/badges/level, which already live in
        // profileMetadata and are the real source of truth for a student's progress.
        let dashboardData = {};
        try {
          const dashboardResponse = await studentService.getDashboardData?.(userId);
          dashboardData = dashboardResponse?.data?.data ?? dashboardResponse?.data ?? dashboardResponse ?? {};
        } catch (dashboardError) {
          console.warn('Dashboard summary fetch failed (non-fatal):', dashboardError);
        }
        const progressData = {
          ...(profileMetadata || {}),
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
          setXp(progressData.xp || 0);
          setWordsCompleted(progressData.wordsCompleted || progressData.completed_words?.length || 0);
          setAchievements(Math.floor((progressData.wordsCompleted || progressData.completedWords?.length || 0) / 5));
          // Load phonetic progression
          setCurrentPhoneticLevel(progressData.currentPhoneticLevel || 'Easy');
          setProgressInCurrentLevel(progressData.progressInCurrentLevel || 0);
          // Load achievement tracking fields
          setHighestPhoneticLevel(progressData.highestPhoneticLevel || progressData.currentPhoneticLevel || 'Easy');
          setHardCyclesCompleted(progressData.hardCyclesCompleted || 0);
          setHadStreakBreak(Boolean(progressData.hadStreakBreak));
          setUnlockedAchievementIds(progressData.unlockedAchievementIds || []);
        }
        // =====================================================================
        // STREAK CALCULATION ON MOUNT
        // =====================================================================
        const currentStreak = progressData?.streak || 0;
        const streakResult = await calculateStreak({
          userId,
          currentStreak,
        });
        if (streakResult) {
          if (currentStreak >= 3 && streakResult.streak === 1) {
            setHadStreakBreak(true);
          }
          setProgress((prev) => ({
            ...prev,
            streak: streakResult.streak,
          }));
        }
        // =====================================================================
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
        // Use phonetic words for structured practice
        const initialPhoneticLevel = progressData?.currentPhoneticLevel || 'Easy';
        const initialProgressCount = progressData?.progressInCurrentLevel || 0;
        setExpectedText(getPhoneticWordForProgress(initialPhoneticLevel, initialProgressCount));
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
    let isMounted = true;
    practiceWordService.getPracticeWords().then((words) => {
      if (isMounted) setPracticeWords(words);
    }).catch((error) => {
      console.error('Failed to load practice words:', error);
    });
    return () => { isMounted = false; };
  }, []);
  const buildProgressSnapshot = () => ({
    xp,
    wordsCompleted,
    achievements,
    completedWords,
    practiceLevel,
    completed: progress.completed || 0,
    accuracy: progress.accuracy || 0,
    streak: progress.streak || 0,
    totalLessons: progress.totalLessons || 7,
    history: progress.history || [],
    currentPhoneticLevel,
    progressInCurrentLevel,
    highestPhoneticLevel,
    hardCyclesCompleted,
    hadStreakBreak,
    unlockedAchievementIds,
  });
  // A save request can take longer than the gap between two rapid state
  // changes (e.g. pronunciation evaluation updates xp, then wordsCompleted,
  // then completedWords across separate renders). Firing an independent
  // request per change lets them resolve OUT OF ORDER, so an older request
  // finishing last can silently overwrite a newer one's data. Chaining every
  // save onto this single ref forces them to run strictly one-at-a-time, and
  // each step reads state fresh at ITS OWN turn, so the final queued save
  // (whichever it is) always reflects the true latest state.
  const saveChainRef = useRef(Promise.resolve());
  const queuePersist = () => {
    saveChainRef.current = saveChainRef.current.catch(() => {}).then(async () => {
      if (!authUser) {
        console.warn('Cannot save progress: user not authenticated');
        return;
      }
      if (!hasLoadedProgress || !currentStudentId) {
        // Initial load for this user hasn't finished restoring saved
        // progress yet -- saving now would overwrite it with defaults.
        return;
      }
      const progressData = buildProgressSnapshot();
      try {
        await studentService.updateStudent(currentStudentId, progressData).catch((error) => {
          console.warn('Failed to save progress via API:', error);
        });
        console.log('Progress saved to backend for student:', currentStudentId);
        localStorage.setItem(`linawletra_progress_${currentStudentId}`, JSON.stringify(progressData));
      } catch (error) {
        console.error('Failed to save progress:', error);
      }
    });
    return saveChainRef.current;
  };
  useEffect(() => {
    queuePersist();
  }, [xp, wordsCompleted, achievements, completedWords, practiceLevel, progress.accuracy, progress.completed, progress.history, progress.streak, progress.totalLessons, currentPhoneticLevel, progressInCurrentLevel, highestPhoneticLevel, hardCyclesCompleted, hadStreakBreak, unlockedAchievementIds, currentStudentId, authUser, hasLoadedProgress]);

  // Recompute unlocked achievements whenever the underlying stats change.
  // This only ever ADDS badge ids (a union with what's already unlocked) --
  // a badge earned in the past must never disappear just because a
  // moment-in-time check (like an improving-streak window) no longer holds.
  useEffect(() => {
    if (!hasLoadedProgress) {
      // Don't evaluate against default/zeroed stats before the real saved
      // achievements have been restored -- that would both wipe real badges
      // and fire a bogus "newly unlocked" celebration for Unang Hakbang.
      return;
    }
    const stats = {
      xp,
      streak: progress.streak || 0,
      accuracy: progress.accuracy || 0,
      completed: progress.completed || 0,
      history: progress.history || [],
      highestPhoneticLevel,
      hardCyclesCompleted,
      hadStreakBreak,
    };
    const unlockedNow = getUnlockedAchievementIds(stats);
    setUnlockedAchievementIds((prev) => {
      const newlyUnlockedIds = unlockedNow.filter((id) => !prev.includes(id));
      if (newlyUnlockedIds.length === 0) {
        return prev;
      }
      setNewlyUnlockedAchievements(newlyUnlockedIds.map(getAchievementById).filter(Boolean));
      return [...prev, ...newlyUnlockedIds];
    });
  }, [xp, progress.streak, progress.accuracy, progress.completed, progress.history, highestPhoneticLevel, hardCyclesCompleted, hadStreakBreak, hasLoadedProgress]);
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
      // Flush any pending progress to the backend BEFORE the auth token is
      // cleared, and queue it onto the SAME ordered chain as every other
      // save -- so it's guaranteed to run after (not race against) any save
      // still pending from a recent action, and be the true final write.
      if (currentStudentId && hasLoadedProgress) {
        console.log('[Logout] flushing progress snapshot:', buildProgressSnapshot());
        await queuePersist();
        console.log('[Logout] flush call finished.');
      } else {
        console.log('[Logout] SKIPPED flush -- guard was false.');
      }
      await logout();
    } catch (error) {
      console.error('Logout error:', error);
      setFeedback('Unable to log out right now.');
    }
  };
  const handleNav = (section) => {
    setActiveSection(section);
    const target = document.getElementById(`${section}-section`);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };
  const startReading = () => {
    // Reset evaluation state before starting new attempt
    setAccuracy(null);
    setAccuracyExplanation('');
    setIsEvaluating(false);
    setFeedback('Basahin ang salita at gawin ang pagbigkas.');
    setTranscribedText('');
    setStatusMessage('Nagre-record na. Magsalita nang malinaw.');
    handleMicClick();
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

    try {
      const response = await speechService.textToSpeech(formatForTagalogSpeech(text), {
        speed: options.speed || options.rate || 0.82,
        // Omit instructions unless the caller overrides them, so the server's
        // more detailed Tagalog-specific default (TAGALOG_TTS_INSTRUCTIONS) is used.
        ...(options.instructions ? { instructions: options.instructions } : {}),
      });
      const audioUrl = URL.createObjectURL(response.data);
      const audio = new Audio(audioUrl);
      ttsAudioRef.current = audio;
      audio.onended = () => URL.revokeObjectURL(audioUrl);
      audio.onerror = () => {
        URL.revokeObjectURL(audioUrl);
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

  const awardPronunciationXp = (amount) => {
    setXp((prev) => (Number(prev) || 0) + amount);
    setXpGainPopup(amount);
    setTimeout(() => setXpGainPopup(null), 2000);
  };
  const normalizeForEvaluation = (text = '') =>
    text
      .toString()
      .toLowerCase()
      .replace(/[^a-z\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  // AI-style accuracy scoring system (0-100%)
  const getTagalogPronunciationFeedback = (score, spoken, target) => {
    const normalizedSpoken = normalizeForEvaluation(spoken);
    const normalizedTarget = normalizeForEvaluation(target);
    const targetTokens = normalizedTarget.split(' ').filter(Boolean);
    const spokenTokens = normalizedSpoken.split(' ').filter(Boolean);
    const missingToken = targetTokens.find((token) =>
      !spokenTokens.some((word) => word.includes(token) || token.includes(word))
    );
    if (score === 100) {
      return 'Magaling! Tama ang bigkas mo.';
    }
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
    const normalizedSpoken = normalizeForEvaluation(spoken);
    const normalizedTarget = normalizeForEvaluation(target);
    const distance = calculateLevenshteinDistance(normalizedSpoken, normalizedTarget);
    const maxLength = Math.max(normalizedSpoken.length, normalizedTarget.length);
    const score = normalizedSpoken === normalizedTarget
      ? 100
      : maxLength === 0
        ? 100
        : Math.max(0, Math.min(99, Math.round(((maxLength - distance) / maxLength) * 100)));
    return {
      score,
      feedback: getTagalogPronunciationFeedback(score, spoken, target),
      distance,
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
  const calculateLevenshteinDistance = (a = '', b = '') => {
    const normalizedA = a.toLowerCase().trim();
    const normalizedB = b.toLowerCase().trim();
    const matrix = Array.from({ length: normalizedA.length + 1 }, () =>
      Array(normalizedB.length + 1).fill(0)
    );
    for (let i = 0; i <= normalizedA.length; i += 1) matrix[i][0] = i;
    for (let j = 0; j <= normalizedB.length; j += 1) matrix[0][j] = j;
    for (let i = 1; i <= normalizedA.length; i += 1) {
      for (let j = 1; j <= normalizedB.length; j += 1) {
        const cost = normalizedA[i - 1] === normalizedB[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost,
        );
      }
    }
    return matrix[normalizedA.length][normalizedB.length];
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
  const comparePronunciation = (spoken) => {
    if (isEvaluating) return;
    setIsEvaluating(true);
    const expected = expectedText;
    const evaluation = evaluatePronunciation(spoken, expected);
    const { score, feedback: tagalogFeedback, distance } = evaluation;
    const isCorrect = score >= 80;
    const isClose = score >= 70 && score < 80;
    const attemptXp = score === 100
      ? PRONUNCIATION_XP.perfect
      : isCorrect
        ? PRONUNCIATION_XP.correct
        : isClose
          ? PRONUNCIATION_XP.close
          : PRONUNCIATION_XP.practice;
    setTranscribedText(spoken);
    setRecognitionDistance(distance);
    setAccuracy(score);
    setFeedback(tagalogFeedback);
    setAccuracyExplanation(getAccuracyExplanation(score, spoken, expected));
    awardPronunciationXp(attemptXp);
    const attemptRecord = {
      word: expected,
      spoken,
      score,
      correct: isCorrect,
      xp: attemptXp,
      playedTTS: score < 80,
      timestamp: Date.now(),
    };
    setProgress((prev) => ({
      ...prev,
      history: [...(prev.history || []), attemptRecord],
    }));
    if (score < 80) {
      const encouragement = ENCOURAGEMENT_MESSAGES[Math.floor(Math.random() * ENCOURAGEMENT_MESSAGES.length)];
      showReassurance(encouragement, 'encourage');
      playYeheySound();
      setTimeout(() => speakTagalog(expected), 900);
      setFeedback(`${tagalogFeedback} Pakinggan mo ito.`);
    }
    if (isCorrect) {
      setStatus('correct');
      setRecognitionResult('success');
      if (score === 100) {
        showReassurance('CONGRATULATIONS!', 'perfect');
        showConfetti();
        playClapSound();
      } else {
        showReassurance('GOOD JOB!', 'success');
      }
      const newProgress = progressInCurrentLevel + 1;
      const threshold = currentPhoneticLevel === 'Easy' ? 5 : currentPhoneticLevel === 'Medium' ? 3 : 2;
      const willAdvance = newProgress >= threshold;
      const nextLevel = willAdvance ? advanceLevel() : currentPhoneticLevel;
      if (!willAdvance) {
        setProgressInCurrentLevel(newProgress);
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
        accuracy: Math.round(((Number(prev.accuracy) || 0) + score) / 2),
      }));
      setExpectedText(getPhoneticWordForProgress(nextLevel, willAdvance ? 0 : newProgress));
      setFeedback(willAdvance ? `?? Level up! Ngayon ay ${nextLevel}. ${tagalogFeedback}` : tagalogFeedback);
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
  const learningPathSteps = filteredLessons.slice(0, 6).map((item, index) => ({
    id: item.id || `${item.title}-${index}`,
    title: item.title || `Lesson ${index + 1}`,
    description: item.description || item.category || 'Continue your learning path.',
    completed: Boolean(item.completed || (item.status || item.status.toLowerCase().includes('complete'))),
  }));
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
  const notifications = useMemo(() => {
    if (uploadsLoading) {
      return [{
        id: 'loading',
        title: 'Updating your class feed',
        message: 'Checking for new teacher files and reminders.',
      }];
    }
    if (teacherUploads.length === 0) {
      return [{
        id: 'empty',
        title: 'No updates yet',
        message: 'Your teacher will share lessons and activities here soon.',
      }];
    }
    return [{
      id: 'new-files',
      title: `${teacherUploads.length} new item${teacherUploads.length === 1 ? '' : 's'} shared`,
      message: 'Open the content section to review your latest lessons and assignments.',
    }];
  }, [uploadsLoading, teacherUploads]);
  const previewSentence = 'The cat sat on the mat.';
  const formattedDate = new Intl.DateTimeFormat('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  }).format(dateTime);
  const formattedTime = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric', minute: 'numeric', hour12: true,
  }).format(dateTime);
  const progressXp = useMemo(
    () => progress.completed * 10 + progress.accuracy,
    [progress]
  );
  const tier = useMemo(() => getTierFromXp(progressXp), [progressXp]);
  const lessonsGoal = progress.totalLessons || 7;
  const completionPercent = Math.min(100, Math.round((Number(progress.completed || 0) / Number(lessonsGoal || 1)) * 100));
  const activitiesCompleted = progress.completed || 0;
  const streakDays = progress.streak || 0;
  const phoneticThreshold = currentPhoneticLevel === 'Easy' ? 5 : currentPhoneticLevel === 'Medium' ? 3 : 2;
  const phoneticPathNodes = Array.from({ length: phoneticThreshold }, (_, index) => {
    const position = index + 1;
    if (position <= progressInCurrentLevel) return 'completed';
    if (position === progressInCurrentLevel + 1) return 'current';
    return 'locked';
  });
  const rootStyles = {
    fontFamily: fontFamilies[accessibilitySettings.fontFamily] || fontFamilies['Comic Sans'],
    fontSize: `${accessibilitySettings.textSize}px`,
    letterSpacing: accessibilitySettings.letterSpacing === 'wide' ? '0.08em' : 'normal',
  };
  const dayOfYear = Math.floor(
    (dateTime - new Date(dateTime.getFullYear(), 0, 0)) / (1000 * 60 * 60 * 24)
  );
  const wordOfTheDay = practiceWords.length > 0
    ? practiceWords[dayOfYear % practiceWords.length]
    : null;
  const selectPracticeWord = (practiceWord) => {
    setActivePracticeWord(practiceWord);
    setHomographPanelOpenId(null);
    setExpectedText(practiceWord.word);
    setStatus('idle');
    setAccuracy(null);
    setAccuracyExplanation('');
    setTranscribedText('');
    setStatusMessage('');
  };
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
              <span className="student-sidebar-link-icon"><FiHome aria-hidden="true" /></span> Overview
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
              className={`student-sidebar-link ${activeSection === 'settings' ? 'active' : ''}`}
              onClick={() => handleNav('settings')}
            >
              <span className="student-sidebar-link-icon"><FiSettings aria-hidden="true" /></span> Settings
            </button>
            <button
              type="button"
              className={`student-sidebar-link ${activeSection === 'profile' ? 'active' : ''}`}
              onClick={() => handleNav('profile')}
            >
              <span className="student-sidebar-link-icon"><FiUser aria-hidden="true" /></span> Profile
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
          <div style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            backgroundColor: '#4F46E5',
            color: '#fff',
            padding: '20px 40px',
            borderRadius: '12px',
            fontSize: '24px',
            fontWeight: 'bold',
            zIndex: 1000,
            animation: 'fadeInOut 2s ease-in-out',
          }}
          >
            +{xpGainPopup} XP
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
        {activeSection === 'home' && (
          <>
            <div className="path-hero-banner">
              <div>
                <p className="path-hero-banner-kicker">LEVEL: {currentPhoneticLevel.toUpperCase()}</p>
                <h2>
                  {nextLesson
                    ? `Next lesson: ${nextLesson.title}`
                    : 'Practice your Tagalog pronunciation'}
                </h2>
              </div>
              <button className="path-hero-guidebook" type="button" onClick={startReading}>
                <FiMic aria-hidden="true" /> Start Reading
              </button>
            </div>
            {wordOfTheDay && (
              <button
                type="button"
                className="word-of-the-day-card"
                onClick={() => { selectPracticeWord(wordOfTheDay); handleNav('practice'); }}
              >
                <span className="word-of-the-day-kicker">Salita Ngayon</span>
                <span className="word-of-the-day-word">{wordOfTheDay.accentedSpelling}</span>
                <span className="word-of-the-day-meaning">{wordOfTheDay.meaning}</span>
              </button>
            )}
            <section className="detail-block">
              <div className="detail-block-title">Your reading path</div>
              <div className="winding-path">
                {phoneticPathNodes.map((state, index) => {
                  const rowAlign = index % 3 === 1 ? 'align-right' : index % 3 === 2 ? 'align-left' : '';
                  const isCurrent = state === 'current';
                  return (
                    <div key={index} className={`winding-path-node-row ${rowAlign}`}>
                      <div className="path-node-wrapper">
                        {isCurrent && <span className="path-node-label">START</span>}
                        <button
                          type="button"
                          className={`path-node ${state}`}
                          onClick={isCurrent ? startReading : undefined}
                          disabled={!isCurrent}
                          aria-label={`Word ${index + 1} of ${phoneticThreshold}, ${state}`}
                        >
                          {state === 'completed' ? <FiStar aria-hidden="true" /> : index + 1}
                        </button>
                      </div>
                      {isCurrent && (
                        <img src="/logo.png" alt="" className="path-mascot" aria-hidden="true" />
                      )}
                    </div>
                  );
                })}
              </div>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', textAlign: 'center', marginTop: '4px' }}>
                {progressInCurrentLevel} / {phoneticThreshold} words in {currentPhoneticLevel} level
              </p>
            </section>
            <section className="detail-block">
              <div className="detail-block-title">Today's progress</div>
              <div className="home-summary-grid">
                <article className="stat-card">
                  <p className="stat-title">Activities</p>
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
                  <p className="stat-title">Learning tier</p>
                  <p className="stat-value">{tier}</p>
                </article>
              </div>
            </section>
            <section className="detail-block">
              <div className="detail-block-title">Assigned lessons</div>
              {learningPathSteps.length > 0 ? (
                <div className="path-map">
                  {learningPathSteps.map((step) => (
                    <div key={step.id} className="path-step">
                      <div className={`path-dot ${step.completed ? 'completed' : 'pending'}`}>
                        {step.completed ? <FiStar aria-hidden="true" /> : '○'}
                      </div>
                      <div>
                        <p className="path-step-title">{step.title}</p>
                        <p className="path-step-copy">{step.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-state-card">
                  <p>No reading path is available yet.</p>
                  <p>Ask your teacher to assign your first lesson so progress appears here.</p>
                </div>
              )}
              <div className="path-actions">
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${completionPercent}%` }} />
                </div>
                <button
                  className="button-large button-primary"
                  type="button"
                  onClick={openNextLesson}
                  disabled={!nextLesson}
                >
                  {nextLesson ? `Continue ${nextLesson.title}` : 'Browse lessons'}
                </button>
              </div>
            </section>
          </>
        )}
        {activeSection === 'practice' && (
          <section id="practice-section" className="detail-block">
            <div className="detail-block-title">Voice practice</div>
            <div className="practice-header">
              <div>
                <h3>Practice your reading</h3>
                <p className="practice-sub">Say the word clearly into your microphone and get instant feedback.</p>
              </div>
              <span className="tier-pill-large">{levelNames[practiceLevel]}</span>
            </div>
            <div className="practice-settings-row">
              <div className="settings-block">
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
            <div className="practice-level-note">
              <span>
                Assigned reading level: <strong>{levelNames[practiceLevel]}</strong>
              </span>
              <span className="note-text">
                {canEditPracticeLevel
                  ? 'This level is used for practice sessions.'
                  : 'Only a parent can change the reading level.'}
              </span>
            </div>
            <div className="practice-stats">
              <div className="stat-item">
                <span>XP: {Number(xp) || 0}</span>
              </div>
              <div className="stat-item">
                <span>Words completed: {Number(wordsCompleted) || 0}</span>
              </div>
              <div className="stat-item">
                <span>Achievements: {Number(achievements) || 0}</span>
              </div>
            </div>
            {practiceWords.length > 0 && (
              <div className="vocabulary-bank">
                <h4>Talasalitaan</h4>
                <div className="vocabulary-grid">
                  {practiceWords.map((practiceWord) => (
                    <button
                      key={practiceWord.id}
                      type="button"
                      className={`vocabulary-chip ${activePracticeWord?.id === practiceWord.id ? 'is-active' : ''}`}
                      onClick={() => selectPracticeWord(practiceWord)}
                    >
                      {practiceWord.accentedSpelling}
                      {practiceWord.isHomograph && <span className="vocabulary-chip-badge">2 kahulugan</span>}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="practice-grid">
              <div className="word-card">
                <div className="word-display">
                  <div className="practice-word">{activePracticeWord ? activePracticeWord.accentedSpelling : expectedText}</div>
                  {activePracticeWord ? (
                    <>
                      <p className="word-meaning">{activePracticeWord.meaning}</p>
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
                    </>
                  ) : (
                    <div className="word-hint">{`${levelNames[practiceLevel]} level practice`}</div>
                  )}
                </div>
                <div className="word-actions">
                  <button
                    className={`button-large ${status === 'listening' ? 'button-danger listening-pulse' : status === 'correct' ? 'button-primary correct-highlight' : status === 'incorrect' ? 'button-danger incorrect-shake' : 'button-primary'}`}
                    onClick={handleMicClick}
                    disabled={isProcessing}
                  >
                    {status === 'listening' ? 'Listening�' : status === 'correct' ? 'Correct!' : status === 'incorrect' ? 'Try again' : 'Say the word'}
                  </button>
                  <button
                    className="button-large button-secondary"
                    type="button"
                    onClick={() => speakTagalog(activePracticeWord ? activePracticeWord.accentedSpelling : expectedText)}
                  >
                    Listen
                  </button>
                  <button className="button-large button-secondary" type="button" onClick={replayRecognizedWord}>
                    Replay Voice
                  </button>
                </div>
                {activePracticeWord?.isHomograph && (
                  <p className="tts-caveat">
                    Baka magkatunog ang dalawa kapag pinindot ang "Listen". Ang marka sa itaas
                    ng salita ang gabay mo kung alin ang tama.
                  </p>
                )}
              </div>
              <div className="feedback-panel">
                <h4>Pronunciation feedback</h4>
                <div className={`feedback-result ${recognitionResult}`}>
                  <div className="feedback-icon">
                    {recognitionResult === 'success' ? '?' : recognitionResult === 'almost' ? '!' : '?'}
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
              </div>
            </div>
            <div className="highlight-row">{renderWordHighlight()}</div>
            {isProcessing && <div className="loading-text">Checking your voice...</div>}
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
                <span>Words finished</span>
              </div>
              <div className="metric-card">
                <strong>{streakDays}</strong>
                <span>Daily streak</span>
              </div>
              <div className="metric-card">
                <strong>{progressXp}</strong>
                <span>Total XP</span>
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
            <div className="detail-block-title">Accessibility settings</div>
            <div className="settings-panel">
              <div className="settings-row">
                <div className="settings-block">
                  <label>Reading font</label>
                  <select
                    value={accessibilitySettings.fontFamily}
                    onChange={(e) => persistAccessibilitySettings({ fontFamily: e.target.value })}
                  >
                    <option value="Comic Sans">Comic Sans</option>
                    <option value="DM Sans">DM Sans</option>
                    <option value="Josefin Sans">Josefin Sans</option>
                  </select>
                </div>
                <div className="settings-block">
                  <label>Text size</label>
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
                  <input
                    type="checkbox"
                    checked={accessibilitySettings.letterSpacing === 'wide'}
                    onChange={(e) => persistAccessibilitySettings({ letterSpacing: e.target.checked ? 'wide' : 'normal' })}
                  />
                  Wide letter spacing
                </label>
                <label className="settings-switch">
                  <input
                    type="checkbox"
                    checked={accessibilitySettings.wordHighlighting}
                    onChange={(e) => persistAccessibilitySettings({ wordHighlighting: e.target.checked })}
                  />
                  Word highlighting
                </label>
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
                <p className="stat-title">Activities</p>
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
      <aside className="student-side-panel">
        <div className="student-panel-card">
          <div className="student-panel-stats-row">
            <div className="student-stat-chip">
              <FiZap aria-hidden="true" /> {streakDays}
            </div>
            <div className="student-stat-chip">
              <FiStar aria-hidden="true" /> {progressXp}
            </div>
          </div>
        </div>
        <div className="student-panel-card">
          <h4>Phonetic Level Progress</h4>
          <div className="progress-metrics">
            <div className="metric-card">
              <strong>{currentPhoneticLevel}</strong>
              <span>Current Level</span>
            </div>
            <div className="metric-card">
              <strong>{progressInCurrentLevel}</strong>
              <span>Progress in Level</span>
            </div>
            <div className="metric-card">
              <strong>{phoneticThreshold}</strong>
              <span>Required for Next</span>
            </div>
          </div>
          <div className="progress-bar" style={{ marginTop: '16px' }}>
            <div
              className="progress-fill"
              style={{
                width: `${(progressInCurrentLevel / phoneticThreshold) * 100}%`,
              }}
            />
          </div>
        </div>
        <div className="student-panel-card">
          <h4>Class updates</h4>
          <div className="notifications-list">
            {notifications.map((item) => (
              <div key={item.id} className="notification-item">
                <h4>{item.title}</h4>
                <p>{item.message}</p>
              </div>
            ))}
          </div>
        </div>
      </aside>
    </div>
    </div>
  );
};
export default StudentDashboard;
