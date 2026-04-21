import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import {
  Video, Download, Loader2, Play, Sparkles, Hash, Clock, AlertCircle,
  CheckCircle2, Upload, ImageIcon, Users, Clapperboard, Sun, Ratio,
  ChevronRight, X,
} from "lucide-react";
import { useState, useRef, useCallback } from "react";
import { toast } from "sonner";

// ──────────────────────────────────────────────────────────────
// Config option definitions
// ──────────────────────────────────────────────────────────────

type Character = "none" | "hand_female" | "model_female" | "model_male" | "couple" | "family";
type Scene = "living_room" | "bedroom" | "kitchen" | "scandinavian" | "japanese" | "luxury" | "studio" | "outdoor";
type Camera = "push_in" | "orbit" | "pan" | "tilt" | "zoom_detail" | "static";
type Lighting = "morning" | "golden" | "natural" | "studio" | "dramatic";
type Ratio = "16:9" | "9:16" | "1:1";
type Duration = 5 | 10 | 20;

const CHARACTER_OPTIONS: { value: Character; label: string; desc: string }[] = [
  { value: "none",         label: "纯产品展示", desc: "无出境人物，聚焦产品本身" },
  { value: "hand_female",  label: "女性手部",   desc: "优雅女手轻触产品表面" },
  { value: "model_female", label: "女性模特",   desc: "时尚女性与产品自然互动" },
  { value: "model_male",   label: "男性模特",   desc: "现代男性居家场景" },
  { value: "couple",       label: "情侣双人",   desc: "温馨情侣居家生活" },
  { value: "family",       label: "家庭场景",   desc: "温暖家庭氛围" },
];

const SCENE_OPTIONS: { value: Scene; label: string; desc: string }[] = [
  { value: "living_room",  label: "客厅",       desc: "现代温馨客厅" },
  { value: "bedroom",      label: "卧室",       desc: "静谧简约卧室" },
  { value: "kitchen",      label: "厨房",       desc: "明亮现代厨房" },
  { value: "scandinavian", label: "北欧简约",   desc: "白墙原木北欧风" },
  { value: "japanese",     label: "日式和风",   desc: "侘寂禅意日式" },
  { value: "luxury",       label: "奢华现代",   desc: "高端大理石空间" },
  { value: "studio",       label: "商业棚拍",   desc: "白色商拍背景" },
  { value: "outdoor",      label: "户外花园",   desc: "绿植户外露台" },
];

const CAMERA_OPTIONS: { value: Camera; label: string; desc: string }[] = [
  { value: "push_in",     label: "缓慢推进",   desc: "向产品缓慢推镜" },
  { value: "orbit",       label: "环绕展示",   desc: "360° 环绕产品" },
  { value: "pan",         label: "横向平移",   desc: "横向扫过空间" },
  { value: "tilt",        label: "上仰镜头",   desc: "从地面向上仰拍" },
  { value: "zoom_detail", label: "纹理特写",   desc: "从全景推近纹理" },
  { value: "static",      label: "固定镜头",   desc: "静态镜头微动效" },
];

const LIGHTING_OPTIONS: { value: Lighting; label: string; desc: string }[] = [
  { value: "morning",  label: "晨光",     desc: "晨曦金白软光" },
  { value: "golden",   label: "黄金时刻", desc: "温暖落日余晖" },
  { value: "natural",  label: "自然光",   desc: "日间散射自然光" },
  { value: "studio",   label: "棚拍光",   desc: "均匀商业棚灯" },
  { value: "dramatic", label: "戏剧光",   desc: "侧逆光强对比" },
];

const RATIO_OPTIONS: { value: Ratio; label: string; sub: string }[] = [
  { value: "16:9", label: "横屏 16:9", sub: "适合电商/电视" },
  { value: "9:16", label: "竖屏 9:16", sub: "适合短视频/手机" },
  { value: "1:1",  label: "方形 1:1",  sub: "适合社交媒体" },
];

const DURATION_OPTIONS: { value: Duration; label: string; note?: string }[] = [
  { value: 5,  label: "5 秒" },
  { value: 10, label: "10 秒" },
  { value: 20, label: "20 秒", note: "两段拼接" },
];

const STATUS_LABELS: Record<string, string> = {
  pending: "等待中",
  generating: "生成中",
  completed: "已完成",
  failed: "生成失败",
};

const STATUS_COLORS: Record<string, string> = {
  pending:    "bg-yellow-100 text-yellow-800",
  generating: "bg-blue-100 text-blue-800",
  completed:  "bg-green-100 text-green-800",
  failed:     "bg-red-100 text-red-800",
};

