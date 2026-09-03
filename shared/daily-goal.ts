export type DailyGoalStatus = "not_configured" | "below" | "reached";
export type DailyGoalTone = "neutral" | "danger" | "success";

export type DailyGoalProgress = {
  actual: number;
  target: number;
  remaining: number;
  percent: number;
  status: DailyGoalStatus;
};

function asNonNegativeNumber(value: number | string | null | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export function calculateDailyGoalProgress(
  actualValue: number | string | null | undefined,
  targetValue: number | string | null | undefined,
): DailyGoalProgress {
  const actual = asNonNegativeNumber(actualValue);
  const target = asNonNegativeNumber(targetValue);

  if (target === 0) {
    return { actual, target, remaining: 0, percent: 0, status: "not_configured" };
  }

  const percent = (actual / target) * 100;
  return {
    actual,
    target,
    remaining: Math.max(target - actual, 0),
    percent,
    status: actual >= target ? "reached" : "below",
  };
}

export function getDailyGoalTone(status: DailyGoalStatus): DailyGoalTone {
  if (status === "reached") return "success";
  if (status === "below") return "danger";
  return "neutral";
}
