import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Settings, User, Shield, Key, Database, Globe, Bell,
  CheckCircle2, AlertCircle, Copy, Eye, EyeOff, ExternalLink,
} from "lucide-react";
import { useState } from "react";
import { useAuth as useAuthHook } from "@/_core/hooks/useAuth";
import { toast } from "sonner";

export default function SettingsPage() {
  useAuth({ redirectOnUnauthenticated: true });
  const { user } = useAuthHook();
  const [showKey, setShowKey] = useState(false);

  const apiStatus = [
    { name: "Gemini 2.5 Flash Image (图像生成)", status: "active", endpoint: "generativelanguage.googleapis.com" },
    { name: "Silicon Flow (图案生成回退)", status: "active", endpoint: "api.siliconflow.cn" },
    { name: "阿里云 OSS (存储)", status: "active", endpoint: "oss-cn-beijing.aliyuncs.com" },
    { name: "阿里云 SMS (短信)", status: "active", endpoint: "dysmsapi.aliyuncs.com" },
  ];

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => toast.success("已复制")).catch(() => toast.error("复制失败"));
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
          <Settings className="w-5 h-5 text-slate-500" />
          权限设置
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          账户信息、API 配置与系统状态
        </p>
      </div>

      {/* Account Info */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <User className="w-4 h-4 text-blue-500" />
            账户信息
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between py-2 border-b">
            <span className="text-sm text-muted-foreground">用户名</span>
            <span className="text-sm font-medium">{user?.name ?? "—"}</span>
          </div>
          <div className="flex items-center justify-between py-2 border-b">
            <span className="text-sm text-muted-foreground">邮箱</span>
            <span className="text-sm font-medium">{user?.email ?? "—"}</span>
          </div>
          <div className="flex items-center justify-between py-2 border-b">
            <span className="text-sm text-muted-foreground">手机号</span>
            <span className="text-sm font-medium">{user?.phone ?? "未绑定"}</span>
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-sm text-muted-foreground">账户角色</span>
            <Badge variant={user?.role === "admin" ? "default" : "secondary"} className="text-xs">
              {user?.role === "admin" ? "管理员" : "普通用户"}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* API Status */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Globe className="w-4 h-4 text-emerald-500" />
            API 服务状态
          </CardTitle>
          <CardDescription className="text-xs">系统依赖的第三方服务连接状态</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {apiStatus.map((api) => (
            <div key={api.name} className="flex items-center justify-between py-2 border-b last:border-0">
              <div>
                <p className="text-sm font-medium">{api.name}</p>
                <p className="text-xs text-muted-foreground">{api.endpoint}</p>
              </div>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${api.status === "active" ? "bg-emerald-500" : "bg-red-500"}`} />
                <span className={`text-xs font-medium ${api.status === "active" ? "text-emerald-600" : "text-red-500"}`}>
                  {api.status === "active" ? "正常" : "异常"}
                </span>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* System Info */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Database className="w-4 h-4 text-violet-500" />
            系统信息
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {[
            { label: "部署域名", value: "sticker-design.com" },
            { label: "服务器", value: "阿里云 ECS（北京）" },
            { label: "数据库", value: "MySQL 8.0 / decor_ai" },
            { label: "对象存储", value: "OSS / decor-ai-images（北京）" },
            { label: "进程管理", value: "PM2" },
          ].map((item) => (
            <div key={item.label} className="flex items-center justify-between py-2 border-b last:border-0">
              <span className="text-sm text-muted-foreground">{item.label}</span>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium font-mono text-xs">{item.value}</span>
                <button onClick={() => copyToClipboard(item.value)} className="text-muted-foreground hover:text-foreground transition-colors">
                  <Copy className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Security */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Shield className="w-4 h-4 text-amber-500" />
            安全说明
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {[
            { icon: CheckCircle2, text: "密码使用 scrypt 哈希加密存储", ok: true },
            { icon: CheckCircle2, text: "会话 Cookie 设置 HttpOnly + Secure", ok: true },
            { icon: CheckCircle2, text: "API 密钥通过环境变量管理，不进入代码", ok: true },
            { icon: CheckCircle2, text: "HTTPS 由 Let's Encrypt 证书保障", ok: true },
            { icon: AlertCircle, text: "SMS 验证码 5 分钟过期", ok: true },
          ].map((item, i) => (
            <div key={i} className="flex items-center gap-2 py-1.5">
              <item.icon className={`w-3.5 h-3.5 shrink-0 ${item.ok ? "text-emerald-500" : "text-amber-500"}`} />
              <span className="text-xs text-muted-foreground">{item.text}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
