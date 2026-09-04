// Experimental only: NOT loaded by legionnaire-insights.user.js.
// Goal: inspect and validate the game's live probabilistic decision path without
// globally patching Math.random or adding gameplay polling.

(function () {
  'use strict';

  const API_NAME = '__legionnaireDiceProbe';

  function getFiber(node) {
    if (!node) return null;
    const key = Object.keys(node).find((k) => k.startsWith('__reactFiber$'));
    return key ? node[key] : null;
  }

  function findRootFiber() {
    let fiber = getFiber(document.getElementById('root') || document.body);
    if (!fiber) {
      for (const el of document.querySelectorAll('*')) {
        fiber = getFiber(el);
        if (fiber) break;
      }
    }
    while (fiber && fiber.return) fiber = fiber.return;
    return fiber;
  }

  function findLiveDecision() {
    const root = findRootFiber();
    if (!root) return null;
    const stack = [root];
    const seen = new Set();
    let guard = 0;
    while (stack.length && guard++ < 50000) {
      const fiber = stack.pop();
      if (!fiber || seen.has(fiber)) continue;
      seen.add(fiber);
      const props = fiber.memoizedProps;
      if (props && typeof props === 'object' && props.decision && typeof props.onChoose === 'function') {
        return { fiber, props, decision: props.decision, onChoose: props.onChoose, player: props.player || null };
      }
      if (fiber.sibling) stack.push(fiber.sibling);
      if (fiber.child) stack.push(fiber.child);
    }
    return null;
  }

  function summarizeOutcome(outcome, index) {
    if (!outcome || typeof outcome !== 'object') return { index, value: outcome };
    return {
      index,
      probability: outcome.probability,
      resultLabel: outcome.resultLabel,
      effects: outcome.effects,
      keys: Object.keys(outcome).sort(),
    };
  }

  function summarizeOption(option, index) {
    const outcomes = Array.isArray(option && option.outcomes) ? option.outcomes : [];
    return {
      index,
      id: option && option.id,
      label: option && (option.label || option.title || option.text),
      keys: option && typeof option === 'object' ? Object.keys(option).sort() : [],
      probabilistic: outcomes.length > 1,
      outcomes: outcomes.map(summarizeOutcome),
    };
  }

  function inspect() {
    const live = findLiveDecision();
    if (!live) return { found: false };
    const options = Array.isArray(live.decision.options) ? live.decision.options : [];
    return {
      found: true,
      decisionId: live.decision.id,
      decisionKeys: Object.keys(live.decision).sort(),
      onChooseArity: live.onChoose.length,
      onChoosePreview: String(live.onChoose).slice(0, 1000),
      options: options.map(summarizeOption),
    };
  }

  function resolve(optionIndex, outcomeIndex) {
    const live = findLiveDecision();
    if (!live) throw new Error('No live decision with onChoose found');
    const options = Array.isArray(live.decision.options) ? live.decision.options : [];
    const option = options[optionIndex];
    if (!option) throw new Error(`Option ${optionIndex} not found`);
    const outcomes = Array.isArray(option.outcomes) ? option.outcomes : [];
    const outcome = outcomes[outcomeIndex];
    if (!outcome) throw new Error(`Outcome ${outcomeIndex} not found`);
    if (outcomes.length < 2) throw new Error('Option is not probabilistic');
    return { live, option, outcome, outcomes };
  }

  // Candidate A: preserve the original option shape but narrow the outcome
  // array to the selected outcome. If the game's onChoose rolls directly from
  // option.outcomes, this keeps all normal game state/effect code intact while
  // making the only possible roll deterministic.
  function forceBySingleOutcome(optionIndex, outcomeIndex) {
    const { live, option, outcome } = resolve(optionIndex, outcomeIndex);
    const forcedOption = { ...option, outcomes: [outcome] };
    return live.onChoose(forcedOption);
  }

  // Candidate B: preserve the original number/order of outcomes and only make
  // the desired one probability 1. This is useful if onChoose expects the
  // original outcome array shape but samples by cumulative probability.
  function forceByProbability(optionIndex, outcomeIndex) {
    const { live, option, outcomes } = resolve(optionIndex, outcomeIndex);
    const forcedOption = {
      ...option,
      outcomes: outcomes.map((outcome, index) => ({
        ...outcome,
        probability: index === outcomeIndex ? 1 : 0,
      })),
    };
    return live.onChoose(forcedOption);
  }

  function probabilisticOptions() {
    const snapshot = inspect();
    return snapshot.found ? snapshot.options.filter((o) => o.probabilistic) : [];
  }

  Object.defineProperty(window, API_NAME, {
    configurable: true,
    value: Object.freeze({
      inspect,
      probabilisticOptions,
      forceBySingleOutcome,
      forceByProbability,
    }),
  });

  console.info(`Legionnaire dice probe ready as window.${API_NAME}. Start with .inspect().`);
})();
