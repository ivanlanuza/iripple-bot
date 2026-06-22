function roundDuration(ms) {
  return Math.round(ms * 10) / 10;
}

export function createTimingTracker(label) {
  const startedAt = Date.now();
  const marks = {};

  return {
    mark(name) {
      marks[name] = roundDuration(Date.now() - startedAt);
      return marks[name];
    },

    snapshot(extra = {}) {
      return {
        label,
        ...marks,
        totalMs: roundDuration(Date.now() - startedAt),
        ...extra,
      };
    },

    log(extra = {}) {
      console.info(
        `[perf] ${label} ${JSON.stringify(this.snapshot(extra))}`,
      );
    },
  };
}
