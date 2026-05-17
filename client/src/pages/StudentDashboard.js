import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../config/supabase';
import { signOut, onAuthStateChanged } from '../services/supabaseAuth';
import { studentService } from '../services/api';
import {
  FiBell,
  FiLogOut,
  FiStar,
} from 'react-icons/fi';
import { subscribeToTeacherUploadsByGradeLevel } from '../services/supabaseService';
import './StudentDashboard.css';

const auth = supabase.auth;
// ============================================================================
// CONSTANTS: Activity & Gamification
// ============================================================================
const XP_PER_ACTIVITY = 50; // Normalized XP reward per completed activity/lesson
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
    .replace(/[^a-z0-9À-ſ\s]/g, ' ')
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
      .eq('uid', userId)
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
 *   - lastLoginDate === yesterday → streak += 1
 *   - lastLoginDate === today → streak unchanged
 *   - lastLoginDate < yesterday → reset streak to 1
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
        // Last login was yesterday → increment streak
        updatedStreak = (currentStreak || 0) + 1;
        console.log(`Streak incremented (yesterday login): ${updatedStreak}`);
      } else if (lastLoginDateParsed.getTime() === today.getTime()) {
        // Last login was today → preserve streak
        updatedStreak = currentStreak || 0;
        console.log(`Streak preserved (already logged in today): ${updatedStreak}`);
      } else if (lastLoginDateParsed.getTime() < yesterday.getTime()) {
        // Last login was before yesterday → reset streak
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
  const [dateTime, setDateTime] = useState(new Date());
  const [accessibilitySettings, setAccessibilitySettings] = useState({
    darkMode: false,
    largeText: false,
    highContrast: false,
    fontFamily: 'DM Sans',
    textSize: 16,
    letterSpacing: 'normal',
    wordHighlighting: true,
  });
  const [userRole, setUserRole] = useState('student');
  const [activeSection, setActiveSection] = useState('home');
  const [showAccessibilityMenu, setShowAccessibilityMenu] = useState(false);
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
  const [xpGainPopup, setXpGainPopup] = useState(null);
  const mediaRecorderRef = useRef(null);
  const recognitionRef = useRef(null);
  const fontFamilies = {
    'Comic Sans': '"Comic Sans MS", cursive, sans-serif',
    'DM Sans': '"DM Sans", sans-serif',
    'Josefin Sans': '"Josefin Sans", sans-serif',
  };
  useEffect(() => {
    const timer = setInterval(() => setDateTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setFeedback('Please log in to use your learning dashboard.');
        return;
      }
      try {
        // Fetch user data via API
        const userData = await studentService.getStudent(user.uid).catch(() => ({}));
        setStudentName(userData.name || userData.fullName || 'Student');
        setUserRole(userData.role || 'student');
        setCurrentStudentId(userData.studentId || userData.student_id || null);
        setStudentGrade(
          normalizeGradeLevel(userData.gradeLevel || userData.grade_level || userData.classId || userData.className || '')
        );
        setStudentRoom(userData.room || userData.classRoom || userData.class_room || '');
        setAccessibilitySettings({
          darkMode: userData.accessibilitySettings?.darkMode ?? false,
          largeText: userData.accessibilitySettings?.largeText ?? false,
          highContrast: userData.accessibilitySettings?.highContrast ?? false,
          fontFamily: userData.accessibilitySettings?.fontFamily || 'DM Sans',
          textSize: userData.accessibilitySettings?.textSize || 16,
          letterSpacing: userData.accessibilitySettings?.letterSpacing || 'normal',
          wordHighlighting: userData.accessibilitySettings?.wordHighlighting ?? true,
        });
        // Fetch progress data via API
        const progressData = await studentService.getDashboardData?.(user.uid).catch(() => ({})) || {};
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
        }
        // =====================================================================
        // STREAK CALCULATION ON MOUNT
        // =====================================================================
        const currentStreak = progressData?.streak || 0;
        const streakResult = await calculateStreak({
          userId: user.uid,
          currentStreak,
        });
        if (streakResult) {
          setProgress((prev) => ({
            ...prev,
            streak: streakResult.streak,
          }));
        }
        // =====================================================================
        if (userData.studentId) {
          try {
            const practiceResponse = await studentService.getPracticeLevel(userData.studentId);
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
      } catch (error) {
        console.error('Firebase load error:', error);
        setFeedback('Cannot load progress right now. Please refresh the page.');
      }
    });
    return () => unsubscribe();
  }, []);
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
        recognitionRef.current.abort();
      }
    };
  }, []);
  useEffect(() => {
    const persistProgress = async () => {
      if (!auth.currentUser) {
        console.warn('Cannot save progress: user not authenticated');
        return;
      }
      const progressData = {
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
      };
      try {
        // Save progress via API
        if (currentStudentId) {
          await studentService.updateStudent(currentStudentId, progressData).catch((error) => {
            console.warn('Failed to save progress via API:', error);
          });
          console.log('Progress saved to backend for student:', currentStudentId);
        }
        // Backup to localStorage
        const userId = currentStudentId || 'unknown';
        localStorage.setItem(`linawletra_progress_${userId}`, JSON.stringify(progressData));
      } catch (error) {
        console.error('Failed to save progress:', error);
      }
    };
    persistProgress();
  }, [xp, wordsCompleted, achievements, completedWords, practiceLevel, progress.accuracy, progress.completed, progress.history, progress.streak, progress.totalLessons, currentPhoneticLevel, progressInCurrentLevel, currentStudentId]);
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
    setAccessibilitySettings((current) => {
      const next = { ...current, ...updates };
      if (currentStudentId) {
        studentService.updateStudent(currentStudentId, {
          accessibilitySettings: next,
        }).catch((error) => {
          console.error('Failed to save accessibility settings:', error);
        });
      }
      return next;
    });
  };
  const handleLogout = async () => {
    try {
      await signOut(auth);
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
  const speakTagalog = (text) => {
  const utterance = new SpeechSynthesisUtterance(text);
  const voices = speechSynthesis.getVoices();
  const tagalogVoice = voices.find(v => v.lang === "fil-PH");
  if (tagalogVoice) {
    utterance.voice = tagalogVoice;
  }
  utterance.lang = "fil-PH";
  utterance.rate = 0.9;
  speechSynthesis.cancel();
  speechSynthesis.speak(utterance);
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
      return "Perfect pronunciation! 🎉";
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
    const nextLevel = currentIndex === levels.length - 1 ? 'Easy' : levels[currentIndex + 1];
    setCurrentPhoneticLevel(nextLevel);
    setProgressInCurrentLevel(0);
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
    setTranscribedText(spoken);
    setRecognitionDistance(distance);
    setAccuracy(score);
    setFeedback(tagalogFeedback);
    setAccuracyExplanation(getAccuracyExplanation(score, spoken, expected));
    const attemptRecord = {
      word: expected,
      spoken,
      score,
      correct: isCorrect,
      playedTTS: score < 80,
      timestamp: Date.now(),
    };
    setProgress((prev) => ({
      ...prev,
      history: [...(prev.history || []), attemptRecord],
    }));
    if (score < 80) {
      speakTagalog(`Ganito ang tamang bigkas: ${expected}`);
      setFeedback(`${tagalogFeedback} Pakinggan mo ito.`);
    }
    if (isCorrect) {
      setStatus('correct');
      setRecognitionResult('success');
      // NOTE: XP is now awarded ONLY via completeActivity(), not on every pronunciation
      // This keeps speech recognition decoupled from gamification rewards
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
        accuracy: prev.accuracy + (distance === 0 ? 10 : 5),
        streak: (prev.streak || 0) + 1,
      }));
      setExpectedText(getPhoneticWordForProgress(nextLevel, willAdvance ? 0 : newProgress));
      setFeedback(willAdvance ? `🎉 Level up! Ngayon ay ${nextLevel}. ${tagalogFeedback}` : tagalogFeedback);
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
      setFeedback(`Speech recognition failed: ${event.error || 'unknown error'}`);
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
  const rootStyles = {
    fontFamily: fontFamilies[accessibilitySettings.fontFamily] || fontFamilies['DM Sans'],
    fontSize: `${accessibilitySettings.textSize}px`,
    letterSpacing: accessibilitySettings.letterSpacing === 'wide' ? '0.08em' : 'normal',
  };
  return (
    <div
      className={`dashboard-container dashboard-page ${accessibilitySettings.darkMode ? 'dark-mode' : ''} ${accessibilitySettings.highContrast ? 'high-contrast' : ''}`}
      style={rootStyles}
    >
      <header className="top-nav">
        <div className="top-nav-left">
          <div className="brand">
            <img src="/logo.png" alt="LinawLetra logo" className="brand-logo" />
            <div className="brand-copy">
              <div className="brand-name">LinawLetra</div>
              <div className="brand-tagline">Student reading dashboard</div>
            </div>
          </div>
          <div className="top-search-box">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search lessons, practice, activities..."
            />
          </div>
        </div>
        <div className="top-nav-right">
          <div className="points-chip">
            <FiStar aria-hidden="true" /> {progressXp} XP
          </div>
          <button className="icon-button" type="button" aria-label="Notifications">
            <FiBell aria-hidden="true" />
          </button>
          <div className="profile-chip">
            <span className="profile-avatar">{studentName?.charAt(0) || 'S'}</span>
            <div>
              <strong>{studentName}</strong>
              <div className="profile-meta">
                {studentGrade}{studentRoom ? ` · ${studentRoom}` : ''}
              </div>
            </div>
          </div>
          <button className="button-small button-danger" type="button" onClick={handleLogout}>
            <FiLogOut aria-hidden="true" /> Logout
          </button>
          <div className="date-inline">
            {formattedDate} • {formattedTime}
          </div>
          <div className="accessibility-dropdown-wrapper">
            <button
              className="button-small button-secondary"
              type="button"
              onClick={() => setShowAccessibilityMenu((open) => !open)}
            >
              Accessibility
            </button>
            {showAccessibilityMenu && (
              <div className="accessibility-dropdown">
                <div className="dropdown-row">
                  <label>Font</label>
                  <select
                    value={accessibilitySettings.fontFamily}
                    onChange={(e) => persistAccessibilitySettings({ fontFamily: e.target.value })}
                  >
                    <option value="Comic Sans">Comic Sans</option>
                    <option value="DM Sans">DM Sans</option>
                    <option value="Josefin Sans">Josefin Sans</option>
                  </select>
                </div>
                <div className="dropdown-row">
                  <label>Text size</label>
                  <input
                    type="range"
                    min="12"
                    max="28"
                    value={accessibilitySettings.textSize}
                    onChange={(e) => persistAccessibilitySettings({ textSize: Number(e.target.value) })}
                  />
                  <span>{accessibilitySettings.textSize}px</span>
                </div>
                <div className="dropdown-row checkbox-row">
                  <label>
                    <input
                      type="checkbox"
                      checked={accessibilitySettings.letterSpacing === 'wide'}
                      onChange={(e) => persistAccessibilitySettings({ letterSpacing: e.target.checked ? 'wide' : 'normal' })}
                    />
                    Wide letter spacing
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={accessibilitySettings.wordHighlighting}
                      onChange={(e) => persistAccessibilitySettings({ wordHighlighting: e.target.checked })}
                    />
                    Word highlighting
                  </label>
                </div>
                <div className="preview-box dropdown-preview">
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
            )}
          </div>
        </div>
      </header>
      <main className="main-content" style={{ position: 'relative' }}>
        {xpGainPopup && (
          <div style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            backgroundColor: '#2a9d8f',
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
        <section className="detail-top-row">
          <div className="detail-avatar-large">{studentName?.charAt(0) || 'S'}</div>
          <div className="detail-info-block">
            <div className="detail-name">{studentName}</div>
            <div className="detail-meta-row">
              {studentGrade || 'Student'}{studentRoom ? ` · ${studentRoom}` : ''}
              {` · ${formattedDate} · Level: ${currentPhoneticLevel}`}
            </div>
            <p className="learning-path-text">
              {nextLesson
                ? `Next lesson: ${nextLesson.title}. Keep your streak going with the next activity.`
                : 'Your teacher will share lessons and practice activities here soon. Check back for updates.'}
            </p>
          </div>
          <div className="detail-badges">
            <span className="status-pill-large">Ready to learn</span>
            <span className="tier-pill-large">{tier}</span>
          </div>
        </section>
        <div className="detail-tabs">
          <button
            type="button"
            className={`tab-button ${activeSection === 'home' ? 'active' : ''}`}
            onClick={() => handleNav('home')}
          >
            Overview
          </button>
          <button
            type="button"
            className={`tab-button ${activeSection === 'content' ? 'active' : ''}`}
            onClick={() => handleNav('content')}
          >
            Learn
          </button>
          <button
            type="button"
            className={`tab-button ${activeSection === 'practice' ? 'active' : ''}`}
            onClick={() => handleNav('practice')}
          >
            Practice
          </button>
          <button
            type="button"
            className={`tab-button ${activeSection === 'progress' ? 'active' : ''}`}
            onClick={() => handleNav('progress')}
          >
            Progress
          </button>
          <button
            type="button"
            className={`tab-button ${activeSection === 'settings' ? 'active' : ''}`}
            onClick={() => handleNav('settings')}
          >
            Settings
          </button>
        </div>
        {activeSection === 'home' && (
          <>
            <section className="detail-block">
              <div className="detail-block-title">Overview</div>
              <p className="learning-path-text">
                {nextLesson
                  ? `Your next lesson is ${nextLesson.title}. Practice reading and pronunciation to keep moving forward.`
                  : 'No lesson is assigned yet. Your progress and learning path will update once your teacher publishes a new activity.'}
              </p>
              <div className="hero-actions">
                <button className="button-large button-primary" type="button" onClick={startReading}>
                  Start Reading
                </button>
              </div>
            </section>
            <section className="detail-block">
              <div className="detail-block-title">Phonetic Level Progress</div>
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
                  <strong>{currentPhoneticLevel === 'Easy' ? 5 : currentPhoneticLevel === 'Medium' ? 3 : 2}</strong>
                  <span>Required for Next</span>
                </div>
              </div>
              <div className="progress-bar" style={{ marginTop: '16px' }}>
                <div
                  className="progress-fill"
                  style={{
                    width: `${(progressInCurrentLevel / (currentPhoneticLevel === 'Easy' ? 5 : currentPhoneticLevel === 'Medium' ? 3 : 2)) * 100}%`,
                  }}
                />
              </div>
              <p style={{ fontSize: '0.9rem', color: '#556b85', marginTop: '8px' }}>
                {progressInCurrentLevel} / {currentPhoneticLevel === 'Easy' ? 5 : currentPhoneticLevel === 'Medium' ? 3 : 2}
              </p>
            </section>
            <section className="detail-block">
              <div className="detail-block-title">Today’s progress</div>
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
            </section>
            <section className="detail-block">
              <div className="detail-block-title">Learning path</div>
              {learningPathSteps.length > 0 ? (
                <div className="path-map">
                  {learningPathSteps.map((step) => (
                    <div key={step.id} className="path-step">
                      <div className={`path-dot ${step.completed ? 'completed' : 'pending'}`}>
                        {step.completed ? '✓' : '•'}
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
            <section className="detail-block">
              <div className="detail-block-title">Class notifications</div>
              <div className="notifications-list">
                {notifications.map((item) => (
                  <div key={item.id} className="notification-item">
                    <h4>{item.title}</h4>
                    <p>{item.message}</p>
                  </div>
                ))}
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
            <div className="practice-grid">
              <div className="word-card">
                <div className="word-display">
                  <div className="practice-word">{expectedText}</div>
                  <div className="word-hint">{`${levelNames[practiceLevel]} level practice`}</div>
                </div>
                <div className="word-actions">
                  <button
                    className={`button-large ${status === 'listening' ? 'button-danger listening-pulse' : status === 'correct' ? 'button-primary correct-highlight' : status === 'incorrect' ? 'button-danger incorrect-shake' : 'button-primary'}`}
                    onClick={handleMicClick}
                    disabled={isProcessing}
                  >
                    {status === 'listening' ? 'Listening…' : status === 'correct' ? 'Correct!' : status === 'incorrect' ? 'Try again' : 'Say the word'}
                  </button>
                  <button className="button-large button-secondary" type="button" onClick={replayRecognizedWord}>
                    Replay
                  </button>
                </div>
              </div>
              <div className="feedback-panel">
                <h4>Pronunciation feedback</h4>
                <div className={`feedback-result ${recognitionResult}`}>
                  <div className="feedback-icon">
                    {recognitionResult === 'success' ? '✓' : recognitionResult === 'almost' ? '!' : '✕'}
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
            {achievements > 0 && (
              <div className="achievements-section">
                <h4>Achievements</h4>
                <div className="achievements-list">
                  {Array.from({ length: achievements }, (_, index) => (
                    <span key={index} className="achievement-badge">Milestone {index + 1}</span>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}
        {activeSection === 'content' && (
          <>
            <section id="content-section" className="detail-block">
              <div className="detail-block-title">Shared lessons</div>
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
                <span>Lessons finished</span>
              </div>
              <div className="metric-card">
                <strong>{streakDays}</strong>
                <span>Streak days</span>
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
      </main>
    </div>
  );
};
export default StudentDashboard;
