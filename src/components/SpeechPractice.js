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
      // Upload to Firebase Storage
      const storageRef = ref(storage, `audio/${Date.now()}.wav`);
      await uploadBytes(storageRef, audioBlob);
      const downloadURL = await getDownloadURL(storageRef);

      // Call Cloud Function
      const functions = getFunctions();
      const processSpeech = httpsCallable(functions, 'processSpeech');
      const result = await processSpeech({
        audioUrl: downloadURL,
        expectedText,
        userId: 'user123', // Replace with actual user ID
      });

      setFeedback(result.data.feedbackText);

      // Play TTS audio
      const audio = new Audio(`data:audio/mp3;base64,${result.data.audioBase64}`);
      audio.play();

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
        </div>
      )}
    </div>
  );
};

export default SpeechPractice;