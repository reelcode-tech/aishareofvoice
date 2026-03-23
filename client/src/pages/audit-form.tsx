import { useState, useEffect } from "react";
import { useLocation, useRoute } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Loader2, Plus, X, Globe, AlertCircle } from "lucide-react";

const LANGUAGES = [
  { code: "en", label: "English", flag: "🇺🇸" },
  { code: "es", label: "Español", flag: "🇪🇸" },
  { code: "fr", label: "Français", flag: "🇫🇷" },
  { code: "de", label: "Deutsch", flag: "🇩🇪" },
  { code: "pt", label: "Português", flag: "🇧🇷" },
  { code: "ja", label: "日本語", flag: "🇯🇵" },
  { code: "ko", label: "한국어", flag: "🇰🇷" },
  { code: "zh", label: "中文", flag: "🇨🇳" },
];

const SUGGESTED_CATEGORIES = [
  "skincare", "beauty", "mattresses", "fashion", "jewelry",
  "CRM software", "project management", "ecommerce", "electronics",
  "home appliances", "personal care", "consulting", "productivity",
];

export default function AuditForm() {
  const [, routeParams] = useRoute("/audit/:encodedUrl");
  const urlParam = routeParams?.encodedUrl ? decodeURIComponent(routeParams.encodedUrl) : "";
  
  const [, navigate] = useLocation();
  const [url, setUrl] = useState(urlParam);
  const [brandName, setBrandName] = useState("");
  const [category, setCategory] = useState("");
  const [tier, setTier] = useState("free");
  const [language, setLanguage] = useState("en");
  const [customCompetitors, setCustomCompetitors] = useState<string[]>([]);
  const [newCompetitor, setNewCompetitor] = useState("");
  const [detected, setDetected] = useState(false);
  const [categoryTouched, setCategoryTouched] = useState(false);
  
  // Auto-detect brand from URL
  const detectMutation = useMutation({
    mutationFn: async (url: string) => {
      const res = await apiRequest("POST", "/api/detect", { url });
      return res.json();
    },
    onSuccess: (data) => {
      setBrandName(data.brand || "");
      // Only set category if backend returned a real one (not empty)
      if (data.category && data.category !== "general") {
        setCategory(data.category);
      }
      setDetected(true);
    },
  });
  
  useEffect(() => {
    if (urlParam) {
      detectMutation.mutate(urlParam);
    }
  }, [urlParam]);
  
  // Run audit
  const auditMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/audit", {
        url,
        brandName,
        category,
        tier,
        language,
        customCompetitors: customCompetitors.length > 0 ? customCompetitors : undefined,
      });
      return res.json();
    },
    onSuccess: (data) => {
      navigate(`/results/${data.id}`);
    },
  });

  const missingCategory = !category.trim();
  
  const addCompetitor = () => {
    if (newCompetitor.trim() && !customCompetitors.includes(newCompetitor.trim())) {
      setCustomCompetitors([...customCompetitors, newCompetitor.trim()]);
      setNewCompetitor("");
    }
  };
  
  const removeCompetitor = (comp: string) => {
    setCustomCompetitors(customCompetitors.filter(c => c !== comp));
  };
  
  const selectedLang = LANGUAGES.find(l => l.code === language);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/40 backdrop-blur-sm sticky top-0 z-50 bg-background/80">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center gap-3">
          <button
            onClick={() => navigate("/")}
            className="text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 text-sm"
            data-testid="back-button"
          >
            <ArrowLeft className="w-4 h-4" />
            Change URL
          </button>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-xl font-bold mb-2" data-testid="form-heading">Confirm Audit Details</h1>
        <p className="text-sm text-muted-foreground mb-8">
          We detected your brand from the URL. Confirm your category so we ask the right questions.
        </p>

        <div className="space-y-6">
          {/* URL */}
          <div>
            <Label htmlFor="url" className="text-sm font-medium mb-1.5 block">Website URL</Label>
            <Input
              id="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="bg-card"
              data-testid="input-url"
            />
          </div>

          {/* Brand Name */}
          <div>
            <Label htmlFor="brand" className="text-sm font-medium mb-1.5 block">Brand Name</Label>
            <Input
              id="brand"
              value={brandName}
              onChange={(e) => setBrandName(e.target.value)}
              placeholder={detectMutation.isPending ? "Detecting..." : "Enter brand name"}
              className="bg-card"
              data-testid="input-brand"
            />
          </div>

          {/* Category — required, with suggestions */}
          <div>
            <Label htmlFor="category" className="text-sm font-medium mb-1.5 block">
              Category <span className="text-orange-400">*</span>
            </Label>
            <Input
              id="category"
              value={category}
              onChange={(e) => { setCategory(e.target.value); setCategoryTouched(true); }}
              onBlur={() => setCategoryTouched(true)}
              placeholder="e.g. skincare, mattresses, CRM software"
              className={`bg-card ${
                categoryTouched && missingCategory ? "border-orange-400/60 focus-visible:ring-orange-400/40" : ""
              }`}
              data-testid="input-category"
            />
            {categoryTouched && missingCategory && (
              <div className="flex items-start gap-1.5 mt-2">
                <AlertCircle className="w-3.5 h-3.5 text-orange-400 mt-0.5 shrink-0" />
                <p className="text-xs text-orange-400">
                  Category is required. It determines which questions we ask AI about your brand.
                </p>
              </div>
            )}
            {/* Quick-pick suggestions */}
            {missingCategory && (
              <div className="mt-2.5">
                <p className="text-xs text-muted-foreground mb-1.5">Quick pick:</p>
                <div className="flex flex-wrap gap-1.5">
                  {SUGGESTED_CATEGORIES.map(cat => (
                    <button
                      key={cat}
                      onClick={() => { setCategory(cat); setCategoryTouched(true); }}
                      className="px-2.5 py-1 rounded-md text-xs border border-border/50 bg-card hover:border-primary/50 hover:text-primary transition-colors"
                      data-testid={`category-quick-${cat.replace(/\s+/g, '-').toLowerCase()}`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Language */}
          <div>
            <Label className="text-sm font-medium mb-1.5 block">
              <Globe className="w-4 h-4 inline mr-1.5" />
              Query Language
            </Label>
            <Select value={language} onValueChange={setLanguage}>
              <SelectTrigger className="bg-card" data-testid="select-language">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LANGUAGES.map(lang => (
                  <SelectItem key={lang.code} value={lang.code}>
                    {lang.flag} {lang.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {language !== "en" && (
              <p className="text-xs text-primary mt-1.5">
                Queries will run in {selectedLang?.label} to match how your market searches.
              </p>
            )}
          </div>

          {/* Custom Competitors */}
          <div>
            <Label className="text-sm font-medium mb-1.5 block">
              Custom Competitors (optional)
            </Label>
            <p className="text-xs text-muted-foreground mb-2">
              Define who you actually compete against. Leave empty for auto-detection.
            </p>
            <div className="flex gap-2 mb-2">
              <Input
                value={newCompetitor}
                onChange={(e) => setNewCompetitor(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCompetitor())}
                placeholder="Add competitor brand name"
                className="bg-card flex-1"
                data-testid="input-competitor"
              />
              <Button variant="secondary" size="sm" onClick={addCompetitor} data-testid="button-add-competitor">
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            {customCompetitors.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {customCompetitors.map(comp => (
                  <Badge key={comp} variant="secondary" className="gap-1.5 pr-1">
                    {comp}
                    <button onClick={() => removeCompetitor(comp)} className="hover:text-destructive">
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Tier Selection — value-based, not engine-based */}
          <div>
            <Label className="text-sm font-medium mb-1.5 block">Audit Depth</Label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { id: "free", label: "Starter", line1: "Quick snapshot", line2: "12 AI queries", price: "Free" },
                { id: "pro", label: "Growth", line1: "Full visibility scan", line2: "20 queries, 3 AI engines", price: "$29" },
                { id: "business", label: "Pro", line1: "Deep competitive intel", line2: "25 queries, weekly tracking", price: "$99" },
                { id: "enterprise", label: "Enterprise", line1: "Ongoing optimization", line2: "30 queries, daily alerts", price: "$299" },
              ].map(t => (
                <button
                  key={t.id}
                  onClick={() => setTier(t.id)}
                  className={`p-3 rounded-lg border text-left transition-all ${
                    tier === t.id
                      ? "border-primary bg-primary/5"
                      : "border-border/50 bg-card hover:border-border"
                  }`}
                  data-testid={`tier-${t.id}`}
                >
                  <div className="text-sm font-semibold">{t.label}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{t.line1}</div>
                  <div className="text-xs text-muted-foreground">{t.line2}</div>
                  <div className="text-xs font-semibold text-primary mt-1">{t.price}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Submit */}
          <Button
            onClick={() => {
              if (missingCategory) {
                setCategoryTouched(true);
                document.getElementById("category")?.focus();
                return;
              }
              auditMutation.mutate();
            }}
            disabled={auditMutation.isPending || !url || !brandName}
            className="w-full h-12 text-base"
            data-testid="button-run-audit"
          >
            {auditMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Analyzing AI visibility...
              </>
            ) : (
              "Run AI Visibility Audit"
            )}
          </Button>
          
          {auditMutation.isError && (
            <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg p-3" data-testid="error-message">
              {auditMutation.error.message}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
