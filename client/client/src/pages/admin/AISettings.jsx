import React, { useState } from 'react';

export default function AISettings() {
  const [settings, setSettings] = useState({
    readingAssistant: true,
    difficultyAdjustment: 'medium',
    recommendationEngine: true,
    responseTone: 'helpful',
  });

  const handleChange = (key, value) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <section className="dashboard-section">
      <div className="section-heading">
        <div>
          <h2>AI Settings</h2>
          <p>Configure adaptive reading assistance, recommendations, and AI behavior.</p>
        </div>
        <span className="pill">AI Controls</span>
      </div>

      <div className="card-panel">
        <div className="section-heading">
          <div>
            <h3>AI configuration</h3>
            <p>Use toggles and controls to customize how AI supports learners.</p>
          </div>
        </div>
        <div className="status-grid dashboard-status-grid">
          <div>
            <span>Reading assistant</span>
            <strong>{settings.readingAssistant ? 'Enabled' : 'Disabled'}</strong>
          </div>
          <div>
            <span>Difficulty level</span>
            <strong>{settings.difficultyAdjustment}</strong>
          </div>
          <div>
            <span>Recommendations</span>
            <strong>{settings.recommendationEngine ? 'Active' : 'Off'}</strong>
          </div>
          <div>
            <span>Response tone</span>
            <strong>{settings.responseTone}</strong>
          </div>
        </div>

        <div className="teacher-form">
          <label>
            Reading assistant
            <input type="checkbox" checked={settings.readingAssistant} onChange={(e) => handleChange('readingAssistant', e.target.checked)} />
          </label>
          <label>
            Difficulty adjustment
            <select value={settings.difficultyAdjustment} onChange={(e) => handleChange('difficultyAdjustment', e.target.value)}>
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </label>
          <label>
            Recommendation engine
            <input type="checkbox" checked={settings.recommendationEngine} onChange={(e) => handleChange('recommendationEngine', e.target.checked)} />
          </label>
          <label>
            AI response tone
            <select value={settings.responseTone} onChange={(e) => handleChange('responseTone', e.target.value)}>
              <option value="helpful">Helpful</option>
              <option value="concise">Concise</option>
              <option value="encouraging">Encouraging</option>
            </select>
          </label>
        </div>
      </div>
    </section>
  );
}
