import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, BarChart3, Shield, Zap, Globe, MessageSquare, Eye, Users } from "lucide-react";

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
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-6 pt-20 pb-16">
        <div className="max-w-3xl">
          <h1 className="text-2xl font-bold tracking-tight leading-tight mb-5" data-testid="hero-heading">
            Are AI tools recommending your brand — or your competitors?
          </h1>
          <p className="text-lg text-foreground/80 leading-relaxed mb-3 max-w-2xl">
            People now ask ChatGPT what to buy. We show whether your brand shows up in those answers.
          </p>
          <p className="text-base text-foreground/60 leading-relaxed mb-8 max-w-2xl">
            We run real customer questions across ChatGPT, Gemini, and Claude — and track who gets recommended.
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

          {/* Proof bullets */}
          <div className="flex flex-wrap items-center gap-6 mt-6 text-sm text-foreground/60">
            <span className="flex items-center gap-1.5">
              <Shield className="w-4 h-4 text-primary" />
              Live queries across ChatGPT, Gemini, and Claude
            </span>
            <span className="flex items-center gap-1.5">
              <BarChart3 className="w-4 h-4 text-primary" />
              Shows probability, not a single score
            </span>
          </div>
        </div>
      </section>

      {/* Variability Section */}
      <section className="border-t border-border/40 bg-card/30">
        <div className="max-w-6xl mx-auto px-6 py-16">
          <h2 className="text-xl font-semibold mb-3">Ask the same question twice, get different answers.</h2>
          <p className="text-base text-foreground/65 mb-8 max-w-2xl leading-relaxed">
            AI responses change 99% of the time. We measure that variation so you don't chase noise. Multiple queries, multiple engines, reported as a range — not false precision.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { value: "We test real buying questions", desc: "The same queries your customers type into ChatGPT, Gemini, and Claude." },
              { value: "We run them across multiple AI tools", desc: "Each engine recommends differently. We test them all." },
              { value: "We show how often you're recommended", desc: "Reported as a range, because a single number would be misleading." },
            ].map((stat) => (
              <div key={stat.value} className="bg-card border border-border/50 rounded-lg p-4">
                <div className="text-sm font-semibold text-foreground mb-1">{stat.value}</div>
                <div className="text-sm text-foreground/55">{stat.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* What You'll Get */}
      <section className="max-w-6xl mx-auto px-6 py-16">
        <h2 className="text-xl font-semibold mb-3">What you'll get</h2>
        <p className="text-base text-foreground/65 mb-8">Every result traces back to a real AI query and a real AI response.</p>
        <div className="grid md:grid-cols-3 gap-4">
          {[
            {
              icon: <Eye className="w-5 h-5" />,
              title: "Your visibility verdict",
              desc: "Where you stand, stated as a verdict first. Then the data: mention rate across all queries, reported as a probability range.",
            },
            {
              icon: <MessageSquare className="w-5 h-5" />,
              title: "Questions we tested",
              desc: "See what consumers asked, what AI said, who got recommended instead of you, and what evidence the model relied on.",
            },
            {
              icon: <Users className="w-5 h-5" />,
              title: "Brands AI recommends most",
              desc: "Your competitors ranked by how frequently AI mentions them. See who's winning, by how much, and in what type of queries.",
            },
            {
              icon: <Shield className="w-5 h-5" />,
              title: "What helps or hurts your visibility",
              desc: "Technical scan of your site: llms.txt, schema, crawler access, content depth. Ranked by impact, linked to specific failure modes.",
            },
            {
              icon: <Zap className="w-5 h-5" />,
              title: "What to fix first",
              desc: "Prioritized recommendations mapped to the actual queries you're losing. Not generic advice — tied to observed gaps in your results.",
            },
            {
              icon: <Globe className="w-5 h-5" />,
              title: "8 languages, same insight",
              desc: "AI recommends differently in Spanish, French, German, Portuguese, Japanese, Korean, and Chinese. Test your real markets.",
            },
          ].map((card) => (
            <div key={card.title} className="bg-card border border-border/50 rounded-lg p-5">
              <div className="text-primary mb-3">{card.icon}</div>
              <h3 className="text-base font-semibold mb-2">{card.title}</h3>
              <p className="text-sm text-foreground/60 leading-relaxed">{card.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How It Works */}
      <section className="border-t border-border/40 bg-card/30">
        <div className="max-w-6xl mx-auto px-6 py-16">
          <h2 className="text-xl font-semibold mb-8">How it works</h2>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { step: "1", title: "Enter your URL", desc: "We detect your brand, category, and competitors automatically." },
              { step: "2", title: "AI engines run", desc: "Real buying questions hit ChatGPT, Gemini, and Claude in parallel." },
              { step: "3", title: "See who gets recommended", desc: "Your visibility verdict, competitor map, and what to fix — in under a minute." },
            ].map((item) => (
              <div key={item.step} className="flex gap-3">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-sm font-semibold text-primary">
                  {item.step}
                </div>
                <div>
                  <h3 className="text-base font-semibold mb-1">{item.title}</h3>
                  <p className="text-sm text-foreground/60">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="max-w-6xl mx-auto px-6 py-16 text-center">
        <h2 className="text-xl font-semibold mb-3">In the era of AI answers, being invisible is being irrelevant.</h2>
        <p className="text-base text-foreground/60 mb-6">Find out where you stand. Takes 30 seconds.</p>
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
      </section>

      {/* Footer */}
      <footer className="border-t border-border/40 py-8">
        <div className="max-w-6xl mx-auto px-6 text-center text-xs text-muted-foreground">
          <span>&copy; 2026 AIShareOfVoice.ai</span>
        </div>
      </footer>
    </div>
  );
}
