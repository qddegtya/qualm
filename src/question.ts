/** Option labels mapped to a description, or `null` when the label speaks for itself. */
export type Options = Readonly<Record<string, string | null>>;

/** Ordered levels, lowest first. The API requires at least two. */
export type Levels = readonly [string, string, ...string[]];

/** A yes/no proposition. `noul` is the name the API gives this on the wire. */
export interface IsQuestion {
  readonly type: "noul";
  readonly instructions: string;
}

export interface ChoiceQuestion<O extends Options = Options> {
  readonly type: "choice";
  readonly instructions: string;
  readonly criteria: O;
}

export interface ScoreQuestion<L extends Levels = Levels> {
  readonly type: "score";
  readonly instructions: string;
  readonly criteria: L;
}

export type Question = IsQuestion | ChoiceQuestion | ScoreQuestion;

/** Asks whether a proposition holds. */
export function is(strings: TemplateStringsArray, ...values: unknown[]): IsQuestion {
  return { type: "noul", instructions: fill(strings, values) };
}

/** Asks which of the given options applies. */
export function choice(strings: TemplateStringsArray, ...values: unknown[]) {
  const instructions = fill(strings, values);
  return <O extends Options>(options: O): ChoiceQuestion<O> => ({
    type: "choice",
    instructions,
    criteria: options,
  });
}

/** Asks where something sits on an ordered rubric. */
export function score(strings: TemplateStringsArray, ...values: unknown[]) {
  const instructions = fill(strings, values);
  return <const L extends Levels>(levels: L): ScoreQuestion<L> => ({
    type: "score",
    instructions,
    criteria: levels,
  });
}

// A template has one more string than it has values, so every gap has a value to fill it.
const fill = (strings: TemplateStringsArray, values: unknown[]): string =>
  strings.reduce((out, part, i) => out + String(values[i - 1]) + part);
