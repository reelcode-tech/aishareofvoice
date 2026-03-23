import { useQuery } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ChevronDown, ChevronRight, Lock, ExternalLink, TrendingUp, TrendingDown, Minus, AlertTriangle, CheckCircle2, ArrowRight } from "lucide-react";
import { useState, useMemo } from "react";
import {
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
} from "recharts";

// Signal strength bar component
function SignalStrength({ score }: { score: number }) {
  const bars = 4;
  const filledBars = score >= 70 ? 4 : score >= 50 ? 3 : score >= 25 ? 2 : score > 0 ? 1 : 0;
  
  return (
    <div className="flex items-end gap-1" data-testid="signal-strength">
      {Array.from({ length: bars }).map((_, i) => (
        <div
          key={i}
          className="signal-bar w-2.5 rounded-sm"
          style={{
            height: `${12 + i * 6}px`,
            backgroundColor: i < filledBars
              ? `hsl(var(--primary))`
              : `hsl(var(--muted))`,
          }}
        />
      ))}
    </div>
  );
}

// Probability range bar
function ProbabilityBar({ low, high, center }: { low: number; high: number; center: number }) {
  return (
    <div className="relative h-3 bg-muted rounded-full overflow-hidden" data-testid="probability-bar">
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

// Historical trend sparkline
function TrendSparkline({ historyItems, currentId }: { historyItems: any[]; currentId: number }) {
  const chartData = useMemo(() => {
    return historyItems
      .slice()
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .map(item => ({
        date: new Date(item.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        score: item.overallScore ?? 0,
        isCurrent: item.id === currentId,
      }));
  }, [historyItems, currentId]);

  if (chartData.length < 2) return null;

  return (
    <div className="bg-card border border-border/50 rounded-xl p-5" data-testid="trend-chart">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base font-semibold text-foreground">Visibility Over Time</h3>
        <span className="text-sm text-foreground/60">{chartData.length} audits</span>
      </div>
      <ResponsiveContainer width="100%" height={140}>
        <AreaChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
          <defs>
            <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="hsl(178, 70%, 38%)" stopOpacity={0.3} />
              <stop offset="95%" stopColor="hsl(178, 70%, 38%)" stopOpacity={0} />
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
            dot={{ r: 4, fill: "hsl(178, 70%, 38%)", stroke: "hsl(240, 18%, 9%)", strokeWidth: 2 }}
            activeDot={{ r: 6, fill: "hsl(178, 70%, 50%)" }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// Helper: generate the "gap diagnosis" insight
function GapDiagnosis({ dimensions, brandName }: { dimensions: any; brandName: string }) {
  const aiVis = dimensions?.aiVisibility?.score ?? 0;
  const content = dimensions?.contentAuthority?.score ?? 0;
  const technical = dimensions?.technicalReadiness?.score ?? 0;
  
  // The core product insight: why is there a gap?
  if (content >= 60 && aiVis < 40) {
    return (
      <div className="bg-orange-500/5 border border-orange-500/20 rounded-xl p-5 mb-4" data-testid="gap-diagnosis">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-orange-400 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="text-base font-semibold text-foreground mb-1">Your content is strong, but AI doesn't connect it to your brand.</h3>
            <p className="text-sm text-foreground/60 leading-relaxed">
              {brandName} scores {content}/100 on content authority but only {aiVis}/100 on AI visibility. 
              You have the content — the problem is AI engines can't find it, parse it, or attribute it to your brand. 
              The recommendations below focus on closing this specific gap.
            </p>
          </div>
        </div>
      </div>
    );
  }
  
  if (technical < 40 && content >= 40) {
    return (
      <div className="bg-orange-500/5 border border-orange-500/20 rounded-xl p-5 mb-4" data-testid="gap-diagnosis">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-orange-400 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="text-base font-semibold text-foreground mb-1">Technical barriers are blocking your AI visibility.</h3>
            <p className="text-sm text-foreground/60 leading-relaxed">
              {brandName} has decent content ({content}/100) but your technical readiness is only {technical}/100. 
              Missing llms.txt, schema markup, or blocked AI crawlers mean engines can't access what you've built.
            </p>
          </div>
        </div>
      </div>
    );
  }
  
  if (aiVis >= 60) {
    return (
      <div className="bg-green-500/5 border border-green-500/20 rounded-xl p-5 mb-4" data-testid="gap-diagnosis">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="text-base font-semibold text-foreground mb-1">AI engines are recommending {brandName} frequently.</h3>
            <p className="text-sm text-foreground/60 leading-relaxed">
              You appear in {aiVis}% of AI conversations. The focus now is maintaining this position and closing gaps with the top competitor.
            </p>
          </div>
        </div>
      </div>
    );
  }
  
  return null;
}

// Expandable conversation card — shows full AI response with brand highlighting
function ConversationCard({ query, results, brandName }: { query: string; results: any[]; brandName: string }) {
  const [expanded, setExpanded] = useState(false);
  const brandMentioned = results.some((r: any) => r.mentionsBrand);
  
  // Highlight brand name in snippet
  function highlightBrand(text: string) {
    if (!brandName || !text) return text;
    const regex = new RegExp(`(${brandName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = text.split(regex);
    if (parts.length === 1) return text;
    return parts.map((part, i) => 
      regex.test(part) ? <mark key={i} className="bg-primary/20 text-primary font-medium px-0.5 rounded">{part}</mark> : part
    );
  }
  
  return (
    <div className="border border-border/50 rounded-lg overflow-hidden" data-testid="conversation-card">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-4 flex items-center gap-3 text-left hover:bg-card/50 transition-colors"
      >
        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${brandMentioned ? "bg-green-500" : "bg-orange-500"}`} />
        <span className="text-sm text-foreground/80 flex-1">{query}</span>
        <div className="flex items-center gap-2">
          {results.map((r: any) => (
            <Badge
              key={r.engine}
              variant={r.mentionsBrand ? "default" : "secondary"}
              className="text-xs"
            >
              {r.engine}
            </Badge>
          ))}
          {expanded ? <ChevronDown className="w-4 h-4 text-foreground/50" /> : <ChevronRight className="w-4 h-4 text-foreground/50" />}
        </div>
      </button>
      {expanded && (
        <div className="conversation-card-content border-t border-border/30 p-4 space-y-4 bg-card/30">
          {results.map((r: any) => (
            <div key={r.engine} className="text-sm">
              <div className="flex items-center gap-2 mb-2">
                <span className="font-medium text-foreground">{r.engine}</span>
                {r.mentionsBrand ? (
                  <Badge variant="outline" className="text-xs text-green-400 border-green-400/30">Recommended you</Badge>
                ) : (
                  <Badge variant="outline" className="text-xs text-orange-400 border-orange-400/30">Didn't mention you</Badge>
                )}
                {r.sentiment !== "not_mentioned" && (
                  <Badge variant="outline" className="text-xs">
                    {r.sentiment === "positive" ? <TrendingUp className="w-3 h-3 mr-1" /> : 
                     r.sentiment === "negative" ? <TrendingDown className="w-3 h-3 mr-1" /> : 
                     <Minus className="w-3 h-3 mr-1" />}
                    {r.sentiment}
                  </Badge>
                )}
              </div>
              
              {/* AI Response snippet with brand highlighting */}
              <div className="bg-background/50 rounded-lg p-3 border border-border/30 mb-2">
                <p className="text-sm text-foreground/70 leading-relaxed">
                  {highlightBrand(r.responseSnippet)}
                </p>
              </div>
              
              {/* Who was recommended instead */}
              {!r.mentionsBrand && r.mentionedBrands.length > 0 && (
                <div className="flex items-start gap-2 mb-2">
                  <ArrowRight className="w-3.5 h-3.5 text-orange-400 flex-shrink-0 mt-0.5" />
                  <span className="text-sm text-foreground/55">
                    AI recommended {r.mentionedBrands.slice(0, 4).join(", ")} instead
                  </span>
                </div>
              )}
              
              {/* Mentioned brands */}
              {r.mentionedBrands.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {r.mentionedBrands.slice(0, 8).map((b: string) => (
                    <Badge key={b} variant="secondary" className="text-xs">{b}</Badge>
                  ))}
                </div>
              )}
              
              {/* Citation sources */}
              {r.citations.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  <span className="text-xs text-foreground/40">Sources cited:</span>
                  {r.citations.slice(0, 3).map((c: string, i: number) => (
                    <a key={i} href={c} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline flex items-center gap-1">
                      <ExternalLink className="w-3 h-3" />
                      {new URL(c).hostname}
                    </a>
                  ))}
                </div>
              )}
            </div>
          ))}
          {!brandMentioned && (
            <div className="bg-orange-500/5 border border-orange-500/10 rounded p-3 text-sm text-foreground/60">
              This is a real consumer query where AI didn't recommend you. Creating content that directly addresses this question could change that.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Competitor row
function CompetitorRow({ comp, index, brandScore }: { comp: any; index: number; brandScore: number }) {
  const delta = comp.mentionRate - brandScore;
  
  return (
    <div className="flex items-center gap-4 py-3 border-b border-border/30 last:border-0" data-testid={`competitor-${index}`}>
      <span className="text-sm text-foreground/50 w-6">{index + 1}</span>
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium text-foreground">{comp.name}</span>
        {delta > 10 && (
          <span className="text-xs text-orange-400 ml-2">+{Math.round(delta)}pp ahead of you</span>
        )}
      </div>
      <div className="text-right">
        <span className="text-sm font-semibold text-foreground">{comp.mentionRate}%</span>
        <div className="w-20 h-1.5 bg-muted rounded-full mt-1">
          <div className="h-full bg-primary rounded-full" style={{ width: `${Math.min(comp.mentionRate, 100)}%` }} />
        </div>
      </div>
    </div>
  );
}

export default function Results() {
  const [, params] = useRoute("/results/:id");
  const [, navigate] = useLocation();
  const id = params?.id;
  
  const { data, isLoading, error } = useQuery({
    queryKey: ["/api/audit", id],
    enabled: !!id,
  });
  
  // History query
  const { data: history } = useQuery({
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
          <p className="text-foreground/60 mb-4">Audit not found or failed to load.</p>
          <Button onClick={() => navigate("/")} data-testid="back-home">Back to Home</Button>
        </div>
      </div>
    );
  }
  
  const scores = data.scores || {};
  const overall = scores.overall || {};
  const dimensions = scores.dimensions || {};
  const competitors = scores.competitors || [];
  const sentiment = scores.sentimentBreakdown || {};
  const perEngine = scores.perEngine || {};
  const queryDetails = scores.queryDetails || [];
  const geoAudit = data.geoAudit || {};
  const recommendations = data.recommendations || [];
  const historyItems = (history as any[]) || [];
  const hasHistory = historyItems.length > 1;
  
  // Compute the AI visibility score for competitor delta display
  const aiVisScore = dimensions?.aiVisibility?.score ?? overall.score ?? 0;

  // Human-readable visibility description
  const visibilityDesc = overall.score >= 60
    ? `AI frequently recommends ${data.brandName}`
    : overall.score >= 30
    ? `AI sometimes recommends ${data.brandName}`
    : overall.score > 0
    ? `AI rarely recommends ${data.brandName}`
    : `We didn't detect ${data.brandName} in AI results for these queries`;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/40 backdrop-blur-sm sticky top-0 z-50 bg-background/80">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <button onClick={() => navigate("/")} className="text-foreground/60 hover:text-foreground transition-colors flex items-center gap-1 text-sm" data-testid="back-link">
            <ArrowLeft className="w-4 h-4" /> New Audit
          </button>
          <span className="text-sm text-foreground/60">{data.brandName} &middot; {data.category}</span>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-8">
        
        {/* Hero Score Card */}
        <section className="bg-card border border-border/50 rounded-xl p-6" data-testid="score-card">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h1 className="text-xl font-bold text-foreground">{data.brandName}</h1>
              <p className="text-sm text-foreground/60">{data.category}</p>
            </div>
            <SignalStrength score={overall.score || 0} />
          </div>
          
          <div className="mb-4">
            <ProbabilityBar low={overall.confidenceLow || 0} high={overall.confidenceHigh || 0} center={overall.score || 0} />
            <div className="flex justify-between text-xs text-foreground/50 mt-1">
              <span>{overall.confidenceLow || 0}%</span>
              <span>{overall.confidenceHigh || 0}%</span>
            </div>
          </div>
          
          <p className="text-base text-foreground/70 leading-relaxed mb-4">
            {visibilityDesc}. Across {overall.observations || 0} queries, your brand appeared in <span className="text-foreground font-semibold">{overall.confidenceLow || 0}% – {overall.confidenceHigh || 0}%</span> of AI answers.
          </p>
          
          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="bg-background/50 rounded-lg p-3">
              <div className="text-lg font-bold text-foreground">{overall.observations || 0}</div>
              <div className="text-sm text-foreground/60">Queries tested</div>
            </div>
            <div className="bg-background/50 rounded-lg p-3">
              <div className="text-lg font-bold text-foreground">{Object.keys(perEngine).length}</div>
              <div className="text-sm text-foreground/60">AI engines</div>
            </div>
            <div className="bg-background/50 rounded-lg p-3">
              <div className="text-lg font-bold text-foreground">{overall.confidenceLow || 0}% – {overall.confidenceHigh || 0}%</div>
              <div className="text-sm text-foreground/60">Visibility range</div>
            </div>
          </div>
        </section>

        {/* Gap Diagnosis — the core product insight */}
        <GapDiagnosis dimensions={dimensions} brandName={data.brandName} />

        {/* Historical Trend Sparkline (if available) */}
        {hasHistory && (
          <TrendSparkline historyItems={historyItems} currentId={parseInt(id || "0")} />
        )}

        {/* Per-Engine Breakdown */}
        <section data-testid="engines-section">
          <h2 className="text-lg font-semibold mb-4 text-foreground">Results by Engine</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {Object.entries(perEngine).map(([engine, engineData]: [string, any]) => {
              const rate = engineData.mentionRate || 0;
              const desc = rate === 0 
                ? `Not detected in ${engineData.totalQueries} queries`
                : `Mentioned in ${Math.round(rate)}% of ${engineData.totalQueries} queries`;
              return (
                <div key={engine} className="bg-card border border-border/50 rounded-lg p-4">
                  <div className="text-sm font-medium text-foreground mb-1">{engine}</div>
                  <div className="text-xl font-bold text-primary">{rate}%</div>
                  <div className="text-sm text-foreground/55">{desc}</div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Conversation Cards */}
        <section data-testid="conversations-section">
          <h2 className="text-lg font-semibold mb-2 text-foreground">The Exact Questions and Answers</h2>
          <p className="text-sm text-foreground/60 mb-4">
            {data.brandName} was recommended in {queryDetails.filter((q: any) => q.results.some((r: any) => r.mentionsBrand)).length} of {queryDetails.length} queries. Expand any card to see exactly what AI said.
          </p>
          <div className="space-y-2">
            {queryDetails.map((q: any, i: number) => (
              <ConversationCard key={i} query={q.query} results={q.results} brandName={data.brandName} />
            ))}
          </div>
        </section>

        {/* Competitive Landscape */}
        <section data-testid="competitors-section">
          <h2 className="text-lg font-semibold mb-2 text-foreground">Who Shows Up Most Often</h2>
          <p className="text-sm text-foreground/55 mb-4">
            Brands most frequently mentioned by AI in {data.category} queries, ranked by recommendation rate.
          </p>
          {competitors.length > 0 ? (
            <div className="bg-card border border-border/50 rounded-lg p-4">
              {competitors.map((comp: any, i: number) => (
                <CompetitorRow key={comp.name} comp={comp} index={i} brandScore={aiVisScore} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-foreground/50">No competitor data extracted from AI responses.</p>
          )}
        </section>

        {/* AI Visibility Drivers — weighted impact visualization */}
        <section data-testid="geo-audit-section">
          <h2 className="text-lg font-semibold mb-2 text-foreground">Why AI Does (or Doesn't) Pick You</h2>
          <p className="text-sm text-foreground/55 mb-4">Ranked by impact on your visibility. Fix the top items first.</p>
          <div className="space-y-3">
            {[
              {
                label: "llms.txt",
                status: geoAudit.llmsTxt?.exists ? `Found — ${geoAudit.llmsTxt.quality} (${geoAudit.llmsTxt.lineCount} lines)` : "Missing — AI has to guess what your brand is about",
                ok: geoAudit.llmsTxt?.exists,
                impact: "high" as const,
                order: 1,
              },
              {
                label: "Schema Markup",
                status: geoAudit.schema?.exists ? `Found — ${geoAudit.schema.types.join(", ")}` : "Missing — AI can't parse your product data",
                ok: geoAudit.schema?.exists,
                impact: "high" as const,
                order: 2,
              },
              {
                label: "AI Crawler Access",
                status: geoAudit.robots?.allowsAI ? "All AI crawlers allowed" : `${geoAudit.robots?.blockedCrawlers?.length || 0} crawlers blocked — AI can't read your content`,
                ok: geoAudit.robots?.allowsAI,
                impact: (geoAudit.robots?.allowsAI ? "low" : "high") as const,
                order: geoAudit.robots?.allowsAI ? 4 : 1,
              },
              {
                label: "Content Depth",
                status: geoAudit.content?.contentDepth === "rich" 
                  ? "Rich — strong foundation for AI discovery"
                  : geoAudit.content?.contentDepth === "adequate"
                  ? "Adequate — could be deeper for AI queries"
                  : "Thin — not enough content for AI to reference",
                ok: geoAudit.content?.contentDepth !== "thin",
                impact: (geoAudit.content?.contentDepth === "thin" ? "high" : "medium") as const,
                order: geoAudit.content?.contentDepth === "thin" ? 2 : 3,
              },
            ]
            .sort((a, b) => a.order - b.order)
            .map(item => {
              const isHighImpact = item.impact === "high" && !item.ok;
              return (
                <div 
                  key={item.label} 
                  className={`bg-card border rounded-lg p-4 transition-all ${
                    isHighImpact 
                      ? "border-orange-500/30 bg-orange-500/5" 
                      : "border-border/50"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${item.ok ? "bg-green-500" : "bg-orange-500"}`} />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground">{item.label}</span>
                        {isHighImpact && (
                          <Badge variant="outline" className="text-xs text-orange-400 border-orange-400/30">Fix this first</Badge>
                        )}
                      </div>
                      <div className="text-sm text-foreground/55 mt-0.5">{item.status}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          
          {/* Basic Site Hygiene (de-emphasized) */}
          <p className="text-sm text-foreground/40 mt-4 mb-2">Standard site hygiene (lower AI impact)</p>
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "OG Tags", ok: geoAudit.meta?.hasOgTags },
              { label: "Meta Description", ok: geoAudit.meta?.hasDescription },
              { label: "Title Quality", ok: geoAudit.meta?.titleQuality === "good" },
            ].map(item => (
              <div key={item.label} className="bg-card/50 border border-border/30 rounded p-2.5 flex items-center gap-2">
                <div className={`w-1.5 h-1.5 rounded-full ${item.ok ? "bg-green-500/60" : "bg-foreground/20"}`} />
                <span className="text-sm text-foreground/55">{item.label}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Recommendations — with examples and "do this first" */}
        <section data-testid="recommendations-section">
          <h2 className="text-lg font-semibold mb-2 text-foreground">What to Fix First</h2>
          <p className="text-sm text-foreground/55 mb-4">Ordered by expected impact on your AI visibility.</p>
          <div className="space-y-3">
            {recommendations.map((rec: any, index: number) => (
              <div
                key={rec.id}
                className={`bg-card border border-border/50 rounded-lg p-4 ${rec.locked ? "opacity-60 relative" : ""}`}
                data-testid={`rec-${rec.id}`}
              >
                {rec.locked && (
                  <div className="absolute inset-0 bg-background/40 backdrop-blur-[2px] rounded-lg flex items-center justify-center z-10">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => navigate(`/audit/${encodeURIComponent(data.brandUrl)}`)}
                      data-testid="unlock-button"
                    >
                      <Lock className="w-3 h-3 mr-1.5" /> Unlock with Pro
                    </Button>
                  </div>
                )}
                <div className="flex items-start gap-3">
                  {index === 0 && !rec.locked && (
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-xs font-bold text-orange-400">1</div>
                  )}
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-sm font-semibold text-foreground">{rec.title}</h3>
                      <Badge variant={rec.impact === "high" ? "default" : "secondary"} className="text-xs">
                        {rec.impact} impact
                      </Badge>
                      <Badge variant="outline" className="text-xs">{rec.effort}</Badge>
                    </div>
                    <p className="text-sm text-foreground/60 leading-relaxed">{rec.why}</p>
                    
                    {/* Expected impact estimate */}
                    {rec.expectedImpact && (
                      <p className="text-xs text-primary/80 mt-2 flex items-center gap-1.5">
                        <TrendingUp className="w-3.5 h-3.5" />
                        {rec.expectedImpact}
                      </p>
                    )}
                    
                    {/* Example content */}
                    {rec.example && (
                      <div className="mt-3 bg-background/50 rounded-lg p-3 border border-border/30">
                        <p className="text-xs text-foreground/40 mb-1.5">Example:</p>
                        <pre className="text-xs text-foreground/60 font-mono leading-relaxed whitespace-pre-wrap">{rec.example}</pre>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Sentiment Breakdown — condensed */}
        <section data-testid="sentiment-section">
          <h2 className="text-lg font-semibold mb-4 text-foreground">Sentiment When Mentioned</h2>
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: "Positive", value: sentiment.positive || 0, color: "text-green-400" },
              { label: "Neutral", value: sentiment.neutral || 0, color: "text-blue-400" },
              { label: "Negative", value: sentiment.negative || 0, color: "text-red-400" },
              { label: "Not Mentioned", value: sentiment.notMentioned || 0, color: "text-foreground/50" },
            ].map(s => (
              <div key={s.label} className="bg-card border border-border/50 rounded-lg p-3 text-center">
                <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
                <div className="text-sm text-foreground/60">{s.label}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Historical Tracking Table */}
        {hasHistory && (
          <section data-testid="history-section">
            <h2 className="text-lg font-semibold mb-4 text-foreground">Past Audits</h2>
            <div className="bg-card border border-border/50 rounded-lg p-4">
              <div className="space-y-2">
                {historyItems.map((item: any) => (
                  <div
                    key={item.id}
                    className={`flex items-center justify-between py-2 border-b border-border/30 last:border-0 ${
                      item.id === parseInt(id || "") ? "text-primary" : "text-foreground"
                    }`}
                  >
                    <span className="text-sm">{new Date(item.createdAt).toLocaleDateString()}</span>
                    <span className="text-sm font-medium">{item.overallScore}/100</span>
                    <Badge variant="secondary" className="text-xs">{item.overallGrade}</Badge>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Methodology Footer — shortened, less academic */}
        <section className="border-t border-border/30 pt-6 text-sm text-foreground/50" data-testid="methodology-footer">
          <p className="leading-relaxed">
            {Object.keys(perEngine).join(" and ")} were asked {overall.observations || 0} buying-intent questions about {data.category}. Results are reported as a range because AI answers vary every time. This is a snapshot, not a guarantee — run again to track changes.
          </p>
          <p className="mt-2 text-foreground/40">
            {new Date(data.timestamp || data.createdAt).toLocaleString()}
          </p>
        </section>
      </div>

      {/* Footer */}
      <footer className="border-t border-border/40 py-6 mt-8">
        <div className="max-w-4xl mx-auto px-6 flex items-center justify-between text-sm text-foreground/50">
          <span>&copy; 2026 AIShareOfVoice.ai</span>
          <a href="https://www.perplexity.ai/computer" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">
            Created with Perplexity Computer
          </a>
        </div>
      </footer>
    </div>
  );
}
