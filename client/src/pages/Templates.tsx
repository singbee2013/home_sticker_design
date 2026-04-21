import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { trpc } from "@/lib/trpc";
import { CATEGORY_LABELS, type TemplateCategory } from "@shared/types";
import {
  LayoutGrid, Upload, Loader2, ImagePlus, Sparkles, Trash2, Wand2,
  Maximize2, Download, X,
} from "lucide-react";
import { useState, useRef } from "react";
import { toast } from "sonner";
import { downloadImageWithPicker } from "@/lib/download";

export default function Templates() {
  useAuth({ redirectOnUnauthenticated: true });

  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [aiGenDialogOpen, setAiGenDialogOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState("");

  const templatesQuery = trpc.template.list.useQuery(
    activeCategory !== "all" ? { category: activeCategory } : undefined
  );
  const initPresets = trpc.template.initPresets.useMutation();
  const uploadCustom = trpc.template.uploadCustom.useMutation();
  const aiGenerate = trpc.template.aiGenerate.useMutation();
  const deleteTemplate = trpc.template.delete.useMutation();

  // Upload form state
  const [uploadName, setUploadName] = useState("");
  const [uploadCategory, setUploadCategory] = useState<TemplateCategory>("wallpaper");
  const [uploadDescription, setUploadDescription] = useState("");
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const [uploadBase64, setUploadBase64] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // AI generate form state
  const [aiGenCategory, setAiGenCategory] = useState<TemplateCategory>("wallpaper");
  const [aiGenCount, setAiGenCount] = useState(3);
  const [aiGenPrompt, setAiGenPrompt] = useState("");

  const templates = templatesQuery.data ?? [];

  const handleInitTemplates = async () => {
    try {
      const result = await initPresets.mutateAsync();
      toast.success(result.message);
      templatesQuery.refetch();
    } catch (err: any) { toast.error(err.message); }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("请选择图片文件"); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setUploadPreview(result);
      setUploadBase64(result.split(",")[1]);
    };
    reader.readAsDataURL(file);
  };

  const handleUpload = async () => {
    if (!uploadName.trim()) { toast.error("请输入模板名称"); return; }
    if (!uploadBase64) { toast.error("请选择图片"); return; }
    try {
      await uploadCustom.mutateAsync({
        name: uploadName.trim(),
        category: uploadCategory,
        description: uploadDescription || undefined,
        imageBase64: uploadBase64,
      });
      toast.success("自定义模板上传成功！");
      setUploadDialogOpen(false);
      resetUploadForm();
      templatesQuery.refetch();
    } catch (err: any) { toast.error(`上传失败: ${err.message}`); }
  };

  const handleAiGenerate = async () => {
    try {
      const result = await aiGenerate.mutateAsync({
        category: aiGenCategory,
        count: aiGenCount,
        customPrompt: aiGenPrompt || undefined,
      });
      if (result.generated === 0) {
        toast.error("未生成任何模板，请查看报错或 SiliconFlow / OSS 配置");
      } else {
        toast.success(`成功生成 ${result.generated} 个场景模板`);
        setAiGenDialogOpen(false);
        setAiGenPrompt("");
      }
      templatesQuery.refetch();
    } catch (err: any) { toast.error(`生成失败: ${err.message}`); }
  };

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`确定删除模板「${name}」？`)) return;
    try {
      await deleteTemplate.mutateAsync({ id });
      toast.success("模板已删除");
      templatesQuery.refetch();
    } catch (err: any) { toast.error(`删除失败: ${err.message}`); }
  };

  const resetUploadForm = () => {
    setUploadName(""); setUploadDescription(""); setUploadPreview(null); setUploadBase64("");
  };

  const categories = [
    { value: "all", label: "全部" },
    ...Object.entries(CATEGORY_LABELS).map(([value, label]) => ({ value, label })),
  ];

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">场景图库</h1>
          <p className="text-muted-foreground">管理10大类目的产品场景模板，支持AI智能生成和自定义上传</p>
        </div>
        <div className="flex gap-2 shrink-0">
          {templates.length === 0 && (
            <Button variant="outline" onClick={handleInitTemplates} disabled={initPresets.isPending}>
              {initPresets.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ImagePlus className="w-4 h-4 mr-2" />}
              初始化预设
            </Button>
          )}

          {/* AI Generate Dialog */}
          <Dialog open={aiGenDialogOpen} onOpenChange={setAiGenDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Wand2 className="w-4 h-4 mr-2" />
                AI 生成模板
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-primary" />
                  AI 智能生成场景模板
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label>产品类目</Label>
                  <Select value={aiGenCategory} onValueChange={(v) => setAiGenCategory(v as TemplateCategory)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>生成数量</Label>
                  <div className="flex gap-2">
                    {[1, 3, 5, 10].map((n) => (
                      <Button key={n} variant={aiGenCount === n ? "default" : "outline"} size="sm" onClick={() => setAiGenCount(n)}>
                        {n}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>自定义要求（可选）</Label>
                  <Textarea
                    placeholder="例如：北欧风格、暖色调灯光、现代简约家具..."
                    value={aiGenPrompt}
                    onChange={(e) => setAiGenPrompt(e.target.value)}
                    rows={3}
                    className="resize-none"
                  />
                </div>
                <Button onClick={handleAiGenerate} disabled={aiGenerate.isPending} className="w-full">
                  {aiGenerate.isPending ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" />生成中...</>
                  ) : (
                    <><Sparkles className="w-4 h-4 mr-2" />生成 {aiGenCount} 个场景模板</>
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Upload Dialog */}
          <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Upload className="w-4 h-4 mr-2" />
                上传模板
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>上传自定义模板</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label>模板名称</Label>
                  <Input placeholder="例如：北欧风客厅" value={uploadName} onChange={(e) => setUploadName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>产品类别</Label>
                  <Select value={uploadCategory} onValueChange={(v) => setUploadCategory(v as TemplateCategory)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>描述（可选）</Label>
                  <Input placeholder="简要描述此模板的场景" value={uploadDescription} onChange={(e) => setUploadDescription(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>场景图片</Label>
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
                  >
                    {uploadPreview ? (
                      <img src={uploadPreview} alt="Preview" className="max-h-48 mx-auto rounded" />
                    ) : (
                      <div className="text-muted-foreground">
                        <Upload className="w-8 h-8 mx-auto mb-2 opacity-50" />
                        <p className="text-sm">点击选择图片</p>
                        <p className="text-xs mt-1">建议使用 16:9 比例的场景图</p>
                      </div>
                    )}
                  </div>
                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />
                </div>
                <Button onClick={handleUpload} disabled={uploadCustom.isPending} className="w-full">
                  {uploadCustom.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                  上传模板
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Category Tabs - Scrollable */}
      <ScrollArea className="w-full">
        <div className="flex gap-2 pb-2">
          {categories.map((cat) => (
            <Button
              key={cat.value}
              variant={activeCategory === cat.value ? "default" : "outline"}
              size="sm"
              onClick={() => setActiveCategory(cat.value)}
              className="shrink-0"
            >
              {cat.label}
              {activeCategory === cat.value && templates.length > 0 && (
                <Badge variant="secondary" className="ml-1.5 px-1.5 py-0 text-xs">{templates.length}</Badge>
              )}
            </Button>
          ))}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>

      {/* Templates Grid */}
      {templatesQuery.isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : templates.length === 0 ? (
        <div className="text-center py-20">
          <LayoutGrid className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-30" />
          <p className="text-muted-foreground mb-2">暂无模板</p>
          <p className="text-sm text-muted-foreground mb-4">您可以初始化预设模板、AI 生成或手动上传</p>
          <div className="flex gap-2 justify-center">
            <Button variant="outline" onClick={handleInitTemplates}>初始化预设</Button>
            <Button variant="outline" onClick={() => setAiGenDialogOpen(true)}>
              <Wand2 className="w-4 h-4 mr-2" />AI 生成
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {templates.map((template) => {
            const imgUrl = template.thumbnailUrl ?? template.sceneImageUrl;
            return (
              <Card key={template.id} className="group overflow-hidden hover:shadow-md transition-all">
                <div
                  className="aspect-video bg-muted relative overflow-hidden cursor-pointer"
                  onClick={() => { setPreviewUrl(imgUrl); setPreviewTitle(template.name); }}
                >
                  <img
                    src={imgUrl}
                    alt={template.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  {/* Badges */}
                  <div className="absolute top-2 right-2">
                    <Badge variant="secondary" className="text-xs bg-black/60 text-white border-0">
                      {CATEGORY_LABELS[template.category as TemplateCategory] ?? template.category}
                    </Badge>
                  </div>
                  {template.isPreset === 0 && (
                    <div className="absolute top-2 left-2">
                      <Badge className="text-xs bg-primary/80 text-primary-foreground border-0">自定义</Badge>
                    </div>
                  )}
                  {/* Hover action overlay */}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/50 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                    <button title="预览" onClick={() => { setPreviewUrl(imgUrl); setPreviewTitle(template.name); }}
                      className="flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-lg bg-black/50 hover:bg-black/70 text-white text-[10px] font-medium">
                      <Maximize2 className="w-3.5 h-3.5" />预览
                    </button>
                    <button title="另存为" onClick={(e) => { e.stopPropagation(); downloadImageWithPicker(imgUrl, template.name || `template-${template.id}`).catch(() => toast.error("下载失败")); }}
                      className="flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-lg bg-black/50 hover:bg-black/70 text-white text-[10px] font-medium">
                      <Download className="w-3.5 h-3.5" />另存为
                    </button>
                    <button title="删除" onClick={(e) => { e.stopPropagation(); handleDelete(template.id, template.name); }}
                      className="flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-lg bg-red-500/80 hover:bg-red-500 text-white text-[10px] font-medium">
                      <Trash2 className="w-3.5 h-3.5" />删除
                    </button>
                  </div>
                </div>
                <CardContent className="p-3">
                  <div className="flex items-start justify-between gap-1">
                    <div className="min-w-0">
                      <h3 className="font-medium text-foreground text-sm">{template.name}</h3>
                      {template.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{template.description}</p>
                      )}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="另存为"
                        onClick={() => downloadImageWithPicker(imgUrl, template.name || `template-${template.id}`).catch(() => toast.error("下载失败"))}>
                        <Download className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" title="删除"
                        onClick={() => handleDelete(template.id, template.name)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Full-screen preview lightbox */}
      {previewUrl && (
        <div className="fixed inset-0 z-50 bg-black/90 flex flex-col" onClick={() => setPreviewUrl(null)}>
          <div className="flex items-center justify-between px-4 py-3 shrink-0" onClick={(e) => e.stopPropagation()}>
            <span className="text-white font-medium text-sm">{previewTitle}</span>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary"
                onClick={() => downloadImageWithPicker(previewUrl, previewTitle || "template").catch(() => toast.error("下载失败"))}>
                <Download className="w-4 h-4 mr-1" />另存为…
              </Button>
              <Button size="icon" variant="ghost" className="text-white hover:text-white hover:bg-white/20" onClick={() => setPreviewUrl(null)}>
                <X className="w-5 h-5" />
              </Button>
            </div>
          </div>
          <div className="flex-1 flex items-center justify-center p-4" onClick={(e) => e.stopPropagation()}>
            <img src={previewUrl} alt="预览" className="max-w-full max-h-full object-contain rounded-lg shadow-2xl" style={{ maxHeight: "calc(100vh - 80px)" }} />
          </div>
        </div>
      )}
    </div>
  );
}
