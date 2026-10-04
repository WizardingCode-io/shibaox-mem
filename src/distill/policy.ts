// Every threshold that turns a judgment into an action lives here, in code, so that it
// can be read, tested and tuned against the golden set without touching a judge.

/** A turn is distilled into a memory when its `worthSaving` reaches this. */
export const SAVE_THRESHOLD = 0.5;

/** A sentence becomes one of a memory's facts when its durability reaches this. */
export const DURABLE_THRESHOLD = 0.5;

export const MAX_FACTS = 5;
export const TITLE_MAX_CHARS = 120;

/** The draft repeats an existing memory: reinforce that memory instead of storing the draft. */
export const DUPLICATE = { minRelationScore: 1.5, maxContradiction: 0.5 };

/** The draft replaces an existing memory: store the draft and mark the old one superseded. */
export const SUPERSEDE = { minContradiction: 0.7, minRelationScore: 0.8 };
