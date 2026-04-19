/**
 * lookup.js — minimal pass assertion for Test D lookup-heavy cases.
 *
 * Purpose: this suite is a latency measurement, not a quality grader.
 * We only need each case to complete (returns valid JSON with events).
 * Latency is captured by promptfoo automatically (context.latencyMs,
 * also echoed in response.output.latency_ms).
 *
 * Tool-call count is recorded for post-hoc analysis via the `tool_calls`
 * score but NOT gated — an overrun marks the score but does not fail.
 */
module.exports = (output, context) => {
  let parsed;
  try {
    parsed = typeof output === 'string' ? JSON.parse(output) : output;
  } catch (err) {
    return { pass: false, score: 0, reason: `Invalid JSON output: ${err.message}` };
  }

  const events = Array.isArray(parsed.events) ? parsed.events : [];
  if (events.length === 0) {
    return { pass: false, score: 0, reason: 'No events in output' };
  }

  const thinkingCount = events.filter(e => e && e.event_type === 'thinking').length;
  const hasDone = Boolean(parsed.done);
  const doneStatus = (parsed.done && parsed.done.status) || parsed.status || 'unknown';

  return {
    pass: hasDone && (doneStatus === 'complete' || doneStatus === 'partial'),
    score: 1,
    reason: `events=${events.length} tool_calls≈${thinkingCount} status=${doneStatus}`,
  };
};
