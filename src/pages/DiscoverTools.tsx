import { Layout } from "@/components/Layout";
import { SEOHead } from "@/components/SEOHead";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { toolsData } from "@/lib/tools-data";
import { ArrowRight, ArrowLeft, Trophy, Flower2, Baby, Sprout } from "lucide-react";
import { useMemo } from "react";
import { getToolDescription, getToolTitle } from "@/lib/toolCopy";
import { useUserProfile, type JourneyStage } from "@/hooks/useUserProfile";

/**
 * Stage-aware tool discovery — covers all three life stages:
 *   • fertility   (pre-pregnancy / trying to conceive)
 *   • pregnant    (active pregnancy weeks 1–42)
 *   • postpartum  (after birth / baby care)
 *
 * Tools are scored by how relevant they are to the user's current stage,
 * with a secondary score based on pregnancy week when available.
 */

type StageRange = { fertility?: number; pregnant?: [number, number]; postpartum?: number };

// Higher number = more relevant for that stage. `undefined` = not relevant.
const STAGE_MAP: Record<string, StageRange> = {
  // ── Fertility / Pre-pregnancy ───────────────────────────────────────────
  "cycle-tracker":           { fertility: 100, pregnant: [0, 4] },
  "fertility-academy":       { fertility: 95 },
  "preconception-checkup":   { fertility: 92 },
  "due-date-calculator":     { fertility: 70, pregnant: [0, 12] },

  // ── Pregnancy ───────────────────────────────────────────────────────────
  "smart-pregnancy-plan":    { pregnant: [4, 42] },
  "weekly-summary":          { pregnant: [4, 42] },
  "fetal-growth":            { pregnant: [5, 42] },
  "ai-meal-suggestion":      { fertility: 60, pregnant: [4, 42], postpartum: 40 },
  "nutrition-supplements":   { fertility: 55, pregnant: [0, 42], postpartum: 50 },
  "vitamin-tracker":         { fertility: 50, pregnant: [0, 42], postpartum: 45 },
  "kick-counter":            { pregnant: [20, 42] },
  "weight-gain":             { pregnant: [8, 42] },
  "ai-fitness-coach":        { fertility: 40, pregnant: [4, 38], postpartum: 60 },
  "pregnancy-comfort":       { pregnant: [12, 42] },
  "wellness-diary":          { fertility: 50, pregnant: [4, 42], postpartum: 70 },
  "smart-appointment-reminder": { fertility: 60, pregnant: [4, 42], postpartum: 60 },
  "ai-bump-photos":          { pregnant: [10, 40] },
  "ai-partner-guide":        { pregnant: [20, 42], postpartum: 70 },
  "ai-birth-plan":           { pregnant: [28, 40] },
  "ai-hospital-bag":         { pregnant: [30, 40] },
  "contraction-timer":       { pregnant: [34, 42] },
  "ai-lactation-prep":       { pregnant: [30, 42], postpartum: 90 },
  "baby-gear-recommender":   { pregnant: [28, 42], postpartum: 85 },

  // ── Postpartum / Baby ───────────────────────────────────────────────────
  "postpartum-recovery":     { postpartum: 98 },
  "postpartum-mental-health":{ postpartum: 96 },
  "baby-cry-translator":     { postpartum: 92 },
  "baby-sleep-tracker":      { postpartum: 90 },
  "baby-growth":             { postpartum: 88 },
  "diaper-tracker":          { postpartum: 86 },
};

function scoreTool(toolId: string, stage: JourneyStage, week: number | null): number {
  const range = STAGE_MAP[toolId];
  if (!range) return 0;

  if (stage === "fertility") return range.fertility ?? 0;
  if (stage === "postpartum") return range.postpartum ?? 0;
  // pregnant
  if (range.pregnant) {
    const [lo, hi] = range.pregnant;
    if (week !== null) {
      if (week >= lo && week <= hi) return 100 - Math.abs(week - (lo + hi) / 2);
      return 0;
    }
    return 60; // pregnant but no week stored → still relevant
  }
  return 0;
}

