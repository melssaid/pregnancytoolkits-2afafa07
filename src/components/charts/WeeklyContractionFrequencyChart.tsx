import { memo, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Activity, TrendingUp, TrendingDown, Minus } from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { format, subDays, eachDayOfInterval } from "date-fns";
import { safeParseLocalStorage } from "@/lib/safeStorage";
import { getDateLocale } from "@/lib/dateLocale";
import { subscribeToData, STORAGE_KEYS } from "@/lib/dataBus";

interface Contraction {
  id: string;
  start: number;
  end: number | null;
  duration: number;
  intensity?: "light" | "moderate" | "strong";
}

export const WeeklyContractionFrequencyChart = memo(function WeeklyContractionFrequencyChart() {
  const { t, i18n } = useTranslation();
  const locale = getDateLocale(i18n.language);

  // Live updates as the user starts / stops contractions in the timer tool.
  const [tick, setTick] = useState(0);
  useEffect(
    () => subscribeToData(() => setTick((n) => n + 1), [STORAGE_KEYS.CONTRACTIONS]),
    [],
  );

  const { chartData, stats } = useMemo(() => {
    const list = safeParseLocalStorage<Contraction[]>(
      STORAGE_KEYS.CONTRACTIONS,
      [],
      (d): d is Contraction[] => Array.isArray(d)
    );
    const days = eachDayOfInterval({ start: subDays(new Date(), 6), end: new Date() });
    const data = days.map((day) => {
      const dayStart = new Date(day).setHours(0, 0, 0, 0);
      const dayEnd = new Date(day).setHours(23, 59, 59, 999);
      const dayItems = list.filter((c) => c.start >= dayStart && c.start <= dayEnd);
      const avgDuration =
        dayItems.length > 0
          ? Math.round(dayItems.reduce((s, c) => s + (c.duration || 0), 0) / dayItems.length)
          : 0;
      return {
        date: format(day, "EEE", { locale }),
        fullDate: format(day, "PP", { locale }),
        count: dayItems.length,
        avgDuration,
      };
    });
    const total = data.reduce((s, d) => s + d.count, 0);
    const activeDays = data.filter((d) => d.count > 0).length;
    const peak = Math.max(0, ...data.map((d) => d.count));
    let trend: "up" | "down" | "neutral" = "neutral";
    const a = data.slice(0, 3).reduce((s, d) => s + d.count, 0);
    const b = data.slice(4).reduce((s, d) => s + d.count, 0);
    if (b > a + 1) trend = "up";
    else     if (b < a - 1) trend = "down";
    return { chartData: data, stats: { total, activeDays, peak, trend } };
  }, [locale, tick]);

  if (stats.total === 0) return null;

  const TrendIcon = stats.trend === "up" ? TrendingUp : stats.trend === "down" ? TrendingDown : Minus;
  const trendColor =
    stats.trend === "up" ? "text-warning" : stats.trend === "down" ? "text-success" : "text-muted-foreground";

  return (
    <section
      aria-labelledby="weekly-contraction-title"
      className="rounded-3xl border border-border/30 bg-card p-4 shadow-sm"
    >
      <header className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-rose-500/10 flex items-center justify-center">
            <Activity className="w-4 h-4 text-rose-500" aria-hidden="true" />
          </div>
          <h3 id="weekly-contraction-title" className="text-base font-bold text-foreground">
            {t("charts.weeklyContractions.title", "تكرار الانقباضات الأسبوعي")}
          </h3>
        </div>
        <div className={`flex items-center gap-1 text-xs font-semibold ${trendColor}`}>
          <TrendIcon className="w-3.5 h-3.5" aria-hidden="true" />
          <span>{t(`charts.weeklyContractions.trend.${stats.trend}`, stats.trend)}</span>
        </div>
      </header>

      <div className="h-[160px] w-full" role="img" aria-label={t("charts.weeklyContractions.aria", "رسم بياني لتكرار الانقباضات الأسبوعي")}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
            <XAxis dataKey="date" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip
              wrapperStyle={{ outline: "none" }}
              contentStyle={{
                background: "hsl(var(--popover))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "0.75rem",
                fontSize: "0.8rem",
                color: "hsl(var(--popover-foreground))",
              }}
              formatter={(v: any, _name, payload: any) => {
                const dur = payload?.payload?.avgDuration || 0;
                return [
                  `${v} • ${dur}s ${t("charts.weeklyContractions.avg", "متوسط")}`,
                  t("charts.weeklyContractions.count", "العدد"),
                ];
              }}
              labelFormatter={(_, payload: any) => payload?.[0]?.payload?.fullDate ?? ""}
            />
            <Line
              type="monotone"
              dataKey="count"
              stroke="hsl(var(--destructive))"
              strokeWidth={2.5}
              dot={{ r: 4, fill: "hsl(var(--destructive))" }}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-muted/40 py-2">
          <dt className="text-[10px] text-muted-foreground">{t("charts.weeklyContractions.total", "الإجمالي")}</dt>
          <dd className="text-sm font-bold text-foreground">{stats.total}</dd>
        </div>
        <div className="rounded-xl bg-muted/40 py-2">
          <dt className="text-[10px] text-muted-foreground">{t("charts.weeklyContractions.activeDays", "أيام نشطة")}</dt>
          <dd className="text-sm font-bold text-foreground">{stats.activeDays}/7</dd>
        </div>
        <div className="rounded-xl bg-muted/40 py-2">
          <dt className="text-[10px] text-muted-foreground">{t("charts.weeklyContractions.peak", "الذروة")}</dt>
          <dd className="text-sm font-bold text-foreground">{stats.peak}</dd>
        </div>
      </dl>
    </section>
  );
});

export default WeeklyContractionFrequencyChart;
