import { memo, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Activity, TrendingUp, TrendingDown, Minus } from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from "recharts";
import { format, subDays, eachDayOfInterval } from "date-fns";
import { getDateLocale } from "@/lib/dateLocale";
import { readKickSessions } from "@/lib/kickSessionsStore";
import { subscribeToData, STORAGE_KEYS } from "@/lib/dataBus";

/**
 * Weekly aggregation of kick-counter sessions, sourced from the unified
 * `kick_sessions` store. Re-renders live whenever the canonical key changes,
 * so the chart updates the instant the user logs a session in another tab
 * or screen.
 */
export const WeeklyKickFrequencyChart = memo(function WeeklyKickFrequencyChart() {
  const { t, i18n } = useTranslation();
  const locale = getDateLocale(i18n.language);

  // Bump this counter on every relevant data change to force `useMemo` to
  // recompute against the freshest localStorage snapshot.
  const [tick, setTick] = useState(0);
  useEffect(() => subscribeToData(() => setTick((n) => n + 1), [STORAGE_KEYS.KICK_SESSIONS]), []);

  const { chartData, stats } = useMemo(() => {
    const sessions = readKickSessions() as Array<{
      started_at?: string;
      total_kicks?: number;
      duration_minutes?: number | null;
    }>;
    const days = eachDayOfInterval({ start: subDays(new Date(), 6), end: new Date() });
    const data = days.map((day) => {
      const key = format(day, "yyyy-MM-dd");
      const dayItems = sessions.filter((s) => (s.started_at ?? "").startsWith(key));
      const kicks = dayItems.reduce((sum, s) => sum + (s.total_kicks ?? 0), 0);
      return {
        date: format(day, "EEE", { locale }),
        fullDate: format(day, "PP", { locale }),
        kicks,
        sessions: dayItems.length,
      };
    });
    const total = data.reduce((s, d) => s + d.kicks, 0);
    const activeDays = data.filter((d) => d.kicks > 0).length;
    const peak = Math.max(0, ...data.map((d) => d.kicks));
    let trend: "up" | "down" | "neutral" = "neutral";
    const a = data.slice(0, 3).reduce((s, d) => s + d.kicks, 0);
    const b = data.slice(4).reduce((s, d) => s + d.kicks, 0);
    if (b > a + 2) trend = "up";
    else if (b < a - 2) trend = "down";
    return { chartData: data, stats: { total, activeDays, peak, trend } };
  }, [locale, tick]);

  if (stats.total === 0) return null;

  const TrendIcon =
    stats.trend === "up" ? TrendingUp : stats.trend === "down" ? TrendingDown : Minus;
  const trendColor =
    stats.trend === "up" ? "text-success" : stats.trend === "down" ? "text-warning" : "text-muted-foreground";

  return (
    <section
      aria-labelledby="weekly-kick-title"
      className="rounded-3xl border border-border/30 bg-card p-4 shadow-sm"
    >
      <header className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
            <Activity className="w-4 h-4 text-primary" aria-hidden="true" />
          </div>
          <h3 id="weekly-kick-title" className="text-base font-bold text-foreground">
            {t("charts.weeklyKicks.title", "حركات الجنين الأسبوعية")}
          </h3>
        </div>
        <div className={`flex items-center gap-1 text-xs font-semibold ${trendColor}`}>
          <TrendIcon className="w-3.5 h-3.5" aria-hidden="true" />
          <span>{t(`charts.weeklyKicks.trend.${stats.trend}`, stats.trend)}</span>
        </div>
      </header>

      <div
        className="h-[160px] w-full"
        role="img"
        aria-label={t("charts.weeklyKicks.aria", "رسم بياني لتكرار حركات الجنين الأسبوعي")}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
            <XAxis
              dataKey="date"
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
            />
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
                const sess = payload?.payload?.sessions || 0;
                return [
                  `${v} • ${sess} ${t("charts.weeklyKicks.sessions", "جلسات")}`,
                  t("charts.weeklyKicks.kicks", "حركات"),
                ];
              }}
              labelFormatter={(_, payload: any) => payload?.[0]?.payload?.fullDate ?? ""}
            />
            <Bar dataKey="kicks" radius={[6, 6, 0, 0]}>
              {chartData.map((d, i) => (
                <Cell key={i} fill="hsl(var(--primary))" fillOpacity={d.kicks > 0 ? 0.85 : 0.3} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-muted/40 py-2">
          <dt className="text-[10px] text-muted-foreground">
            {t("charts.weeklyKicks.total", "الإجمالي")}
          </dt>
          <dd className="text-sm font-bold text-foreground">{stats.total}</dd>
        </div>
        <div className="rounded-xl bg-muted/40 py-2">
          <dt className="text-[10px] text-muted-foreground">
            {t("charts.weeklyKicks.activeDays", "أيام نشطة")}
          </dt>
          <dd className="text-sm font-bold text-foreground">{stats.activeDays}/7</dd>
        </div>
        <div className="rounded-xl bg-muted/40 py-2">
          <dt className="text-[10px] text-muted-foreground">
            {t("charts.weeklyKicks.peak", "الذروة")}
          </dt>
          <dd className="text-sm font-bold text-foreground">{stats.peak}</dd>
        </div>
      </dl>
    </section>
  );
});

export default WeeklyKickFrequencyChart;
