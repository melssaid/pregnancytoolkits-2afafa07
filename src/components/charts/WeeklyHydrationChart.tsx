import { memo, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Droplet, TrendingUp, TrendingDown, Minus } from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
  Cell,
} from "recharts";
import { format, subDays, eachDayOfInterval } from "date-fns";
import { safeParseLocalStorage } from "@/lib/safeStorage";
import { getDateLocale } from "@/lib/dateLocale";
import { getUserId } from "@/hooks/useSupabase";
import { subscribeToData, STORAGE_KEYS } from "@/lib/dataBus";

const GOAL = 8;

interface WaterLog {
  date: string;
  glasses?: number;
  timestamp?: string;
}

export const WeeklyHydrationChart = memo(function WeeklyHydrationChart() {
  const { t, i18n } = useTranslation();
  const locale = getDateLocale(i18n.language);
  const userId = getUserId();
  const waterKey = STORAGE_KEYS.WATER_LOGS(userId);

  // Live updates whenever the user logs / removes a glass anywhere in the app.
  const [tick, setTick] = useState(0);
  useEffect(() => subscribeToData(() => setTick((n) => n + 1), [waterKey]), [waterKey]);

  const { chartData, stats } = useMemo(() => {
    const logs = safeParseLocalStorage<WaterLog[]>(waterKey, [], (d): d is WaterLog[] =>
      Array.isArray(d)
    );
    const days = eachDayOfInterval({ start: subDays(new Date(), 6), end: new Date() });
    const data = days.map((day) => {
      const key = format(day, "yyyy-MM-dd");
      const total = logs
        .filter((l) => l.date?.startsWith(key))
        .reduce((s, l) => s + (l.glasses || 1), 0);
      return {
        date: format(day, "EEE", { locale }),
        fullDate: format(day, "PP", { locale }),
        glasses: total,
        met: total >= GOAL,
      };
    });
    const total = data.reduce((s, d) => s + d.glasses, 0);
    const avg = total / 7;
    const goalMet = data.filter((d) => d.met).length;
    let trend: "up" | "down" | "neutral" = "neutral";
    const a = data.slice(0, 3).reduce((s, d) => s + d.glasses, 0) / 3;
    const b = data.slice(4).reduce((s, d) => s + d.glasses, 0) / 3;
    if (b > a + 1) trend = "up";
    else if (b < a - 1) trend = "down";
    return { chartData: data, stats: { avg, total, goalMet, trend } };
  }, [locale, waterKey, tick]);

  if (stats.total === 0) return null;

  const TrendIcon = stats.trend === "up" ? TrendingUp : stats.trend === "down" ? TrendingDown : Minus;
  const trendColor =
    stats.trend === "up" ? "text-success" : stats.trend === "down" ? "text-warning" : "text-muted-foreground";

  return (
    <section
      aria-labelledby="weekly-hydration-title"
      className="rounded-3xl border border-border/30 bg-card p-4 shadow-sm"
    >
      <header className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-sky-500/10 flex items-center justify-center">
            <Droplet className="w-4 h-4 text-sky-500" aria-hidden="true" />
          </div>
          <h3 id="weekly-hydration-title" className="text-base font-bold text-foreground">
            {t("charts.weeklyHydration.title", "الترطيب الأسبوعي")}
          </h3>
        </div>
        <div className={`flex items-center gap-1 text-xs font-semibold ${trendColor}`}>
          <TrendIcon className="w-3.5 h-3.5" aria-hidden="true" />
          <span>{t(`charts.weeklyHydration.trend.${stats.trend}`, stats.trend)}</span>
        </div>
      </header>

      <div className="h-[160px] w-full" role="img" aria-label={t("charts.weeklyHydration.aria", "رسم بياني لاستهلاك الماء الأسبوعي")}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
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
              formatter={(v: any) => [`${v} / ${GOAL}`, t("charts.weeklyHydration.glasses", "أكواب")]}
              labelFormatter={(_, payload: any) => payload?.[0]?.payload?.fullDate ?? ""}
            />
            <ReferenceLine y={GOAL} stroke="hsl(var(--success))" strokeDasharray="4 4" opacity={0.6} />
            <Bar dataKey="glasses" radius={[6, 6, 0, 0]}>
              {chartData.map((d, i) => (
                <Cell key={i} fill={d.met ? "hsl(var(--success))" : "hsl(var(--primary))"} fillOpacity={d.met ? 0.8 : 0.6} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-muted/40 py-2">
          <dt className="text-[10px] text-muted-foreground">{t("charts.weeklyHydration.average", "المتوسط/يوم")}</dt>
          <dd className="text-sm font-bold text-foreground">{stats.avg.toFixed(1)}</dd>
        </div>
        <div className="rounded-xl bg-muted/40 py-2">
          <dt className="text-[10px] text-muted-foreground">{t("charts.weeklyHydration.total", "الإجمالي")}</dt>
          <dd className="text-sm font-bold text-foreground">{stats.total}</dd>
        </div>
        <div className="rounded-xl bg-muted/40 py-2">
          <dt className="text-[10px] text-muted-foreground">{t("charts.weeklyHydration.goalsMet", "أهداف محققة")}</dt>
          <dd className="text-sm font-bold text-foreground">{stats.goalMet}/7</dd>
        </div>
      </dl>
    </section>
  );
});

export default WeeklyHydrationChart;
