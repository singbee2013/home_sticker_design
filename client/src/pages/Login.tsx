import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Sparkles, Phone, Mail, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

export default function Login() {
  const utils = trpc.useUtils();
  const [activeTab, setActiveTab] = useState<"phone" | "login" | "register" | "forgot">("phone");

  // Email login
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  // Register form
  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regConfirm, setRegConfirm] = useState("");
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotCode, setForgotCode] = useState("");
  const [forgotPassword, setForgotPassword] = useState("");
  const [forgotConfirm, setForgotConfirm] = useState("");

  // Phone login
  const [phone, setPhone] = useState("");
  const [smsCode, setSmsCode] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [forgotCooldown, setForgotCooldown] = useState(0);
  const forgotCooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [showRegConfirm, setShowRegConfirm] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [showForgotConfirm, setShowForgotConfirm] = useState(false);

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

  const sendEmailResetCodeMutation = trpc.auth.sendEmailResetCode.useMutation({
    onSuccess: (data) => {
      if (data.devCode) {
        toast.success(`邮箱验证码（开发模式）：${data.devCode}`);
      } else {
        toast.success("验证码已发送到邮箱，请注意查收");
      }
      setForgotCooldown(60);
      forgotCooldownRef.current = setInterval(() => {
        setForgotCooldown((c) => {
          if (c <= 1) {
            if (forgotCooldownRef.current) clearInterval(forgotCooldownRef.current);
            return 0;
          }
          return c - 1;
        });
      }, 1000);
    },
    onError: (err) => toast.error(err.message),
  });

  const resetPasswordMutation = trpc.auth.resetPasswordWithCode.useMutation({
    onSuccess: () => {
      toast.success("密码重置成功，请使用新密码登录");
      setForgotCode("");
      setForgotPassword("");
      setForgotConfirm("");
      setActiveTab("login");
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

  const handleSendEmailResetCode = () => {
    if (!forgotEmail.trim()) { toast.error("请输入邮箱"); return; }
    sendEmailResetCodeMutation.mutate({ email: forgotEmail.trim() });
  };

  const handleResetPassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!forgotEmail.trim()) { toast.error("请输入邮箱"); return; }
    if (forgotCode.trim().length !== 6) { toast.error("请输入6位验证码"); return; }
    if (forgotPassword.length < 6) { toast.error("新密码至少6位"); return; }
    if (forgotPassword !== forgotConfirm) { toast.error("两次输入的新密码不一致"); return; }
    resetPasswordMutation.mutate({
      email: forgotEmail.trim(),
      code: forgotCode.trim(),
      newPassword: forgotPassword,
    });
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

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "phone" | "login" | "register" | "forgot")}>
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
                setForgotEmail(loginEmail || regEmail || forgotEmail);
                setActiveTab("forgot");
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
                    <div className="relative">
                      <Input
                        id="login-password"
                        type={showLoginPassword ? "text" : "password"}
                        placeholder="••••••••"
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        autoComplete="current-password"
                        className="pr-10"
                      />
                      <button
                        type="button"
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        onClick={() => setShowLoginPassword((v) => !v)}
                        aria-label={showLoginPassword ? "隐藏密码" : "显示密码"}
                      >
                        {showLoginPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
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
                    <div className="relative">
                      <Input
                        id="reg-password"
                        type={showRegPassword ? "text" : "password"}
                        placeholder="••••••••"
                        value={regPassword}
                        onChange={(e) => setRegPassword(e.target.value)}
                        autoComplete="new-password"
                        className="pr-10"
                      />
                      <button
                        type="button"
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        onClick={() => setShowRegPassword((v) => !v)}
                        aria-label={showRegPassword ? "隐藏密码" : "显示密码"}
                      >
                        {showRegPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="reg-confirm">确认密码</Label>
                    <div className="relative">
                      <Input
                        id="reg-confirm"
                        type={showRegConfirm ? "text" : "password"}
                        placeholder="••••••••"
                        value={regConfirm}
                        onChange={(e) => setRegConfirm(e.target.value)}
                        autoComplete="new-password"
                        className="pr-10"
                      />
                      <button
                        type="button"
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        onClick={() => setShowRegConfirm((v) => !v)}
                        aria-label={showRegConfirm ? "隐藏密码" : "显示密码"}
                      >
                        {showRegConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <Button type="submit" className="w-full" disabled={registerMutation.isPending}>
                    {registerMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                    注册
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Forgot password */}
          <TabsContent value="forgot">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">忘记密码</CardTitle>
                <CardDescription>通过邮箱验证码重置密码</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleResetPassword} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="forgot-email">邮箱</Label>
                    <Input
                      id="forgot-email"
                      type="email"
                      placeholder="you@example.com"
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      autoComplete="email"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="forgot-code">邮箱验证码</Label>
                    <div className="flex gap-2">
                      <Input
                        id="forgot-code"
                        type="text"
                        placeholder="6位验证码"
                        value={forgotCode}
                        onChange={(e) => setForgotCode(e.target.value.trim())}
                        maxLength={6}
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleSendEmailResetCode}
                        disabled={forgotCooldown > 0 || sendEmailResetCodeMutation.isPending}
                        className="whitespace-nowrap min-w-[100px]"
                      >
                        {sendEmailResetCodeMutation.isPending ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : forgotCooldown > 0 ? (
                          `${forgotCooldown}s 后重发`
                        ) : (
                          "发送验证码"
                        )}
                      </Button>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      如暂未接入邮件服务，系统会返回开发验证码用于紧急重置。
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="forgot-password">新密码</Label>
                    <div className="relative">
                      <Input
                        id="forgot-password"
                        type={showForgotPassword ? "text" : "password"}
                        placeholder="至少6位"
                        value={forgotPassword}
                        onChange={(e) => setForgotPassword(e.target.value)}
                        autoComplete="new-password"
                        className="pr-10"
                      />
                      <button
                        type="button"
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        onClick={() => setShowForgotPassword((v) => !v)}
                        aria-label={showForgotPassword ? "隐藏密码" : "显示密码"}
                      >
                        {showForgotPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="forgot-confirm">确认新密码</Label>
                    <div className="relative">
                      <Input
                        id="forgot-confirm"
                        type={showForgotConfirm ? "text" : "password"}
                        placeholder="再次输入新密码"
                        value={forgotConfirm}
                        onChange={(e) => setForgotConfirm(e.target.value)}
                        autoComplete="new-password"
                        className="pr-10"
                      />
                      <button
                        type="button"
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        onClick={() => setShowForgotConfirm((v) => !v)}
                        aria-label={showForgotConfirm ? "隐藏密码" : "显示密码"}
                      >
                        {showForgotConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <Button type="submit" className="w-full" disabled={resetPasswordMutation.isPending}>
                    {resetPasswordMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                    重置密码
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
