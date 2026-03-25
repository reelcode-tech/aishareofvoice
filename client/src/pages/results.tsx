import { useQuery } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Lock,
  ExternalLink,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  Info,
  Copy,
  Check,
  BookOpen,
} from "lucide-react";
import { useState, useMemo } from "react";
import {
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
} from "recharts";

// ─── Types ───────────────────────────────────────────────────────────────────

interface DimensionScore {
  score: number;
  grade: string;
  weight: number;
}

interface Competitor {
  name: string;
  mentionRate: number;
  mentionCount: number;
  totalQueries: number;
  archetype?: string;
}

interface SentimentBreakdown {
  positive: number;
  neutral: number;
  negative: number;
  notMentioned: number;
}

interface IntentCount {
  mentioned: number;
  total: number;
}

interface EngineIntentData {
  [intent: string]: IntentCount;
}

interface EngineData {
  score: number;
  mentionRate: number;
  totalQueries: number;
  byIntent: EngineIntentData;
}

interface QueryResult {
  engine: string;
  mentionsBrand: boolean;
  brandPosition: "top_pick" | "featured" | "mentioned" | "not_found";
  mentionedBrands: string[];
  sentiment: string;
  responseSnippet: string;
  citations: string[];
  sourceTypes: string[];
}

interface QueryDetail {
  query: string;
  intent: "branded" | "best" | "comparison" | "review" | "alternative" | "recommendation";
  results: QueryResult[];
}

interface IntentBreakdownItem {
  mentioned: number;
  total: number;
  rate: number;
}

interface Scores {
  overall: {
    score: number;
    grade: string;
    confidenceLow: number;
    confidenceHigh: number;
    marginOfError: number;
    observations: number;
  };
  dimensions: {
    aiVisibility: DimensionScore;
    technicalReadiness: DimensionScore;
    contentAuthority: DimensionScore;
    competitivePosition: DimensionScore;
  };
  competitors: Competitor[];
  sentimentBreakdown: SentimentBreakdown;
  perEngine: { [engine: string]: EngineData };
  queryDetails: QueryDetail[];
  intentBreakdown: { [intent: string]: IntentBreakdownItem };
}

interface GeoAudit {
  llmsTxt: { exists: boolean; quality: string; lineCount: number };
  schema: { exists: boolean; types: string[]; hasProduct: boolean; hasOrganization: boolean; hasService: boolean };
  robots: { allowsAI: boolean; blockedCrawlers: string[] };
  content: { contentDepth: string; hasBlog: boolean; hasFAQ: boolean };
  meta: { hasOgTags: boolean; hasDescription: boolean; titleQuality: string };
}

interface PlaybookStep {
  step: number;
  title: string;
  description: string;
  code?: string;
}

interface Recommendation {
  id: string;
  title: string;
  why: string;
  example?: string;
  expectedImpact?: string;
  impact: "high" | "medium" | "low";
  effort: string;
  locked: boolean;
  category: string;
  playbook?: PlaybookStep[];
  linkedQueries?: string[];
}

interface AuditData {
  id: number;
  brandName: string;
  brandUrl: string;
  category: string;
  tier: string;
  language: string;
  timestamp: string;
  scores: Scores;
  geoAudit: GeoAudit;
  recommendations: Recommendation[];
  customCompetitors: string[];
}

