import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Sparkles, Phone, Mail } from "lucide-react";
import { toast } from "sonner";

export default function Login() {
  const utils = trpc.useUtils();
  const [activeTab, setActiveTab] = useState<"phone" | "login" | "register">("phone");

  // Email login
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  // Register form
  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regConfirm, setRegConfirm] = useState("");

  // Phone login
  const [phone, setPhone] = useState("");
  const [smsCode, setSmsCode] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: async () => {
      await utils.auth.me.invalidate();
      window.location.href = "/";
    },
    onError: (err) => toast.error(err.message),
  });

  const registerMutation = trpc.auth.register.useMutation({
    onSuccess: () => {
      toast.success("注册成功，请登录");
    },
    onError: (err) => toast.error(err.message),
  });

  const sendSmsMutation = trpc.auth.sendSmsCode.useMutation({
    onSuccess: (data) => {
      if (data.devCode) {
        toast.success(`开发环境验证码：${data.devCode}`);
      } else {
        toast.success("验证码已发送，请注意查收");
      }
      setCooldown(60);
      cooldownRef.current = setInterval(() => {
        setCooldown((c) => {
          if (c <= 1) {
            if (cooldownRef.current) clearInterval(cooldownRef.current);
            return 0;
          }
          return c - 1;
        });
      }, 1000);
    },
    onError: (err) => toast.error(err.message),
  });

  const phoneLoginMutation = trpc.auth.loginWithPhone.useMutation({
    onSuccess: async () => {
      await utils.auth.me.invalidate();
      window.location.href = "/";
    },
    onError: (err) => toast.error(err.message),
  });

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginEmail || !loginPassword) { toast.error("请填写邮箱和密码"); return; }
    loginMutation.mutate({ email: loginEmail, password: loginPassword });
  };

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    if (!regName || !regEmail || !regPassword) { toast.error("请填写所有字段"); return; }
    if (regPassword !== regConfirm) { toast.error("两次密码不一致"); return; }
    if (regPassword.length < 6) { toast.error("密码至少 6 位"); return; }
    registerMutation.mutate({ name: regName, email: regEmail, password: regPassword });
  };

  const handleSendCode = () => {
    if (!/^1[3-9]\d{9}$/.test(phone)) { toast.error("请输入正确的手机号"); return; }
    sendSmsMutation.mutate({ phone });
  };

  const handlePhoneLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^1[3-9]\d{9}$/.test(phone)) { toast.error("请输入正确的手机号"); return; }
    if (smsCode.length !== 6) { toast.error("请输入6位验证码"); return; }
    phoneLoginMutation.mutate({ phone, code: smsCode });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Logo */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-primary text-primary-foreground mx-auto">
            <Sparkles className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">DecorAI</h1>
          <p className="text-sm text-muted-foreground">AI 驱动的家居贴纸设计平台</p>
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "phone" | "login" | "register")}>
          <TabsList className="w-full">
            <TabsTrigger value="phone" className="flex-1 gap-1.5">
              <Phone className="w-3.5 h-3.5" />手机登录
            </TabsTrigger>
            <TabsTrigger value="login" className="flex-1 gap-1.5">
              <Mail className="w-3.5 h-3.5" />邮箱登录
            </TabsTrigger>
            <TabsTrigger value="register" className="flex-1">注册</TabsTrigger>
          </TabsList>
          <div className="flex justify-end mt-2">
            <button
              type="button"
              className="text-sm text-primary hover:underline"
              onClick={() => {
                setActiveTab("phone");
                toast.info("忘记密码可使用手机验证码登录");
              }}
            >
              忘记密码？
            </button>
          </div>

          {/* Phone SMS Login */}
          <TabsContent value="phone">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">手机验证码登录</CardTitle>
                <CardDescription>未注册手机号将自动创建账号</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handlePhoneLogin} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="phone">手机号</Label>
                    <Input
                      id="phone"
                      type="tel"
                      placeholder="请输入手机号"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value.trim())}
                      maxLength={11}
                      autoComplete="tel"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="sms-code">验证码</Label>
                    <div className="flex gap-2">
                      <Input
                        id="sms-code"
                        type="text"
                        placeholder="6位验证码"
                        value={smsCode}
                        onChange={(e) => setSmsCode(e.target.value.trim())}
                        maxLength={6}
                        autoComplete="one-time-code"
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleSendCode}
                        disabled={cooldown > 0 || sendSmsMutation.isPending}
                        className="whitespace-nowrap min-w-[100px]"
                      >
                        {sendSmsMutation.isPending ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : cooldown > 0 ? (
                          `${cooldown}s 后重发`
                        ) : (
                          "获取验证码"
                        )}
                      </Button>
                    </div>
                  </div>
                  <Button type="submit" className="w-full" disabled={phoneLoginMutation.isPending}>
                    {phoneLoginMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                    登录 / 注册
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Email Login */}
          <TabsContent value="login">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">邮箱登录</CardTitle>
                <CardDescription>使用邮箱和密码登录</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="login-email">邮箱</Label>
                    <Input
                      id="login-email"
                      type="email"
                      placeholder="you@example.com"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      autoComplete="email"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="login-password">密码</Label>
                    <Input
                      id="login-password"
                      type="password"
                      placeholder="••••••••"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      autoComplete="current-password"
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={loginMutation.isPending}>
                    {loginMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                    登录
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Register */}
          <TabsContent value="register">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">创建账号</CardTitle>
                <CardDescription>首次使用请先注册</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleRegister} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="reg-name">姓名</Label>
                    <Input
                      id="reg-name"
                      placeholder="你的姓名"
                      value={regName}
                      onChange={(e) => setRegName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="reg-email">邮箱</Label>
                    <Input
                      id="reg-email"
                      type="email"
                      placeholder="you@example.com"
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      autoComplete="email"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="reg-password">密码（至少 6 位）</Label>
                    <Input
                      id="reg-password"
                      type="password"
                      placeholder="••••••••"
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      autoComplete="new-password"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="reg-confirm">确认密码</Label>
                    <Input
                      id="reg-confirm"
                      type="password"
                      placeholder="••••••••"
                      value={regConfirm}
                      onChange={(e) => setRegConfirm(e.target.value)}
                      autoComplete="new-password"
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={registerMutation.isPending}>
                    {registerMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                    注册
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
