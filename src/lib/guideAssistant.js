import GUIDE_ANSWERS from '@/lib/guideAnswers';
import { TOOL_GUIDE_SECTIONS } from '@/lib/toolKnowledge';

// Small, deterministic in-app guide. It deliberately answers only from AXIS 3D's
// maintained help data instead of guessing about controls or behavior it cannot verify.
const clean = (text) => String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const padded = (text) => ` ${clean(text)} `;
const tokens = (text) => clean(text).split(' ').filter(Boolean);

const FALLBACK = 'I do not have a reliable AXIS 3D answer for that yet. Try naming the exact tool or gesture. I would rather leave this unanswered than guess.';
const AMBIGUOUS_TOOL_NAMES = new Set(['object', 'face', 'edge', 'vertex', 'smooth', 'merge', 'delete', 'clone', 'split', 'connect', 'lock', 'mirror', 'combine', 'separate', 'divide', 'measure']);
const WEAK_TOPIC_WORDS = new Set(['select', 'selection', 'choose', 'move', 'drag', 'position', 'rotate', 'rotation', 'scale', 'resize', 'color', 'image', 'file', 'save', 'name', 'view', 'box', 'multiple', 'smooth']);
const STOP_WORDS = new Set(['a', 'an', 'and', 'are', 'can', 'do', 'does', 'for', 'how', 'i', 'in', 'is', 'it', 'me', 'of', 'on', 'or', 'the', 'this', 'to', 'what', 'where', 'with', 'you']);

function hasPhrase(text, phrase) {
  const p = clean(phrase);
  if (!p) return false;
  return text.includes(` ${p} `) || text.includes(` ${p}s `) || text.includes(` ${p}es `);
}

const toolIndex = TOOL_GUIDE_SECTIONS.flatMap((section) =>
  section.items.map((item) => ({ group: section.title, ...item, key: item.name.toLowerCase() }))
);
const toolNames = [...new Set(toolIndex.map((tool) => tool.name))];

function toolAnswer(name) {
  const hits = toolIndex.filter((tool) => tool.name === name);
  if (hits.length === 1) return `${name} (${hits[0].group}): ${hits[0].description}`;
  return hits.map((tool) => `${tool.group} → ${name}: ${tool.description}`).join('\n');
}

function intentPrefix(question, name, answer) {
  const q = clean(question);
  if (/^(where|where is|where s|find|location)\b/.test(q)) {
    return `${name}: ${answer}`;
  }
  if (/^(what|what is|what does|explain|tell me about)\b/.test(q)) {
    return answer;
  }
  if (/^(how|how do|how can)\b/.test(q)) {
    return answer;
  }
  return answer;
}

export function localAnswer(question) {
  const text = padded(question);
  const qTokens = tokens(question);
  if (!qTokens.length) return FALLBACK;

  const meaningful = qTokens.filter((word) => !STOP_WORDS.has(word));

  // Specific multi-word/unambiguous tool names can answer directly. Selection
  // nouns such as Object/Face/Edge/Vertex are context in normal questions:
  // "rotate an object" must answer rotation, not define the Object mode.
  const namedTools = toolNames
    .filter((name) => hasPhrase(text, name))
    .sort((a, b) => b.length - a.length);
  const specificTools = namedTools.filter((name) => !AMBIGUOUS_TOOL_NAMES.has(name.toLowerCase()));

  if (specificTools.length) {
    const chosen = specificTools[0];
    return intentPrefix(question, chosen, toolAnswer(chosen));
  }

  // An ambiguous tool name is only a direct lookup when it is essentially the
  // whole question ("what does Merge do?", "where is Delete?"), not when it is
  // merely the target/context of another action.
  if (namedTools.length && meaningful.length <= 2) {
    const chosen = namedTools[0];
    return intentPrefix(question, chosen, toolAnswer(chosen));
  }

  const scored = [];

  GUIDE_ANSWERS.forEach((entry, order) => {
    let score = 0;
    let strongMatches = 0;
    let matches = 0;

    entry.words.forEach((word) => {
      if (!hasPhrase(text, word)) return;
      matches += 1;
      const wordCount = tokens(word).length;
      const weak = wordCount === 1 && WEAK_TOPIC_WORDS.has(clean(word));
      if (!weak) strongMatches += 1;
      score += weak ? 1 : 4 + Math.max(0, wordCount - 1) * 3;
    });

    // Action words are valid intent even in a longer natural-language question.
    // Specific phrases still outrank them, but "rotate an object" must remain a
    // rotation question rather than falling through to Object mode.
    if (score > 0) scored.push({ score, strongMatches, matches, order, answer: entry.answer });
  });

  if (!scored.length) return FALLBACK;
  scored.sort((a, b) =>
    b.score - a.score ||
    b.strongMatches - a.strongMatches ||
    b.matches - a.matches ||
    a.order - b.order
  );

  // Refuse a very weak accidental match on a detailed question.
  if (scored[0].score <= 1 && meaningful.length > 2) return FALLBACK;
  return scored[0].answer;
}
