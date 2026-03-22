import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, BarChart3, Shield, Zap, Globe, TrendingUp, Eye } from "lucide-react";

export default function Landing() {
  const [url, setUrl] = useState("");
  const [, navigate] = useLocation();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (url.trim()) {
      navigate(`/audit/${encodeURIComponent(url.trim())}`);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/40 backdrop-blur-sm sticky top-0 z-50 bg-background/80">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="relative w-8 h-8">
              <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-8 h-8">
                <rect x="2" y="2" width="28" height="28" rx="6" stroke="hsl(var(--primary))" strokeWidth="2.5" />
                <path d="M8 22V14M12 22V10M16 22V16M20 22V12M24 22V8" stroke="hsl(var(--primary))" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
            </div>
            <span className="text-lg font-semibold tracking-tight" data-testid="logo-text">AIShareOfVoice</span>
          </div>
          <nav className="flex items-center gap-6 text-sm text-muted-foreground">
            <span className="hidden sm:inline">Methodology</span>
            <span className="hidden sm:inline">Pricing</span>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-6 pt-20 pb-16">
        <div className="max-w-3xl">
          <h1 className="text-xl font-bold tracking-tight leading-tight mb-4" data-testid="hero-heading">
            The AI recommendation engine is the new front page.
          </h1>
          <p className="text-base text-muted-foreground leading-relaxed mb-3 max-w-2xl">
            Your customers are asking ChatGPT, Gemini, and Claude for advice. If you aren't the answer, your competitor is.
          </p>
          <p className="text-base text-muted-foreground leading-relaxed mb-8 max-w-2xl">
            Measure your brand's AI Share of Voice — how often AI recommends you versus competitors across real consumer queries.
          </p>

          {/* URL Input */}
          <form onSubmit={handleSubmit} className="flex gap-3 max-w-xl" data-testid="audit-form">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Enter your website URL"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="pl-10 h-12 bg-card border-border text-base"
                data-testid="url-input"
              />
            </div>
            <Button type="submit" size="lg" className="h-12 px-6 bg-primary hover:bg-primary/90" data-testid="analyze-button">
              Analyze
            </Button>
          </form>

          {/* Social proof */}
          <div className="flex flex-wrap items-center gap-6 mt-6 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Shield className="w-4 h-4 text-primary" />
              Real API data from 3 AI engines
            </span>
            <span className="flex items-center gap-1.5">
              <BarChart3 className="w-4 h-4 text-primary" />
              Statistical sampling methodology
            </span>
            <span className="flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-primary" />
              SparkToro-validated approach
            </span>
          </div>
        </div>
      </section>

      {/* Variability Section */}
      <section className="border-t border-border/40 bg-card/30">
        <div className="max-w-6xl mx-auto px-6 py-16">
          <h2 className="text-lg font-semibold mb-2">AI answers vary. Ours account for it.</h2>
          <p className="text-sm text-muted-foreground mb-8 max-w-2xl">
            Research from SparkToro (2,961 runs, 600 volunteers) shows AI responses change 99%+ of the time. Single queries are meaningless. We run multiple queries across multiple engines and report probability ranges, not false precision.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { value: "99%+", label: "Response variability", desc: "No two AI answers are identical" },
              { value: "3", label: "AI engines", desc: "ChatGPT, Gemini, Claude" },
              { value: "12-30", label: "Queries per audit", desc: "Depends on tier" },
              { value: "0", label: "Made-up data", desc: "Every result is traceable" },
            ].map((stat) => (
              <div key={stat.label} className="bg-card border border-border/50 rounded-lg p-4">
                <div className="text-xl font-bold text-primary mb-1">{stat.value}</div>
                <div className="text-sm font-medium mb-0.5">{stat.label}</div>
                <div className="text-xs text-muted-foreground">{stat.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* What Your Audit Includes */}
      <section className="max-w-6xl mx-auto px-6 py-16">
        <h2 className="text-lg font-semibold mb-2">What your audit includes</h2>
        <p className="text-sm text-muted-foreground mb-8">Every audit runs real queries against live AI engines and reports exactly what they said.</p>
        <div className="grid md:grid-cols-3 gap-4">
          {[
            {
              icon: <Eye className="w-5 h-5" />,
              title: "Signal Strength",
              desc: "Probability range showing how likely AI mentions your brand, with Wilson confidence intervals. Not a vanity score — a statistical measurement.",
            },
            {
              icon: <Search className="w-5 h-5" />,
              title: "Conversation Laboratory",
              desc: "See the actual queries consumers ask and what AI said. Every response is an expandable card showing who was recommended instead of you, and why.",
            },
            {
              icon: <BarChart3 className="w-5 h-5" />,
              title: "Competitive Archetypes",
              desc: "Your competitors mapped as Dominant, Established, Consistent, or Emerging — with strategic labels based on their AI presence.",
            },
            {
              icon: <Shield className="w-5 h-5" />,
              title: "AI Readiness Audit",
              desc: "Technical scan of your llms.txt, schema markup, AI crawler access, and content depth — the signals AI engines use to decide whether to recommend you.",
            },
            {
              icon: <Zap className="w-5 h-5" />,
              title: "Smart Recommendations",
              desc: "Context-aware fixes that check your actual site before recommending. No generic advice — each recommendation explains why it matters for your specific situation.",
            },
            {
              icon: <Globe className="w-5 h-5" />,
              title: "Multi-Language Support",
              desc: "Run audits in 8 languages to match how your market searches. AI responds differently in Spanish, French, German, Portuguese, Japanese, Korean, and Chinese.",
            },
          ].map((card) => (
            <div key={card.title} className="bg-card border border-border/50 rounded-lg p-5">
              <div className="text-primary mb-3">{card.icon}</div>
              <h3 className="text-sm font-semibold mb-2">{card.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{card.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How It Works */}
      <section className="border-t border-border/40 bg-card/30">
        <div className="max-w-6xl mx-auto px-6 py-16">
          <h2 className="text-lg font-semibold mb-8">How it works</h2>
          <div className="grid md:grid-cols-4 gap-6">
            {[
              { step: "1", title: "Enter URL", desc: "Paste your website. We auto-detect brand and category." },
              { step: "2", title: "Confirm details", desc: "Edit brand name, category, and add custom competitors." },
              { step: "3", title: "AI engines run", desc: "Real queries hit ChatGPT, Gemini, and Claude in parallel." },
              { step: "4", title: "Get your report", desc: "Signal strength, conversation cards, competitive map, and recommendations." },
            ].map((item) => (
              <div key={item.step} className="flex gap-3">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-sm font-semibold text-primary">
                  {item.step}
                </div>
                <div>
                  <h3 className="text-sm font-semibold mb-1">{item.title}</h3>
                  <p className="text-sm text-muted-foreground">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Methodology */}
      <section className="max-w-6xl mx-auto px-6 py-16">
        <h2 className="text-lg font-semibold mb-2">Methodology</h2>
        <p className="text-sm text-muted-foreground mb-6 max-w-2xl">
          We measure AI Share of Voice by querying multiple AI engines with real consumer-intent prompts and analyzing brand mentions with statistical rigor.
        </p>
        <div className="grid md:grid-cols-2 gap-6 text-sm">
          <div>
            <h3 className="font-semibold mb-2">Evidence Basis</h3>
            <ul className="space-y-1.5 text-muted-foreground">
              <li>&#8226; Multiple queries per audit (12-30 depending on tier)</li>
              <li>&#8226; Multiple AI engines queried in parallel</li>
              <li>&#8226; Wilson score confidence intervals for all visibility metrics</li>
              <li>&#8226; Probability ranges reported, not point estimates</li>
              <li>&#8226; Every result traceable to a specific query and AI response</li>
            </ul>
          </div>
          <div>
            <h3 className="font-semibold mb-2">Limitations</h3>
            <ul className="space-y-1.5 text-muted-foreground">
              <li>&#8226; AI responses are inherently variable (99%+ variation per SparkToro)</li>
              <li>&#8226; Scores are directional signals, not absolute truth</li>
              <li>&#8226; Results reflect a point in time — AI models update frequently</li>
              <li>&#8226; Free tier uses 2 engines with fewer queries (wider confidence intervals)</li>
              <li>&#8226; Brand extraction from AI prose has inherent parsing challenges</li>
            </ul>
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="border-t border-border/40 bg-card/30">
        <div className="max-w-6xl mx-auto px-6 py-16 text-center">
          <h2 className="text-lg font-semibold mb-2">Some brands show up in AI. Others don't.</h2>
          <p className="text-sm text-muted-foreground mb-6">Find out where you stand. Free audit takes 30 seconds.</p>
          <form onSubmit={handleSubmit} className="flex gap-3 max-w-md mx-auto">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Enter your website URL"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="pl-10 h-11 bg-card border-border"
                data-testid="url-input-bottom"
              />
            </div>
            <Button type="submit" className="h-11 px-6" data-testid="analyze-button-bottom">
              Analyze
            </Button>
          </form>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/40 py-8">
        <div className="max-w-6xl mx-auto px-6 flex items-center justify-between text-xs text-muted-foreground">
          <span>&copy; 2026 AIShareOfVoice.ai</span>
          <a href="https://www.perplexity.ai/computer" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">
            Created with Perplexity Computer
          </a>
        </div>
      </footer>
    </div>
  );
}
