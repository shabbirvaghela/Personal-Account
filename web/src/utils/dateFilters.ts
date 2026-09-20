export type FilterPeriod =
  | "today"
  | "this_week"
  | "this_month"
  | "this_year"
  | "this_fy"
  | "custom"
  | "all";

export interface DateRange {
  from: number;
  to: number;
}

function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

export function rangeForPeriod(period: FilterPeriod, custom?: DateRange): DateRange | null {
  const now = new Date();
  const todayStart = startOfDay(now);

  switch (period) {
    case "today":
      return { from: todayStart.getTime(), to: Date.now() };
    case "this_week": {
      const day = todayStart.getDay();
      const monday = new Date(todayStart);
      monday.setDate(todayStart.getDate() - ((day + 6) % 7));
      return { from: monday.getTime(), to: Date.now() };
    }
    case "this_month": {
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: first.getTime(), to: Date.now() };
    }
    case "this_year": {
      const first = new Date(now.getFullYear(), 0, 1);
      return { from: first.getTime(), to: Date.now() };
    }
    case "this_fy": {
      // Indian financial year: Apr 1 - Mar 31
      const fyStartYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
      const first = new Date(fyStartYear, 3, 1);
      return { from: first.getTime(), to: Date.now() };
    }
    case "custom":
      return custom ?? null;
    case "all":
    default:
      return null;
  }
}
