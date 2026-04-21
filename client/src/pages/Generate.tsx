import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import {
  STYLE_PRESETS, CATEGORY_LABELS, CATEGORY_SIZES, TARGET_MARKET_LABELS,
  OUTPUT_MODE_LABELS,
  DEVICE_MODEL_REFERENCE, DEVICE_SKIN_GENERATION_MODE_HINT_ZH, isDeviceSkinCategory,
  AMAZON_LISTING_COUNT_OPTIONS,
  type TemplateCategory, type OutputMode, type TargetMarket,
} from "@shared/types";
import {
  Sparkles, Loader2, Download, Eye, CheckCircle2, XCircle,
  Upload, Hash, Ruler, Grid3X3, Globe, Scissors, Trash2, ZoomIn, Plus, X, ImagePlus, SlidersHorizontal,
} from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { useState, useCallback, useRef, useMemo } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { downloadImageWithPicker } from "@/lib/download";

// ── Custom sizes stored in localStorage ──────────────────────────────────────
const CUSTOM_SIZES_KEY = "decor_ai_custom_sizes";

type CustomSize = { id: string; label: string; widthCm: number; heightCm: number };

function loadCustomSizes(): CustomSize[] {
  try {
    return JSON.parse(localStorage.getItem(CUSTOM_SIZES_KEY) || "[]");
  } catch { return []; }
}

function saveCustomSizes(sizes: CustomSize[]) {
  localStorage.setItem(CUSTOM_SIZES_KEY, JSON.stringify(sizes));
}