interface HistoryItem {
  id: number;
  brandName: string;
  overallScore: number;
  overallGrade: string;
  tier: string;
  createdAt: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const INTENT_LABELS: Record<string, string> = {
  branded: "branded",
  best: '"best" queries',
  comparison: "comparison",
  review: "review",
  alternative: "alternative",
  recommendation: "recommendation",
};

function intentStrength(rate: number): { label: string; filled: number } {
  if (rate === 0) return { label: "missing", filled: 0 };
  if (rate < 0.25) return { label: "weak", filled: 1 };
  if (rate < 0.55) return { label: "moderate", filled: 2 };
  if (rate < 0.8) return { label: "strong", filled: 3 };
  return { label: "dominant", filled: 4 };
}

function IntentDots({ filled, label }: { filled: number; label: string }) {
  const colorMap: Record<string, string> = {
    missing: "bg-foreground/15",
    weak: "bg-orange-500",
    moderate: "bg-yellow-500",
    strong: "bg-primary",
    dominant: "bg-green-500",
  };
  const color = colorMap[label] ?? "bg-primary";
  return (
    <span className="flex items-center gap-1.5">
      <span className="flex gap-0.5">
        {Array.from({ length: 4 }).map((_, i) => (
          <span
            key={i}
            className={`inline-block w-2 h-2 rounded-full ${i < filled ? color : "bg-foreground/15"}`}
          />
        ))}
      </span>
      <span
        className={`text-xs ${
          label === "missing"
            ? "text-foreground/35"
            : label === "weak"
            ? "text-orange-400"
            : label === "moderate"
            ? "text-yellow-400"
            : label === "strong" || label === "dominant"
            ? "text-primary"
            : "text-foreground/60"
        }`}
      >
        {label}
      </span>
    </span>
  );
}

// ─── Components ──────────────────────────────────────────────────────────────

function SignalStrength({ score }: { score: number }) {
  const bars = 4;
  const filledBars =
    score >= 70 ? 4 : score >= 50 ? 3 : score >= 25 ? 2 : score > 0 ? 1 : 0;
  return (
    <div className="flex items-end gap-1" data-testid="signal-strength">
      {Array.from({ length: bars }).map((_, i) => (
        <div
          key={i}
          className="w-2.5 rounded-sm"
          style={{
            height: `${12 + i * 6}px`,
            backgroundColor:
              i < filledBars
                ? "hsl(var(--primary))"
                : "hsl(var(--muted))",
          }}
        />
      ))}
    </div>
  );
}

function ProbabilityBar({
  low,
  high,
  center,
}: {
  low: number;
  high: number;
  center: number;
}) {
  return (
    <div
      className="relative h-3 bg-muted rounded-full overflow-hidden"
      data-testid="probability-bar"
    >
      <div
        className="absolute h-full bg-primary/30 rounded-full"
        style={{ left: `${low}%`, width: `${Math.max(high - low, 2)}%` }}
      />
      <div
        className="absolute top-1/2 -translate-y-1/2 w-2 h-2 bg-primary rounded-full"
        style={{ left: `${center}%` }}
      />
    </div>
  );
}

function TrendSparkline({
  historyItems,
  currentId,
}: {
  historyItems: HistoryItem[];
  currentId: number;
}) {
  const chartData = useMemo(() => {
    return historyItems
      .slice()
      .sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      )
      .map((item) => ({
        date: new Date(item.createdAt).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        }),
        score: item.overallScore ?? 0,
        isCurrent: item.id === currentId,
      }));
  }, [historyItems, currentId]);

  if (chartData.length < 2) return null;

  return (
    <div
      className="bg-card border border-border/50 rounded-xl p-5"
      data-testid="trend-chart"
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base font-semibold text-foreground">
          Visibility over time
        </h3>
        <span className="text-sm text-foreground/60">
          {chartData.length} audits
        </span>
      </div>
      <ResponsiveContainer width="100%" height={140}>
        <AreaChart
          data={chartData}
          margin={{ top: 5, right: 5, bottom: 5, left: -20 }}
        >
          <defs>
            <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="5%"
                stopColor="hsl(178, 70%, 38%)"
                stopOpacity={0.3}
              />
              <stop
                offset="95%"
                stopColor="hsl(178, 70%, 38%)"
                stopOpacity={0}
              />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="date"
            tick={{ fill: "hsl(220, 10%, 70%)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fill: "hsl(220, 10%, 70%)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={35}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "hsl(240, 18%, 10%)",
              border: "1px solid hsl(240, 8%, 22%)",
              borderRadius: "8px",
              color: "hsl(220, 10%, 94%)",
              fontSize: "13px",
            }}
            formatter={(value: number) => [`${value}/100`, "Score"]}
          />
          <Area
            type="monotone"
            dataKey="score"
            stroke="hsl(178, 70%, 38%)"
            strokeWidth={2}
            fill="url(#trendFill)"
            dot={{
              r: 4,
              fill: "hsl(178, 70%, 38%)",
              stroke: "hsl(240, 18%, 9%)",
              strokeWidth: 2,
            }}
            activeDot={{ r: 6, fill: "hsl(178, 70%, 50%)" }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function GapDiagnosis({
  dimensions,
  brandName,
}: {
  dimensions: Scores["dimensions"];
  brandName: string;
}) {
  const aiVis = dimensions?.aiVisibility?.score ?? 0;
  const content = dimensions?.contentAuthority?.score ?? 0;
  const technical = dimensions?.technicalReadiness?.score ?? 0;

  if (content >= 60 && aiVis < 40) {
    return (
      <div
        className="bg-orange-500/5 border border-orange-500/20 rounded-xl p-5 mb-4"
        data-testid="gap-diagnosis"
      >
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-orange-400 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="text-base font-semibold text-foreground mb-1">
              Your content is strong, but AI doesn't connect it to your brand.
            </h3>
            <p className="text-sm text-foreground/60 leading-relaxed">
              {brandName} scores {content}/100 on content authority but only{" "}
              {aiVis}/100 on AI visibility. You have the content — the problem
              is AI engines can't find it, parse it, or attribute it to your
              brand. The fixes below target this specific gap.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (technical < 40 && content >= 40) {
    return (
      <div
        className="bg-orange-500/5 border border-orange-500/20 rounded-xl p-5 mb-4"
        data-testid="gap-diagnosis"
      >
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-orange-400 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="text-base font-semibold text-foreground mb-1">
              Technical barriers are blocking your AI visibility.
            </h3>
            <p className="text-sm text-foreground/60 leading-relaxed">
              {brandName} has decent content ({content}/100) but technical
              readiness is only {technical}/100. Without an llms.txt file, AI
              has to infer your brand, products, and positioning from scattered
              pages. Missing schema or blocked crawlers compound the problem.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (aiVis >= 60) {
    return (
      <div
        className="bg-green-500/5 border border-green-500/20 rounded-xl p-5 mb-4"
        data-testid="gap-diagnosis"
      >
        <div className="flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="text-base font-semibold text-foreground mb-1">
              AI engines are recommending {brandName} frequently.
            </h3>
            <p className="text-sm text-foreground/60 leading-relaxed">
              You appear in {aiVis}% of AI conversations. The focus now is
              maintaining this position and closing gaps with the top
              competitor.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

// Expandable conversation card
function ConversationCard({
  queryDetail,
  brandName,
  intentBreakdown,
}: {
  queryDetail: QueryDetail;
  brandName: string;
  intentBreakdown: { [intent: string]: IntentBreakdownItem };
}) {
  const [expanded, setExpanded] = useState(false);
  const { query, intent, results } = queryDetail;
  const brandMentioned = results.some((r) => r.mentionsBrand);

  // Find which competitor replaced the brand across all engines
  const replacerBrands = results
    .filter((r) => !r.mentionsBrand && r.mentionedBrands.length > 0)
    .flatMap((r) => r.mentionedBrands.slice(0, 2));
  const topReplacer =
    replacerBrands.length > 0
      ? replacerBrands.reduce(
          (acc, b) => {
            acc[b] = (acc[b] || 0) + 1;
            return acc;
          },
          {} as Record<string, number>
        )
      : null;
  const topReplacerName = topReplacer
    ? Object.entries(topReplacer).sort((a, b) => b[1] - a[1])[0]?.[0]
    : null;

  // Dominant source type
  const allSourceTypes = results.flatMap((r) => r.sourceTypes || []);
  const dominantSource =
    allSourceTypes.length > 0
      ? allSourceTypes.reduce(
          (acc, s) => {
            acc[s] = (acc[s] || 0) + 1;
            return acc;
          },
          {} as Record<string, number>
        )
      : null;
  const topSource = dominantSource
    ? Object.entries(dominantSource).sort((a, b) => b[1] - a[1])[0]?.[0]
    : null;

  // Position label
  function positionLabel(pos: string) {
    if (pos === "top_pick") return "top pick";
    if (pos === "featured") return "featured";
    if (pos === "mentioned") return "mentioned";
    return "not found";
  }

  function highlightBrand(text: string) {
    if (!brandName || !text) return text;
    const regex = new RegExp(
      `(${brandName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`,
      "gi"
    );
    const parts = text.split(regex);
    if (parts.length === 1) return text;
    return parts.map((part, i) =>
      regex.test(part) ? (
        <mark
          key={i}
          className="bg-primary/20 text-primary font-medium px-0.5 rounded"
        >
          {part}
        </mark>
      ) : (
        part
      )
    );
  }

  const intentLabel = INTENT_LABELS[intent] ?? intent;

  return (
    <div
      className="border border-border/50 rounded-lg overflow-hidden"
      data-testid="conversation-card"
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-4 flex items-start gap-3 text-left hover:bg-card/50 transition-colors"
      >
        <div
          className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${
            brandMentioned ? "bg-green-500" : "bg-orange-500"
          }`}
        />
        <div className="flex-1 min-w-0">
          <span className="text-sm text-foreground/85 leading-relaxed block">
            {query}
          </span>
          {/* Intelligence summary line */}
          <div className="flex flex-wrap items-center gap-2 mt-1.5">
            <span className="text-xs text-foreground/45 bg-background/60 border border-border/30 rounded px-1.5 py-0.5">
              {intentLabel}
            </span>
            {brandMentioned ? (
              <>
                {results.find((r) => r.mentionsBrand)?.brandPosition &&
                  results.find((r) => r.mentionsBrand)?.brandPosition !==
                    "not_found" && (
                    <span className="text-xs text-green-400/80">
                      {positionLabel(
                        results.find((r) => r.mentionsBrand)!.brandPosition
                      )}
                    </span>
                  )}
              </>
            ) : (
              <>
                {topReplacerName && (
                  <span className="text-xs text-orange-400/80">
                    → {topReplacerName} recommended instead
                  </span>
                )}
                {topSource && (
                  <span className="text-xs text-foreground/40">
                    AI relied on {topSource}
                  </span>
                )}
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 mt-0.5">
          {results.map((r) => (
            <Badge
              key={r.engine}
              variant={r.mentionsBrand ? "default" : "secondary"}
              className="text-xs"
            >
              {r.engine}
            </Badge>
          ))}
          {expanded ? (
            <ChevronDown className="w-4 h-4 text-foreground/50" />
          ) : (
            <ChevronRight className="w-4 h-4 text-foreground/50" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border/30 p-4 space-y-4 bg-card/30">
          {results.map((r) => (
            <div key={r.engine} className="text-sm">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className="font-medium text-foreground">{r.engine}</span>
                {r.mentionsBrand ? (
                  <Badge
                    variant="outline"
                    className="text-xs text-green-400 border-green-400/30"
                  >
                    Recommended you
                    {r.brandPosition && r.brandPosition !== "not_found"
                      ? ` · ${positionLabel(r.brandPosition)}`
                      : ""}
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="text-xs text-orange-400 border-orange-400/30"
                  >
                    Didn't mention you
                  </Badge>
                )}
                {r.sentiment && r.sentiment !== "not_mentioned" && (
                  <Badge variant="outline" className="text-xs">
                    {r.sentiment === "positive" ? (
                      <TrendingUp className="w-3 h-3 mr-1" />
                    ) : r.sentiment === "negative" ? (
                      <TrendingDown className="w-3 h-3 mr-1" />
                    ) : (
                      <Minus className="w-3 h-3 mr-1" />
                    )}
                    {r.sentiment}
                  </Badge>
                )}
                {/* Source types */}
                {r.sourceTypes && r.sourceTypes.length > 0 && (
                  <span className="text-xs text-foreground/40 ml-auto">
                    via {r.sourceTypes.slice(0, 2).join(", ")}
                  </span>
                )}
              </div>

              <div className="bg-background/50 rounded-lg p-3 border border-border/30 mb-2">
                <p className="text-sm text-foreground/70 leading-relaxed">
                  {highlightBrand(r.responseSnippet)}
                </p>
              </div>

              {!r.mentionsBrand && r.mentionedBrands.length > 0 && (
                <div className="flex items-start gap-2 mb-2">
                  <ArrowRight className="w-3.5 h-3.5 text-orange-400 flex-shrink-0 mt-0.5" />
                  <span className="text-sm text-foreground/55">
                    Recommended instead: {r.mentionedBrands.slice(0, 4).join(", ")}
                  </span>
                </div>
              )}

              {r.mentionedBrands.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {r.mentionedBrands.slice(0, 8).map((b) => (
                    <Badge key={b} variant="secondary" className="text-xs">
                      {b}
                    </Badge>
                  ))}
                </div>
              )}

              {r.citations && r.citations.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  <span className="text-xs text-foreground/40">
                    Sources cited:
                  </span>
                  {r.citations.slice(0, 3).map((c, i) => {
                    let hostname = c;
                    try {
                      hostname = new URL(c).hostname;
                    } catch {}
                    return (
                      <a
                        key={i}
                        href={c}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary hover:underline flex items-center gap-1"
                      >
                        <ExternalLink className="w-3 h-3" />
                        {hostname}
                      </a>
                    );
                  })}
                </div>
              )}
            </div>
          ))}

          {!brandMentioned && (
            <div className="bg-orange-500/5 border border-orange-500/10 rounded p-3 text-sm text-foreground/60">
              This is a real consumer query where AI didn't recommend you.
              Creating content that directly addresses this question could
              change that.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Engine card with intent pattern breakdown
function EngineCard({
  engine,
  engineData,
  brandName,
}: {
  engine: string;
  engineData: EngineData;
  brandName: string;
}) {
  const rate = engineData.mentionRate || 0;
  const byIntent = engineData.byIntent || {};

  const intentEntries = Object.entries(byIntent).filter(
    ([, val]) => val.total > 0
  );

  return (
    <div
      className="bg-card border border-border/50 rounded-xl p-5"
      data-testid={`engine-card-${engine}`}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-foreground">{engine}</span>
        <span className="text-xl font-bold text-primary">{rate}%</span>
      </div>
      <div className="text-xs text-foreground/50 mb-4">
        {rate === 0
          ? `Not detected across ${engineData.totalQueries} queries`
          : `Mentioned in ${Math.round(rate)}% of ${engineData.totalQueries} queries`}
      </div>

      {intentEntries.length > 0 && (
        <div className="space-y-2 border-t border-border/30 pt-3">
          {intentEntries.map(([intent, val]) => {
            const r = val.total > 0 ? val.mentioned / val.total : 0;
            const { label, filled } = intentStrength(r);
            return (
              <div
                key={intent}
                className="flex items-center justify-between gap-3"
              >
                <span className="text-xs text-foreground/50 w-24 truncate">
                  {INTENT_LABELS[intent] ?? intent}
                </span>
                <IntentDots filled={filled} label={label} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Competitor row with intent context
function CompetitorRow({
  comp,
  index,
  brandScore,
  queryDetails,
  intentBreakdown,
}: {
  comp: Competitor;
  index: number;
  brandScore: number;
  queryDetails: QueryDetail[];
  intentBreakdown: { [intent: string]: IntentBreakdownItem };
}) {
  const delta = comp.mentionRate - brandScore;

  // Find intents where this competitor appears and we don't
  const intentsTheyBeatUs: string[] = useMemo(() => {
    const beaten: string[] = [];
    for (const qd of queryDetails) {
      const brandPresent = qd.results.some((r) => r.mentionsBrand);
      const compPresent = qd.results.some(
        (r) =>
          !r.mentionsBrand &&
          r.mentionedBrands
            .map((b) => b.toLowerCase())
            .includes(comp.name.toLowerCase())
      );
      if (compPresent && !brandPresent && !beaten.includes(qd.intent)) {
        beaten.push(qd.intent);
      }
    }
    return beaten.slice(0, 3);
  }, [comp.name, queryDetails]);

  return (
    <div
      className="py-3 border-b border-border/30 last:border-0"
      data-testid={`competitor-${index}`}
    >
      <div className="flex items-center gap-4">
        <span className="text-sm text-foreground/40 w-5 text-right flex-shrink-0">
          {index + 1}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-foreground">
              {comp.name}
            </span>
            {delta > 10 && (
              <span className="text-xs text-orange-400">
                +{Math.round(delta)}pp ahead
              </span>
            )}
            {comp.archetype && (
              <span className="text-xs text-foreground/35 italic">
                {comp.archetype}
              </span>
            )}
          </div>
          {intentsTheyBeatUs.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {intentsTheyBeatUs.map((intent) => (
                <span
                  key={intent}
                  className="text-xs text-foreground/40 bg-background/60 border border-border/25 rounded px-1.5 py-0.5"
                >
                  beats you on {INTENT_LABELS[intent] ?? intent}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="text-right flex-shrink-0">
          <span className="text-sm font-semibold text-foreground">
            {comp.mentionRate}%
          </span>
          <div className="w-20 h-1.5 bg-muted rounded-full mt-1">
            <div
              className="h-full bg-primary rounded-full"
              style={{ width: `${Math.min(comp.mentionRate, 100)}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// Intent breakdown mini-chart across all engines
function IntentBreakdownSection({
  intentBreakdown,
}: {
  intentBreakdown: { [intent: string]: IntentBreakdownItem };
}) {
  const entries = Object.entries(intentBreakdown).filter(
    ([, v]) => v.total > 0
  );
  if (entries.length === 0) return null;

  return (
    <div
      className="bg-card border border-border/50 rounded-xl p-5"
      data-testid="intent-breakdown"
    >
      <h3 className="text-sm font-semibold text-foreground mb-1">
        Visibility by query type
      </h3>
      <p className="text-xs text-foreground/50 mb-4">
        How often you appeared across different intent categories.
      </p>
      <div className="space-y-3">
        {entries
          .sort((a, b) => b[1].rate - a[1].rate)
          .map(([intent, val]) => {
            const pct = Math.round((val.rate || 0) * 100);
            const { label, filled } = intentStrength(val.rate || 0);
            return (
              <div key={intent} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-foreground/70">
                    {INTENT_LABELS[intent] ?? intent}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-foreground/50">
                      {val.mentioned}/{val.total}
                    </span>
                    <IntentDots filled={filled} label={label} />
                  </div>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary/70 rounded-full transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
}

// ─── Recommendation Playbook Card ─────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors px-2 py-1 rounded-md border border-primary/20 hover:bg-primary/5"
      data-testid="copy-code-button"
    >
      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function RecommendationCard({
  rec,
  index,
  brandUrl,
  navigate,
}: {
  rec: Recommendation;
  index: number;
  brandUrl: string;
  navigate: (path: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasPlaybook = rec.playbook && rec.playbook.length > 0;

  return (
    <div
      className={`bg-card border rounded-xl overflow-hidden transition-all ${
        rec.locked
          ? "opacity-60 relative border-border/50"
          : expanded
          ? "border-primary/30 ring-1 ring-primary/10"
          : "border-border/50 hover:border-border"
      }`}
      data-testid={`rec-${rec.id}`}
    >
      {rec.locked && (
        <div className="absolute inset-x-0 bottom-0 top-[70%] bg-gradient-to-t from-background via-background/95 to-transparent rounded-b-xl flex flex-col items-center justify-end pb-4 z-10">
          <p className="text-xs text-foreground/50 mb-2 text-center max-w-[280px]">
            {rec.linkedQueries && rec.linkedQueries.length > 0
              ? `You're invisible on ${rec.linkedQueries.length} high-intent quer${rec.linkedQueries.length === 1 ? "y" : "ies"}. See exactly what to fix.`
              : "We found the gap. Upgrade to see the fix."
            }
          </p>
          <Button
            size="sm"
            className="bg-primary hover:bg-primary/90"
            onClick={() =>
              navigate(`/audit/${encodeURIComponent(brandUrl)}`)
            }
            data-testid="unlock-button"
          >
            <Lock className="w-3 h-3 mr-1.5" /> Unlock with Monitor · $79/mo
          </Button>
        </div>
      )}

      {/* Clickable header */}
      <button
        onClick={() => !rec.locked && hasPlaybook && setExpanded(!expanded)}
        className={`w-full text-left p-5 ${hasPlaybook && !rec.locked ? "cursor-pointer" : "cursor-default"}`}
        data-testid={`rec-toggle-${rec.id}`}
      >
        <div className="flex items-start gap-3">
          {index === 0 && !rec.locked && (
            <div className="flex-shrink-0 w-6 h-6 rounded-full bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-xs font-bold text-orange-400">
              1
            </div>
          )}
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-1.5">
              <h3 className="text-sm font-semibold text-foreground">
                {rec.title}
              </h3>
              <Badge
                variant={rec.impact === "high" ? "default" : "secondary"}
                className="text-xs"
              >
                {rec.impact} impact
              </Badge>
              <Badge variant="outline" className="text-xs">
                {rec.effort}
              </Badge>
              {hasPlaybook && !rec.locked && (
                <span className="ml-auto flex items-center gap-1 text-xs text-primary">
                  <BookOpen className="w-3.5 h-3.5" />
                  {expanded ? "Hide" : "Show"} playbook
                  {expanded ? (
                    <ChevronDown className="w-3 h-3" />
                  ) : (
                    <ChevronRight className="w-3 h-3" />
                  )}
                </span>
              )}
            </div>
            <p className="text-sm text-foreground/60 leading-relaxed">
              {rec.why}
            </p>
            {rec.expectedImpact && (
              <p className="text-xs text-primary/80 mt-2 flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5" />
                {rec.expectedImpact}
              </p>
            )}
            {/* Linked failing queries */}
            {rec.linkedQueries && rec.linkedQueries.length > 0 && !expanded && (
              <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                <span className="text-xs text-foreground/35">Failing on:</span>
                {rec.linkedQueries.slice(0, 3).map((q, i) => (
                  <Badge key={i} variant="outline" className="text-[10px] text-foreground/40 border-border/40 font-normal">
                    {q.length > 40 ? q.slice(0, 37) + "..." : q}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>
      </button>

      {/* Expanded playbook content */}
      {expanded && hasPlaybook && (
        <div className="border-t border-border/30 bg-background/30 px-5 py-4">
          <div className="space-y-4">
            {rec.playbook!.map((step) => (
              <div key={step.step} className="flex gap-3">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-xs font-bold text-primary">
                  {step.step}
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-medium text-foreground mb-1">
                    {step.title}
                  </h4>
                  <p className="text-sm text-foreground/55 leading-relaxed">
                    {step.description}
                  </p>
                  {step.code && (
                    <div className="mt-2 relative">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] text-foreground/30 uppercase tracking-wider">Copy-paste this</span>
                        <CopyButton text={step.code} />
                      </div>
                      <pre className="text-xs text-foreground/60 font-mono leading-relaxed whitespace-pre-wrap bg-background rounded-lg p-3 border border-border/30 overflow-x-auto">
                        {step.code}
                      </pre>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Linked queries at bottom of playbook */}
          {rec.linkedQueries && rec.linkedQueries.length > 0 && (
            <div className="mt-4 pt-3 border-t border-border/20">
              <p className="text-xs text-foreground/35 mb-1.5">Queries this will help:</p>
              <div className="flex flex-wrap gap-1.5">
                {rec.linkedQueries.map((q, i) => (
                  <Badge key={i} variant="outline" className="text-[10px] text-foreground/50 border-border/40 font-normal">
                    "{q}"
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Results() {
  const [, params] = useRoute("/results/:id");
  const [, navigate] = useLocation();
  const id = params?.id;

  const { data, isLoading, error } = useQuery<AuditData>({
    queryKey: ["/api/audit", id],
    enabled: !!id,
  });

  const { data: history } = useQuery<HistoryItem[]>({
    queryKey: ["/api/history", data?.brandName],
    enabled: !!data?.brandName,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-60 w-full" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-foreground/60 mb-4">
            Audit not found or failed to load.
          </p>
          <Button onClick={() => navigate("/")} data-testid="back-home">
            Back to home
          </Button>
        </div>
      </div>
    );
  }

  const scores = data.scores || ({} as Scores);
  const overall = scores.overall || ({} as Scores["overall"]);
  const dimensions = scores.dimensions || ({} as Scores["dimensions"]);
  const allCompetitors = scores.competitors || [];
  // Snapshot tier: cap at top 3 competitors
  const isSnapshot = data.tier === "snapshot" || data.tier === "free";
  const competitors = isSnapshot ? allCompetitors.slice(0, 3) : allCompetitors;
  const hiddenCompetitorCount = isSnapshot ? Math.max(0, allCompetitors.length - 3) : 0;
  const sentiment = scores.sentimentBreakdown || ({} as SentimentBreakdown);
  const perEngine = scores.perEngine || {};
  const queryDetails = scores.queryDetails || [];
  const intentBreakdown = scores.intentBreakdown || {};
  const geoAudit = data.geoAudit || ({} as GeoAudit);
  const recommendations = data.recommendations || [];
  const historyItems = history || [];
  const hasHistory = historyItems.length > 1;

  const aiVisScore = dimensions?.aiVisibility?.score ?? overall.score ?? 0;

  // ── Verdict copy ──────────────────────────────────────────────────────────
  const mentionedQueryCount = queryDetails.filter((q) =>
    q.results.some((r) => r.mentionsBrand)
  ).length;
  const totalQueryCount = queryDetails.length;

  let verdictHeadline = "";
  let verdictBody = "";

  if (overall.score >= 60) {
    verdictHeadline = `${data.brandName} shows up consistently.`;
    verdictBody = `Mentioned in AI answers for ${mentionedQueryCount} of ${totalQueryCount} tested query types. Estimated visibility range: ${overall.confidenceLow ?? 0}% to ${overall.confidenceHigh ?? 0}%.`;
  } else if (overall.score >= 30) {
    verdictHeadline = `${data.brandName} is showing up, but inconsistently.`;
    verdictBody = `Mentioned in AI answers for ${mentionedQueryCount} of ${totalQueryCount} tested query types. Estimated visibility range: ${overall.confidenceLow ?? 0}% to ${overall.confidenceHigh ?? 0}%.`;
  } else if (overall.score > 0) {
    verdictHeadline = `${data.brandName} rarely appears in AI recommendations.`;
    verdictBody = `Mentioned in only ${mentionedQueryCount} of ${totalQueryCount} tested query types. Estimated visibility range: ${overall.confidenceLow ?? 0}% to ${overall.confidenceHigh ?? 0}%.`;
  } else {
    verdictHeadline = `${data.brandName} wasn't detected in AI results.`;
    verdictBody = `Across ${overall.observations ?? 0} queries, AI engines didn't surface ${data.brandName} in any tested category.`;
  }

  // ── Geo audit items ───────────────────────────────────────────────────────
  const visibilityItems = [
    {
      label: "llms.txt",
      status: geoAudit.llmsTxt?.exists
        ? `Found — ${geoAudit.llmsTxt.quality} (${geoAudit.llmsTxt.lineCount} lines)`
        : "Missing — AI has to infer your brand, products, and positioning from scattered pages.",
      ok: geoAudit.llmsTxt?.exists,
      impact: "high" as const,
      order: 1,
    },
    {
      label: "Schema markup",
      status: geoAudit.schema?.exists
        ? `Found — ${(geoAudit.schema.types || []).join(", ")}`
        : "Missing — AI can't reliably parse your product data or business info.",
      ok: geoAudit.schema?.exists,
      impact: "high" as const,
      order: 2,
    },
    {
      label: "AI crawler access",
      status: geoAudit.robots?.allowsAI
        ? "All AI crawlers allowed"
        : `${geoAudit.robots?.blockedCrawlers?.length || 0} crawlers blocked — AI can't read your content.`,
      ok: geoAudit.robots?.allowsAI,
      impact: (geoAudit.robots?.allowsAI ? "low" : "high") as
        | "high"
        | "medium"
        | "low",
      order: geoAudit.robots?.allowsAI ? 4 : 1,
    },
    {
      label: "Content depth",
      status:
        geoAudit.content?.contentDepth === "rich"
          ? "Rich — strong foundation for AI discovery."
          : geoAudit.content?.contentDepth === "adequate"
          ? "Adequate — could be deeper for AI to surface confidently."
          : "Thin — not enough for AI to cite authoritatively.",
      ok: geoAudit.content?.contentDepth !== "thin",
      impact: (geoAudit.content?.contentDepth === "thin"
        ? "high"
        : "medium") as "high" | "medium" | "low",
      order: geoAudit.content?.contentDepth === "thin" ? 2 : 3,
    },
  ].sort((a, b) => a.order - b.order);

  return (
    <div className="min-h-screen bg-background">
      {/* Sticky header */}
      <header className="border-b border-border/40 backdrop-blur-sm sticky top-0 z-50 bg-background/80">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <button
            onClick={() => navigate("/")}
            className="text-foreground/60 hover:text-foreground transition-colors flex items-center gap-1 text-sm"
            data-testid="back-link"
          >
            <ArrowLeft className="w-4 h-4" /> New audit
          </button>
          <span className="text-sm text-foreground/60 flex items-center gap-2">
            {data.brandName}&nbsp;&middot;&nbsp;{data.category}
            <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${
              data.tier === "agency" ? "bg-amber-500/15 text-amber-500 border border-amber-500/20" :
              data.tier === "monitor" ? "bg-primary/15 text-primary border border-primary/20" :
              "bg-foreground/10 text-foreground/50 border border-border/30"
            }`}>
              {data.tier === "agency" ? "Agency" : data.tier === "monitor" ? "Monitor" : "Snapshot"}
            </span>
          </span>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-8">

        {/* ── 1. Verdict card ────────────────────────────────────────────── */}
        <section
          className="bg-card border border-border/50 rounded-xl p-6"
          data-testid="score-card"
        >
          <div className="flex items-start justify-between mb-5">
            <div className="flex-1 min-w-0 pr-4">
              <p className="text-xs text-foreground/45 uppercase tracking-wider mb-1">
                {data.category}
              </p>
              <h1 className="text-xl font-bold text-foreground leading-tight mb-2">
                {verdictHeadline}
              </h1>
              <p className="text-sm text-foreground/65 leading-relaxed">
                {verdictBody}
              </p>
            </div>
            <div className="flex flex-col items-end gap-2 flex-shrink-0">
              <SignalStrength score={overall.score || 0} />
              <span className="text-xs text-foreground/45">
                {overall.grade ?? "—"}
              </span>
            </div>
          </div>

          {/* Probability range bar */}
          <div className="mb-5">
            <ProbabilityBar
              low={overall.confidenceLow || 0}
              high={overall.confidenceHigh || 0}
              center={overall.score || 0}
            />
            <div className="flex justify-between text-xs text-foreground/45 mt-1.5">
              <span>{overall.confidenceLow ?? 0}%</span>
              <span className="text-foreground/35">visibility range</span>
              <span>{overall.confidenceHigh ?? 0}%</span>
            </div>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-background/50 rounded-lg p-3 text-center">
              <div className="text-lg font-bold text-foreground">
                {overall.observations ?? 0}
              </div>
              <div className="text-xs text-foreground/55">Queries tested</div>
            </div>
            <div className="bg-background/50 rounded-lg p-3 text-center">
              <div className="text-lg font-bold text-foreground">
                {Object.keys(perEngine).length}
              </div>
              <div className="text-xs text-foreground/55">AI engines</div>
            </div>
            <div className="bg-background/50 rounded-lg p-3 text-center">
              <div className="text-lg font-bold text-foreground">
                {mentionedQueryCount}/{totalQueryCount}
              </div>
              <div className="text-xs text-foreground/55">Query types</div>
            </div>
          </div>
        </section>

        {/* ── 2. Gap diagnosis ───────────────────────────────────────────── */}
        <GapDiagnosis dimensions={dimensions} brandName={data.brandName} />

        {/* ── 3. Historical trend ────────────────────────────────────────── */}
        {hasHistory && (
          <TrendSparkline
            historyItems={historyItems}
            currentId={parseInt(id || "0")}
          />
        )}

        {/* ── 4. Results by engine (with intent pattern) ─────────────────── */}
        <section data-testid="engines-section">
          <h2 className="text-base font-semibold mb-1 text-foreground">
            Results by engine
          </h2>
          <p className="text-sm text-foreground/50 mb-4">
            Each engine's mention rate, plus how visibility breaks down by
            query type.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.entries(perEngine).map(([engine, engineData]) => (
              <EngineCard
                key={engine}
                engine={engine}
                engineData={engineData}
                brandName={data.brandName}
              />
            ))}
          </div>
        </section>

        {/* ── 5. Intent breakdown ────────────────────────────────────────── */}
        {Object.keys(intentBreakdown).length > 0 && (
          <IntentBreakdownSection intentBreakdown={intentBreakdown} />
        )}

        {/* ── 6. Questions we tested ─────────────────────────────────────── */}
        <section data-testid="conversations-section">
          <h2 className="text-base font-semibold mb-1 text-foreground">
            Questions we tested
          </h2>
          <p className="text-sm text-foreground/50 mb-4">
            {data.brandName} appeared in{" "}
            <span className="text-foreground font-medium">
              {mentionedQueryCount} of {totalQueryCount}
            </span>{" "}
            queries. Expand any card to see what AI said and who it recommended
            instead.
          </p>
          <div className="space-y-2">
            {queryDetails.map((q, i) => (
              <ConversationCard
                key={i}
                queryDetail={q}
                brandName={data.brandName}
                intentBreakdown={intentBreakdown}
              />
            ))}
          </div>
        </section>

        {/* ── 7. Brands AI recommends most ──────────────────────────────── */}
        <section data-testid="competitors-section">
          <h2 className="text-base font-semibold mb-1 text-foreground">
            Brands AI recommends most
          </h2>
          <p className="text-sm text-foreground/50 mb-1">
            Ranked by how often each brand appears in {data.category} queries.
          </p>
          <p className="text-xs text-foreground/35 mb-4">
            These are the brands AI surfaces most in your space — your direct
            competition for AI-driven discovery.
          </p>
          {competitors.length > 0 ? (
            <div className="bg-card border border-border/50 rounded-xl p-4">
              {competitors.map((comp, i) => (
                <CompetitorRow
                  key={comp.name}
                  comp={comp}
                  index={i}
                  brandScore={aiVisScore}
                  queryDetails={queryDetails}
                  intentBreakdown={intentBreakdown}
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-foreground/45">
              No competitor data extracted from AI responses.
            </p>
          )}
          {hiddenCompetitorCount > 0 && (
            <div className="mt-3 p-4 bg-card/50 border border-border/30 rounded-xl text-center">
              <p className="text-sm text-foreground/50 mb-2">
                +{hiddenCompetitorCount} more competitor{hiddenCompetitorCount !== 1 ? "s" : ""} detected. See who else AI recommends in your space.
              </p>
              <Button
                size="sm"
                className="bg-primary hover:bg-primary/90"
                onClick={() => navigate(`/audit/${encodeURIComponent(data.brandUrl)}`)}
              >
                <Lock className="w-3 h-3 mr-1.5" />
                Unlock full competitor map · Monitor $79/mo
              </Button>
            </div>
          )}
        </section>

        {/* ── 8. What helps or hurts visibility ─────────────────────────── */}
        <section data-testid="geo-audit-section">
          <h2 className="text-base font-semibold mb-1 text-foreground">
            What helps or hurts your visibility
          </h2>
          <p className="text-sm text-foreground/50 mb-4">
            Ranked by impact. Fix the top items first.
          </p>

          <div className="space-y-3 mb-5">
            {visibilityItems.map((item) => {
              const isHighImpact = item.impact === "high" && !item.ok;
              return (
                <div
                  key={item.label}
                  className={`bg-card border rounded-xl p-4 transition-all ${
                    isHighImpact
                      ? "border-orange-500/30 bg-orange-500/5"
                      : "border-border/50"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={`w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1 ${
                        item.ok ? "bg-green-500" : "bg-orange-500"
                      }`}
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <span className="text-sm font-medium text-foreground">
                          {item.label}
                        </span>
                        {isHighImpact && (
                          <Badge
                            variant="outline"
                            className="text-xs text-orange-400 border-orange-400/30"
                          >
                            Fix this first
                          </Badge>
                        )}
                      </div>
                      <div className="text-sm text-foreground/55">
                        {item.status}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Site hygiene (lower priority) */}
          <p className="text-xs text-foreground/35 mb-2">
            Standard site hygiene (lower AI impact)
          </p>
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "OG tags", ok: geoAudit.meta?.hasOgTags },
              { label: "Meta description", ok: geoAudit.meta?.hasDescription },
              {
                label: "Title quality",
                ok: geoAudit.meta?.titleQuality === "good",
              },
            ].map((item) => (
              <div
                key={item.label}
                className="bg-card/50 border border-border/30 rounded-lg p-2.5 flex items-center gap-2"
              >
                <div
                  className={`w-1.5 h-1.5 rounded-full ${
                    item.ok ? "bg-green-500/60" : "bg-foreground/20"
                  }`}
                />
                <span className="text-xs text-foreground/50">{item.label}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ── 9. Sentiment when mentioned ────────────────────────────────── */}
        <section data-testid="sentiment-section">
          <h2 className="text-base font-semibold mb-4 text-foreground">
            Sentiment when mentioned
          </h2>
          <div className="grid grid-cols-4 gap-3">
            {[
              {
                label: "Positive",
                value: sentiment.positive ?? 0,
                color: "text-green-400",
              },
              {
                label: "Neutral",
                value: sentiment.neutral ?? 0,
                color: "text-blue-400",
              },
              {
                label: "Negative",
                value: sentiment.negative ?? 0,
                color: "text-red-400",
              },
              {
                label: "Not mentioned",
                value: sentiment.notMentioned ?? 0,
                color: "text-foreground/45",
              },
            ].map((s) => (
              <div
                key={s.label}
                className="bg-card border border-border/50 rounded-xl p-3 text-center"
              >
                <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
                <div className="text-xs text-foreground/55 mt-0.5">
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── 10. What to fix first ──────────────────────────────────────── */}
        <section data-testid="recommendations-section">
          <h2 className="text-base font-semibold mb-1 text-foreground">
            What to fix first
          </h2>
          <p className="text-sm text-foreground/50 mb-4">
            Ordered by expected impact on AI visibility. Click any recommendation for step-by-step instructions.
          </p>
          <div className="space-y-3">
            {recommendations.map((rec, index) => (
              <RecommendationCard
                key={rec.id}
                rec={rec}
                index={index}
                brandUrl={data.brandUrl}
                navigate={navigate}
              />
            ))}
          </div>
        </section>

        {/* ── 11. Past audits ───────────────────────────────────────────── */}
        {hasHistory && (
          <section data-testid="history-section">
            <h2 className="text-base font-semibold mb-4 text-foreground">
              Past audits
            </h2>
            <div className="bg-card border border-border/50 rounded-xl p-4">
              <div className="space-y-2">
                {historyItems.map((item) => (
                  <div
                    key={item.id}
                    className={`flex items-center justify-between py-2 border-b border-border/30 last:border-0 ${
                      item.id === parseInt(id || "")
                        ? "text-primary"
                        : "text-foreground"
                    }`}
                  >
                    <span className="text-sm">
                      {new Date(item.createdAt).toLocaleDateString()}
                    </span>
                    <span className="text-sm font-medium">
                      {item.overallScore}/100
                    </span>
                    <Badge variant="secondary" className="text-xs">
                      {item.overallGrade}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ── 12. Methodology ────────────────────────────────────────────── */}
        <section
          className="border border-border/30 rounded-xl p-5"
          data-testid="methodology-section"
        >
          <div className="flex items-center gap-2 mb-3">
            <Info className="w-4 h-4 text-foreground/40" />
            <h2 className="text-sm font-semibold text-foreground/60">
              How this audit works
            </h2>
          </div>
          <div className="grid sm:grid-cols-2 gap-4 text-xs text-foreground/50">
            <div>
              <p className="mb-1">
                <span className="text-foreground/65 font-medium">
                  Engines tested:
                </span>{" "}
                {Object.keys(perEngine).join(", ") || "—"}
              </p>
              <p className="mb-1">
                <span className="text-foreground/65 font-medium">
                  Total queries:
                </span>{" "}
                {overall.observations ?? 0}
              </p>
              {Object.keys(intentBreakdown).length > 0 && (
                <p className="mb-1">
                  <span className="text-foreground/65 font-medium">
                    Intent clusters:
                  </span>{" "}
                  {Object.entries(intentBreakdown)
                    .filter(([, v]) => v.total > 0)
                    .map(
                      ([k, v]) =>
                        `${INTENT_LABELS[k] ?? k} (${v.total})`
                    )
                    .join(", ")}
                </p>
              )}
            </div>
            <div>
              <p className="mb-1">
                <span className="text-foreground/65 font-medium">
                  "Mentioned" means:
                </span>{" "}
                your brand name appeared in the AI response text.
              </p>
              <p className="mb-1">
                <span className="text-foreground/65 font-medium">Region:</span>{" "}
                {data.language ?? "en"} / global
              </p>
              <p className="mb-1">
                <span className="text-foreground/65 font-medium">
                  Last run:
                </span>{" "}
                {new Date(
                  data.timestamp || (data as any).createdAt
                ).toLocaleString()}
              </p>
            </div>
          </div>
          <p className="text-xs text-foreground/35 mt-3 leading-relaxed">
            Results are reported as a range because AI answers vary between
            sessions. This is a point-in-time snapshot — run again to track
            changes.
          </p>
        </section>
      </div>

      {/* Footer */}
      <footer className="border-t border-border/40 py-6 mt-8">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <span className="text-sm text-foreground/40">
            &copy; 2026 AIShareOfVoice.ai
          </span>
        </div>
      </footer>
    </div>
  );
}
