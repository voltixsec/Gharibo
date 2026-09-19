/**
 * Deterministic conversation titles derived from the first user message.
 *
 * WHY THIS EXISTS
 * ---------------
 * A new chat starts as "New conversation", which is useless in a sidebar once
 * there are several of them. Titling must therefore happen as soon as the first
 * user message is accepted.
 *
 * WHY IT IS NOT AI-GENERATED
 * --------------------------
 * Calling GHARIBO-V1 (or any external model) to invent a title would wake a
 * scaled-to-zero GPU, cost money, add latency to the very first message, and
 * introduce a second failure mode into a request the user is waiting on. The
 * first message is already a perfectly good description of the conversation, so
 * the title is derived from it: deterministic, fast, local and free.
 *
 * No network. No model. No randomness.
 */

/** Title given to a conversation until its first user message is accepted. */
export const DEFAULT_CONVERSATION_TITLE = "New conversation";

/** Hard cap so a title always fits a sidebar row. */
export const MAX_TITLE_CHARS = 60;

/** Aim for a compact phrase; never exceed this many words before char capping. */
const MAX_WORDS = 10;

/** Anything shorter than this is usually not worth showing over the default. */
const MIN_USEFUL_CHARS = 2;

/** Fenced code blocks. */
const FENCE_RE = /```[\s\S]*?```/g;
/** Inline code spans. */
const INLINE_CODE_RE = /`[^`]*`/g;
/** URLs (and bare www hosts). */
const URL_RE = /\b(?:https?:\/\/|www\.)\S+/gi;
/**
 * Long opaque tokens: hashes, base64 blobs, ids.
 *
 * Deliberately conservative. A blanket "N+ characters with no spaces" rule eats
 * ordinary long words ("supercalifragilistic"), which is worse than leaving an
 * id in a title. So a token is only treated as machine noise when it either
 *   - carries a digit and is long (>= 20), which is how ids/hashes look, or
 *   - is absurdly long (>= 48), which no real word is.
 */
const LONG_TOKEN_RE =
  /\b(?=[A-Za-z0-9_+/=-]*\d)[A-Za-z0-9_+/=-]{20,}\b|\b[A-Za-z0-9_+/=-]{48,}\b/g;
/** All whitespace (incl. NBSP and newlines) collapsed to single spaces. */
const WHITESPACE_RE = /\s+/g;

/** Leading/trailing punctuation and quote marks, Latin AND Arabic. */
const EDGE_PUNCT_RE =
  /^[\s"'“”‘’`*_\-–—~|:;,.!?؟،؛؟()[\]{}<>«»/\\]+|[\s"'“”‘’`*_\-–—~|:;,.!?؟،؛؟()[\]{}<>«»/\\]+$/g;

/** Politeness/intent lead-ins, English. Order matters (longest first). */
const EN_LEAD_INS = [
  "can you please",
  "could you please",
  "would you please",
  "can you",
  "could you",
  "would you",
  "please",
  "help me to",
  "help me",
  "i would like to",
  "i'd like to",
  "i want to",
  "i need to",
  "i want",
  "i need",
  "let's",
  "lets",
  "tell me about",
  "tell me",
];

/** Politeness/intent lead-ins, Arabic. */
const AR_LEAD_INS = [
  "من فضلك",
  "لو سمحت",
  "ممكن",
  "أريد أن",
  "اريد ان",
  "أرغب في",
  "ارغب في",
  "أريد",
  "اريد",
  "أرغب",
  "ارغب",
  "عايز اعمل",
  "عايز أعمل",
  "عايز",
  "عيز",
  "محتاج",
];

/** Trailing filler that adds nothing to a title. */
const EN_TRAILING_RE = /\s+(?:for this project|for my project|for me|please|thanks|thank you|pls)\.?$/i;
const AR_TRAILING_RE = /\s+(?:للشركة|للمشروع|في المشروع|ده|دي)\s*$/;

/** English stopwords, dropped only from Latin-script titles. */
const EN_STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "of", "for", "to", "in", "on", "at", "by",
  "with", "from", "my", "me", "is", "are", "was", "were", "be", "this", "that",
  "it", "its", "about", "into", "as", "do", "does", "did", "some", "any",
]);

/** True when the text is Latin-script (so stopword rules are safe to apply). */
function isLatinScript(text) {
  if (!text) return false;
  const latin = (text.match(/[A-Za-z]/g) || []).length;
  const nonLatin = (text.match(/[؀-ۿ]/g) || []).length;
  return latin > 0 && latin >= nonLatin;
}

/**
 * Removes a known lead-in phrase from the start of the text.
 *
 * The match is case-insensitive but the SLICE is taken from the original, so
 * the remainder keeps its own capitalisation. Lowercasing the whole string here
 * would silently destroy acronyms - "NVIDIA NIM" became "Nvidia nim".
 */
function stripLeadIn(text, phrases) {
  const lower = text.toLowerCase();
  for (const phrase of phrases) {
    if (lower.startsWith(phrase)) {
      const rest = text.slice(phrase.length).trimStart();
      // Only strip when something meaningful is left behind.
      if (rest.length >= MIN_USEFUL_CHARS) return rest;
    }
  }
  return text;
}

/**
 * Collapses "compare X with Y" into "X vs Y" before word capping runs, so both
 * subjects survive truncation.
 */
