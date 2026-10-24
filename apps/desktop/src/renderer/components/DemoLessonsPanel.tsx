import { useState } from 'react';
import { DEMO_LESSONS, type DemoLesson } from '@screentutor/shared';
import './DemoLessonsPanel.css';

interface Props {
  onSelectQuestion: (question: string, mode: string, lesson: DemoLesson) => void;
  onClose: () => void;
}

const CATEGORIES = ['All', 'Algebra', 'Calculus', 'Graphs', 'Code'] as const;

export default function DemoLessonsPanel({ onSelectQuestion, onClose }: Props) {
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [expandedLesson, setExpandedLesson] = useState<string | null>(DEMO_LESSONS[0].id);

  const filtered = activeCategory === 'All'
    ? DEMO_LESSONS
    : DEMO_LESSONS.filter(l => l.category === activeCategory);

  const handleChip = (lesson: DemoLesson, q: { label: string; mode: string }) => {
    onSelectQuestion(q.label, q.mode, lesson);
  };

  return (
    <div className="demo-panel">
      <div className="demo-panel-header drag-region">
        <div className="demo-header-left">
          <span className="demo-icon">🎓</span>
          <div>
            <h3 className="demo-title">Demo Lessons</h3>
            <p className="demo-subtitle">Works offline · Mock mode</p>
          </div>
        </div>
        <button className="demo-close-btn no-drag" onClick={onClose} aria-label="Close Demo Lessons">✕</button>
      </div>

      {/* Category filter */}
      <div className="demo-category-bar no-drag">
        {CATEGORIES.map(cat => (
          <button
            key={cat}
            className={`demo-cat-chip ${activeCategory === cat ? 'active' : ''}`}
            onClick={() => setActiveCategory(cat)}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Lesson list */}
      <div className="demo-lesson-list">
        {filtered.map(lesson => (
          <div
            key={lesson.id}
            className={`demo-lesson-card ${expandedLesson === lesson.id ? 'expanded' : ''}`}
          >
            {/* Card header */}
            <button
              className="demo-lesson-header no-drag"
              onClick={() => setExpandedLesson(expandedLesson === lesson.id ? null : lesson.id)}
              aria-expanded={expandedLesson === lesson.id}
            >
              <span className="demo-lesson-emoji">{lesson.emoji}</span>
              <div className="demo-lesson-meta">
                <span className="demo-lesson-name">{lesson.title}</span>
                <span className="demo-lesson-cat">{lesson.category}</span>
              </div>
              <span className="demo-lesson-chevron">{expandedLesson === lesson.id ? '▲' : '▼'}</span>
            </button>

            {/* Expanded content */}
            {expandedLesson === lesson.id && (
              <div className="demo-lesson-body">
                {/* Content preview */}
                <div className="demo-content-preview" aria-label="Lesson content">
                  <div className="demo-content-lines">
                    {lesson.contentLines.map((line, i) => (
                      <div key={i} className={`demo-content-line ${line === '' ? 'spacer' : ''} ${line.startsWith('←') || line.startsWith('#') ? 'dim' : ''} ${line.startsWith('Student') ? 'dim' : ''}`}>
                        {line || '\u00A0'}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Description */}
                <p className="demo-lesson-desc">{lesson.description}</p>

                {/* Suggested questions */}
                <div className="demo-questions-label">Suggested questions:</div>
                <div className="demo-question-chips">
                  {lesson.suggestedQuestions.map((q, i) => (
                    <button
                      key={i}
                      className={`demo-q-chip mode-${q.mode} no-drag`}
                      onClick={() => handleChip(lesson, q)}
                      title={`Mode: ${q.mode}`}
                    >
                      <span className="chip-mode-dot" />
                      {q.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="demo-panel-footer">
        <span className="demo-footer-badge">🤖 Mock Claude · No API key needed</span>
      </div>
    </div>
  );
}