export default function Generate() {
  useAuth({ redirectOnUnauthenticated: true });
  const [, setLocation] = useLocation();

  // Form state
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState("");
  const [category, setCategory] = useState<TemplateCategory>("wallpaper");
  const [sizeId, setSizeId] = useState("");
  const [targetMarket, setTargetMarket] = useState<TargetMarket>("global");
  const [batchCount, setBatchCount] = useState(3);
  // similarity is only used in Tier 2 (mixed mode, has reference + text).
  // Default 80 = "80% reference, 20% text description".
  const [similarity, setSimilarity] = useState(80);
  const [outputMode, setOutputMode] = useState<OutputMode>("both");
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<number[]>([]);
  const [generateSeamless, setGenerateSeamless] = useState(false);
  const [amazonCount, setAmazonCount] = useState<number>(10);
  const [amazonSizeSpec, setAmazonSizeSpec] = useState("");
  const [amazonBrandName, setAmazonBrandName] = useState("");
  const [amazonProductTitle, setAmazonProductTitle] = useState("");
  const [amazonImagePreview, setAmazonImagePreview] = useState<string | null>(null);
  const [amazonImageBase64, setAmazonImageBase64] = useState("");
  const [amazonFeatureFlags, setAmazonFeatureFlags] = useState({
    waterproof: true,
    moistureproof: true,
    selfAdhesive: true,
    easyApply: true,
  });

  // Custom sizes state
  const [customSizes, setCustomSizes] = useState<CustomSize[]>(loadCustomSizes);
  const [showCustomSizeInput, setShowCustomSizeInput] = useState(false);
  const [customWidth, setCustomWidth] = useState("");
  const [customHeight, setCustomHeight] = useState("");
  const [customSizeLabel, setCustomSizeLabel] = useState("");

  // Reference image state
  const [referencePreview, setReferencePreview] = useState<string | null>(null);
  const [referenceBase64, setReferenceBase64] = useState("");
  const refFileInputRef = useRef<HTMLInputElement>(null);
  const amazonFileInputRef = useRef<HTMLInputElement>(null);

  // Preview state
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState("");

  // Delete pattern mutation
  const deletePatternMutation = trpc.pattern.delete.useMutation({
    onSuccess: (_, variables) => {
      setGeneratedPatterns(prev => prev.filter(p => p.id !== variables.id));
      toast.success("图案已删除");
    },
    onError: (err) => toast.error(`删除失败: ${err.message}`),
  });

  // Seamless processing mutation
  const seamlessMutation = trpc.seamless.process.useMutation({
    onSuccess: (data) => {
      toast.success("无缝化处理完成！");
      setGeneratedPatterns(prev => prev.map(p =>
        p.id === data.patternId ? { ...p, seamlessImageUrl: data.seamlessImageUrl } : p
      ));
    },
    onError: (err) => toast.error(`无缝化处理失败: ${err.message}`),
  });

  // Queries
  const templatesQuery = trpc.template.list.useQuery(
    category ? { category } : undefined
  );
  const initPresets = trpc.template.initPresets.useMutation();

  // Available sizes: preset + custom
  const availableSizes = useMemo(() => {
    return [...(CATEGORY_SIZES[category] || []), ...customSizes];
  }, [category, customSizes]);

  // Reset size when category changes
  const handleCategoryChange = (val: string) => {
    setCategory(val as TemplateCategory);
    setSizeId("");
  };

  const handleAddCustomSize = () => {
    const w = parseFloat(customWidth);
    const h = parseFloat(customHeight);
    if (!w || !h || w <= 0 || h <= 0) { toast.error("请输入有效的宽高数值"); return; }
    const label = customSizeLabel.trim() || `${w}cm × ${h}cm (自定义)`;
    const newSize: CustomSize = { id: `custom_${Date.now()}`, label, widthCm: w, heightCm: h };
    const updated = [...customSizes, newSize];
    setCustomSizes(updated);
    saveCustomSizes(updated);
    setSizeId(newSize.id);
    setCustomWidth(""); setCustomHeight(""); setCustomSizeLabel("");
    setShowCustomSizeInput(false);
    toast.success("自定义尺寸已保存");
  };

  const handleDeleteCustomSize = (id: string) => {
    const updated = customSizes.filter(s => s.id !== id);
    setCustomSizes(updated);
    saveCustomSizes(updated);
    if (sizeId === id) setSizeId("");
    toast.success("尺寸已删除");
  };

  // Single generation
  const generateMutation = trpc.pattern.generate.useMutation({
    onSuccess: (data) => {
      toast.success(`图案生成成功！编号: ${data.productCode}`);
      setGeneratedPatterns((prev) => [{ ...data, tileImageUrl: data.tileImageUrl ?? null, seamlessImageUrl: data.seamlessImageUrl ?? null }, ...prev]);
    },
    onError: (err) => toast.error(`生成失败: ${err.message}`),
  });

  // Batch generation
  const batchMutation = trpc.pattern.batchGenerate.useMutation({
    onSuccess: (data) => {
      toast.success(`批量任务已启动 (任务ID: ${data.taskId})，请在历史记录中查看进度`);
    },
    onError: (err) => toast.error(`批量生成失败: ${err.message}`),
  });

  // Reference generation
  const refGenMutation = trpc.pattern.generateFromReference.useMutation({
    onSuccess: (data) => {
      toast.success(`基于参考素材生成了 ${data.generated} 张图案`);
      data.patterns.forEach((p) => {
        setGeneratedPatterns((prev) => [
          { id: p.id, imageUrl: p.imageUrl, productCode: p.productCode, tileImageUrl: null, seamlessImageUrl: p.seamlessImageUrl ?? null, status: "completed" },
          ...prev,
        ]);
      });
    },
    onError: (err) => toast.error(`生成失败: ${err.message}`),
  });

  const amazonMutation = trpc.pattern.generateAmazonListingSet.useMutation({
    onSuccess: (data) => {
      toast.success(`亚马逊图集任务已启动（任务ID: ${data.taskId}，共 ${data.targetCount} 张）`);
    },
    onError: (err) => toast.error(`亚马逊图集生成失败: ${err.message}`),
  });

  // Mockup generation
  const mockupMutation = trpc.mockup.generate.useMutation({
    onSuccess: (data) => {
      toast.success("效果图生成成功！");
      setGeneratedMockups((prev) => [data, ...prev]);
    },
    onError: (err) => toast.error(`效果图生成失败: ${err.message}`),
  });

  const [generatedPatterns, setGeneratedPatterns] = useState<
    { id: number; imageUrl: string; productCode?: string | null; tileImageUrl?: string | null; seamlessImageUrl?: string | null; status: string }[]
  >([]);
  const [generatedMockups, setGeneratedMockups] = useState<
    { id: number; imageUrl: string; productCode?: string | null }[]
  >([]);
  const [selectedPatternForMockup, setSelectedPatternForMockup] = useState<number | null>(null);

  // Reference image handling
  const handleRefFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("请选择图片文件"); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error("图片大小不能超过10MB"); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setReferencePreview(result);
      setReferenceBase64(result.split(",")[1]);
    };
    reader.readAsDataURL(file);
  };

  const clearReference = () => {
    setReferencePreview(null);
    setReferenceBase64("");
    if (refFileInputRef.current) refFileInputRef.current.value = "";
  };

  const handleAmazonFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("请选择图片文件"); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error("图片大小不能超过10MB"); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setAmazonImagePreview(result);
      setAmazonImageBase64(result.split(",")[1]);
    };
    reader.readAsDataURL(file);
  };

  const clearAmazonImage = () => {
    setAmazonImagePreview(null);
    setAmazonImageBase64("");
    if (amazonFileInputRef.current) amazonFileInputRef.current.value = "";
  };

  const handleInitTemplates = useCallback(async () => {
    try {
      const result = await initPresets.mutateAsync();
      toast.success(result.message);
      templatesQuery.refetch();
    } catch (err: any) { toast.error(err.message); }
  }, [initPresets, templatesQuery]);

  const handleGenerate = () => {
    if (!prompt.trim() && !referenceBase64) {
      toast.error("请输入图案描述或上传参考素材");
      return;
    }

    // If has reference image, use reference generation
    if (referenceBase64) {
      const hasTextInput = !!(prompt.trim() || style);
      refGenMutation.mutate({
        referenceImageBase64: referenceBase64,
        // Tier 1 (no text): backend will fix ipScale=0.99 regardless of this value
        // Tier 2 (has text): pass slider value (80–99)
        similarity: hasTextInput ? similarity : 99,
        prompt: prompt.trim() || undefined,
        style: style || undefined,
        category: category || undefined,
        count: batchCount,
      });
      return;
    }

    if (batchCount <= 1) {
      generateMutation.mutate({
        prompt: prompt.trim(),
        style: style || undefined,
        category: category || undefined,
        sizeId: sizeId || undefined,
        targetMarket: targetMarket || undefined,
        generateSeamless,
      });
    } else {
      batchMutation.mutate({
        prompt: prompt.trim(),
        style: style || undefined,
        count: batchCount,
        templateIds: selectedTemplateIds.length > 0 ? selectedTemplateIds : undefined,
        category: category || undefined,
        sizeId: sizeId || undefined,
        targetMarket: targetMarket || undefined,
        outputMode,
        generateSeamless,
      });
    }
  };

  const handleGenerateMockup = (patternId: number, templateId: number) => {
    mockupMutation.mutate({ patternId, templateId });
  };

  const handleGenerateAmazonSet = () => {
    if (!amazonImageBase64) {
      toast.error("请先上传白底商品图");
      return;
    }
    amazonMutation.mutate({
      productImageBase64: amazonImageBase64,
      category,
      count: amazonCount,
      sizeSpec: amazonSizeSpec.trim() || undefined,
      brandName: amazonBrandName.trim() || undefined,
      productTitle: amazonProductTitle.trim() || undefined,
      featureFlags: amazonFeatureFlags,
    });
  };

  const isGenerating = generateMutation.isPending || batchMutation.isPending || refGenMutation.isPending;
  const templates = templatesQuery.data ?? [];

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Page Header */}
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">AI 图案生成</h1>
        <p className="text-muted-foreground">
          输入描述或上传参考素材，AI 为您生成高品质无缝循环装饰纹样，支持多尺寸规格和自动产品编号
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Left: Generation Form */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" />
                生成设置
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Prompt */}
              <div className="space-y-2">
                <Label htmlFor="prompt">图案描述</Label>
                <Textarea
                  id="prompt"
                  placeholder="描述您想要的图案，例如：蓝色海洋波浪纹理、金色几何菱形图案、粉色樱花花瓣..."
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={3}
                  className="resize-none"
                />
              </div>

              {/* Reference Image Upload */}
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <Upload className="w-3.5 h-3.5" />
                  参考素材（可选）
                </Label>
                {referencePreview ? (
                  <div className="space-y-2">
                    <div className="relative rounded-lg border overflow-hidden">
                      <img src={referencePreview} alt="参考素材" className="w-full h-36 object-cover" />
                      <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                        <Button size="sm" variant="secondary" onClick={clearReference}>移除参考素材</Button>
                      </div>
                    </div>
                    {/* Mode indicator */}
                    {!(prompt.trim() || style) ? (
                      // ── Tier 1: Pure reference ────────────────────────────────
                      <div className="flex items-start gap-2 p-2.5 rounded-lg bg-emerald-50 border border-emerald-200">
                        <span className="text-emerald-600 text-base leading-none mt-0.5">●</span>
                        <div>
                          <p className="text-[12px] font-semibold text-emerald-700">纯参考素材模式</p>
                          <p className="text-[11px] text-emerald-600 mt-0.5">
                            未填写描述和风格，AI 将 100% 以参考素材的构图、色调和笔触为唯一标准生成图案
                          </p>
                        </div>
                      </div>
                    ) : (
                      // ── Tier 2: Mixed mode ────────────────────────────────────
                      <div className="space-y-2">
                        <div className="flex items-start gap-2 p-2.5 rounded-lg bg-blue-50 border border-blue-200">
                          <span className="text-blue-500 text-base leading-none mt-0.5">◑</span>
                          <div>
                            <p className="text-[12px] font-semibold text-blue-700">混合模式 — 参考素材 {similarity}% · 文字描述 {100 - similarity}%</p>
                            <p className="text-[11px] text-blue-600 mt-0.5">
                              有文字描述或风格选择时，可调节参考素材的权重比例
                            </p>
                          </div>
                        </div>
                        {/* Similarity Slider — only shown in mixed mode */}
                        <div className="px-1 space-y-1.5">
                          <div className="flex items-center justify-between">
                            <Label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <SlidersHorizontal className="w-3 h-3" />
                              参考素材权重
                            </Label>
                            <span className="text-xs font-bold text-primary tabular-nums">{similarity}%</span>
                          </div>
                          <Slider
                            min={70}
                            max={99}
                            step={1}
                            value={[similarity]}
                            onValueChange={([v]) => setSimilarity(v)}
                            className="w-full"
                          />
                          <div className="flex justify-between text-[10px] text-muted-foreground">
                            <span>70% 均衡混合</span>
                            <span>99% 参考优先</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div
                    onClick={() => refFileInputRef.current?.click()}
                    className="border-2 border-dashed rounded-lg p-4 text-center cursor-pointer hover:border-primary/50 transition-colors"
                  >
                    <Upload className="w-6 h-6 mx-auto mb-1.5 text-muted-foreground opacity-50" />
                    <p className="text-xs text-muted-foreground">上传参考素材 — 无描述时 AI 直接复刻风格，有描述时按比例混合</p>
                  </div>
                )}
                <input ref={refFileInputRef} type="file" accept="image/*" className="hidden" onChange={handleRefFileSelect} />
              </div>

              {/* Style Selection */}
              <div className="space-y-2">
                <Label>设计风格</Label>
                <Select
                  value={style || "__none__"}
                  onValueChange={(v) => setStyle(v === "__none__" ? "" : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="不限风格" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">
                      <span className="text-muted-foreground">不限风格</span>
                    </SelectItem>
                    {STYLE_PRESETS.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        <span className="flex items-center gap-2">
                          <span>{s.name}</span>
                          <span className="text-xs text-muted-foreground">{s.nameEn}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!!referencePreview && !!style && (
                  <p className="text-[11px] text-muted-foreground">
                    混合模式：风格选择作为 {100 - similarity}% 的参考方向
                  </p>
                )}
              </div>

              {/* Category Selection */}
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <Grid3X3 className="w-3.5 h-3.5" />
                  产品类目
                </Label>
                <Select value={category} onValueChange={handleCategoryChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {isDeviceSkinCategory(category) && (
                  <div className="rounded-md border border-border/80 bg-muted/30 px-3 py-2.5 space-y-1.5 text-[11px] text-muted-foreground leading-relaxed">
                    <p className="font-medium text-foreground/90">
                      {DEVICE_MODEL_REFERENCE[category].title}
                    </p>
                    <ul className="list-disc pl-4 space-y-0.5">
                      {DEVICE_MODEL_REFERENCE[category].lines.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                    <p className="text-[10px] pt-0.5 border-t border-border/60 mt-2">
                      真机开孔、弧面与贴膜尺寸请以各品牌官网技术规格或实测为准；生图会尽量跟随您在描述里写明的具体型号，批量生成时系统已约束为「同机型、同构图，仅换贴纸纹样」。
                    </p>
                    <p className="text-[10px] pt-1.5 text-muted-foreground whitespace-pre-line leading-relaxed border-t border-border/60 mt-2">
                      {DEVICE_SKIN_GENERATION_MODE_HINT_ZH}
                    </p>
                  </div>
                )}
              </div>

              {/* Target Market Selection */}
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5" />
                  目标市场
                </Label>
                <Select value={targetMarket} onValueChange={v => setTargetMarket(v as TargetMarket)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.entries(TARGET_MARKET_LABELS) as [TargetMarket, string][]).map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Size Selection */}
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <Ruler className="w-3.5 h-3.5" />
                  产品尺寸
                </Label>
                <Select value={sizeId} onValueChange={setSizeId}>
                  <SelectTrigger>
                    <SelectValue placeholder="选择尺寸规格（可选）" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableSizes.map((size) => (
                      <SelectItem key={size.id} value={size.id}>
                        <span className="flex items-center justify-between w-full gap-2">
                          <span>{size.label}</span>
                          {customSizes.find(c => c.id === size.id) && (
                            <button
                              className="text-destructive hover:text-destructive/80 ml-2"
                              onClick={(e) => { e.stopPropagation(); handleDeleteCustomSize(size.id); }}
                            >
                              <X className="w-3 h-3" />
                            </button>
                          )}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {/* Custom size input toggle */}
                {!showCustomSizeInput ? (
                  <Button variant="outline" size="sm" className="w-full text-xs" onClick={() => setShowCustomSizeInput(true)}>
                    <Plus className="w-3 h-3 mr-1" />自定义尺寸
                  </Button>
                ) : (
                  <div className="border rounded-lg p-3 space-y-2 bg-muted/30">
                    <p className="text-xs font-medium text-muted-foreground">添加自定义尺寸</p>
                    <Input placeholder="名称（可选）如：定制款" value={customSizeLabel} onChange={e => setCustomSizeLabel(e.target.value)} className="h-8 text-sm" />
                    <div className="flex gap-2">
                      <Input placeholder="宽 cm" type="number" value={customWidth} onChange={e => setCustomWidth(e.target.value)} className="h-8 text-sm" />
                      <Input placeholder="高 cm" type="number" value={customHeight} onChange={e => setCustomHeight(e.target.value)} className="h-8 text-sm" />
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" className="flex-1 h-7 text-xs" onClick={handleAddCustomSize}>保存</Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowCustomSizeInput(false)}>取消</Button>
                    </div>
                  </div>
                )}
              </div>

              {/* Batch Count */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>生成数量</Label>
                  <span className="text-sm font-semibold text-primary tabular-nums">{batchCount} 张</span>
                </div>
                <div className="grid grid-cols-5 gap-1.5">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((count) => (
                    <Button
                      key={count}
                      variant={batchCount === count ? "default" : "outline"}
                      size="sm"
                      onClick={() => setBatchCount(count)}
                      className="h-8 text-sm"
                    >
                      {count}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Output Mode */}
              {batchCount > 1 && (
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5">
                    <Grid3X3 className="w-3.5 h-3.5" />
                    输出模式
                  </Label>
                  <div className="flex gap-2 flex-wrap">
                    {(Object.entries(OUTPUT_MODE_LABELS) as [OutputMode, string][]).map(([mode, label]) => (
                      <Button
                        key={mode}
                        variant={outputMode === mode ? "default" : "outline"}
                        size="sm"
                        onClick={() => setOutputMode(mode)}
                      >
                        {label}
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              {/* Template Selection for Batch */}
              {batchCount > 1 && (outputMode === "mockup_only" || outputMode === "both") && templates.length > 0 && (
                <div className="space-y-2">
                  <Label>选择场景模板</Label>
                  <div className="grid grid-cols-2 gap-2 max-h-60 overflow-y-auto">
                    {templates.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => {
                          setSelectedTemplateIds((prev) =>
                            prev.includes(t.id) ? prev.filter((id) => id !== t.id) : [...prev, t.id]
                          );
                        }}
                        className={`p-1.5 rounded-lg border text-left text-xs transition-all ${
                          selectedTemplateIds.includes(t.id)
                            ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                            : "border-border hover:border-primary/30"
                        }`}
                      >
                        <div className="aspect-video rounded overflow-hidden mb-1 bg-muted">
                          <img src={t.thumbnailUrl ?? t.sceneImageUrl} alt={t.name} className="w-full h-full object-cover" />
                        </div>
                        <span className="font-medium text-foreground line-clamp-1">{t.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Seamless Processing Toggle */}
              <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
                <button
                  onClick={() => setGenerateSeamless(!generateSeamless)}
                  className={`w-9 h-5 rounded-full transition-colors relative ${generateSeamless ? "bg-primary" : "bg-muted-foreground/30"}`}
                >
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${generateSeamless ? "left-4" : "left-0.5"}`} />
                </button>
                <div>
                  <Label className="flex items-center gap-1.5 cursor-pointer" onClick={() => setGenerateSeamless(!generateSeamless)}>
                    <Scissors className="w-3.5 h-3.5" />
                    同时生成无缝化图案
                  </Label>
                  <p className="text-xs text-muted-foreground mt-0.5">AI 修复图案边缘接缝，确保生产级别无缝平铺</p>
                </div>
              </div>

              {/* Init Templates Card */}
              {templates.length === 0 && !templatesQuery.isLoading && (
                <div className="p-3 rounded-lg border border-dashed text-center">
                  <p className="text-xs text-muted-foreground mb-2">当前类目暂无模板</p>
                  <Button variant="outline" size="sm" onClick={handleInitTemplates} disabled={initPresets.isPending}>
                    {initPresets.isPending ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <ImagePlus className="w-3.5 h-3.5 mr-1.5" />}
                    初始化预设模板
                  </Button>
                </div>
              )}

              {/* Amazon Listing Set */}
              <div className="space-y-3 rounded-lg border p-3 bg-muted/20">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">亚马逊图集（8-15 张）</Label>
                  <Badge variant="outline">默认 10 张</Badge>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  上传白底商品图后，一键生成主图、场景图、尺寸图、细节图和卖点图；可在历史任务中查看进度。
                </p>

                {amazonImagePreview ? (
                  <div className="space-y-2">
                    <div className="relative rounded border overflow-hidden">
                      <img src={amazonImagePreview} alt="亚马逊商品图" className="w-full h-32 object-cover bg-white" />
                    </div>
                    <Button size="sm" variant="secondary" onClick={clearAmazonImage} className="w-full">移除商品图</Button>
                  </div>
                ) : (
                  <div
                    onClick={() => amazonFileInputRef.current?.click()}
                    className="border-2 border-dashed rounded-lg p-3 text-center cursor-pointer hover:border-primary/50 transition-colors"
                  >
                    <Upload className="w-5 h-5 mx-auto mb-1 text-muted-foreground opacity-60" />
                    <p className="text-xs text-muted-foreground">点击上传白底商品图（建议正视角，主体完整）</p>
                  </div>
                )}
                <input ref={amazonFileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAmazonFileSelect} />

                <div className="grid grid-cols-2 gap-2">
                  <Input placeholder="品牌名（可选）" value={amazonBrandName} onChange={(e) => setAmazonBrandName(e.target.value)} className="h-8 text-xs" />
                  <Input placeholder="产品标题（可选）" value={amazonProductTitle} onChange={(e) => setAmazonProductTitle(e.target.value)} className="h-8 text-xs" />
                </div>
                <Input
                  placeholder="尺寸标注（例：30cm x 20cm / 适配 13-16 英寸）"
                  value={amazonSizeSpec}
                  onChange={(e) => setAmazonSizeSpec(e.target.value)}
                  className="h-8 text-xs"
                />
                <div className="grid grid-cols-4 gap-1.5">
                  {[
                    { key: "waterproof", label: "防水" },
                    { key: "moistureproof", label: "防潮" },
                    { key: "selfAdhesive", label: "背胶" },
                    { key: "easyApply", label: "易粘贴" },
                  ].map((item) => (
                    <button
                      key={item.key}
                      className={`h-7 rounded border text-[11px] ${amazonFeatureFlags[item.key as keyof typeof amazonFeatureFlags] ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}
                      onClick={() => setAmazonFeatureFlags((prev) => ({ ...prev, [item.key]: !prev[item.key as keyof typeof prev] }))}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {AMAZON_LISTING_COUNT_OPTIONS.map((count) => (
                    <button
                      key={count}
                      className={`h-7 rounded border text-[11px] ${amazonCount === count ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}
                      onClick={() => setAmazonCount(count)}
                    >
                      {count} 张
                    </button>
                  ))}
                </div>
                <Button onClick={handleGenerateAmazonSet} disabled={amazonMutation.isPending || !amazonImageBase64} className="w-full" variant="outline">
                  {amazonMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      正在提交亚马逊图集任务...
                    </>
                  ) : "一键生成亚马逊图集"}
                </Button>
              </div>

              {/* Generate Button */}
              <Button onClick={handleGenerate} disabled={isGenerating || (!prompt.trim() && !referenceBase64)} className="w-full" size="lg">
                {isGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    {referenceBase64 ? "分析参考素材并生成..." : batchCount > 1 ? "提交批量任务..." : "正在生成..."}
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-2" />
                    {referenceBase64
                      ? `基于参考素材生成 ${batchCount} 张`
                      : batchCount > 1
                        ? `批量生成 ${batchCount} 张`
                        : "生成图案"}
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Right: Results */}
        <div className="lg:col-span-3 space-y-5">
          {/* Generated Patterns */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">生成结果</CardTitle>
                {generatedPatterns.length > 0 && (
                  <Badge variant="secondary">{generatedPatterns.length} 张</Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {generatedPatterns.length === 0 && !isGenerating ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Sparkles className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">输入描述并点击生成，AI 将为您创建装饰图案</p>
                  <p className="text-xs mt-2 opacity-70">支持上传参考素材，AI 将分析并生成风格相似的新图案</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {isGenerating && (
                    <div className="aspect-square rounded-lg border-2 border-dashed border-primary/30 flex items-center justify-center bg-primary/[0.02]">
                      <div className="text-center">
                        <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-2" />
                        <p className="text-xs text-muted-foreground">AI 生成中...</p>
                      </div>
                    </div>
                  )}
                  {generatedPatterns.map((pattern) => (
                    <div key={pattern.id} className="group relative aspect-square rounded-lg overflow-hidden border bg-muted">
                      <img src={pattern.imageUrl} alt={`图案 ${pattern.id}`} className="w-full h-full object-cover" />
                      {/* Product code badge */}
                      {pattern.productCode && (
                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2">
                          <div className="flex items-center gap-1">
                            <Hash className="w-3 h-3 text-white/80" />
                            <span className="text-xs text-white font-mono">{pattern.productCode}</span>
                          </div>
                        </div>
                      )}
                      {/* Hover actions */}
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex flex-col items-center justify-center gap-1.5 opacity-0 group-hover:opacity-100">
                        <div className="flex gap-1.5">
                          {/* Zoom preview */}
                          <Button size="sm" variant="secondary" className="h-7 px-2" onClick={() => { setPreviewUrl(pattern.imageUrl); setPreviewTitle(pattern.productCode || `图案 ${pattern.id}`); }}>
                            <ZoomIn className="w-3 h-3" />
                          </Button>
                          {/* Download */}
                          <Button size="sm" variant="secondary" className="h-7 px-2"
                            onClick={() => downloadImageWithPicker(pattern.imageUrl, pattern.productCode || `pattern-${pattern.id}`)}>
                            <Download className="w-3 h-3" />
                          </Button>
                          {/* Delete */}
                          <Button size="sm" variant="destructive" className="h-7 px-2" onClick={() => deletePatternMutation.mutate({ id: pattern.id })} disabled={deletePatternMutation.isPending}>
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                        <div className="flex gap-1.5">
                          <Button size="sm" variant="secondary" className="h-7 text-xs px-2" onClick={() => setSelectedPatternForMockup(pattern.id)}>
                            <Eye className="w-3 h-3 mr-1" />效果图
                          </Button>
                          {pattern.tileImageUrl && (
                            <Button size="sm" variant="secondary" className="h-7 text-xs px-2" onClick={() => { setPreviewUrl(pattern.tileImageUrl!); setPreviewTitle("平铺预览"); }}>
                              <Grid3X3 className="w-3 h-3 mr-1" />平铺
                            </Button>
                          )}
                        </div>
                        {!pattern.seamlessImageUrl && pattern.status === "completed" && (
                          <Button size="sm" variant="secondary" className="h-7 text-xs" onClick={() => seamlessMutation.mutate({ patternId: pattern.id })} disabled={seamlessMutation.isPending}>
                            {seamlessMutation.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Scissors className="w-3 h-3 mr-1" />}无缝化
                          </Button>
                        )}
                      </div>
                      {/* Status icon */}
                      <div className="absolute top-1.5 right-1.5">
                        {pattern.status === "completed" ? (
                          <CheckCircle2 className="w-4 h-4 text-green-500 drop-shadow" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-500 drop-shadow" />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Mockup Generation */}
          {selectedPatternForMockup && templates.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center justify-between">
                  <span>选择模板生成效果图</span>
                  <Button variant="ghost" size="sm" onClick={() => setSelectedPatternForMockup(null)}>关闭</Button>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {templates.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => handleGenerateMockup(selectedPatternForMockup, t.id)}
                      disabled={mockupMutation.isPending}
                      className="group relative rounded-lg overflow-hidden border hover:border-primary/50 transition-all text-left"
                    >
                      <div className="aspect-video bg-muted">
                        <img src={t.thumbnailUrl ?? t.sceneImageUrl} alt={t.name} className="w-full h-full object-cover" />
                      </div>
                      <div className="p-2">
                        <p className="text-xs font-medium text-foreground line-clamp-1">{t.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {CATEGORY_LABELS[t.category as TemplateCategory] ?? t.category}
                        </p>
                      </div>
                      <div className="absolute inset-0 bg-primary/0 group-hover:bg-primary/10 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                        {mockupMutation.isPending ? (
                          <Loader2 className="w-6 h-6 animate-spin text-primary" />
                        ) : (
                          <span className="text-xs font-medium text-primary bg-white/90 px-3 py-1.5 rounded-full shadow">
                            点击生成效果图
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Generated Mockups */}
          {generatedMockups.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">效果图预览</CardTitle>
                  <Badge variant="secondary">{generatedMockups.length} 张</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {generatedMockups.map((mockup) => (
                    <div key={mockup.id} className="group relative rounded-lg overflow-hidden border">
                      <img src={mockup.imageUrl} alt={`效果图 ${mockup.id}`} className="w-full aspect-video object-cover" />
                      {mockup.productCode && (
                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2">
                          <span className="text-xs text-white font-mono">{mockup.productCode}</span>
                        </div>
                      )}
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                        <Button size="sm" variant="secondary"
                          onClick={() => downloadImageWithPicker(mockup.imageUrl, mockup.productCode || `mockup-${mockup.id}`)}>
                          <Download className="w-3 h-3 mr-1" />另存为
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Preview Dialog */}
      <Dialog open={!!previewUrl} onOpenChange={() => setPreviewUrl(null)}>
        <DialogContent className="max-w-4xl p-0 overflow-hidden">
          <DialogHeader className="p-4 pb-0">
            <DialogTitle>{previewTitle || "图案预览"}</DialogTitle>
          </DialogHeader>
          {previewUrl && (
            <div className="relative p-4">
              <img src={previewUrl} alt="预览" className="w-full h-auto rounded-lg max-h-[70vh] object-contain" />
              <div className="flex justify-end mt-3 gap-2">
                <Button size="sm" variant="outline" onClick={() => setPreviewUrl(null)}>关闭</Button>
                <Button size="sm" onClick={() => downloadImageWithPicker(previewUrl!, previewTitle || "preview")}>
                  <Download className="w-4 h-4 mr-1" />另存为…
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
