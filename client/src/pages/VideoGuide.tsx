import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Video, CheckCircle2, ChevronRight, Lightbulb, Sparkles, Layers2, ArrowRight } from "lucide-react";
import { useLocation } from "wouter";

const steps = [
  {
    step: 1,
    icon: Sparkles,
    title: "生成图案",
    color: "bg-violet-500",
    desc: "在「AI 图案生成」页面，输入描述词或上传参考素材，选择目标品类和产品尺寸，生成高质量设计图案。",
    tips: ["使用参考素材图效果更精准", "批量生成可一次产出多个变体", "生成后可对图案做无缝处理"],
    path: "/generate",
    cta: "去生成图案",
  },
  {
    step: 2,
    icon: Layers2,
    title: "合成效果图",
    color: "bg-emerald-500",
    desc: "在「效果图合成」页面，选择一个图案，再选一个或多个产品场景模板，一键合成专业产品效果图。",
    tips: ["支持同时选多个场景批量合成", "场景图库按品类分类，方便筛选", "合成后可直接下载 1200×1200px 高清图"],
    path: "/composite",
    cta: "去合成效果图",
  },
  {
    step: 3,
    icon: Video,
    title: "生成产品视频",
    color: "bg-orange-500",
    desc: "在「视频合成工作台」，选择已合成好的效果图，选择视频类型（展示/促销/故事），一键生成 15 秒产品视频。",
    tips: ["视频生成约需 1-3 分钟，可后台等待", "生成完成后会自动显示在列表", "支持下载 MP4 格式"],
    path: "/videos",
    cta: "去生成视频",
  },
];

const tips = [
  { icon: "🎨", title: "图案关键词技巧", desc: "在描述词里加上「水彩」「扁平插画」「几何图形」等风格词，生成效果更精准。" },
  { icon: "📐", title: "尺寸选择建议", desc: "亚马逊主图建议 64×64cm，Temu 促销图建议 40×60cm，可按平台选择。" },
  { icon: "🔁", title: "批量提效", desc: "「批量生成」功能可一次性出多个方向，再从中挑选最佳，比单张效率高 5 倍。" },
  { icon: "🎬", title: "视频类型选择", desc: "产品展示类视频适合主图，促销活动类适合广告，故事叙述类适合品牌宣传。" },
];

export default function VideoGuide() {
  useAuth({ redirectOnUnauthenticated: true });
  const [, setLocation] = useLocation();

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
          <Video className="w-5 h-5 text-orange-500" />
          视频制作指南
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          从图案生成到视频导出，掌握完整的创作流程
        </p>
      </div>

      {/* Workflow */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">三步完成视频制作</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {steps.map((s, i) => (
            <Card key={s.step} className="border-0 shadow-sm">
              <CardContent className="p-5 space-y-4">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl ${s.color} flex items-center justify-center text-white font-bold text-sm`}>
                    {s.step}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <s.icon className="w-4 h-4 text-muted-foreground" />
                      <h3 className="font-semibold text-sm">{s.title}</h3>
                    </div>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{s.desc}</p>
                <ul className="space-y-1.5">
                  {s.tips.map((tip, j) => (
                    <li key={j} className="flex items-start gap-2 text-xs text-muted-foreground">
                      <CheckCircle2 className="w-3 h-3 text-emerald-500 mt-0.5 shrink-0" />
                      {tip}
                    </li>
                  ))}
                </ul>
                <Button size="sm" variant="outline" className="w-full text-xs gap-1" onClick={() => setLocation(s.path)}>
                  {s.cta} <ArrowRight className="w-3 h-3" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Tips */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
          <Lightbulb className="w-4 h-4" /> 实用技巧
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {tips.map((tip, i) => (
            <Card key={i} className="border-0 shadow-sm bg-muted/30">
              <CardContent className="p-4 flex gap-3">
                <span className="text-xl">{tip.icon}</span>
                <div>
                  <h4 className="text-sm font-semibold">{tip.title}</h4>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{tip.desc}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* CTA */}
      <Card className="border-0 shadow-sm bg-gradient-to-r from-primary/5 to-orange-500/5">
        <CardContent className="p-6 flex items-center justify-between">
          <div>
            <h3 className="font-semibold">准备好开始创作了吗？</h3>
            <p className="text-sm text-muted-foreground mt-1">从 AI 图案生成开始，5 分钟内完成一条产品视频</p>
          </div>
          <Button onClick={() => setLocation("/generate")} className="gap-2 shrink-0">
            <Sparkles className="w-4 h-4" />
            立即开始
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
