import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { downloadImageWithPicker, batchDownloadAs1200px } from "@/lib/download";
import { CATEGORY_LABELS, type TemplateCategory } from "@shared/types";
import {
  ImagePlus, Download, Loader2, Sparkles, Grid3X3, Layers2,
  Hash, X, Maximize2, Trash2,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

export default function Mockups() {
  useAuth({ redirectOnUnauthenticated: true });
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();

  const mockupsQuery = trpc.mockup.list.useQuery();
  const patternsQuery = trpc.pattern.list.useQuery();
  const mockups = mockupsQuery.data ?? [];
  const patterns = patternsQuery.data ?? [];

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState("");
  const [previewFilename, setPreviewFilename] = useState("image");
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<{ done: number; total: number } | null>(null);
  const [activeTab, setActiveTab] = useState("mockups");

  const deleteMockup = trpc.mockup.delete.useMutation({
    onSuccess: () => { toast.success("已删除"); utils.mockup.list.invalidate(); },
    onError: (e) => toast.error(`删除失败: ${e.message}`),
  });

  const deletePattern = trpc.pattern.delete.useMutation({
    onSuccess: () => { toast.success("已删除"); utils.pattern.list.invalidate(); },
    onError: (e) => toast.error(`删除失败: ${e.message}`),
  });

  const patternsWithTiles = patterns.filter((p) => p.tileImageUrl);

  const openPreview = (url: string, title: string, filename: string) => {
    setPreviewUrl(url);
    setPreviewTitle(title);
    setPreviewFilename(filename);
  };

  const handleSingleDownload = async (url: string, filename: string) => {
    try {
      await downloadImageWithPicker(url, filename);
    } catch {
      toast.error("下载失败，请重试");
    }
  };

  const handleBatchDownload = async (items: { url: string; filename: string }[]) => {
    if (items.length === 0) return;
    setDownloading(true);
    setDownloadProgress({ done: 0, total: items.length });
    try {
      await batchDownloadAs1200px(items, (done, total) => setDownloadProgress({ done, total }));
      toast.success(`已下载 ${items.length} 张图片`);
    } catch {
      toast.error("批量下载失败，请重试");
    } finally {
      setDownloading(false);
      setDownloadProgress(null);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">效果图预览</h1>
          <p className="text-muted-foreground text-sm">鼠标悬停图片可预览、下载或删除</p>
        </div>
        <Button onClick={() => setLocation("/generate")} className="shrink-0">
          <Sparkles className="w-4 h-4 mr-2" />生成新效果图
        </Button>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <TabsList>
            <TabsTrigger value="mockups" className="flex items-center gap-1.5">
              <Layers2 className="w-3.5 h-3.5" />场景效果图
              {mockups.length > 0 && <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-xs">{mockups.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="tiles" className="flex items-center gap-1.5">
              <Grid3X3 className="w-3.5 h-3.5" />平铺纹样图
              {patternsWithTiles.length > 0 && <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-xs">{patternsWithTiles.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="patterns" className="flex items-center gap-1.5">
              <ImagePlus className="w-3.5 h-3.5" />原始图案
              {patterns.length > 0 && <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-xs">{patterns.length}</Badge>}
            </TabsTrigger>
          </TabsList>

          <div className="flex gap-2 items-center">
            {downloading && downloadProgress && (
              <span className="text-xs text-muted-foreground">
                下载中 {downloadProgress.done}/{downloadProgress.total}…
              </span>
            )}
            {activeTab === "mockups" && mockups.length > 0 && (
              <Button variant="outline" size="sm" onClick={() => handleBatchDownload(mockups.map((m) => ({ url: m.imageUrl, filename: m.productCode || `mockup-${m.id}` })))} disabled={downloading}>
                {downloading ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Download className="w-4 h-4 mr-1.5" />}
                批量下载 ({mockups.length})
              </Button>
            )}
            {activeTab === "tiles" && patternsWithTiles.length > 0 && (
              <Button variant="outline" size="sm" onClick={() => handleBatchDownload(patternsWithTiles.map((p) => ({ url: p.tileImageUrl!, filename: `tile-${p.productCode || `pattern-${p.id}`}` })))} disabled={downloading}>
                {downloading ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Download className="w-4 h-4 mr-1.5" />}
                批量下载 ({patternsWithTiles.length})
              </Button>
            )}
            {activeTab === "patterns" && patterns.length > 0 && (
              <Button variant="outline" size="sm" onClick={() => handleBatchDownload(patterns.map((p) => ({ url: p.imageUrl, filename: p.productCode || `pattern-${p.id}` })))} disabled={downloading}>
                {downloading ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Download className="w-4 h-4 mr-1.5" />}
                批量下载 ({patterns.length})
              </Button>
            )}
          </div>
        </div>

        {/* Mockups Tab */}
        <TabsContent value="mockups" className="mt-4">
          {mockupsQuery.isLoading ? <LoadingSpinner /> : mockups.length === 0 ? (
            <EmptyState icon={<Layers2 className="w-12 h-12" />} title="暂无效果图" desc="前往 AI 图案生成页面，选择图案和模板生成效果图" onAction={() => setLocation("/generate")} />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {mockups.map((m) => (
                <ImageCard
                  key={m.id}
                  imageUrl={m.imageUrl}
                  title={`效果图 ${m.productCode || `#${m.id}`}`}
                  filename={m.productCode || `mockup-${m.id}`}
                  aspectRatio="video"
                  meta={<>
                    {m.productCode && <div className="flex items-center gap-1 mb-0.5"><Hash className="w-3 h-3 text-primary" /><span className="text-xs font-mono font-medium">{m.productCode}</span></div>}
                    <p className="text-xs text-muted-foreground">图案 #{m.patternId} · 模板 #{m.templateId}</p>
                    <p className="text-xs text-muted-foreground">{new Date(m.createdAt).toLocaleString("zh-CN")}</p>
                  </>}
                  onPreview={openPreview}
                  onDownload={handleSingleDownload}
                  onDelete={() => deleteMockup.mutate({ id: m.id })}
                  deleteLoading={deleteMockup.isPending}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* Tile Patterns Tab */}
        <TabsContent value="tiles" className="mt-4">
          {patternsQuery.isLoading ? <LoadingSpinner /> : patternsWithTiles.length === 0 ? (
            <EmptyState icon={<Grid3X3 className="w-12 h-12" />} title="暂无平铺纹样图" desc="生成图案时会自动创建平铺纹样图" onAction={() => setLocation("/generate")} />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {patternsWithTiles.map((p) => (
                <ImageCard
                  key={p.id}
                  imageUrl={p.tileImageUrl!}
                  title={`平铺图 ${p.productCode || `#${p.id}`}`}
                  filename={`tile-${p.productCode || `pattern-${p.id}`}`}
                  aspectRatio="square"
                  meta={<>
                    {p.productCode && <div className="flex items-center gap-1 mb-0.5"><Hash className="w-3 h-3 text-primary" /><span className="text-xs font-mono font-medium">{p.productCode}</span></div>}
                    {p.targetCategory && <Badge variant="secondary" className="text-xs mt-0.5">{CATEGORY_LABELS[p.targetCategory as TemplateCategory] ?? p.targetCategory}</Badge>}
                  </>}
                  onPreview={openPreview}
                  onDownload={handleSingleDownload}
                  onDelete={() => deletePattern.mutate({ id: p.id })}
                  deleteLoading={deletePattern.isPending}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* Original Patterns Tab */}
        <TabsContent value="patterns" className="mt-4">
          {patternsQuery.isLoading ? <LoadingSpinner /> : patterns.length === 0 ? (
            <EmptyState icon={<ImagePlus className="w-12 h-12" />} title="暂无图案" desc="前往 AI 图案生成页面创建新图案" onAction={() => setLocation("/generate")} />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {patterns.map((p) => (
                <ImageCard
                  key={p.id}
                  imageUrl={p.imageUrl}
                  title={`图案 ${p.productCode || `#${p.id}`}`}
                  filename={p.productCode || `pattern-${p.id}`}
                  aspectRatio="square"
                  meta={<p className="text-xs text-muted-foreground truncate">{p.prompt}</p>}
                  onPreview={openPreview}
                  onDownload={handleSingleDownload}
                  onDelete={() => deletePattern.mutate({ id: p.id })}
                  deleteLoading={deletePattern.isPending}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Full-screen Preview */}
      {previewUrl && (
        <div className="fixed inset-0 z-50 bg-black/90 flex flex-col" onClick={() => setPreviewUrl(null)}>
          <div className="flex items-center justify-between px-4 py-3 shrink-0" onClick={(e) => e.stopPropagation()}>
            <span className="text-white font-medium text-sm">{previewTitle}</span>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="secondary" onClick={() => handleSingleDownload(previewUrl, previewFilename)}>
                <Download className="w-4 h-4 mr-1" />另存为…
              </Button>
              <Button size="icon" variant="ghost" className="text-white hover:text-white hover:bg-white/20" onClick={() => setPreviewUrl(null)}>
                <X className="w-5 h-5" />
              </Button>
            </div>
          </div>
          <div className="flex-1 flex items-center justify-center p-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <img src={previewUrl} alt="预览" className="max-w-full max-h-full object-contain rounded-lg shadow-2xl" style={{ maxHeight: "calc(100vh - 80px)" }} />
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Shared ImageCard ----

function ImageCard({
  imageUrl, title, filename, aspectRatio, meta,
  onPreview, onDownload, onDelete, deleteLoading,
}: {
  imageUrl: string;
  title: string;
  filename: string;
  aspectRatio: "square" | "video";
  meta: React.ReactNode;
  onPreview: (url: string, title: string, filename: string) => void;
  onDownload: (url: string, filename: string) => void;
  onDelete?: () => void;
  deleteLoading?: boolean;
}) {
  return (
    <Card className="group overflow-hidden hover:shadow-md transition-all">
      <div
        className={`${aspectRatio === "square" ? "aspect-square" : "aspect-video"} bg-muted relative overflow-hidden cursor-pointer`}
        onClick={() => onPreview(imageUrl, title, filename)}
      >
        <img src={imageUrl} alt={title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
        {/* Hover overlay with action buttons */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
          <ActionBtn icon={<Maximize2 className="w-3.5 h-3.5" />} label="预览" onClick={() => onPreview(imageUrl, title, filename)} />
          <ActionBtn icon={<Download className="w-3.5 h-3.5" />} label="另存为" onClick={(e) => { e.stopPropagation(); onDownload(imageUrl, filename); }} />
          {onDelete && (
            <ActionBtn
              icon={deleteLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              label="删除"
              danger
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
            />
          )}
        </div>
      </div>
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">{meta}</div>
          <div className="flex gap-1 shrink-0">
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="另存为…" onClick={() => onDownload(imageUrl, filename)}>
              <Download className="w-3.5 h-3.5" />
            </Button>
            {onDelete && (
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" title="删除" onClick={onDelete} disabled={deleteLoading}>
                {deleteLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ActionBtn({ icon, label, danger, onClick }: { icon: React.ReactNode; label: string; danger?: boolean; onClick: (e: React.MouseEvent) => void }) {
  return (
    <button
      title={label}
      onClick={onClick}
      className={`flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-lg text-white text-[10px] font-medium transition-colors ${danger ? "bg-red-500/80 hover:bg-red-500" : "bg-black/50 hover:bg-black/70"}`}
    >
      {icon}
      {label}
    </button>
  );
}

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );
}

function EmptyState({ icon, title, desc, onAction }: { icon: React.ReactNode; title: string; desc: string; onAction: () => void }) {
  return (
    <div className="text-center py-20">
      <div className="mx-auto mb-4 text-muted-foreground opacity-30">{icon}</div>
      <p className="text-muted-foreground mb-2">{title}</p>
      <p className="text-sm text-muted-foreground mb-4">{desc}</p>
      <Button variant="outline" onClick={onAction}><Sparkles className="w-4 h-4 mr-2" />开始生成</Button>
    </div>
  );
}