function collapseComparison(text) {
  const en = text.match(/^compare\s+(.+?)\s+(?:with|and|to|vs\.?|versus)\s+(.+)$/i);
  if (en) return `${en[1].trim()} vs ${en[2].trim()}`;

  const ar = text.match(/^مقارنة\s+(?:بين\s+)?(.+?)\s+(?:و|مع|ضد)\s+(.+)$/);
  if (ar) return `${ar[1].trim()} vs ${ar[2].trim()}`;

  return text;
}

/**
 * Truncates on a character budget without ever splitting a Unicode code point,
 * preferring a word boundary and marking the cut.
 */
function truncateCleanly(text, maxChars) {
  const chars = Array.from(text);
  if (chars.length <= maxChars) return text;

  // Reserve one code point for the ellipsis so the RESULT fits the budget,
  // not the text before the ellipsis is added.
  const budget = Math.max(1, maxChars - 1);
  const candidate = chars.slice(0, budget).join("");

  // Prefer the last whitespace before the cap so we do not cut mid-word.
  const lastSpace = candidate.lastIndexOf(" ");
  if (lastSpace > Math.floor(budget * 0.6)) {
    return `${candidate.slice(0, lastSpace).trimEnd()}…`;
  }
  // No sensible boundary: cut by code point and mark it.
  return `${candidate.trimEnd()}…`;
}

/**
 * Derives a compact, sidebar-safe conversation title from a user message.
 *
 * The language of the input is preserved: Arabic in, Arabic out. Nothing is
 * transliterated or translated.
 *
 * @param {unknown} firstUserMessage
 * @returns {string} a title, or {@link DEFAULT_CONVERSATION_TITLE} when nothing
 *   useful can be derived.
 */
export function deriveConversationTitle(firstUserMessage) {
  if (typeof firstUserMessage !== "string") return DEFAULT_CONVERSATION_TITLE;

  let text = firstUserMessage;

  // 1. Drop code and machine-generated noise before anything else, so a pasted
  //    stack trace or a signed URL cannot dominate the title.
  text = text.replace(FENCE_RE, " ").replace(INLINE_CODE_RE, " ");
  text = text.replace(URL_RE, " ").replace(LONG_TOKEN_RE, " ");

  // 2. Normalise every kind of whitespace (multiline prompts become one line).
  text = text.replace(WHITESPACE_RE, " ").trim();
  if (!text) return DEFAULT_CONVERSATION_TITLE;

  // 3. Trim edge punctuation.
  text = text.replace(EDGE_PUNCT_RE, "").trim();
  if (text.length < MIN_USEFUL_CHARS) return DEFAULT_CONVERSATION_TITLE;

  // 4. Peel politeness/intent off the front (both scripts). Matching is
  //    case-insensitive inside stripLeadIn; the remainder keeps its own casing.
  text = stripLeadIn(text, EN_LEAD_INS);
  text = stripLeadIn(text, AR_LEAD_INS);

  text = text.replace(WHITESPACE_RE, " ").trim();
  text = text.replace(EDGE_PUNCT_RE, "").trim();
  if (text.length < MIN_USEFUL_CHARS) return DEFAULT_CONVERSATION_TITLE;

  // 5. Keep both subjects of a comparison ("X vs Y").
  text = collapseComparison(text);

  // 6. Drop filler at the end.
  text = text.replace(EN_TRAILING_RE, "").replace(AR_TRAILING_RE, "").trim();

  // 7. For Latin script only, drop stopwords to tighten the phrase.
  if (isLatinScript(text)) {
    const words = text.split(" ").filter((w) => w.length > 0);
    const kept = words.filter((w) => !EN_STOPWORDS.has(w.toLowerCase()));
    // Never let stopword removal leave nothing meaningful.
    if (kept.length >= Math.min(2, words.length) && kept.join(" ").length >= MIN_USEFUL_CHARS) {
      text = kept.join(" ");
    }
  }

  // 8. Word cap, then character cap.
  const words = text.split(" ").filter((w) => w.length > 0);
  if (words.length > MAX_WORDS) text = words.slice(0, MAX_WORDS).join(" ");
  text = truncateCleanly(text, MAX_TITLE_CHARS);

  // 9. Final tidy-up.
  text = text.replace(EDGE_PUNCT_RE, "").trim();
  if (text.length < MIN_USEFUL_CHARS) return DEFAULT_CONVERSATION_TITLE;

  // 10. Sentence-case a plain lowercase Latin first word ("debug" -> "Debug"),
  //     leaving words that already use internal capitals alone ("eBay").
  const firstWord = text.split(" ")[0] || "";
  if (/^[a-z]/.test(text) && !/[A-Z]/.test(firstWord.slice(1))) {
    text = text.charAt(0).toUpperCase() + text.slice(1);
  }

  return text;
}

/**
 * True when a persisted title still counts as "untitled" and may therefore be
 * replaced by an automatic title.
 *
 * A manual rename is authoritative: once the title is anything else, this is
 * false and automatic titling must not touch it.
 *
 * @param {unknown} title
 * @returns {boolean}
 */
export function isAutoTitleEligible(title) {
  if (typeof title !== "string") return true;
  const trimmed = title.trim();
  return trimmed === "" || trimmed === DEFAULT_CONVERSATION_TITLE;
}
