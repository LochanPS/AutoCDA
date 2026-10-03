/**
 * parseFallback.js — pure decision for the parser's no-LLM / low-confidence tail.
 *
 * After the regex fast path runs and (optionally) the LLM fallback has been
 * tried, the app still needs to decide what to show the user. This is that
 * decision, extracted from App so it can be unit-tested without rendering the
 * whole component tree or hitting the network.
 *
 * Given the regex `fast` result, it returns one of two outcomes:
 *   - "fail"       → couldn't identify any circuit: show a calm message + the
 *                    type picker so the user can choose manually.
 *   - "lowConfidence" → a type matched but with defaulted targets: open the
 *                    confirm card flagged low-confidence (no message needed).
 */

export const PARSE_FAIL_MESSAGE =
  'Couldn’t identify a circuit from that. Try something like ' +
  '“low-pass filter 2 kHz”, or pick a type below.';

/**
 * Decide the fallback outcome for a regex parse result.
 * @param {{type: ?string, confidence: number}} fast - parsePrompt() output
 * @returns {{kind: "fail", message: string, showTypePicker: true}
 *          | {kind: "lowConfidence"}}
 */
export function parseFallback(fast) {
  if (!fast || fast.confidence === 0 || !fast.type) {
    return { kind: "fail", message: PARSE_FAIL_MESSAGE, showTypePicker: true };
  }
  return { kind: "lowConfidence" };
}
