import React, { useState, useRef } from 'react';
import { speechService } from '../services/api';

const SpeechPractice = ({ expectedText }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState(null);
  const [feedback, setFeedback] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

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
        await uploadAndProcess(audioBlob);
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
    } catch (error) {
      console.error('Error starting recording:', error);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const uploadAndProcess = async (audioBlob) => {
    setIsProcessing(true);
    try {
      const audioFile = new File([audioBlob], `reading-${Date.now()}.wav`, { type: audioBlob.type || 'audio/wav' });
      const transcription = await speechService.speechToText(audioFile);
      const spokenText = transcription?.data?.text || '';
      const isMatch = spokenText.trim().toLowerCase() === String(expectedText).trim().toLowerCase();
      const feedbackText = isMatch
        ? 'Great reading! Your pronunciation matched the text.'
        : `I heard "${spokenText || 'nothing clearly'}". Try reading "${expectedText}" again.`;

      setFeedback(feedbackText);

      try {
        const { data } = await speechService.textToSpeech(feedbackText);
        setAudioUrl(data.audioUrl);
        const audio = new Audio(data.audioUrl);
        audio.play();
      } catch (ttsError) {
        console.warn('Text-to-speech feedback is unavailable:', ttsError);
      }

    } catch (error) {
      console.error('Error processing audio:', error);
      setFeedback('Sorry, there was an error. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="speech-practice">
      <h2>Practice Reading</h2>
      <p>Read this text: <strong>{expectedText}</strong></p>
      
      <button 
        onClick={isRecording ? stopRecording : startRecording}
        disabled={isProcessing}
      >
        {isRecording ? 'Stop Recording' : 'Start Recording'}
      </button>
      
      {isProcessing && <p>Processing your speech...</p>}
      
      {feedback && (
        <div className="feedback">
          <p>{feedback}</p>
          {audioUrl && <audio controls src={audioUrl}>Your browser does not support audio playback.</audio>}
        </div>
      )}
    </div>
  );
};

export default SpeechPractice;
