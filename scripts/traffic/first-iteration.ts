export type Family = "trail" | "camp";

export type Variant = "A" | "B";

type Profile =
  | "welcome"
  | "first"
  | "gap"
  | "optional"
  | "short"
  | "long"
  | "edited";

export const populations: readonly {
  profile: Profile;
  explore: number;
  direct: number;
  exploreClicks: number;
  directClicks: number;
}[] = [
  {
    direct: 1,
    directClicks: 0,
    explore: 3,
    exploreClicks: 0,
    profile: "welcome",
  },
  {
    direct: 1,
    directClicks: 0,
    explore: 3,
    exploreClicks: 0,
    profile: "first",
  },
  { direct: 1, directClicks: 0, explore: 3, exploreClicks: 0, profile: "gap" },
  {
    direct: 1,
    directClicks: 0,
    explore: 3,
    exploreClicks: 0,
    profile: "optional",
  },
  {
    direct: 3,
    directClicks: 2,
    explore: 3,
    exploreClicks: 2,
    profile: "short",
  },
  { direct: 2, directClicks: 1, explore: 4, exploreClicks: 3, profile: "long" },
  {
    direct: 1,
    directClicks: 1,
    explore: 1,
    exploreClicks: 1,
    profile: "edited",
  },
];

export const manualRoute = (
  family: Family,
  variant: Variant,
  long: boolean
): readonly string[] => {
  if (family === "camp") {
    return [
      "welcome",
      "pace",
      "interests",
      ...(long ? ["waterside"] : []),
      "hours",
      "prepare",
      "result",
    ];
  }

  return variant === "A"
    ? [
        "welcome",
        "pace",
        ...(long ? ["supplies"] : []),
        "interests",
        "hours",
        "prepare",
        "result",
      ]
    : [
        "welcome",
        "hours",
        "pace",
        ...(long ? ["supplies"] : []),
        "interests",
        "prepare",
        "result",
      ];
};

type MetricPairs = Record<string, readonly number[]>;

interface TrafficReference {
  readonly edges: MetricPairs;
  readonly steps: MetricPairs;
}

export const reference = (
  family: Family,
  variant: Variant,
  explore: boolean
): TrafficReference => {
  const counts = explore
    ? {
        branch: [14, 14],
        finished: [8, 8],
        first: [17, 14],
        longEdge: [8, 8],
        middleEdge: [14, 14],
        optional: [8, 5],
        optionalEdge: [5, 5],
        shortEdge: [7, 4],
        startEdge: [17, 17],
        terminal: [8, 0],
        welcome: [20, 17],
      }
    : {
        branch: [8, 8],
        finished: [6, 6],
        first: [9, 8],
        longEdge: [4, 4],
        middleEdge: [8, 8],
        optional: [4, 3],
        optionalEdge: [3, 3],
        shortEdge: [5, 4],
        startEdge: [9, 9],
        terminal: [6, 0],
        welcome: [10, 9],
      };

  const reordered = family === "trail" && variant === "B";

  const steps = {
    hours: reordered ? counts.first : counts.finished,
    interests: family === "camp" ? counts.branch : counts.finished,
    pace: reordered ? counts.branch : counts.first,
    prepare: counts.finished,
    result: counts.terminal,
    welcome: counts.welcome,
    [family === "trail" ? "supplies" : "waterside"]: counts.optional,
  };

  if (family === "camp") {
    return {
      edges: {
        "hours:prepare": counts.finished,
        "interests:hours": counts.shortEdge,
        "interests:waterside": counts.longEdge,
        "pace:interests": counts.middleEdge,
        "prepare:result": counts.finished,
        "waterside:hours": counts.optionalEdge,
        "welcome:pace": counts.startEdge,
      },
      steps,
    };
  }

  return {
    edges: reordered
      ? {
          "hours:pace": counts.middleEdge,
          "interests:prepare": counts.finished,
          "pace:interests": counts.shortEdge,
          "pace:supplies": counts.longEdge,
          "prepare:result": counts.finished,
          "supplies:interests": counts.optionalEdge,
          "welcome:hours": counts.startEdge,
        }
      : {
          "hours:prepare": counts.finished,
          "interests:hours": counts.finished,
          "pace:interests": counts.shortEdge,
          "pace:supplies": counts.longEdge,
          "prepare:result": counts.finished,
          "supplies:interests": counts.optionalEdge,
          "welcome:pace": counts.startEdge,
        },
    steps,
  };
};

export const expectedSummaries = {
  all: {
    ctaClickers: 40,
    ctaCtr: 5 / 7,
    resultReachRate: 7 / 15,
    resultReached: 56,
    started: 120,
  },
  direct: {
    ctaClickers: 16,
    ctaCtr: 2 / 3,
    resultReachRate: 3 / 5,
    resultReached: 24,
    started: 40,
  },
  directCell: {
    ctaClickers: 4,
    ctaCtr: 2 / 3,
    resultReachRate: 3 / 5,
    resultReached: 6,
    started: 10,
  },
  explore: {
    ctaClickers: 24,
    ctaCtr: 3 / 4,
    resultReachRate: 2 / 5,
    resultReached: 32,
    started: 80,
  },
  exploreCell: {
    ctaClickers: 6,
    ctaCtr: 3 / 4,
    resultReachRate: 2 / 5,
    resultReached: 8,
    started: 20,
  },
} as const;
