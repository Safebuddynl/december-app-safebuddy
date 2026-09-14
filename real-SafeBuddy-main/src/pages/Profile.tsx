import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { errorMessage } from "@/lib/errors";
import { User } from "@supabase/supabase-js";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  CalendarDays,
  Camera,
  ChevronRight,
  Clock,
  FileText,
  Heart,
  Info,
  Loader2,
  LogOut,
  Pencil,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import BottomNav from "@/components/BottomNav";
import SafetySettingsDialog from "@/components/SafetySettingsDialog";
import TrustedContactsCard from "@/components/TrustedContactsCard";
import SafetyPreferencesCard from "@/components/profile/SafetyPreferencesCard";
import { cn } from "@/lib/utils";

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];

/** A username may be changed once per this many days (also enforced in the database). */
const USERNAME_COOLDOWN_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_BIO = 200;

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

const Profile = () => {
  const navigate = useNavigate();
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
  const [showAbout, setShowAbout] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [reportCount, setReportCount] = useState(0);
  const [likesReceived, setLikesReceived] = useState<number | null>(null);

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

      // Likes on the user's own reports. Read-only; the tile hides if this fails.
      const { data: upvoteRows, error: upvoteError } = await supabase
        .from("safety_reports")
        .select("upvotes")
        .eq("user_id", user.id);

      if (!upvoteError && upvoteRows) {
        setLikesReceived(upvoteRows.reduce((sum, row) => sum + (row.upvotes ?? 0), 0));
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
      toast.error("Kies een afbeelding");
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error("De afbeelding moet kleiner zijn dan 5 MB");
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
      toast.success("Profielfoto bijgewerkt");
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
          toast.error(`Je kunt je gebruikersnaam maar één keer per 30 dagen wijzigen (nog ${daysLeft} dagen)`);
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
      toast.success("Profiel bijgewerkt");
    } catch (error) {
      console.error("Error updating profile:", error);

      // The database trigger rejects an early username change; translate that
      // into the same message the client-side check uses.
      const message = errorMessage(error, "Profiel bijwerken is mislukt");
      toast.error(
        message.toLowerCase().includes("30 days")
          ? "Je kunt je gebruikersnaam maar één keer per 30 dagen wijzigen"
          : message
      );
    }
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setUsername(profile?.username || "");
    setBio(profile?.bio || "");
    setLanguages(profile?.languages || []);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
    toast.success("Je bent uitgelogd");
  };

  if (loading) {
    return (
      <div
        className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background"
        role="status"
      >
        <Loader2 className="h-8 w-8 animate-spin text-primary motion-reduce:animate-none" />
        <p className="text-sm text-muted-foreground">Profiel laden…</p>
      </div>
    );
  }

  const displayName = profile?.username || "Gebruiker";

  // When the username may be changed again, if that is still in the future.
  const nextUsernameChange = profile?.last_username_change
    ? new Date(new Date(profile.last_username_change).getTime() + USERNAME_COOLDOWN_DAYS * DAY_MS)
    : null;
  const usernameLocked = nextUsernameChange !== null && nextUsernameChange.getTime() > nowTs;

  const memberSince = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString("nl-NL", { month: "short", year: "numeric" })
    : null;

  const stats: { label: string; value: string; Icon: LucideIcon }[] = [
    { label: "Meldingen", value: reportCount.toLocaleString("nl-NL"), Icon: FileText },
    ...(likesReceived !== null
      ? [{ label: "Likes ontvangen", value: likesReceived.toLocaleString("nl-NL"), Icon: Heart }]
      : []),
    ...(memberSince ? [{ label: "Lid sinds", value: memberSince, Icon: CalendarDays }] : []),
  ];

  return (
    <div className="min-h-screen bg-background pb-24 overflow-y-auto" data-route-page="false">
      <header className="gradient-header px-4 pb-16 pt-10 text-primary-foreground">
        <div className="mx-auto flex max-w-2xl flex-col items-center text-center">
          <div className="relative">
            <Avatar className="h-28 w-28 shadow-elevated ring-4 ring-primary-foreground/40">
              <AvatarImage src={profile?.avatar_url ?? undefined} alt="Profielfoto" />
              <AvatarFallback className="bg-primary-foreground/20 text-3xl font-semibold text-primary-foreground">
                {displayName[0]?.toUpperCase() || "G"}
              </AvatarFallback>
            </Avatar>
            <button
              type="button"
              onClick={handleAvatarClick}
              disabled={uploading}
              aria-label="Profielfoto wijzigen"
              className={cn(
                "absolute bottom-1 right-1 flex h-9 w-9 items-center justify-center rounded-full bg-card text-primary shadow-card ring-2 ring-primary-foreground transition-colors hover:bg-primary-tint disabled:opacity-80 motion-reduce:transition-none",
                focusRing
              )}
            >
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
              ) : (
                <Camera className="h-4 w-4" />
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

          <h1 className="mt-4 text-2xl font-bold">{displayName}</h1>
          {user?.email && <p className="text-sm text-primary-foreground/80">{user.email}</p>}

          {profile?.bio && (
            <p className="mt-3 max-w-md whitespace-pre-line text-sm text-primary-foreground/90">
              {profile.bio}
            </p>
          )}

          {profile?.languages && profile.languages.length > 0 && (
            <ul className="mt-3 flex flex-wrap justify-center gap-2" aria-label="Talen">
              {profile.languages.map((langId: string) => {
                const lang = availableLanguages.find((l) => l.id === langId);
                return lang ? (
                  <li
                    key={langId}
                    className="inline-flex items-center gap-1 rounded-full bg-primary-foreground/15 px-3 py-1 text-xs font-medium"
                  >
                    <span aria-hidden="true">{lang.flag}</span>
                    {lang.label}
                  </li>
                ) : null;
              })}
            </ul>
          )}

          {!isEditing && (
            <Button
              onClick={() => setIsEditing(true)}
              className="mt-5 rounded-full bg-primary-foreground text-primary hover:bg-primary-foreground/90 active:bg-primary-foreground/90"
            >
              <Pencil className="h-4 w-4" />
              Profiel bewerken
            </Button>
          )}
        </div>
      </header>

      <main className="relative z-10 mx-auto -mt-10 max-w-2xl space-y-4 px-4">
        {isEditing && (
          <Card className="rounded-2xl border-0 shadow-card">
            <CardContent className="space-y-5 p-5">
              <h2 className="text-lg font-semibold">Profiel bewerken</h2>

              <div className="space-y-1.5">
                <Label htmlFor="username">Gebruikersnaam</Label>
                <Input
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Kies een gebruikersnaam"
                  aria-describedby="username-hint"
                  className="h-11 rounded-xl"
                />
                <p
                  id="username-hint"
                  className={cn(
                    "flex items-start gap-1.5 text-xs",
                    usernameLocked ? "text-warning" : "text-muted-foreground"
                  )}
                >
                  <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  {usernameLocked && nextUsernameChange
                    ? `Je kunt je gebruikersnaam weer wijzigen vanaf ${nextUsernameChange.toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" })}.`
                    : "Je kunt je gebruikersnaam één keer per 30 dagen wijzigen."}
                </p>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-baseline justify-between">
                  <Label htmlFor="bio">Bio</Label>
                  <span className="text-xs tabular-nums text-muted-foreground" aria-live="polite">
                    {bio.length}/{MAX_BIO}
                  </span>
                </div>
                <Textarea
                  id="bio"
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Vertel iets over jezelf"
                  maxLength={MAX_BIO}
                  rows={3}
                  className="rounded-xl"
                />
              </div>

              <fieldset>
                <legend className="mb-2 text-sm font-medium">Talen</legend>
                <div className="flex flex-wrap gap-2">
                  {availableLanguages.map((lang) => {
                    const selected = languages.includes(lang.id);
                    return (
                      <button
                        key={lang.id}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => toggleLanguage(lang.id)}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors motion-reduce:transition-none",
                          selected
                            ? "border-primary bg-primary-tint text-primary"
                            : "border-border bg-card text-foreground hover:bg-muted",
                          focusRing
                        )}
                      >
                        <span aria-hidden="true">{lang.flag}</span>
                        {lang.label}
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              <div className="flex gap-2">
                <Button variant="outline" onClick={cancelEditing} className="h-11 flex-1 rounded-xl">
                  Annuleren
                </Button>
                <Button onClick={handleSaveProfile} className="h-11 flex-1 rounded-xl">
                  Opslaan
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="rounded-2xl border-0 shadow-card">
          <CardContent className="p-5">
            <h2 className="mb-4 font-semibold">Statistieken</h2>
            <div
              className={cn(
                "grid gap-3",
                stats.length === 3 ? "grid-cols-3" : stats.length === 2 ? "grid-cols-2" : "grid-cols-1"
              )}
            >
              {stats.map(({ label, value, Icon }) => (
                <div key={label} className="rounded-xl bg-primary-tint p-3 text-center">
                  <Icon className="mx-auto mb-1.5 h-5 w-5 text-primary" aria-hidden="true" />
                  <div className="text-xl font-bold leading-tight tabular-nums text-foreground">
                    {value}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">{label}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <TrustedContactsCard />

        <SafetyPreferencesCard />

        <Card className="overflow-hidden rounded-2xl border-0 shadow-card">
          <ul className="divide-y divide-border">
            <li>
              <MenuRow
                Icon={Settings}
                title="Instellingen"
                subtitle="Beheer je voorkeuren"
                onClick={() => setShowSafetySettings(true)}
              />
            </li>
            <li>
              <MenuRow
                Icon={Info}
                title="Over SafeBuddy"
                subtitle="Wat de app doet en voor wie"
                onClick={() => setShowAbout(true)}
              />
            </li>
            <li>
              <MenuRow
                Icon={LogOut}
                title="Uitloggen"
                subtitle="Afmelden op dit apparaat"
                tone="destructive"
                onClick={() => setShowLogoutConfirm(true)}
              />
            </li>
          </ul>
        </Card>

        <SafetySettingsDialog
          open={showSafetySettings}
          onOpenChange={setShowSafetySettings}
        />
      </main>

      <Dialog open={showAbout} onOpenChange={setShowAbout}>
        <DialogContent className="rounded-2xl sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Over SafeBuddy</DialogTitle>
            <DialogDescription>
              SafeBuddy helpt je veiliger over straat. Je ziet waar anderen onveilige plekken
              hebben gemeld, plant een veiligere route en deelt je rit met mensen die je vertrouwt.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => setShowAbout(false)} className="rounded-xl">
              Sluiten
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showLogoutConfirm} onOpenChange={setShowLogoutConfirm}>
        <DialogContent className="rounded-2xl sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Uitloggen?</DialogTitle>
            <DialogDescription>
              Je moet opnieuw inloggen om meldingen te plaatsen of je rit te delen.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={() => setShowLogoutConfirm(false)}
              className="rounded-xl"
            >
              Annuleren
            </Button>
            <Button
              variant="destructive"
              onClick={() => void handleLogout()}
              className="rounded-xl"
            >
              <LogOut className="h-4 w-4" />
              Uitloggen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <BottomNav />
    </div>
  );
};

const MenuRow = ({
  Icon,
  title,
  subtitle,
  onClick,
  tone = "default",
}: {
  Icon: LucideIcon;
  title: string;
  subtitle: string;
  onClick: () => void;
  tone?: "default" | "destructive";
}) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      "flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-muted/60 motion-reduce:transition-none",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
    )}
  >
    <span
      aria-hidden="true"
      className={cn(
        "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
        tone === "destructive" ? "bg-destructive/10 text-destructive" : "bg-primary-tint text-primary"
      )}
    >
      <Icon className="h-5 w-5" />
    </span>
    <span className="min-w-0 flex-1">
      <span
        className={cn(
          "block font-semibold",
          tone === "destructive" ? "text-destructive" : "text-foreground"
        )}
      >
        {title}
      </span>
      <span className="block truncate text-xs text-muted-foreground">{subtitle}</span>
    </span>
    <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
  </button>
);

export default Profile;
