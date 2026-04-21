import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { Heart, Sparkles, Layers2, Download, X, Maximize2, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { downloadImageAs1200px } from "@/lib/download";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { getQueryKey } from "@trpc/react-query";

export default function Favorites() {
  useAuth({ redirectOnUnauthenticated: true });
  const [, setLocation] = useLocation();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("all");
  const queryClient = useQueryClient();

  const { data: favorites = [], isLoading } = trpc.favorite.list.useQuery();

  const toggleMutation = trpc.favorite.toggle.useMutation({
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: getQueryKey(trpc.favorite.list) });
      toast.success(result.action === "added" ? "已收藏" : "已取消收藏");
    },
    onError: () => toast.error("操作失败，请重试"),
  });

  const patternFavs = favorites.filter((f) => f.itemType === "pattern");
  const mockupFavs = favorites.filter((f) => f.itemType === "mockup");

  const displayed =
    activeTab === "all" ? favorites :
    activeTab === "patterns" ? patternFavs : mockupFavs;

  return (
    <div className="space-y-5 max-w-5xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
          <Heart className="w-5 h-5 text-rose-500" />
          我的收藏
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          收藏的图案和效果图，在图案/效果图页面点击爱心即可收藏
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="h-8">
          <TabsTrigger value="all" className="text-xs h-7">全部 ({favorites.length})</TabsTrigger>
          <TabsTrigger value="patterns" className="text-xs h-7">图案 ({patternFavs.length})</TabsTrigger>
          <TabsTrigger value="mockups" className="text-xs h-7">效果图 ({mockupFavs.length})</TabsTrigger>
        </TabsList>
      </Tabs>

      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin mr-2" />
          <span className="text-sm">加载中...</span>
        </div>
      ) : displayed.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground border-2 border-dashed rounded-xl">
          <Heart className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">
            {activeTab === "all" ? "还没有收藏任何内容" :
             activeTab === "patterns" ? "还没有收藏图案" : "还没有收藏效果图"}
          </p>
          <p className="text-xs mt-1 text-muted-foreground/70">
            在图案生成或效果图预览页面，点击 ♥ 即可收藏
          </p>
          <div className="flex items-center justify-center gap-3 mt-4">
            <Button size="sm" variant="outline" className="text-xs gap-1" onClick={() => setLocation("/generate")}>
              <Sparkles className="w-3 h-3" /> 去生成图案
            </Button>
            <Button size="sm" variant="outline" className="text-xs gap-1" onClick={() => setLocation("/mockups")}>
              <Layers2 className="w-3 h-3" /> 去效果图
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {displayed.map((item) => (
            <Card key={`${item.itemType}-${item.itemId}`} className="overflow-hidden border-0 shadow-sm group">
              <div className="relative aspect-square bg-muted">
                <img src={item.imageUrl} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                  <Button size="icon" variant="secondary" className="h-7 w-7" onClick={() => setPreviewUrl(item.imageUrl)}>
                    <Maximize2 className="w-3 h-3" />
                  </Button>
                  <Button
                    size="icon"
                    variant="secondary"
                    className="h-7 w-7"
                    onClick={() =>
                      downloadImageAs1200px(item.imageUrl, `${item.itemType}-${item.itemId}.png`)
                        .then(() => toast.success("已下载"))
                    }
                  >
                    <Download className="w-3 h-3" />
                  </Button>
                  <Button
                    size="icon"
                    variant="secondary"
                    className="h-7 w-7"
                    disabled={toggleMutation.isPending}
                    onClick={() =>
                      toggleMutation.mutate({
                        itemType: item.itemType as "pattern" | "mockup",
                        itemId: item.itemId,
                        imageUrl: item.imageUrl,
                        label: item.label ?? undefined,
                      })
                    }
                  >
                    <X className="w-3 h-3" />
                  </Button>
                </div>
                <div className="absolute top-2 left-2">
                  <Badge variant="secondary" className="text-[9px] px-1.5 py-0 h-4">
                    {item.itemType === "pattern" ? "图案" : "效果图"}
                  </Badge>
                </div>
              </div>
              {item.label && (
                <CardContent className="p-2">
                  <p className="text-[10px] text-muted-foreground truncate">{item.label}</p>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Lightbox */}
      {previewUrl && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={() => setPreviewUrl(null)}>
          <img src={previewUrl} alt="" className="max-w-full max-h-full rounded-xl shadow-2xl" onClick={(e) => e.stopPropagation()} />
          <button className="absolute top-4 right-4 w-8 h-8 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white" onClick={() => setPreviewUrl(null)}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Hook for toggling DB-backed favorites from any page.
 * Invalidates the favorite.list query on change.
 */
export function useFavoriteToggle() {
  const queryClient = useQueryClient();
  const mutation = trpc.favorite.toggle.useMutation({
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getQueryKey(trpc.favorite.list) });
    },
  });

  const toggle = (item: {
    itemType: "pattern" | "mockup";
    itemId: number;
    imageUrl: string;
    label?: string;
  }) => {
    mutation.mutate(item, {
      onSuccess: (result) => {
        toast.success(result.action === "added" ? "已收藏" : "已取消收藏");
      },
      onError: () => toast.error("收藏操作失败"),
    });
  };

  return { toggle, isPending: mutation.isPending };
}
