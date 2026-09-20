import { FilterPeriod } from "../utils/dateFilters";

const OPTIONS: { value: FilterPeriod; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "this_week", label: "This Week" },
  { value: "this_month", label: "This Month" },
  { value: "this_year", label: "This Year" },
  { value: "this_fy", label: "Financial Year" },
  { value: "all", label: "All Time" },
];

export function FilterBar({ value, onChange }: { value: FilterPeriod; onChange: (p: FilterPeriod) => void }) {
  return (
    <div className="filter-bar">
      {OPTIONS.map((o) => (
        <button key={o.value} className={o.value === value ? "chip active" : "chip"} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
