import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { errorMessage } from "@/lib/errors";
import { User } from "@supabase/supabase-js";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Camera, Loader2, LogOut, Shield } from "lucide-react";
import { toast } from "sonner";
import { useLanguage } from "@/i18n/LanguageContext";
import BottomNav from "@/components/BottomNav";
import SafetySettingsDialog from "@/components/SafetySettingsDialog";
import TrustedContactsCard from "@/components/TrustedContactsCard";

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];

const Profile = () => {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [languages, setLanguages] = useState<string[]>([]);
  const [nowTs, setNowTs] = useState<number>(Date.now());
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showSafetySettings, setShowSafetySettings] = useState(false);
  const [reportCount, setReportCount] = useState(0);

  const availableLanguages = [
    { id: "dutch", label: "Nederlands", flag: "🇳🇱" },
    { id: "english", label: "English", flag: "🇬🇧" },
    { id: "french", label: "Français", flag: "🇫🇷" }
  ];

  useEffect(() => {
    const fetchProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        navigate("/auth");
        return;
      }

      setUser(user);

      const { data: profileData } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (profileData) {
        setProfile(profileData);
        setUsername(profileData.username || "");
        setBio(profileData.bio || "");
        setLanguages(profileData.languages || []);
      }

      // `head: true` asks for the count only, instead of downloading every row.
      const { count } = await supabase
        .from("safety_reports")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id);

      if (count !== null) {
        setReportCount(count);
      }

      setLoading(false);
    };

    fetchProfile();

    // Refreshes the username cooldown countdown once a minute.
    const cooldownTimer = setInterval(() => setNowTs(Date.now()), 60_000);

    // ReportLocationDialog dispatches this after a successful submission.
    const handleReportSubmitted = () => {
      refreshReportCount();
    };

    window.addEventListener("reportSubmitted", handleReportSubmitted);

    return () => {
      clearInterval(cooldownTimer);
      window.removeEventListener("reportSubmitted", handleReportSubmitted);
    };
  }, [navigate]);

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      toast.error("Please upload an image file");
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be smaller than 5MB");
      return;
    }

    setUploading(true);

    try {
      // Generate unique file name
      const fileExt = file.name.split(".").pop();
      const fileName = `${user.id}-${Date.now()}.${fileExt}`;
      const filePath = `avatars/${fileName}`;

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from("avatars")
        .getPublicUrl(filePath);

      // Update profile with new avatar URL
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ avatar_url: publicUrl })
        .eq("id", user.id);

      if (updateError) throw updateError;

      setProfile((current) => (current ? { ...current, avatar_url: publicUrl } : current));
      toast.success(t("profileUpdated"));
    } catch (error) {
      console.error("Error uploading avatar:", error);
      toast.error(errorMessage(error, "Profielfoto uploaden is mislukt"));
    } finally {
      setUploading(false);
    }
  };

  const toggleLanguage = (langId: string) => {
    setLanguages(prev =>
      prev.includes(langId)
        ? prev.filter(l => l !== langId)
        : [...prev, langId]
    );
  };

  const refreshReportCount = async () => {
    const { data: auth } = await supabase.auth.getUser();
    const currentUser = auth?.user;
    if (!currentUser) return;

    const { count } = await supabase
      .from("safety_reports")
      .select("id", { count: "exact", head: true })
      .eq("user_id", currentUser.id);

    if (count !== null) {
      setReportCount(count);
    }
  };

  const handleSaveProfile = async () => {
    if (!user) return;

    try {
      const changedUsername = username.trim() !== (profile?.username || "");

      // A database trigger enforces the 30-day cooldown. Checking it here too
      // turns a rejected write into an immediate, specific message.
      if (changedUsername && profile?.last_username_change) {
        const last = new Date(profile.last_username_change).getTime();
        const daysSinceChange = (nowTs - last) / (1000 * 60 * 60 * 24);
        if (daysSinceChange < 30) {
          const daysLeft = Math.ceil(30 - daysSinceChange);
          toast.error(`${t("usernameChangeCooldown")} (${daysLeft} dagen)`);
          return;
        }
      }

      const changes = {
        username,
        bio,
        languages,
        ...(changedUsername ? { last_username_change: new Date().toISOString() } : {}),
      };

      const { error } = await supabase.from("profiles").update(changes).eq("id", user.id);
      if (error) throw error;

      setProfile((current) => (current ? { ...current, ...changes } : current));
      setIsEditing(false);
      toast.success(t("profileUpdated"));
    } catch (error) {
      console.error("Error updating profile:", error);

      // The database trigger rejects an early username change; translate that
      // into the same message the client-side check uses.
      const message = errorMessage(error, t("failedUpdateProfile"));
      toast.error(
        message.toLowerCase().includes("30 days") ? t("usernameChangeCooldown") : message
      );
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
    toast.success(t("signOutSuccessfully"));
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-primary/20 via-background to-secondary/20 flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20 overflow-y-auto" data-route-page="false">
      
      {/* Gradient Header Section */}
      <div className="gradient-header pt-12 pb-20 px-4 relative overflow-hidden">
        <div className="max-w-2xl mx-auto">
          {/* Profile Header */}
          <div className="text-center space-y-4">
            <div className="relative w-24 h-24 mx-auto group">
              <Avatar className="w-24 h-24 border-4 border-white/30">
                <AvatarImage src={profile?.avatar_url} />
                <AvatarFallback className="bg-white/20 text-white text-2xl">
                  {profile?.username?.[0]?.toUpperCase() || "U"}
                </AvatarFallback>
              </Avatar>
              <button
                onClick={handleAvatarClick}
                disabled={uploading}
                className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
              >
                {uploading ? (
                  <Loader2 className="h-6 w-6 text-white animate-spin" />
                ) : (
                  <Camera className="h-6 w-6 text-white" />
                )}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                className="hidden"
              />
            </div>
            
            {isEditing ? (
              <div className="space-y-3">
                <div>
                  <Label htmlFor="username" className="text-white">{t("username")}</Label>
                  <Input
                    id="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder={t("enterUsername")}
                    className="bg-white/20 border-white/30 text-white placeholder:text-white/60"
                  />
                  {profile?.last_username_change && (
                    <p className="text-xs text-white/80 mt-1">
                      {t("nextChangeAvailable")} {new Date(new Date(profile.last_username_change).getTime() + 30*24*60*60*1000).toLocaleDateString()}
                    </p>
                  )}
                </div>
                <div>
                  <Label htmlFor="bio" className="text-white">{t("bio")}</Label>
                  <Textarea
                    id="bio"
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder={t("tellAboutYourself")}
                    rows={3}
                    className="bg-white/20 border-white/30 text-white placeholder:text-white/60"
                  />
                </div>
                <div>
                  <Label className="text-white mb-3 block">{t("languages")}</Label>
                  <div className="space-y-2">
                    {availableLanguages.map((lang) => (
                      <div key={lang.id} className="flex items-center gap-3 p-2 rounded bg-white/10 hover:bg-white/20 transition">
                        <Checkbox
                          id={`lang-${lang.id}`}
                          checked={languages.includes(lang.id)}
                          onCheckedChange={() => toggleLanguage(lang.id)}
                          className="accent-white"
                        />
                        <label
                          htmlFor={`lang-${lang.id}`}
                          className="flex items-center gap-2 cursor-pointer text-white flex-1"
                        >
                          <span>{lang.flag}</span>
                          <span>{lang.label}</span>
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleSaveProfile} className="flex-1 bg-white text-primary hover:bg-white/90">
                    {t("saveChanges")}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setIsEditing(false);
                      setUsername(profile?.username || "");
                      setBio(profile?.bio || "");
                      setLanguages(profile?.languages || []);
                    }}
                    className="flex-1 text-white hover:bg-white/10"
                  >
                    {t("cancel")}
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <h2 className="text-2xl font-bold text-white">{profile?.username || "User"}</h2>
                <p className="text-white/80 text-sm">{user?.email}</p>
                <p className="text-white/90">{profile?.bio || `Hello, I'm ${profile?.username || "User"}!`}</p>
                
                {profile?.languages && profile.languages.length > 0 && (
                  <div className="flex flex-wrap gap-2 justify-center mt-2">
                    {profile.languages.map((langId: string) => {
                      const lang = availableLanguages.find(l => l.id === langId);
                      return lang ? (
                        <span key={langId} className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-white/20 text-white text-sm">
                          <span>{lang.flag}</span>
                          <span>{lang.label}</span>
                        </span>
                      ) : null;
                    })}
                  </div>
                )}
                
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsEditing(true)}
                  className="mt-2 text-white/90 hover:text-white hover:bg-white/10"
                >
                  ✏️ {t("editProfile")}
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 -mt-12 space-y-6 relative z-10">

        {/* Lifetime Stats Card */}
        <Card className="shadow-card mb-6">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-foreground">{t("statistics")}</h3>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center">
                <div className="text-3xl font-bold text-primary mb-1">0</div>
                <div className="text-sm text-muted-foreground">{t("safeRoutes")}</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-primary mb-1">{reportCount}</div>
                <div className="text-sm text-muted-foreground">{t("reports")}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <TrustedContactsCard />

        {/* Safety Preferences */}
        <Card className="shadow-card mb-6">
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center gap-2 mb-3">
              <Shield className="h-5 w-5 text-primary" />
              <h3 className="font-semibold text-foreground">{t("safetyPreferences")}</h3>
            </div>
            
            <div className="flex items-center justify-between py-2">
              <div>
                <p className="font-medium text-foreground">{t("avoidDarkStreets")}</p>
                <p className="text-sm text-muted-foreground">{t("prioritizeWellLit")}</p>
              </div>
              <input type="checkbox" className="w-5 h-5 accent-primary" />
            </div>
            
            <div className="flex items-center justify-between py-2">
              <div>
                <p className="font-medium text-foreground">{t("preferBusyAreas")}</p>
                <p className="text-sm text-muted-foreground">{t("routePopulated")}</p>
              </div>
              <input type="checkbox" className="w-5 h-5 accent-primary" />
            </div>
            
            <div className="flex items-center justify-between py-2">
              <div>
                <p className="font-medium text-foreground">{t("notifications")}</p>
                <p className="text-sm text-muted-foreground">{t("safetyAlertsUpdates")}</p>
              </div>
              <input type="checkbox" className="w-5 h-5 accent-primary" defaultChecked />
            </div>
          </CardContent>
        </Card>

        {/* Navigation Buttons */}
        <div className="space-y-3 mb-6">
          <Button
            variant="outline"
            className="w-full justify-between h-14 bg-card hover:bg-muted"
            onClick={() => setShowSafetySettings(true)}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-accent flex items-center justify-center">
                <Shield className="h-5 w-5 text-primary" />
              </div>
              <div className="text-left">
                <p className="font-semibold text-foreground">{t("settings")}</p>
                <p className="text-xs text-muted-foreground">{t("managePreferences")}</p>
              </div>
            </div>
            <span className="text-muted-foreground">→</span>
          </Button>

          <Button
            variant="outline"
            className="w-full justify-between h-14 bg-card hover:bg-muted"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-accent flex items-center justify-center">
                <Shield className="h-5 w-5 text-primary" />
              </div>
              <div className="text-left">
                <p className="font-semibold text-foreground">{t("aboutSafeBuddy")}</p>
                <p className="text-xs text-muted-foreground">{t("moreInformation")}</p>
              </div>
            </div>
            <span className="text-muted-foreground">→</span>
          </Button>
        </div>

        {/* Log Out Button */}
        <Button
          variant="outline"
          className="w-full gap-3 h-12 bg-card hover:bg-muted border-destructive/30"
          onClick={handleLogout}
        >
          <LogOut className="h-5 w-5 text-destructive" />
          <span className="font-semibold text-destructive">{t("logOut")}</span>
        </Button>

        {/* Small Ad Space */}
        <div className="mt-6">
          <div className="bg-muted/50 border border-border rounded-lg p-3 text-center">
            <span className="text-xs text-muted-foreground">{t("advertisement")}</span>
          </div>
        </div>

        <SafetySettingsDialog
          open={showSafetySettings}
          onOpenChange={setShowSafetySettings}
        />
      </div>

      <BottomNav />
    </div>
  );
};

export default Profile;
