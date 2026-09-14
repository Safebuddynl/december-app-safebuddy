import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { isSupabaseConfigured } from "@/lib/env";
import { errorMessage } from "@/lib/errors";
import { toast } from "sonner";
import { useLanguage } from "@/i18n/LanguageContext";
import { Eye, EyeOff, Shield } from "lucide-react";

const Auth = () => {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [isLoading, setIsLoading] = useState(false);
  const supabaseReady = isSupabaseConfigured();
  
  // Login state
  const [loginIdentifier, setLoginIdentifier] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  
  // Signup state
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupConfirmPassword, setSignupConfirmPassword] = useState("");
  const [signupUsername, setSignupUsername] = useState("");
  const [showSignupPassword, setShowSignupPassword] = useState(false);
  const [showSignupConfirm, setShowSignupConfirm] = useState(false);

  // Password rules, shown as a live checklist and enforced on submit.
  const passwordChecks = useMemo(
    () => ({
      length: signupPassword.length >= 8,
      upper: /[A-Z]/.test(signupPassword),
      lower: /[a-z]/.test(signupPassword),
      number: /[0-9]/.test(signupPassword),
      special: /[^A-Za-z0-9]/.test(signupPassword),
    }),
    [signupPassword]
  );

  const passwordMeetsRules = Object.values(passwordChecks).every(Boolean);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      let emailToUse = loginIdentifier.trim();
      if (!emailToUse.includes("@")) {
        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("email")
          .ilike("username", loginIdentifier)
          .single();
        if (profileError || !profile?.email) {
          throw new Error("Username not found. Try your email address.");
        }
        emailToUse = profile.email as string;
      }

      const { error } = await supabase.auth.signInWithPassword({
        email: emailToUse,
        password: loginPassword,
      });

      if (error) throw error;

      // Auto-heal: ensure profile has username/email after login
      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user;
      if (user) {
        const { data: profileRow } = await supabase
          .from("profiles")
          .select("id, username")
          .eq("id", user.id)
          .single();
        const metaUsername = user.user_metadata?.username as string | undefined;
        if (!profileRow || !profileRow.username) {
          await supabase
            .from("profiles")
            .upsert({ id: user.id, username: metaUsername || null, email: user.email || null });
        }
      }

      toast.success("Welcome back!");
      navigate("/profile");
    } catch (error) {
      toast.error(errorMessage(error, t("failedUpdateProfile")));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // The checklist below the field showed these rules but nothing enforced
    // them, so an account could be created with a one-character password.
    if (!passwordMeetsRules) {
      toast.error("Je wachtwoord voldoet nog niet aan alle eisen");
      return;
    }

    if (signupPassword !== signupConfirmPassword) {
      toast.error(t("passwordsNoMatch"));
      return;
    }

    setIsLoading(true);

    try {
      // Create account
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: signupEmail,
        password: signupPassword,
        options: {
          data: {
            username: signupUsername,
          },
          emailRedirectTo: `${window.location.origin}/`,
        },
      });

      if (authError) throw authError;
      if (!authData.user) throw new Error("Failed to create user");

      // If session exists (email confirmation disabled), upsert profile immediately
      if (authData.session && authData.user) {
        await supabase
          .from("profiles")
          .upsert({ id: authData.user.id, username: signupUsername, email: signupEmail });
        toast.success(t("profileUpdated"));
        navigate("/profile");
      } else {
        // Otherwise rely on DB trigger to create profile from metadata
        toast.success("Account created! Please confirm via email to continue.");
      }
    } catch (error) {
      toast.error(errorMessage(error, "Account aanmaken is mislukt"));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/20 via-background to-secondary/20 flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-elevated">
        <CardContent className="p-6">
          <div className="flex flex-col items-center mb-6">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center mb-4 glow">
              <Shield className="h-8 w-8 text-primary-foreground" />
            </div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
              SafeBuddy
            </h1>
            <p className="text-muted-foreground text-sm">Your safety companion</p>
          </div>

          <Tabs defaultValue="login" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="login">{t("signIn")}</TabsTrigger>
              <TabsTrigger value="signup">{t("signUp")}</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              {!supabaseReady && (
                <div className="mb-4 text-sm text-destructive">
                  Supabase omgeving mist configuratie. Stel VITE_SUPABASE_URL en VITE_SUPABASE_PUBLISHABLE_KEY in .env.local in en herstart.
                </div>
              )}
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">{t("email")}</label>
                  <Input
                    type="text"
                    placeholder={t("enterEmail")}
                    value={loginIdentifier}
                    onChange={(e) => setLoginIdentifier(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">{t("password")}</label>
                  <Input
                    type="password"
                    placeholder={t("enterPassword")}
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    required
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full bg-gradient-to-r from-primary to-secondary"
                  disabled={isLoading || !supabaseReady}
                >
                  {isLoading ? `${t("loading")}...` : t("signInButton")}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              {!supabaseReady && (
                <div className="mb-4 text-sm text-destructive">
                  Supabase omgeving mist configuratie. Stel VITE_SUPABASE_URL en VITE_SUPABASE_PUBLISHABLE_KEY in .env.local in en herstart.
                </div>
              )}
              <form onSubmit={handleSignup} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">{t("username")}</label>
                  <Input
                    type="text"
                    placeholder={t("enterUsername")}
                    value={signupUsername}
                    onChange={(e) => setSignupUsername(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">{t("email")}</label>
                  <Input
                    type="email"
                    placeholder={t("enterEmail")}
                    value={signupEmail}
                    onChange={(e) => setSignupEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">{t("password")}</label>
                  <div className="relative">
                    <Input
                      type={showSignupPassword ? "text" : "password"}
                      placeholder={t("enterPassword")}
                      value={signupPassword}
                      onChange={(e) => setSignupPassword(e.target.value)}
                      required
                      className="pr-10"
                    />
                    <button
                      type="button"
                      aria-label={showSignupPassword ? "Hide password" : "Show password"}
                      aria-pressed={showSignupPassword}
                      onClick={() => setShowSignupPassword((v) => !v)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setShowSignupPassword((v) => !v);
                        }
                      }}
                      className="absolute inset-y-0 right-2 flex items-center text-gray-400 hover:text-[#F57C00] focus:text-[#F57C00] focus:outline-none"
                    >
                      {showSignupPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <ul className="mt-2 space-y-1 text-sm">
                    <li className={passwordChecks.length ? "text-green-600" : "text-muted-foreground"}>
                      {passwordChecks.length ? "✔" : "✖"} {t("passwordMinLength")}
                    </li>
                    <li className={passwordChecks.upper ? "text-green-600" : "text-muted-foreground"}>
                      {passwordChecks.upper ? "✔" : "✖"} {t("passwordUppercase")}
                    </li>
                    <li className={passwordChecks.lower ? "text-green-600" : "text-muted-foreground"}>
                      {passwordChecks.lower ? "✔" : "✖"} {t("passwordLowercase")}
                    </li>
                    <li className={passwordChecks.number ? "text-green-600" : "text-muted-foreground"}>
                      {passwordChecks.number ? "✔" : "✖"} {t("passwordNumber")}
                    </li>
                    <li className={passwordChecks.special ? "text-green-600" : "text-muted-foreground"}>
                      {passwordChecks.special ? "✔" : "✖"} {t("passwordSpecial")}
                    </li>
                  </ul>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">{t("confirmPassword")}</label>
                  <div className="relative">
                    <Input
                      type={showSignupConfirm ? "text" : "password"}
                      placeholder={t("enterConfirmPassword")}
                      value={signupConfirmPassword}
                      onChange={(e) => setSignupConfirmPassword(e.target.value)}
                      required
                      className="pr-10"
                    />
                    <button
                      type="button"
                      aria-label={showSignupConfirm ? "Hide password" : "Show password"}
                      aria-pressed={showSignupConfirm}
                      onClick={() => setShowSignupConfirm((v) => !v)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setShowSignupConfirm((v) => !v);
                        }
                      }}
                      className="absolute inset-y-0 right-2 flex items-center text-gray-400 hover:text-[#F57C00] focus:text-[#F57C00] focus:outline-none"
                    >
                      {showSignupConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {signupConfirmPassword && signupPassword !== signupConfirmPassword && (
                    <p className="text-red-600 text-sm mt-1">{t("passwordsNoMatch")}</p>
                  )}
                </div>


                <Button
                  type="submit"
                  className="w-full bg-gradient-to-r from-primary to-secondary"
                  disabled={isLoading || !supabaseReady}
                >
                  {isLoading ? `${t("loading")}...` : t("signUpButton")}
                </Button>
                
                
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default Auth;