function getRecommendedTools(stage: JourneyStage, week: number | null) {
  return toolsData
    .map(tool => ({ ...tool, score: scoreTool(tool.id, stage, week) }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.priority - b.priority;
    });
}

/**
 * Derive a short, localized "why we recommend this" badge per tool.
 * Returns null when the reason would be redundant (very low score).
 */
type ReasonKind = "fertility" | "postpartum" | "near-week" | "this-week" | "trimester" | "all-pregnancy";
type Reason = { kind: ReasonKind; label: string; tone: string };

function getReasonBadge(
  toolId: string,
  stage: JourneyStage,
  week: number | null,
  t: (key: string, opts?: any) => string
): Reason | null {
  const range = STAGE_MAP[toolId];
  if (!range) return null;

  if (stage === "fertility" && range.fertility) {
    return {
      kind: "fertility",
      label: t("discover.reason.fertility", "Pre-pregnancy"),
      tone: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    };
  }
  if (stage === "postpartum" && range.postpartum) {
    return {
      kind: "postpartum",
      label: t("discover.reason.postpartum", "Postpartum care"),
      tone: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
    };
  }
  if (stage === "pregnant" && range.pregnant) {
    const [lo, hi] = range.pregnant;
    if (week !== null && week >= lo && week <= hi) {
      const center = Math.round((lo + hi) / 2);
      const dist = Math.abs(week - center);
      // Highly specific window (≤ 6 weeks wide) → call out the exact week
      if (hi - lo <= 6) {
        return {
          kind: "this-week",
          label: t("discover.reason.thisWeek", { week, defaultValue: `Useful at week ${week}` }),
          tone: "bg-rose-500/12 text-rose-700 dark:text-rose-300",
        };
      }
      // Within 4 weeks of the center → "near week N"
      if (dist <= 4) {
        return {
          kind: "near-week",
          label: t("discover.reason.nearWeek", { week, defaultValue: `Near week ${week}` }),
          tone: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
        };
      }
      // Trimester-scope match
      const trimester = week <= 13 ? 1 : week <= 27 ? 2 : 3;
      return {
        kind: "trimester",
        label: t(`discover.reason.trimester${trimester}`, { defaultValue: `Trimester ${trimester}` }),
        tone: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
      };
    }
    // Pregnant but no week stored, or generic full-pregnancy tool
    if (lo <= 4 && hi >= 38) {
      return {
        kind: "all-pregnancy",
        label: t("discover.reason.allPregnancy", "All pregnancy"),
        tone: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
      };
    }
  }
  return null;
}

const STAGE_ICON: Record<JourneyStage, typeof Flower2> = {
  fertility: Sprout,
  pregnant: Flower2,
  postpartum: Baby,
};

const STAGE_TINT: Record<JourneyStage, { bg: string; text: string }> = {
  fertility:  { bg: "bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400" },
  pregnant:   { bg: "bg-rose-500/10",    text: "text-rose-600 dark:text-rose-400" },
  postpartum: { bg: "bg-sky-500/10",     text: "text-sky-600 dark:text-sky-400" },
};

