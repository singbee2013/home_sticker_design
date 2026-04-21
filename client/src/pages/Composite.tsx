import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { CATEGORY_LABELS, type TemplateCategory } from "@shared/types";
import {
  Layers2, Sparkles, ImagePlus, Download, Loader2, CheckCircle2,
  ChevronRight, LayoutGrid, X, Maximize2, RefreshCw, Info,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { downloadImageAs1200px } from "@/lib/download";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

type Step = "pattern" | "template" | "generate" | "result";

export default function Composite() {
  useAuth({ redirectOnUnauthenticated: true });

  const [step, setStep] = useState<Step>("pattern");
  const [selectedPatternId, setSelectedPatternId] = useState<number | null>(null);
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<number[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [resultMockups, setResultMockups] = useState<{ id: number; imageUrl: string; productCode?: string | null; error?: string }[]>([]);

  const patternsQuery = trpc.pattern.list.useQuery({ limit: 50 });
  const templatesQuery = trpc.template.list.useQuery(
    categoryFilter !== "all" ? { category: categoryFilter as TemplateCategory } : {}
  );

  const batchMockup = trpc.mockup.batchGenerate.useMutation({
    onSuccess: (data) => {
      const successful = data
        .filter((d) => !d.error && d.imageUrl)
        .map((d) => ({ id: d.mockupId, imageUrl: d.imageUrl, productCode: selectedPattern?.productCode }));
      setResultMockups(successful);
      setStep("result");
      toast.success(`成功合成 ${successful.length} 张效果图`);
    },
    onError: (e) => toast.error(e.message),
  });

  const patterns = patternsQuery.data ?? [];
  const templates = templatesQuery.data ?? [];
  const selectedPattern = patterns.find((p) => p.id === selectedPatternId);

  const categories = [
    { value: "all", label: "全部品类" },
    ...Object.entries(CATEGORY_LABELS).map(([k, v]) => ({ value: k, label: v })),
  ];

  const handleGenerate = () => {
    if (!selectedPatternId || selectedTemplateIds.length === 0) return;
    setStep("generate");
    batchMockup.mutate({
      patternId: selectedPatternId,
      templateIds: selectedTemplateIds,
    });
  };

  const toggleTemplate = (id: number) => {
    setSelectedTemplateIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const stepConfig = [
    { key: "pattern", label: "① 选图案" },
    { key: "template", label: "② 选场景" },
    { key: "generate", label: "③ 生成" },
    { key: "result", label: "④ 查看结果" },
  ] as const;

  return (
    <div className="space-y-5 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Layers2 className="w-5 h-5 text-emerald-500" />
            效果图合成
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            选择图案和场景模板，一键合成专业产品效果图
          </p>
        </div>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-1">
        {stepConfig.map((s, i) => {
          const isActive = s.key === step;
          const isDone = stepConfig.findIndex((x) => x.key === step) > i;
          return (
            <div key={s.key} className="flex items-center gap-1">
              <button
                onClick={() => {
                  if (isDone) setStep(s.key);
                }}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : isDone
                    ? "bg-primary/10 text-primary cursor-pointer hover:bg-primary/20"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {isDone && !isActive ? <CheckCircle2 className="inline w-3 h-3 mr-1" /> : null}
                {s.label}
              </button>
              {i < stepConfig.length - 1 && (
                <ChevronRight className="w-3 h-3 text-muted-foreground" />
              )}
            </div>
          );
        })}
      </div>

      {/* Step 1: Select Pattern */}
      {step === "pattern" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-sm">选择一个图案</h2>
            <span className="text-xs text-muted-foreground">{patterns.length} 个可用</span>
          </div>
          {patternsQuery.isPending ? (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
              {[...Array(12)].map((_, i) => (
                <div key={i} className="aspect-square rounded-xl bg-muted animate-pulse" />
              ))}
            </div>
          ) : patterns.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground border-2 border-dashed rounded-xl">
              <Sparkles className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">还没有生成过图案</p>
              <Button size="sm" variant="outline" className="mt-3" onClick={() => window.location.href = "/generate"}>
                去生成图案
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
              {patterns.map((p) => (
                <div
                  key={p.id}
                  onClick={() => setSelectedPatternId(p.id)}
                  className={`relative aspect-square rounded-xl overflow-hidden cursor-pointer border-2 transition-all ${
                    selectedPatternId === p.id
                      ? "border-primary ring-2 ring-primary/30 scale-[1.02]"
                      : "border-transparent hover:border-primary/40"
                  }`}
                >
                  <img src={p.imageUrl} alt="" className="w-full h-full object-cover" />
                  {selectedPatternId === p.id && (
                    <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                      <CheckCircle2 className="w-6 h-6 text-primary drop-shadow" />
                    </div>
                  )}
                  {p.productCode && (
                    <div className="absolute bottom-0 inset-x-0 bg-black/50 text-white text-[9px] px-1.5 py-0.5 truncate">
                      {p.productCode}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          <div className="flex justify-end">
            <Button
              disabled={!selectedPatternId}
              onClick={() => setStep("template")}
              className="gap-2"
            >
              下一步：选场景 <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Step 2: Select Templates */}
      {step === "template" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            {selectedPattern && (
              <div className="flex items-center gap-2 bg-muted/60 rounded-lg p-2 pr-3">
                <img src={selectedPattern.imageUrl} className="w-8 h-8 rounded-md object-cover" alt="" />
                <div>
                  <p className="text-xs font-medium">已选图案</p>
                  <p className="text-[10px] text-muted-foreground">{selectedPattern.productCode ?? `#${selectedPattern.id}`}</p>
                </div>
              </div>
            )}
            <div className="flex-1 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <LayoutGrid className="w-4 h-4 text-muted-foreground" />
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="h-8 text-xs w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c.value} value={c.value} className="text-xs">{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <span className="text-xs text-muted-foreground">
                已选 {selectedTemplateIds.length} 个场景
              </span>
            </div>
          </div>

          {templatesQuery.isPending ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {[...Array(8)].map((_, i) => <div key={i} className="aspect-[4/3] rounded-xl bg-muted animate-pulse" />)}
            </div>
          ) : templates.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground border-2 border-dashed rounded-xl">
              <ImagePlus className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">该品类暂无场景模板</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {templates.map((t) => (
                <div
                  key={t.id}
                  onClick={() => toggleTemplate(t.id)}
                  className={`relative rounded-xl overflow-hidden cursor-pointer border-2 transition-all group ${
                    selectedTemplateIds.includes(t.id)
                      ? "border-primary ring-2 ring-primary/30"
                      : "border-transparent hover:border-primary/40"
                  }`}
                >
                  <div className="aspect-[4/3] bg-muted">
                    <img src={t.sceneImageUrl} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                  </div>
                  {selectedTemplateIds.includes(t.id) && (
                    <div className="absolute top-2 right-2 w-5 h-5 bg-primary rounded-full flex items-center justify-center">
                      <CheckCircle2 className="w-3.5 h-3.5 text-primary-foreground" />
                    </div>
                  )}
                  <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent px-2 pt-4 pb-2">
                    <p className="text-white text-xs font-medium leading-snug">{t.name ?? CATEGORY_LABELS[t.category as TemplateCategory]}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between pt-1">
            <Button variant="ghost" size="sm" onClick={() => setStep("pattern")}>
              ← 返回
            </Button>
            <Button
              disabled={selectedTemplateIds.length === 0}
              onClick={handleGenerate}
              className="gap-2"
            >
              <Layers2 className="w-4 h-4" />
              合成 {selectedTemplateIds.length} 张效果图
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Generating */}
      {step === "generate" && (
        <div className="text-center py-20 space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
          <div>
            <p className="font-semibold text-foreground">正在合成效果图...</p>
            <p className="text-sm text-muted-foreground mt-1">
              正在将图案贴合到 {selectedTemplateIds.length} 个场景，请稍候
            </p>
          </div>
          <div className="flex items-center justify-center gap-1">
            {[...Array(selectedTemplateIds.length)].map((_, i) => (
              <div key={i} className="w-1.5 h-1.5 rounded-full bg-primary/40 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
            ))}
          </div>
        </div>
      )}

      {/* Step 4: Results */}
      {step === "result" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-500" />
              <h2 className="font-semibold">合成完成，共 {resultMockups.length} 张效果图</h2>
            </div>
            <Button variant="outline" size="sm" className="gap-2" onClick={() => { setStep("pattern"); setSelectedPatternId(null); setSelectedTemplateIds([]); setResultMockups([]); }}>
              <RefreshCw className="w-3.5 h-3.5" />
              重新合成
            </Button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {resultMockups.map((m) => (
              <Card key={m.id} className="overflow-hidden border-0 shadow-sm group">
                <div className="relative aspect-square bg-muted">
                  <img src={m.imageUrl} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                    <Button size="icon" variant="secondary" className="h-8 w-8" onClick={() => setPreviewUrl(m.imageUrl)}>
                      <Maximize2 className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="icon" variant="secondary" className="h-8 w-8" onClick={() => downloadImageAs1200px(m.imageUrl, `mockup-${m.id}.png`).then(() => toast.success("已下载"))}>
                      <Download className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
                {m.productCode && (
                  <CardContent className="p-2">
                    <p className="text-[10px] text-muted-foreground truncate">{m.productCode}</p>
                  </CardContent>
                )}
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Lightbox */}
      {previewUrl && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={() => setPreviewUrl(null)}>
          <img src={previewUrl} alt="" className="max-w-full max-h-full rounded-xl shadow-2xl" onClick={(e) => e.stopPropagation()} />
          <button className="absolute top-4 right-4 w-8 h-8 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white transition-colors" onClick={() => setPreviewUrl(null)}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
