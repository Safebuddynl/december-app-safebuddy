import { useState, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { supabase, isSupabaseConfigured } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Shield, Upload, FileText, Camera, Eye, EyeOff } from "lucide-react";

const Auth = () => {
  const navigate = useNavigate();
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
  // Removed ID verification requirements

  // Password validation rules
  const passwordChecks = useMemo(() => {
    const length = signupPassword.length >= 8;
    const upper = /[A-Z]/.test(signupPassword);
    const lower = /[a-z]/.test(signupPassword);
    const number = /[0-9]/.test(signupPassword);
    const special = /[^A-Za-z0-9]/.test(signupPassword);
    return { length, upper, lower, number, special };
  }, [signupPassword]);

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
        const metaUsername = (user.user_metadata as any)?.username;
        if (!profileRow || !profileRow.username) {
          await supabase
            .from("profiles")
            .upsert({ id: user.id, username: metaUsername || null, email: user.email || null });
        }
      }

      toast.success("Welcome back!");
      navigate("/profile");
    } catch (error: any) {
      toast.error(error.message || "Failed to login");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (signupPassword !== signupConfirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    // ID verification removed: no document or selfie required

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
        toast.success("Account created!");
        navigate("/profile");
      } else {
        // Otherwise rely on DB trigger to create profile from metadata
        toast.success("Account created! Please confirm via email to continue.");
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to sign up");
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
              <TabsTrigger value="login">Login</TabsTrigger>
              <TabsTrigger value="signup">Sign Up</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              {!supabaseReady && (
                <div className="mb-4 text-sm text-destructive">
                  Supabase omgeving mist configuratie. Stel VITE_SUPABASE_URL en VITE_SUPABASE_PUBLISHABLE_KEY in .env.local in en herstart.
                </div>
              )}
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Email or Username</label>
                  <Input
                    type="text"
                    placeholder="Enter your email or username"
                    value={loginIdentifier}
                    onChange={(e) => setLoginIdentifier(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Password</label>
                  <Input
                    type="password"
                    placeholder="Enter your password"
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
                  {isLoading ? "Logging in..." : "Login"}
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
                  <label className="text-sm font-medium">Username</label>
                  <Input
                    type="text"
                    placeholder="Choose a username"
                    value={signupUsername}
                    onChange={(e) => setSignupUsername(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Email</label>
                  <Input
                    type="email"
                    placeholder="Enter your email"
                    value={signupEmail}
                    onChange={(e) => setSignupEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Password</label>
                  <div className="relative">
                    <Input
                      type={showSignupPassword ? "text" : "password"}
                      placeholder="Create a password"
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
                      {passwordChecks.length ? "✔" : "✖"} At least 8 characters
                    </li>
                    <li className={passwordChecks.upper ? "text-green-600" : "text-muted-foreground"}>
                      {passwordChecks.upper ? "✔" : "✖"} At least 1 uppercase letter
                    </li>
                    <li className={passwordChecks.lower ? "text-green-600" : "text-muted-foreground"}>
                      {passwordChecks.lower ? "✔" : "✖"} At least 1 lowercase letter
                    </li>
                    <li className={passwordChecks.number ? "text-green-600" : "text-muted-foreground"}>
                      {passwordChecks.number ? "✔" : "✖"} At least 1 number
                    </li>
                    <li className={passwordChecks.special ? "text-green-600" : "text-muted-foreground"}>
                      {passwordChecks.special ? "✔" : "✖"} At least 1 special character
                    </li>
                  </ul>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Confirm Password</label>
                  <div className="relative">
                    <Input
                      type={showSignupConfirm ? "text" : "password"}
                      placeholder="Confirm your password"
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
                    <p className="text-red-600 text-sm mt-1">Passwords do not match</p>
                  )}
                </div>

                {/* ID Verification removed */}

                <Button
                  type="submit"
                  className="w-full bg-gradient-to-r from-primary to-secondary"
                  disabled={isLoading || !supabaseReady}
                >
                  {isLoading ? "Creating account..." : "Sign Up"}
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