export default function DiscoverTools() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language?.split("-")[0] || "en";
  const isRTL = i18n.language === "ar";
  const ArrowIcon = isRTL ? ArrowLeft : ArrowRight;
  const { profile } = useUserProfile();
  const stage: JourneyStage = profile.journeyStage || "pregnant";
  const StageIcon = STAGE_ICON[stage];
  const tint = STAGE_TINT[stage];

  const week = useMemo(() => {
    if (stage !== "pregnant") return null;
    try {
      const saved = localStorage.getItem("pregnancyWeek");
      if (saved) return parseInt(saved, 10);
      const dueDate = localStorage.getItem("dueDate");
      if (dueDate) {
        const diff = new Date(dueDate).getTime() - Date.now();
        const weeksLeft = Math.round(diff / (7 * 24 * 60 * 60 * 1000));
        return Math.max(4, 40 - weeksLeft);
      }
    } catch {}
    return profile.pregnancyWeek || null;
  }, [stage, profile.pregnancyWeek]);

  // Track which tools user has visited
  const usedTools = useMemo(() => {
    try {
      const keys = Object.keys(localStorage).filter(k => k.startsWith("tool_visited_"));
      return new Set(keys.map(k => k.replace("tool_visited_", "")));
    } catch { return new Set<string>(); }
  }, []);

  const recommended = useMemo(() => getRecommendedTools(stage, week), [stage, week]);
  // Only show tools that actually belong to this stage (score > 0)
  const stageTools = recommended.filter(t => t.score > 0);
  const newTools = stageTools.filter(t => !usedTools.has(t.id));
  const usedToolsList = stageTools.filter(t => usedTools.has(t.id));

  // Stage-specific copy
  const stageTitle = t(`discover.stage.${stage}.title`);
  const stageContext = stage === "pregnant" && week
    ? t("discover.weekContext", { week })
    : t(`discover.stage.${stage}.context`);

  return (
    <Layout showBack>
      <SEOHead title={t("discover.seoTitle", "Discover New Tools")} noindex />
      <div className="container max-w-2xl pb-20">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center py-6">
          <div className={`inline-flex h-12 w-12 items-center justify-center rounded-2xl ${tint.bg} mx-auto mb-3`}>
            <StageIcon className={`h-6 w-6 ${tint.text}`} strokeWidth={1.8} />
          </div>
          <h1 className="text-xl font-bold text-foreground mb-1">{stageTitle}</h1>
          <p className="text-xs text-muted-foreground mb-3">{stageContext}</p>
          <Link
            to="/achievements"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs font-bold hover:bg-amber-500/20 transition-colors"
          >
            <Trophy className="w-3.5 h-3.5" />
            {t("discover.viewAchievements", "View My Achievements")}
          </Link>
        </motion.div>

        {/* New / Not yet tried */}
        {newTools.length > 0 && (
          <div className="mb-8">
            <h2 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
              <span className="h-1 w-6 rounded-full bg-primary" />
              {t("discover.newForYou", "New for You")}
              <span className="text-[10px] text-muted-foreground font-normal">({newTools.length})</span>
            </h2>
            <div className="space-y-2">
              {newTools.slice(0, 12).map((tool, i) => {
                const Icon = tool.icon;
                const reason = getReasonBadge(tool.id, stage, week, t);
                return (
                  <motion.div key={tool.id} initial={{ opacity: 0, x: isRTL ? 10 : -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.04 }}>
                    <Link to={tool.href} className="flex items-start gap-3 p-3 rounded-xl bg-card border border-border hover:border-primary/30 transition-all group">
                      <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Icon className="h-4 w-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">{getToolTitle(tool, t, lang)}</span>
                          {tool.hasAI && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-bold">AI</span>}
                        </div>
                        <div className="text-[10px] text-muted-foreground truncate mt-0.5">{getToolDescription(tool, t, lang)}</div>
                        {reason && (
                          <span
                            className={`inline-block mt-1.5 text-[9.5px] font-semibold px-1.5 py-0.5 rounded-md ${reason.tone}`}
                            aria-label={t("discover.reason.ariaPrefix", "Why suggested:") + " " + reason.label}
                          >
                            {reason.label}
                          </span>
                        )}
                      </div>
                      <ArrowIcon className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary flex-shrink-0 mt-1" />
                    </Link>
                  </motion.div>
                );
              })}
            </div>
          </div>
        )}

        {/* Already used */}
        {usedToolsList.length > 0 && (
          <div>
            <h2 className="text-sm font-bold text-muted-foreground mb-3">
              {t("discover.alreadyUsed", "Already Used")} ({usedToolsList.length})
            </h2>
            <div className="space-y-1.5 opacity-70">
              {usedToolsList.slice(0, 8).map(tool => {
                const Icon = tool.icon;
                return (
                  <Link key={tool.id} to={tool.href} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/50 transition-colors">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">{getToolTitle(tool, t, lang)}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
