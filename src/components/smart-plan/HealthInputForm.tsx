import { readKickSessions } from "@/lib/kickSessionsStore";
import { useState, useMemo, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { ChevronDown, ChevronUp, Info, Plus } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { WeekSlider } from "@/components/WeekSlider";
import { Link } from "react-router-dom";

export interface HealthData {
  week: number;
  weight: number;
  height: number;
  age: number;
  lastKickCount: number;
  bloodPressureSys: number;
  bloodPressureDia: number;
  sleepHours: number;
  activityLevel: string;
  mood: string;
  conditions: string[];
}

/** Read latest kick session stats from the unified canonical store */
function getLatestKickStats(): { totalKicks: number; lastSessionDate: string | null } {
  try {
    const sessions = readKickSessions() as Array<{ total_kicks?: number; ended_at?: string; started_at?: string }>;
    const completed = sessions.filter(s => s.ended_at).sort((a, b) =>
      new Date(b.ended_at!).getTime() - new Date(a.ended_at!).getTime()
    );
    if (completed.length === 0) return { totalKicks: 0, lastSessionDate: null };
    return {
      totalKicks: completed[0].total_kicks || 0,
      lastSessionDate: completed[0].ended_at || null,
    };
  } catch {
    return { totalKicks: 0, lastSessionDate: null };
  }
}

const conditionOptions = [
  { key: 'gestational_diabetes', ar: 'سكري الحمل', en: 'Gestational Diabetes', de: 'Schwangerschaftsdiabetes', fr: 'Diabète gestationnel', es: 'Diabetes gestacional', pt: 'Diabetes gestacional', tr: 'Gebelik Diyabeti' },
  { key: 'hypertension', ar: 'ارتفاع ضغط الدم', en: 'Hypertension', de: 'Bluthochdruck', fr: 'Hypertension', es: 'Hipertensión', pt: 'Hipertensão', tr: 'Hipertansiyon' },
  { key: 'anemia', ar: 'فقر الدم', en: 'Anemia', de: 'Anämie', fr: 'Anémie', es: 'Anemia', pt: 'Anemia', tr: 'Anemi' },
  { key: 'thyroid', ar: 'مشاكل الغدة الدرقية', en: 'Thyroid Issues', de: 'Schilddrüsenprobleme', fr: 'Problèmes thyroïdiens', es: 'Problemas de tiroides', pt: 'Problemas de tireoide', tr: 'Tiroid Sorunları' },
  { key: 'preeclampsia_risk', ar: 'خطر تسمم الحمل', en: 'Preeclampsia Risk', de: 'Präeklampsie-Risiko', fr: 'Risque de prééclampsie', es: 'Riesgo de preeclampsia', pt: 'Risco de pré-eclâmpsia', tr: 'Preeklampsi Riski' },
];

const moodOptions = [
  { value: 'great', ar: 'ممتازة', en: 'Great', de: 'Ausgezeichnet', fr: 'Excellent', es: 'Excelente', pt: 'Excelente', tr: 'Harika' },
  { value: 'good', ar: 'جيدة', en: 'Good', de: 'Gut', fr: 'Bien', es: 'Bien', pt: 'Bom', tr: 'İyi' },
  { value: 'okay', ar: 'مقبولة', en: 'Okay', de: 'Okay', fr: 'Correct', es: 'Regular', pt: 'Razoável', tr: 'İdare eder' },
  { value: 'stressed', ar: 'متوترة', en: 'Stressed', de: 'Gestresst', fr: 'Stressée', es: 'Estresada', pt: 'Estressada', tr: 'Stresli' },
  { value: 'low', ar: 'منخفضة', en: 'Low', de: 'Niedrig', fr: 'Basse', es: 'Baja', pt: 'Baixo', tr: 'Düşük' },
];

const activityOptions = [
  { value: 'sedentary', ar: 'قليل الحركة', en: 'Sedentary', de: 'Sitzend', fr: 'Sédentaire', es: 'Sedentario', pt: 'Sedentário', tr: 'Hareketsiz' },
  { value: 'moderate', ar: 'متوسط', en: 'Moderate', de: 'Mäßig', fr: 'Modéré', es: 'Moderado', pt: 'Moderado', tr: 'Orta' },
  { value: 'active', ar: 'نشيط', en: 'Active', de: 'Aktiv', fr: 'Actif', es: 'Activo', pt: 'Ativo', tr: 'Aktif' },
];

interface HealthInputFormProps {
  health: HealthData;
  onUpdate: (field: keyof HealthData, value: any) => void;
  lang: string;
}

export function HealthInputForm({ health, onUpdate, lang }: HealthInputFormProps) {
  const { t } = useTranslation();
  const [showMore, setShowMore] = useState(false);
  const kickStats = useMemo(() => getLatestKickStats(), []);

  // Sync kick count into health data for AI prompt
  useEffect(() => {
    if (kickStats.totalKicks > 0 && health.lastKickCount !== kickStats.totalKicks) {
      onUpdate('lastKickCount', kickStats.totalKicks);
    }
  }, [kickStats.totalKicks, health.lastKickCount, onUpdate]);

  const getLabel = (option: Record<string, string>) => option[lang] || option.en;

  const kickLabels: Record<string, { title: string; noData: string; kicks: string; lastSession: string; addAria: string; hint: string }> = {
    ar: { title: 'ركلات الجنين', noData: 'لم تُسجَّل أي ركلة بعد', kicks: 'ركلة', lastSession: 'آخر جلسة', addAria: 'إضافة ركلات إلى التقرير', hint: 'تُضاف الركلات تلقائياً إلى تقرير الذكاء الاصطناعي' },
    en: { title: 'Fetal Kicks', noData: 'No kicks recorded yet', kicks: 'kicks', lastSession: 'Last session', addAria: 'Add kicks to AI report', hint: 'Kicks are automatically included in the AI report' },
    de: { title: 'Fötale Tritte', noData: 'Noch keine Tritte erfasst', kicks: 'Tritte', lastSession: 'Letzte Sitzung', addAria: 'Tritte zum KI-Bericht hinzufügen', hint: 'Tritte werden automatisch in den KI-Bericht aufgenommen' },
    fr: { title: 'Coups du fœtus', noData: 'Aucun coup enregistré', kicks: 'coups', lastSession: 'Dernière session', addAria: 'Ajouter au rapport IA', hint: 'Les coups sont automatiquement inclus dans le rapport IA' },
    es: { title: 'Patadas fetales', noData: 'Sin patadas registradas', kicks: 'patadas', lastSession: 'Última sesión', addAria: 'Añadir al informe de IA', hint: 'Las patadas se incluyen automáticamente en el informe de IA' },
    pt: { title: 'Chutes fetais', noData: 'Sem chutes registrados', kicks: 'chutes', lastSession: 'Última sessão', addAria: 'Adicionar ao relatório de IA', hint: 'Os chutes são incluídos automaticamente no relatório de IA' },
    tr: { title: 'Fetal Tekmeler', noData: 'Henüz tekme kaydı yok', kicks: 'tekme', lastSession: 'Son oturum', addAria: 'AI raporuna ekle', hint: 'Tekmeler AI raporuna otomatik eklenir' },
  };
  const kl = kickLabels[lang] || kickLabels.en;

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label className="text-xs font-semibold">{t("smartPlan.pregnancyWeek", "Pregnancy Week")}</Label>
        <WeekSlider week={health.week} onChange={(v) => onUpdate('week', v)} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">{t("smartPlan.weight", "Weight (kg)")}</Label>
          <Input type="number" value={health.weight} onChange={e => onUpdate('weight', +e.target.value)} className="h-8 text-xs" />
        </div>
        <div>
          <Label className="text-xs">{t("smartPlan.height", "Height (cm)")}</Label>
          <Input type="number" value={health.height} onChange={e => onUpdate('height', +e.target.value)} className="h-8 text-xs" />
        </div>
      </div>

      {/* Fetal Kicks — linked from Kick Counter */}
      <div className="relative rounded-2xl overflow-hidden border border-primary/15 bg-gradient-to-br from-primary/[0.05] via-card to-primary/[0.02] p-3.5 shadow-[0_1px_3px_hsl(340_30%_25%/0.04)]">
        <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-primary/40 to-transparent" />

        <div className="flex items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h4 className="text-[15px] font-extrabold text-foreground tracking-tight leading-tight whitespace-normal break-words" style={{ overflowWrap: 'anywhere' }}>
              {kl.title}
            </h4>
            {kickStats.totalKicks > 0 ? (
              <div className="flex items-baseline gap-1.5 mt-1">
                <span className="text-2xl font-black text-primary leading-none tabular-nums">{kickStats.totalKicks}</span>
                <span className="text-[11px] font-medium text-muted-foreground">{kl.kicks} · {kl.lastSession}</span>
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground mt-1">{kl.noData}</p>
            )}
          </div>

          <Link
            to="/tools/kick-counter"
            aria-label={kl.addAria}
            className="group relative shrink-0 w-11 h-11 rounded-full flex items-center justify-center bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-[0_4px_12px_-2px_hsl(var(--primary)/0.45)] hover:shadow-[0_6px_18px_-2px_hsl(var(--primary)/0.55)] active:scale-95 transition-all duration-200"
          >
            <Plus className="w-5 h-5" strokeWidth={3} />
            <span className="absolute inset-0 rounded-full ring-2 ring-primary/20 animate-ping opacity-0 group-hover:opacity-100" />
          </Link>
        </div>

        <p className="text-[10px] text-muted-foreground/75 mt-2.5 leading-relaxed">
          {kl.hint}
        </p>
      </div>

      <button onClick={() => setShowMore(!showMore)} className="text-xs text-primary flex items-center gap-1">
        {showMore ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        {t("smartPlan.moreOptions", "More details")}
      </button>

      {showMore && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">{t("smartPlan.age", "Age")}</Label>
              <Input type="number" value={health.age} onChange={e => onUpdate('age', +e.target.value)} className="h-8 text-xs" />
            </div>
            <div>
              <Label className="text-xs">{t("smartPlan.sleepHours", "Sleep (hrs)")}</Label>
              <Input type="number" value={health.sleepHours} onChange={e => onUpdate('sleepHours', +e.target.value)} className="h-8 text-xs" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">{t("smartPlan.systolic", "Systolic")}</Label>
              <Input type="number" value={health.bloodPressureSys} onChange={e => onUpdate('bloodPressureSys', +e.target.value)} className="h-8 text-xs" />
            </div>
            <div>
              <Label className="text-xs">{t("smartPlan.diastolic", "Diastolic")}</Label>
              <Input type="number" value={health.bloodPressureDia} onChange={e => onUpdate('bloodPressureDia', +e.target.value)} className="h-8 text-xs" />
            </div>
          </div>

          <div>
            <Label className="text-xs">{t("smartPlan.mood", "Mood")}</Label>
            <Select value={health.mood} onValueChange={v => onUpdate('mood', v)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {moodOptions.map(o => <SelectItem key={o.value} value={o.value}>{getLabel(o)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs">{t("smartPlan.activityLevel", "Activity Level")}</Label>
            <Select value={health.activityLevel} onValueChange={v => onUpdate('activityLevel', v)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {activityOptions.map(o => <SelectItem key={o.value} value={o.value}>{getLabel(o)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs mb-1 block">{t("smartPlan.conditions", "Health Conditions")}</Label>
            <div className="grid grid-cols-1 gap-1.5">
              {conditionOptions.map(c => (
                <label key={c.key} className="flex items-center gap-2 text-xs">
                  <Checkbox
                    checked={health.conditions.includes(c.key)}
                    onCheckedChange={checked => {
                      onUpdate('conditions', checked
                        ? [...health.conditions, c.key]
                        : health.conditions.filter((k: string) => k !== c.key)
                      );
                    }}
                  />
                  {getLabel(c)}
                </label>
              ))}
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