// ──────────────────────────────────────────────────────────────
// Selector sub-component
// ──────────────────────────────────────────────────────────────

function OptionGrid<T extends string>({
  options, value, onChange, cols = 3,
}: {
  options: { value: T; label: string; desc: string }[];
  value: T;
  onChange: (v: T) => void;
  cols?: 2 | 3 | 4 | 6;
}) {
  const colClass = { 2: "grid-cols-2", 3: "grid-cols-3", 4: "grid-cols-2 sm:grid-cols-4", 6: "grid-cols-3 sm:grid-cols-6" }[cols];
  return (
    <div className={`grid ${colClass} gap-2`}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`rounded-lg border px-3 py-2 text-left transition-all text-sm ${
            value === opt.value
              ? "border-primary bg-primary/10 text-primary font-medium"
              : "border-border bg-background hover:border-primary/40 hover:bg-muted/60"
          }`}
        >
          <div className="font-medium leading-tight">{opt.label}</div>
          <div className="text-xs text-muted-foreground mt-0.5 leading-tight">{opt.desc}</div>
        </button>
      ))}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Main page
// ──────────────────────────────────────────────────────────────

export default function Videos() {
  useAuth({ redirectOnUnauthenticated: true });

  const videosQuery = trpc.video.list.useQuery(undefined, { refetchInterval: 8000 });
  const mockupsQuery = trpc.mockup.list.useQuery();
  const videos = videosQuery.data ?? [];
  const mockups = mockupsQuery.data ?? [];

  const uploadRefMutation = trpc.video.uploadRefImage.useMutation();
  const generateMutation = trpc.video.generate.useMutation({
    onSuccess: (data) => {
      toast.success(`视频任务已提交（${data.productCode}），预计 2~5 分钟完成`);
      videosQuery.refetch();
      setShowForm(false);
      resetForm();
    },
    onError: (err) => toast.error(`提交失败: ${err.message}`),
  });

  const [showForm, setShowForm] = useState(false);

  // Image source
  const [imageTab, setImageTab] = useState<"upload" | "mockup">("upload");
  const [uploadedUrl, setUploadedUrl] = useState("");
  const [uploadPreview, setUploadPreview] = useState("");
  const [selectedMockupUrl, setSelectedMockupUrl] = useState("");
  const [isUploading, setIsUploading] = useState(false);

  // Video configs
  const [character, setCharacter] = useState<Character>("none");
  const [scene, setScene] = useState<Scene>("living_room");
  const [camera, setCamera] = useState<Camera>("push_in");
  const [lighting, setLighting] = useState<Lighting>("natural");
  const [ratio, setRatio] = useState<Ratio>("16:9");
  const [duration, setDuration] = useState<Duration>(10);
  const [customText, setCustomText] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetForm = () => {
    setUploadedUrl("");
    setUploadPreview("");
    setSelectedMockupUrl("");
    setCharacter("none");
    setScene("living_room");
    setCamera("push_in");
    setLighting("natural");
    setRatio("16:9");
    setDuration(10);
    setCustomText("");
    setImageTab("upload");
  };

  const handleFileSelect = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) { toast.error("请上传图片文件"); return; }
    if (file.size > 10 * 1024 * 1024) { toast.error("图片大小不能超过 10MB"); return; }

    const preview = URL.createObjectURL(file);
    setUploadPreview(preview);
    setIsUploading(true);

    try {
      const arrayBuf = await file.arrayBuffer();
      const bytes = new Uint8Array(arrayBuf);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64 = btoa(binary);
      const { url } = await uploadRefMutation.mutateAsync({ imageBase64: base64, mimeType: file.type });
      setUploadedUrl(url);
      toast.success("图片上传成功");
    } catch (err) {
      toast.error("图片上传失败，请重试");
      setUploadPreview("");
    } finally {
      setIsUploading(false);
    }
  }, [uploadRefMutation]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }, [handleFileSelect]);

  const sourceImageUrl = imageTab === "upload" ? uploadedUrl : selectedMockupUrl;

  const handleGenerate = () => {
    if (!sourceImageUrl) {
      toast.error(imageTab === "upload" ? "请先上传效果图" : "请先选择效果图");
      return;
    }
    generateMutation.mutate({
      sourceImageUrl,
      character,
      scene,
      camera,
      lighting,
      ratio,
      duration,
      customText: customText.trim() || undefined,
    });
  };

  const generatingCount = videos.filter((v) => v.status === "generating" || v.status === "pending").length;
  const [previewVideo, setPreviewVideo] = useState<{ clips: string[] } | null>(null);

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">产品视频</h1>
          <p className="text-muted-foreground text-sm">
            上传效果图，配置出境人物和场景，AI 生成 5–20 秒产品短视频（Wan2.1-I2V）
          </p>
        </div>
        <div className="flex gap-2 items-center">
          {generatingCount > 0 && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" />{generatingCount} 个生成中
            </span>
          )}
          <Button onClick={() => { setShowForm(!showForm); if (!showForm) resetForm(); }}>
            <Video className="w-4 h-4 mr-2" />
            {showForm ? "收起" : "生成新视频"}
          </Button>
        </div>
      </div>

      {/* Generation Form */}
      {showForm && (
        <Card className="border-primary/20 bg-primary/[0.02]">
          <CardContent className="p-5 space-y-6">

            {/* Step 1: Image source */}
            <section className="space-y-3">
              <SectionTitle icon={<ImageIcon className="w-4 h-4" />} step="1" title="选择效果图" required />

              <div className="flex gap-2 mb-3">
                {(["upload", "mockup"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setImageTab(tab)}
                    className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-all ${
                      imageTab === tab ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary/40"
                    }`}
                  >
                    {tab === "upload" ? "直接上传图片" : "从效果图库选择"}
                  </button>
                ))}
              </div>

              {imageTab === "upload" ? (
                <div
                  className={`relative border-2 border-dashed rounded-xl transition-all ${uploadPreview ? "border-primary/40 bg-primary/5" : "border-border hover:border-primary/40 hover:bg-muted/40"}`}
                  onDrop={handleDrop}
                  onDragOver={(e) => e.preventDefault()}
                >
                  {uploadPreview ? (
                    <div className="flex items-center gap-4 p-4">
                      <img src={uploadPreview} alt="preview" className="w-24 h-24 object-cover rounded-lg border" />
                      <div className="flex-1 space-y-1">
                        {isUploading ? (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Loader2 className="w-4 h-4 animate-spin" />上传中…
                          </div>
                        ) : uploadedUrl ? (
                          <div className="flex items-center gap-2 text-sm text-green-600">
                            <CheckCircle2 className="w-4 h-4" />图片已上传，可以开始生成
                          </div>
                        ) : (
                          <div className="text-sm text-destructive">上传失败，请重试</div>
                        )}
                        <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground"
                          onClick={() => { setUploadPreview(""); setUploadedUrl(""); }}>
                          <X className="w-3 h-3 mr-1" />重新选择
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div
                      className="flex flex-col items-center justify-center py-10 cursor-pointer"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Upload className="w-8 h-8 text-muted-foreground mb-2" />
                      <p className="text-sm text-muted-foreground">点击或拖拽上传效果图</p>
                      <p className="text-xs text-muted-foreground mt-1">支持 JPG / PNG / WEBP，最大 10MB</p>
                    </div>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); }}
                  />
                </div>
              ) : (
                <div>
                  {mockups.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4">暂无效果图，请先在效果图页面生成</p>
                  ) : (
                    <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-2 max-h-44 overflow-y-auto pr-1">
                      {mockups.map((m) => (
                        <div
                          key={m.id}
                          onClick={() => setSelectedMockupUrl(m.imageUrl)}
                          className={`relative aspect-square rounded-lg overflow-hidden cursor-pointer border-2 transition-all ${selectedMockupUrl === m.imageUrl ? "border-primary shadow-md" : "border-transparent hover:border-primary/40"}`}
                        >
                          <img src={m.imageUrl} alt="" className="w-full h-full object-cover" />
                          {selectedMockupUrl === m.imageUrl && (
                            <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                              <CheckCircle2 className="w-4 h-4 text-primary" />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </section>

            {/* Step 2: Character */}
            <section className="space-y-3">
              <SectionTitle icon={<Users className="w-4 h-4" />} step="2" title="出境人物" />
              <OptionGrid options={CHARACTER_OPTIONS} value={character} onChange={setCharacter} cols={3} />
            </section>

            {/* Step 3: Scene */}
            <section className="space-y-3">
              <SectionTitle icon={<ImageIcon className="w-4 h-4" />} step="3" title="场景风格" />
              <OptionGrid options={SCENE_OPTIONS} value={scene} onChange={setScene} cols={4} />
            </section>

            {/* Step 4: Camera */}
            <section className="space-y-3">
              <SectionTitle icon={<Clapperboard className="w-4 h-4" />} step="4" title="运镜方式" />
              <OptionGrid options={CAMERA_OPTIONS} value={camera} onChange={setCamera} cols={3} />
            </section>

            {/* Step 5: Lighting */}
            <section className="space-y-3">
              <SectionTitle icon={<Sun className="w-4 h-4" />} step="5" title="灯光氛围" />
              <OptionGrid options={LIGHTING_OPTIONS} value={lighting} onChange={setLighting} cols={3} />
            </section>

            {/* Step 6: Ratio + Duration */}
            <section className="space-y-3">
              <SectionTitle icon={<Ratio className="w-4 h-4" />} step="6" title="画面比例 & 时长" />
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">画面比例</Label>
                  <div className="flex gap-2">
                    {RATIO_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setRatio(opt.value)}
                        className={`flex-1 rounded-lg border px-2 py-2 text-center transition-all text-sm ${
                          ratio === opt.value
                            ? "border-primary bg-primary/10 text-primary font-medium"
                            : "border-border hover:border-primary/40 hover:bg-muted/60"
                        }`}
                      >
                        <div className="font-medium text-xs">{opt.label}</div>
                        <div className="text-[10px] text-muted-foreground mt-0.5">{opt.sub}</div>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">视频时长</Label>
                  <div className="flex gap-2">
                    {DURATION_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setDuration(opt.value)}
                        className={`flex-1 rounded-lg border px-2 py-2 text-center transition-all ${
                          duration === opt.value
                            ? "border-primary bg-primary/10 text-primary font-medium"
                            : "border-border hover:border-primary/40 hover:bg-muted/60"
                        }`}
                      >
                        <div className="font-medium text-sm">{opt.label}</div>
                        {opt.note && <div className="text-[10px] text-muted-foreground">{opt.note}</div>}
                      </button>
                    ))}
                  </div>
                  {duration === 20 && (
                    <p className="text-xs text-muted-foreground">
                      20 秒由两段 10 秒视频拼接：第一段出境展示，第二段纹理特写
                    </p>
                  )}
                </div>
              </div>
            </section>

            {/* Optional custom prompt */}
            <section className="space-y-2">
              <Label className="text-xs text-muted-foreground">补充描述（可选）</Label>
              <Textarea
                placeholder="例：产品在轻风中微微晃动，背景有模糊的绿植…"
                value={customText}
                onChange={(e) => setCustomText(e.target.value)}
                rows={2}
                className="resize-none text-sm"
              />
            </section>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button variant="outline" onClick={() => { setShowForm(false); resetForm(); }}>取消</Button>
              <Button
                onClick={handleGenerate}
                disabled={generateMutation.isPending || isUploading || !sourceImageUrl}
              >
                {generateMutation.isPending
                  ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />提交中…</>
                  : <><Sparkles className="w-4 h-4 mr-2" />开始生成视频</>}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Video List */}
      {videosQuery.isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : videos.length === 0 ? (
        <div className="text-center py-20">
          <div className="mx-auto mb-4 text-muted-foreground opacity-30"><Video className="w-12 h-12 mx-auto" /></div>
          <p className="text-muted-foreground mb-2">暂无视频</p>
          <p className="text-sm text-muted-foreground mb-4">上传效果图并点击"生成新视频"开始创作</p>
          <Button variant="outline" onClick={() => setShowForm(true)}><Sparkles className="w-4 h-4 mr-2" />生成第一个视频</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {videos.map((video) => (
            <VideoCard key={video.id} video={video} onPreview={setPreviewVideo} />
          ))}
        </div>
      )}

      {/* Preview Modal */}
      {previewVideo && (
        <VideoPreviewModal
          clips={previewVideo.clips}
          onClose={() => setPreviewVideo(null)}
        />
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Section title helper
// ──────────────────────────────────────────────────────────────

function SectionTitle({ icon, step, title, required }: {
  icon: React.ReactNode; step: string; title: string; required?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs font-bold shrink-0">
        {step}
      </span>
      <span className="text-muted-foreground">{icon}</span>
      <h4 className="font-semibold text-sm text-foreground">{title}</h4>
      {required && <span className="text-destructive text-xs">*</span>}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Video card
// ──────────────────────────────────────────────────────────────

/** Parse thumbnailUrl which may be a JSON array of all clip URLs */
function parseClips(video: any): string[] {
  if (!video.videoUrl) return [];
  if (!video.thumbnailUrl) return [video.videoUrl];
  try {
    const parsed = JSON.parse(video.thumbnailUrl);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
  } catch {}
  return [video.videoUrl];
}

function VideoCard({ video, onPreview }: {
  video: any;
  onPreview: (v: { clips: string[] }) => void;
}) {
  const isGenerating = video.status === "generating" || video.status === "pending";
  const clips = parseClips(video);
  const hasMultiClip = clips.length > 1;

  return (
    <Card className="group overflow-hidden hover:shadow-md transition-all">
      <div className="aspect-video bg-muted relative overflow-hidden">
        {video.videoUrl ? (
          <video
            src={video.videoUrl}
            className="w-full h-full object-cover"
            muted loop
            onMouseEnter={(e) => (e.currentTarget as HTMLVideoElement).play()}
            onMouseLeave={(e) => { (e.currentTarget as HTMLVideoElement).pause(); (e.currentTarget as HTMLVideoElement).currentTime = 0; }}
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2">
            {isGenerating ? (
              <>
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <p className="text-xs text-muted-foreground">AI 生成中…</p>
              </>
            ) : (
              <AlertCircle className="w-8 h-8 text-destructive" />
            )}
          </div>
        )}
        {video.videoUrl && (
          <div
            className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100 cursor-pointer"
            onClick={() => onPreview({ clips })}
          >
            <Play className="w-10 h-10 text-white drop-shadow-lg fill-white" />
          </div>
        )}
        {hasMultiClip && (
          <div className="absolute top-2 right-2">
            <Badge className="bg-black/60 text-white border-0 text-[10px] px-1.5 py-0">
              {clips.length} 段 · {video.durationSeconds}s
            </Badge>
          </div>
        )}
      </div>

      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1 space-y-1">
            {video.productCode && (
              <div className="flex items-center gap-1">
                <Hash className="w-3 h-3 text-primary shrink-0" />
                <span className="text-xs font-mono font-medium truncate">{video.productCode}</span>
              </div>
            )}
            <div className="flex items-center gap-1.5 flex-wrap">
              <Badge className={`text-xs px-1.5 py-0 ${STATUS_COLORS[video.status] ?? ""}`}>
                {isGenerating && <Loader2 className="w-2.5 h-2.5 mr-1 animate-spin inline" />}
                {STATUS_LABELS[video.status] ?? video.status}
              </Badge>
              {video.durationSeconds && (
                <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                  <Clock className="w-3 h-3" />{video.durationSeconds}s
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {new Date(video.createdAt).toLocaleString("zh-CN")}
            </p>
          </div>
          {video.videoUrl && (
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 shrink-0" asChild title="下载视频">
              <a href={video.videoUrl} download={`${video.productCode ?? `video-${video.id}`}.mp4`} target="_blank" rel="noopener noreferrer">
                <Download className="w-3.5 h-3.5" />
              </a>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ──────────────────────────────────────────────────────────────
// Preview modal — supports sequential playback for multi-clip videos
// ──────────────────────────────────────────────────────────────

const CLIP_LABELS = ["片段一：场景展示", "片段二：纹理特写", "片段三：细节展示", "片段四：收尾镜头"];

function VideoPreviewModal({ clips, onClose }: { clips: string[]; onClose: () => void }) {
  const [currentIdx, setCurrentIdx] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);

  const handleEnded = () => {
    if (currentIdx < clips.length - 1) {
      setCurrentIdx(currentIdx + 1);
    }
  };

  const switchClip = (idx: number) => {
    setCurrentIdx(idx);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center"
      onClick={onClose}
    >
      <div className="relative max-w-3xl w-full px-4" onClick={(e) => e.stopPropagation()}>
        {clips.length > 1 && (
          <div className="flex items-center gap-1.5 mb-3 justify-center flex-wrap">
            {clips.map((_, i) => (
              <button
                key={i}
                onClick={() => switchClip(i)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  currentIdx === i ? "bg-white text-black" : "bg-white/20 text-white hover:bg-white/30"
                }`}
              >
                {CLIP_LABELS[i] ?? `片段${i + 1}`}
              </button>
            ))}
          </div>
        )}

        <video
          ref={videoRef}
          key={clips[currentIdx]}
          src={clips[currentIdx]}
          controls
          autoPlay
          onEnded={handleEnded}
          className="w-full rounded-xl shadow-2xl"
          style={{ maxHeight: "70vh" }}
        />

        {clips.length > 1 && (
          <p className="text-center text-white/50 text-xs mt-2">
            {currentIdx + 1} / {clips.length} — 播放完自动切换下一段
          </p>
        )}

        <div className="flex justify-between mt-3">
          <Button variant="secondary" onClick={onClose}>关闭</Button>
          <div className="flex gap-2 flex-wrap justify-end">
            {clips.map((url, i) => (
              <Button key={i} variant={i === 0 ? "default" : "outline"} size="sm" asChild>
                <a href={url} download={`video-clip${i + 1}.mp4`} target="_blank" rel="noopener noreferrer">
                  <Download className="w-3.5 h-3.5 mr-1" />
                  {clips.length === 1 ? "下载视频" : `下载片段${i + 1}`}
                </a>
              </Button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
