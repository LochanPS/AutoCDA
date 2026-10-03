import { parseFallback, PARSE_FAIL_MESSAGE } from "./parseFallback";
import { parsePrompt } from "../utils/circuitParser";

describe("parseFallback — the parse-failure message path", () => {
  test("garbage input (confidence 0) → fail outcome with calm message + type picker", () => {
    const fast = parsePrompt("asdf qwerty 123 zzz");
    expect(fast.confidence).toBe(0);
    expect(fast.type).toBeNull();

    const out = parseFallback(fast);
    expect(out.kind).toBe("fail");
    expect(out.showTypePicker).toBe(true);
    expect(out.message).toBe(PARSE_FAIL_MESSAGE);
    // Calm + specific: names an example, never blank or a raw error.
    expect(out.message).toMatch(/low-pass filter 2 kHz/);
    expect(out.message.length).toBeGreaterThan(0);
  });

  test("empty / whitespace prompt also routes to fail, not a blank state", () => {
    const out = parseFallback(parsePrompt("   "));
    expect(out.kind).toBe("fail");
    expect(out.message).toBe(PARSE_FAIL_MESSAGE);
  });

  test("a type matched with defaulted targets → lowConfidence (confirm card), no message", () => {
    // "low pass filter" with no frequency → type matches, target defaulted.
    const fast = parsePrompt("low pass filter");
    expect(fast.type).toBe("rc_lowpass");
    expect(fast.confidence).toBeLessThan(0.9);

    const out = parseFallback(fast);
    expect(out.kind).toBe("lowConfidence");
    expect(out.message).toBeUndefined();
  });
});
