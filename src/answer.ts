import type { Levels, Options } from "./question.ts";

export interface DecideOptions {
  /** Minimum confidence to act on. Defaults to the client's `confidence`. */
  readonly confidence?: number;
}

/** Every branch, plus `unsure`. Each returns whatever it likes. */
type Handlers<Branch extends string> = { readonly [K in Branch | "unsure"]: () => unknown };

/** Rejects handler keys that are neither a branch nor `unsure`. */
type NoExtra<Branch extends string, H> = Record<Exclude<keyof H, Branch | "unsure">, never>;

/** Whatever the branch that ran returned. */
type Taken<H extends Handlers<string>> = ReturnType<H[keyof H]>;

/** A yes/no judgment. */
export interface IsAnswer {
  readonly type: "is";
  /** Probability the proposition is true, exactly as the model reported it. */
  readonly probability: number;
  /**
   * Certainty, from zero at an even split to one at either extreme.
   * Derived here as `|2p - 1|`: the API reports no confidence for this question type.
   */
  readonly confidence: number;
  /** Which side of even the probability fell on. The top-ranked side, not "the answer". */
  readonly top: boolean;
  /** Runs one branch. `unsure` runs whenever confidence falls below the bar. */
  decide<H extends Handlers<"yes" | "no"> & NoExtra<"yes" | "no", H>>(
    handlers: H,
    options?: DecideOptions,
  ): Taken<H>;
}

/** A selection among labelled options. */
export interface ChoiceAnswer<O extends Options = Options> {
  readonly type: "choice";
  /** The highest-probability label. The top-ranked one, not "the answer". */
  readonly top: keyof O & string;
  /** How much the top label stands out, from zero to one, as the API reported it. */
  readonly confidence: number;
  readonly probabilities: Readonly<Record<keyof O & string, number>>;
  /** Runs one branch. `unsure` runs whenever confidence falls below the bar. */
  decide<H extends Handlers<keyof O & string> & NoExtra<keyof O & string, H>>(
    handlers: H,
    options?: DecideOptions,
  ): Taken<H>;
}

/** A position on an ordered rubric. A measurement, not a selection — so it has no `decide`. */
export interface ScoreAnswer<L extends Levels = Levels> {
  readonly type: "score";
  /** Each level number weighted by its probability, so it may fall between levels. */
  readonly value: number;
  readonly confidence: number;
  readonly probabilities: Readonly<Record<number, number>>;
  /** Level descriptions keyed by their number, as the API returned them. */
  readonly legend: Readonly<Record<number, string>>;
  /** The levels this rubric was asked with. */
  readonly levels: L;
}

export function isAnswer(probability: number, bar: number): IsAnswer {
  const confidence = Math.abs(2 * probability - 1);
  const top = probability > 0.5;
  return {
    type: "is",
    probability,
    confidence,
    top,
    // `run` returns the value of one of `handlers`, which is what `Taken<H>` describes;
    // TypeScript cannot follow that through a computed branch name.
    decide: ((handlers: Branches, options?: DecideOptions) =>
      run(
        handlers,
        sure(confidence, bar, options) ? (top ? "yes" : "no") : "unsure",
      )) as IsAnswer["decide"],
  };
}

export function choiceAnswer(
  top: string,
  confidence: number,
  probabilities: Readonly<Record<string, number>>,
  bar: number,
): ChoiceAnswer {
  return {
    type: "choice",
    top,
    confidence,
    probabilities,
    // See the note in `isAnswer`.
    decide: ((handlers: Branches, options?: DecideOptions) =>
      run(handlers, sure(confidence, bar, options) ? top : "unsure")) as ChoiceAnswer["decide"],
  };
}

type Branches = Readonly<Record<string, () => unknown>>;

/** Acting exactly on the bar counts as sure. */
const sure = (confidence: number, bar: number, options?: DecideOptions) =>
  confidence >= (options?.confidence ?? bar);

function run(handlers: Branches, branch: string): unknown {
  const handler = handlers[branch];
  if (handler === undefined) {
    throw new TypeError(
      `The model answered "${branch}", which is not one of the options it was given.`,
    );
  }
  return handler();
}
