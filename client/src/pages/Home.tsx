import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Sparkles, Layers2, Images, Video, ArrowRight,
  ImagePlus, TrendingUp, Clock, CheckCircle2, Loader2,
  Library, Plus,
} from "lucide-react";

export default function Home() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  const patternList = trpc.pattern.list.useQuery({ limit: 8 });
  const mockupList = trpc.mockup.list.useQuery({ limit: 8 });
  const taskList = trpc.task.list.useQuery();
  const videoList = trpc.video.list.useQuery();

  const totalPatterns = patternList.data?.length ?? 0;
  const totalMockups = mockupList.data?.length ?? 0;
  const totalVideos = videoList.data?.length ?? 0;
  const pendingTasks = taskList.data?.filter((t) => t.status === "running" || t.status === "pending").length ?? 0;

  const recentPatterns = patternList.data?.slice(0, 4) ?? [];
  const recentMockups = mockupList.data?.slice(0, 4) ?? [];

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "早上好" : hour < 18 ? "下午好" : "晚上好";

  const quickActions = [
    {
      icon: Sparkles,
      title: "AI 图案生成",
      desc: "输入描述或上传参考素材，一键生成高品质图案",
      path: "/generate",
      color: "bg-violet-500",
      badge: "核心功能",
    },
    {
      icon: Library,
      title: "场景图库",
      desc: "浏览产品场景模板，支持按品类筛选",
      path: "/templates",
      color: "bg-blue-500",
    },
    {
      icon: Layers2,
      title: "效果图合成",
      desc: "将图案贴合到产品场景，生成专业效果图",
      path: "/composite",
      color: "bg-emerald-500",
      badge: "推荐",
    },
    {
      icon: Video,
      title: "视频合成工作台",
      desc: "基于效果图快速生成产品展示视频",
      path: "/videos",
      color: "bg-orange-500",
    },
  ];

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {greeting}，{user?.name ?? "用户"} 👋
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            欢迎回到 DecorAI 设计平台，今天想创作什么？
          </p>
        </div>
        <Button onClick={() => setLocation("/generate")} className="gap-2 shadow-sm">
          <Plus className="w-4 h-4" />
          开始创作
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { icon: Sparkles, label: "已生成图案", value: totalPatterns, color: "text-violet-500", bg: "bg-violet-50" },
          { icon: Images, label: "效果图合成", value: totalMockups, color: "text-blue-500", bg: "bg-blue-50" },
          { icon: Video, label: "产品视频", value: totalVideos, color: "text-orange-500", bg: "bg-orange-50" },
          { icon: pendingTasks > 0 ? Loader2 : CheckCircle2, label: "进行中任务", value: pendingTasks, color: pendingTasks > 0 ? "text-amber-500" : "text-emerald-500", bg: pendingTasks > 0 ? "bg-amber-50" : "bg-emerald-50" },
        ].map((stat) => (
          <Card key={stat.label} className="border-0 shadow-sm">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl ${stat.bg} flex items-center justify-center shrink-0`}>
                <stat.icon className={`w-5 h-5 ${stat.color} ${stat.label === "进行中任务" && pendingTasks > 0 ? "animate-spin" : ""}`} />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{stat.value}</p>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">快捷入口</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {quickActions.map((action) => (
            <Card
              key={action.path}
              className="group cursor-pointer border-0 shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5"
              onClick={() => setLocation(action.path)}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className={`w-10 h-10 rounded-xl ${action.color} flex items-center justify-center`}>
                    <action.icon className="w-5 h-5 text-white" />
                  </div>
                  {action.badge && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{action.badge}</Badge>
                  )}
                </div>
                <h3 className="font-semibold text-foreground text-sm">{action.title}</h3>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{action.desc}</p>
                <div className="flex items-center gap-1 mt-3 text-xs text-primary font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                  进入 <ArrowRight className="w-3 h-3" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Recent Work */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Patterns */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-violet-500" />
              最近生成的图案
            </CardTitle>
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-muted-foreground" onClick={() => setLocation("/generate")}>
              查看全部 <ArrowRight className="w-3 h-3" />
            </Button>
          </CardHeader>
          <CardContent className="pt-0">
            {patternList.isPending ? (
              <div className="grid grid-cols-4 gap-2">
                {[...Array(4)].map((_, i) => <div key={i} className="aspect-square rounded-lg bg-muted animate-pulse" />)}
              </div>
            ) : recentPatterns.length > 0 ? (
              <div className="grid grid-cols-4 gap-2">
                {recentPatterns.map((p) => (
                  <div key={p.id} className="aspect-square rounded-lg overflow-hidden bg-muted group relative cursor-pointer" onClick={() => setLocation("/generate")}>
                    <img src={p.imageUrl} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Sparkles className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">还没有生成过图案</p>
                <Button size="sm" variant="outline" className="mt-3 h-8 text-xs" onClick={() => setLocation("/generate")}>
                  去生成
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Mockups */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Layers2 className="w-4 h-4 text-emerald-500" />
              最近效果图
            </CardTitle>
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-muted-foreground" onClick={() => setLocation("/mockups")}>
              查看全部 <ArrowRight className="w-3 h-3" />
            </Button>
          </CardHeader>
          <CardContent className="pt-0">
            {mockupList.isPending ? (
              <div className="grid grid-cols-4 gap-2">
                {[...Array(4)].map((_, i) => <div key={i} className="aspect-square rounded-lg bg-muted animate-pulse" />)}
              </div>
            ) : recentMockups.length > 0 ? (
              <div className="grid grid-cols-4 gap-2">
                {recentMockups.map((m) => (
                  <div key={m.id} className="aspect-square rounded-lg overflow-hidden bg-muted group relative cursor-pointer" onClick={() => setLocation("/mockups")}>
                    <img src={m.imageUrl} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Layers2 className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">还没有合成过效果图</p>
                <Button size="sm" variant="outline" className="mt-3 h-8 text-xs" onClick={() => setLocation("/composite")}>
                  去合成
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Activity */}
      {(taskList.data?.length ?? 0) > 0 && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-blue-500" />
              近期批量任务
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-2">
            {taskList.data?.slice(0, 5).map((task) => (
              <div key={task.id} className="flex items-center justify-between py-2 border-b last:border-0">
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${
                    task.status === "completed" ? "bg-emerald-500" :
                    task.status === "running" ? "bg-amber-500 animate-pulse" :
                    task.status === "failed" ? "bg-red-500" : "bg-slate-300"
                  }`} />
                  <div>
                    <p className="text-sm font-medium truncate max-w-[300px]">{task.prompt}</p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(task.createdAt).toLocaleDateString("zh-CN")}
                    </p>
                  </div>
                </div>
                <Badge variant={task.status === "completed" ? "default" : task.status === "running" ? "secondary" : "destructive"} className="text-xs">
                  {task.status === "completed" ? `完成 ${task.completedCount}张` :
                   task.status === "running" ? "生成中" :
                   task.status === "failed" ? "失败" : "等待中"}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
