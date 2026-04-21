import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { downloadImageWithPicker } from "@/lib/download";
import { CATEGORY_LABELS, type TemplateCategory } from "@shared/types";
import {
  History as HistoryIcon, Loader2, Download, Clock, CheckCircle2,
  XCircle, Sparkles, ImagePlus, Hash, RefreshCw, Maximize2, Trash2, X,
} from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";

export default function History() {
  useAuth({ redirectOnUnauthenticated: true });
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const [activeTab, setActiveTab] = useState("patterns");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState("");
  const [previewFilename, setPreviewFilename] = useState("image");

  const patternsQuery = trpc.pattern.list.useQuery();
  const tasksQuery = trpc.task.list.useQuery();
  const mockupsQuery = trpc.mockup.list.useQuery();

  const patterns = patternsQuery.data ?? [];
  const tasks = tasksQuery.data ?? [];
  const mockups = mockupsQuery.data ?? [];

  const deletePattern = trpc.pattern.delete.useMutation({
    onSuccess: () => { toast.success("图案已删除"); utils.pattern.list.invalidate(); },
    onError: (e) => toast.error(`删除失败: ${e.message}`),
  });

  const deleteMockup = trpc.mockup.delete.useMutation({
    onSuccess: () => { toast.success("效果图已删除"); utils.mockup.list.invalidate(); },
    onError: (e) => toast.error(`删除失败: ${e.message}`),
  });

  const invalidatePatternsAfterRecover = async () => {
    toast.success("已修复卡住的生成记录");
    await utils.pattern.list.invalidate();
  };

  const recoverPatternMutation = trpc.pattern.recoverStuck.useMutation({
    onSuccess: invalidatePatternsAfterRecover,
  });

  const recoverSystemMutation = trpc.system.repairStuckPatterns.useMutation({
    onSuccess: invalidatePatternsAfterRecover,
  });

  const isRecovering =
    recoverPatternMutation.isPending || recoverSystemMutation.isPending;

  const handleRecoverStuck = async () => {
    try {
      await recoverPatternMutation.mutateAsync();
    } catch (e: unknown) {
      const msg =
        e && typeof e === "object" && "message" in e
          ? String((e as { message: unknown }).message)
          : "";
      if (msg.includes("No procedure found") || msg.includes("procedure found")) {
        try {
          await recoverSystemMutation.mutateAsync();
        } catch {
          toast.error(
            "服务端未包含修复接口，请执行 pnpm build 并重启后再试；或直接刷新本页（超过约 90 秒仍无图的「生成中」会自动标为失败）。",
          );
          await patternsQuery.refetch();
        }
      } else {
        toast.error(msg || "修复失败");
      }
    }
  };

  const openPreview = (url: string, title: string, filename: string) => {
    setPreviewUrl(url);
    setPreviewTitle(title);
    setPreviewFilename(filename);
  };

  const handleDownload = async (url: string, filename: string) => {
    try {
      await downloadImageWithPicker(url, filename);
    } catch {
      toast.error("下载失败，请重试");
    }
  };

  const statusBadge = (status: string) => {
    const map: Record<string, { cls: string; icon: React.ReactNode; label: string }> = {
      completed: { cls: "text-green-600 border-green-200 bg-green-50", icon: <CheckCircle2 className="w-3 h-3 mr-1" />, label: "已完成" },
      running: { cls: "text-blue-600 border-blue-200 bg-blue-50", icon: <Loader2 className="w-3 h-3 mr-1 animate-spin" />, label: "进行中" },
      failed: { cls: "text-red-600 border-red-200 bg-red-50", icon: <XCircle className="w-3 h-3 mr-1" />, label: "失败" },
      pending: { cls: "text-yellow-600 border-yellow-200 bg-yellow-50", icon: <Clock className="w-3 h-3 mr-1" />, label: "等待中" },
      generating: { cls: "text-blue-600 border-blue-200 bg-blue-50", icon: <Loader2 className="w-3 h-3 mr-1 animate-spin" />, label: "生成中" },
    };
    const s = map[status] || { cls: "", icon: null, label: status };
    return <Badge variant="outline" className={s.cls}>{s.icon}{s.label}</Badge>;
  };

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">历史记录</h1>
          <p className="text-sm text-muted-foreground">鼠标悬停图片可预览、另存为或删除</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void handleRecoverStuck()}
            disabled={isRecovering}
            title="将「生成中」且无图的记录标为失败，便于删除或重新生成"
          >
            {isRecovering ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : null}
            修复卡住
          </Button>
          <Button variant="outline" size="sm" onClick={() => { patternsQuery.refetch(); tasksQuery.refetch(); mockupsQuery.refetch(); }}>
            <RefreshCw className="w-4 h-4 mr-1.5" />刷新
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="patterns"><Sparkles className="w-3.5 h-3.5 mr-1.5" />图案 ({patterns.length})</TabsTrigger>
          <TabsTrigger value="mockups"><ImagePlus className="w-3.5 h-3.5 mr-1.5" />效果图 ({mockups.length})</TabsTrigger>
          <TabsTrigger value="tasks"><HistoryIcon className="w-3.5 h-3.5 mr-1.5" />批量任务 ({tasks.length})</TabsTrigger>
        </TabsList>

        {/* Patterns Tab */}
        <TabsContent value="patterns" className="mt-4">
          {patternsQuery.isLoading ? <LoadingSpinner /> : patterns.length === 0 ? (
            <EmptyState icon={Sparkles} title="暂无图案记录" desc="前往 AI 图案生成页面创建您的第一个设计" action={() => setLocation("/generate")} actionLabel="开始生成" />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {patterns.map((pattern) => (
                <div key={pattern.id} className="group relative rounded-xl overflow-hidden border bg-card hover:shadow-md transition-all">
                  {/* Image */}
                  <div
                    className="aspect-square bg-muted cursor-pointer relative overflow-hidden"
                    onClick={() => pattern.imageUrl && openPreview(pattern.imageUrl, `图案 ${pattern.productCode || `#${pattern.id}`}`, pattern.productCode || `pattern-${pattern.id}`)}
                  >
                    {pattern.imageUrl ? (
                      <img src={pattern.imageUrl} alt={`图案 ${pattern.id}`} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                    ) : pattern.status === "failed" ? (
                      <div className="w-full h-full flex flex-col items-center justify-center gap-1.5 px-2 text-center">
                        <XCircle className="w-8 h-8 text-destructive" />
                        <span className="text-[11px] text-muted-foreground leading-tight">生成失败，可删除后重试</span>
                      </div>
                    ) : (() => {
                      const staleMs = Date.now() - new Date(pattern.createdAt).getTime();
                      const stale = staleMs > 2 * 60 * 1000;
                      return (
                        <div className="w-full h-full flex flex-col items-center justify-center gap-1.5 px-2 text-center">
                          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                          {stale && (
                            <span className="text-[10px] text-amber-600 leading-tight">
                              长时间无结果？点右上角「修复卡住」或刷新
                            </span>
                          )}
                        </div>
                      );
                    })()}
                    {/* Hover overlay */}
                    {pattern.imageUrl && (
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/50 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                        <HoverBtn icon={<Maximize2 className="w-3.5 h-3.5" />} label="预览"
                          onClick={() => openPreview(pattern.imageUrl, `图案 ${pattern.productCode || `#${pattern.id}`}`, pattern.productCode || `pattern-${pattern.id}`)} />
                        <HoverBtn icon={<Download className="w-3.5 h-3.5" />} label="另存为"
                          onClick={(e) => { e.stopPropagation(); handleDownload(pattern.imageUrl, pattern.productCode || `pattern-${pattern.id}`); }} />
                        <HoverBtn icon={deletePattern.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />} label="删除" danger
                          onClick={(e) => { e.stopPropagation(); deletePattern.mutate({ id: pattern.id }); }} />
                      </div>
                    )}
                    {!pattern.imageUrl && pattern.status === "failed" && (
                      <div className="absolute bottom-1 right-1 z-10">
                        <Button
                          size="sm"
                          variant="secondary"
                          className="h-7 text-xs shadow-sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            deletePattern.mutate({ id: pattern.id });
                          }}
                          disabled={deletePattern.isPending}
                        >
                          {deletePattern.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                          <span className="ml-1">删除</span>
                        </Button>
                      </div>
                    )}
                  </div>
                  {/* Footer info */}
                  <div className="p-2 space-y-1">
                    {pattern.productCode && (
                      <div className="flex items-center gap-1">
                        <Hash className="w-3 h-3 text-primary" />
                        <span className="text-xs font-mono font-medium text-foreground truncate">{pattern.productCode}</span>
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground truncate">{pattern.prompt}</p>
                    <div className="flex items-center justify-between gap-1 flex-wrap">
                      {statusBadge(pattern.status)}
                      {pattern.targetCategory && (
                        <Badge variant="secondary" className="text-xs px-1.5 py-0">
                          {CATEGORY_LABELS[pattern.targetCategory as TemplateCategory] ?? pattern.targetCategory}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">{new Date(pattern.createdAt).toLocaleString("zh-CN")}</p>
                    {/* Bottom action row */}
                    {pattern.imageUrl && (
                      <div className="flex gap-1 pt-1 border-t">
                        <Button size="sm" variant="ghost" className="h-6 flex-1 text-xs gap-1"
                          onClick={() => openPreview(pattern.imageUrl, `图案 ${pattern.productCode || `#${pattern.id}`}`, pattern.productCode || `pattern-${pattern.id}`)}>
                          <Maximize2 className="w-3 h-3" />预览
                        </Button>
                        <Button size="sm" variant="ghost" className="h-6 flex-1 text-xs gap-1"
                          onClick={() => handleDownload(pattern.imageUrl, pattern.productCode || `pattern-${pattern.id}`)}>
                          <Download className="w-3 h-3" />另存为
                        </Button>
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                          onClick={() => deletePattern.mutate({ id: pattern.id })} disabled={deletePattern.isPending}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Mockups Tab */}
        <TabsContent value="mockups" className="mt-4">
          {mockupsQuery.isLoading ? <LoadingSpinner /> : mockups.length === 0 ? (
            <EmptyState icon={ImagePlus} title="暂无效果图" desc="在图案生成页面选择图案和模板来生成效果图" action={() => setLocation("/generate")} actionLabel="开始生成" />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {mockups.map((mockup) => (
                <Card key={mockup.id} className="group overflow-hidden hover:shadow-md transition-all">
                  <div
                    className="aspect-video bg-muted cursor-pointer relative overflow-hidden"
                    onClick={() => openPreview(mockup.imageUrl, `效果图 ${mockup.productCode || `#${mockup.id}`}`, mockup.productCode || `mockup-${mockup.id}`)}
                  >
                    <img src={mockup.imageUrl} alt={`效果图 ${mockup.id}`} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/50 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                      <HoverBtn icon={<Maximize2 className="w-3.5 h-3.5" />} label="预览"
                        onClick={() => openPreview(mockup.imageUrl, `效果图 ${mockup.productCode || `#${mockup.id}`}`, mockup.productCode || `mockup-${mockup.id}`)} />
                      <HoverBtn icon={<Download className="w-3.5 h-3.5" />} label="另存为"
                        onClick={(e) => { e.stopPropagation(); handleDownload(mockup.imageUrl, mockup.productCode || `mockup-${mockup.id}`); }} />
                      <HoverBtn icon={deleteMockup.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />} label="删除" danger
                        onClick={(e) => { e.stopPropagation(); deleteMockup.mutate({ id: mockup.id }); }} />
                    </div>
                  </div>
                  <CardContent className="p-3">
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        {mockup.productCode && (
                          <div className="flex items-center gap-1 mb-0.5">
                            <Hash className="w-3 h-3 text-primary" />
                            <span className="text-xs font-mono font-medium text-foreground">{mockup.productCode}</span>
                          </div>
                        )}
                        <p className="text-xs text-muted-foreground">图案 #{mockup.patternId} · 模板 #{mockup.templateId}</p>
                        <p className="text-xs text-muted-foreground">{new Date(mockup.createdAt).toLocaleString("zh-CN")}</p>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="另存为…"
                          onClick={() => handleDownload(mockup.imageUrl, mockup.productCode || `mockup-${mockup.id}`)}>
                          <Download className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" title="删除"
                          onClick={() => deleteMockup.mutate({ id: mockup.id })} disabled={deleteMockup.isPending}>
                          {deleteMockup.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Tasks Tab */}
        <TabsContent value="tasks" className="mt-4">
          {tasksQuery.isLoading ? <LoadingSpinner /> : tasks.length === 0 ? (
            <EmptyState icon={HistoryIcon} title="暂无批量任务" desc="在图案生成页面设置数量大于1即可创建批量任务" action={() => setLocation("/generate")} actionLabel="开始批量生成" />
          ) : (
            <div className="space-y-3">
              {tasks.map((task) => (
                <Card key={task.id} className="hover:shadow-sm transition-all">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          {statusBadge(task.status)}
                          {task.style && <Badge variant="secondary" className="text-xs">{task.style}</Badge>}
                          {task.targetCategory && (
                            <Badge variant="outline" className="text-xs">
                              {CATEGORY_LABELS[task.targetCategory as TemplateCategory] ?? task.targetCategory}
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-foreground font-medium truncate">{task.prompt}</p>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                          <span>目标: {task.targetCount} 张</span>
                          <span>完成: {task.completedCount} 张</span>
                          {task.failedCount > 0 && <span className="text-red-500">失败: {task.failedCount} 张</span>}
                          <span>{new Date(task.createdAt).toLocaleString("zh-CN")}</span>
                        </div>
                        <div className="w-full bg-muted rounded-full h-1.5">
                          <div
                            className="bg-primary h-1.5 rounded-full transition-all"
                            style={{ width: `${Math.round(((task.completedCount + task.failedCount) / task.targetCount) * 100)}%` }}
                          />
                        </div>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => { tasksQuery.refetch(); patternsQuery.refetch(); }}>
                        <RefreshCw className="w-4 h-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
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
              <Button size="sm" variant="secondary" onClick={() => handleDownload(previewUrl, previewFilename)}>
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

// ---- Hover button for image overlay ----
function HoverBtn({ icon, label, danger, onClick }: {
  icon: React.ReactNode; label: string; danger?: boolean; onClick: (e: React.MouseEvent) => void;
}) {
  return (
    <button title={label} onClick={onClick}
      className={`flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-lg text-white text-[10px] font-medium transition-colors ${danger ? "bg-red-500/80 hover:bg-red-500" : "bg-black/50 hover:bg-black/70"}`}>
      {icon}{label}
    </button>
  );
}

function LoadingSpinner() {
  return <div className="flex items-center justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
}

function EmptyState({ icon: Icon, title, desc, action, actionLabel }: { icon: any; title: string; desc: string; action: () => void; actionLabel: string }) {
  return (
    <div className="text-center py-16">
      <Icon className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-30" />
      <p className="text-muted-foreground font-medium mb-1">{title}</p>
      <p className="text-sm text-muted-foreground mb-4">{desc}</p>
      <Button variant="outline" onClick={action}>{actionLabel}</Button>
    </div>
  );
}
