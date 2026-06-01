import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { lessonService, progressService, speechService } from '../services/api';

export default function LessonComponent() {
  const { lessonId, studentId } = useParams();
  const [lesson, setLesson] = useState(null);
  const [progress, setProgress] = useState(null);
  const [isReading, setIsReading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [transcription, setTranscription] = useState('');
  const [loading, setLoading] = useState(true);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  useEffect(() => {
    fetchLesson();
    if (studentId) {
      fetchProgress();
    } else {
      setLoading(false);
    }
  }, [lessonId, studentId]);

  const fetchLesson = async () => {
    try {
      const response = await lessonService.getLesson(lessonId);
      setLesson(response.data);
    } catch (error) {
      console.error('Error fetching lesson:', error);
    }
  };

  const fetchProgress = async () => {
    try {
      const response = await progressService.createOrGetProgress({
        studentId,
        lessonId,
      });
      setProgress(response.data);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching progress:', error);
      setLoading(false);
    }
  };

  const handleReadAloud = async () => {
    if (!lesson) return;

    try {
      setIsReading(true);
      const response = await speechService.textToSpeech(lesson.tagalogText);
      const audioBlob = new Blob([response.data], { type: 'audio/mpeg' });
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      audio.play();
      audio.onended = () => setIsReading(false);
    } catch (error) {
      console.error('TTS Error:', error);
      setIsReading(false);
      alert('Failed to play audio');
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };

      mediaRecorderRef.current.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        await transcribeAudio(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
    } catch (error) {
      console.error('Recording Error:', error);
      alert('Failed to start recording');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const transcribeAudio = async (audioBlob) => {
    try {
      const response = await speechService.speechToText(audioBlob);
      setTranscription(response.data.text);
    } catch (error) {
      console.error('STT Error:', error);
      alert('Failed to transcribe audio');
    }
  };

  const handleCompleteLesson = async () => {
    const progressId = progress?._id || progress?.id;
    if (!progressId) {
      alert('Lesson preview only. Open this as a student to save progress.');
      return;
    }

    try {
      await progressService.updateProgress(progressId, {
        status: 'completed',
        score: 85,
        percentageComplete: 100,
        feedback: 'Great job! You completed this lesson.',
      });
      alert('Lesson completed!');
      window.location.href = '/dashboard';
    } catch (error) {
      console.error('Error completing lesson:', error);
    }
  };

  if (loading || !lesson) return <div className="container" style={{ marginTop: '2rem' }}>Loading...</div>;

  return (
    <div className="container" style={{ maxWidth: '800px', marginTop: '2rem' }}>
      <div className="card">
        <h1>{lesson.title}</h1>
        <p style={{ color: 'var(--secondary-text)', marginBottom: '1.5rem' }}>{lesson.description}</p>

        <div style={{
          backgroundColor: 'var(--light-bg)',
          padding: '2rem',
          borderRadius: '8px',
          marginBottom: '2rem',
          fontSize: '1.3rem',
          fontWeight: '600',
          lineHeight: '2',
          letterSpacing: '0.08em',
        }}>
          {lesson.tagalogText}
        </div>

        <div style={{ marginBottom: '2rem' }}>
          <h2>Content</h2>
          <p style={{ fontSize: '1.1rem', lineHeight: '1.8' }}>{lesson.content}</p>
        </div>

        <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
          <button className="btn-primary" onClick={handleReadAloud}>
            🔊 {isReading ? 'Playing...' : 'Read Aloud'}
          </button>
          <button className="btn-secondary" onClick={isRecording ? stopRecording : startRecording}>
            🎤 {isRecording ? 'Stop Recording' : 'Record & Transcribe'}
          </button>
          <button className="btn-secondary" onClick={() => window.location.href = '/dashboard'}>
            Back to Dashboard
          </button>
        </div>

        {transcription && (
          <div style={{ marginBottom: '2rem' }}>
            <h3>Your Transcription:</h3>
            <p style={{ backgroundColor: 'var(--light-bg)', padding: '1rem', borderRadius: '8px' }}>
              {transcription}
            </p>
          </div>
        )}

        <button className="btn-primary" onClick={handleCompleteLesson} style={{ width: '100%', padding: '1rem' }}>
          {studentId ? 'Complete Lesson' : 'Preview Lesson'}
        </button>
      </div>
    </div>
  );
}
