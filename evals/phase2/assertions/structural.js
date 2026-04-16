/**
 * structural.js — Pass/fail assertions for basic structural integrity.
 *
 * Checks:
 *   1. Output parses as valid JSON
 *   2. At least 1 event exists
 *   3. A "done" event exists with status "complete" or "partial"
 *
 * @param {string} output - JSON string returned by the promptfoo provider
 * @param {object} context - promptfoo context (vars, prompt, etc.)
 * @returns {{ pass: boolean, score: number, reason: string }}
 */
module.exports = (output, context) => {
  let parsed;
  try {
    parsed = typeof output === 'string' ? JSON.parse(output) : output;
  } catch (err) {
    return { pass: false, score: 0, reason: `Failed to parse output as JSON: ${err.message}` };
  }

  // Check: at least 1 event
  const events = parsed.events;
  if (!Array.isArray(events) || events.length === 0) {
    return { pass: false, score: 0, reason: 'No events found in output' };
  }

  // Check: done event exists
  const done = parsed.done;
  if (!done) {
    return { pass: false, score: 0, reason: 'No done event found in output' };
  }

  // Check: status is "complete" or "partial"
  const status = done.status || parsed.status;
  if (status !== 'complete' && status !== 'partial') {
    return {
      pass: false,
      score: 0,
      reason: `Done event has unexpected status: "${status}" (expected "complete" or "partial")`,
    };
  }

  return {
    pass: true,
    score: 1,
    reason: `Structural OK: ${events.length} events, status="${status}"`,
  };
};
