import { useState } from 'react';
import { Search } from 'lucide-react';
import { localAnswer } from '@/lib/guideAssistant';

export default function GuideQuestionBar({ uiColor, highlightColor }) {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');

  const ask = (event) => {
    event.preventDefault();
    const text = question.trim();
    if (text) setAnswer(localAnswer(text));
  };

  return (
    <div className="mb-5">
      <form onSubmit={ask} className="flex gap-2">
        <label htmlFor="guide-question" className="sr-only">Ask a question about tools or gestures</label>
        <input
          id="guide-question"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="Ask about tools or gestures"
          className="h-10 flex-1 min-w-0 rounded-lg border bg-white/5 px-3 text-[13px] outline-none"
          style={{ color: uiColor, borderColor: `${highlightColor}55`, caretColor: highlightColor }}
        />
        <button
          type="submit"
          aria-label="Ask question"
          className="h-10 w-10 shrink-0 rounded-lg border flex items-center justify-center active:scale-95"
          style={{ color: highlightColor, borderColor: `${highlightColor}66` }}
        >
          <Search className="w-4 h-4" />
        </button>
      </form>
      {answer && <p className="mt-2 rounded-lg bg-white/5 p-3 text-[13px] leading-snug whitespace-pre-line" style={{ color: uiColor }}>{answer}</p>}
    </div>
  );
}