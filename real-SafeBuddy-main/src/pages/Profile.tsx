import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { User } from "@supabase/supabase-js";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { User as UserIcon, Settings, Users, Shield, LogOut, Camera, Loader2 } from "lucide-react";
import { toast } from "sonner";
import BottomNav from "@/components/BottomNav";
import SafetySettingsDialog from "@/components/SafetySettingsDialog";

const Profile = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [nowTs, setNowTs] = useState<number>(Date.now());
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showSafetySettings, setShowSafetySettings] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState<string | null>(null);

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
      }

      // Fetch verification status
      const { data: verificationData } = await supabase
        .from("user_verifications")
        .select("verification_status")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (verificationData) {
        setVerificationStatus(verificationData.verification_status);
      }
      
      setLoading(false);
    };

    fetchProfile();
    const t = setInterval(() => setNowTs(Date.now()), 60_000);
    return () => clearInterval(t);
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

      setProfile({ ...profile, avatar_url: publicUrl });
      toast.success("Profile picture updated!");
    } catch (error: any) {
      console.error("Error uploading avatar:", error);
      toast.error(error.message || "Failed to upload profile picture");
    } finally {
      setUploading(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!user) return;

    try {
      const changedUsername = username.trim() !== (profile?.username || "");
      // Enforce 30-day cooldown client-side for better UX
      if (changedUsername && profile?.last_username_change) {
        const last = new Date(profile.last_username_change).getTime();
        const diffDays = (nowTs - last) / (1000 * 60 * 60 * 24);
        if (diffDays < 30) {
          const daysLeft = Math.ceil(30 - diffDays);
          toast.error(`You can change your username again in ${daysLeft} day(s).`);
          return;
        }
      }

      const { error } = await supabase
        .from("profiles")
        .update(changedUsername ? { username, bio, last_username_change: new Date().toISOString() } : { username, bio })
        .eq("id", user.id);

      if (error) throw error;

      setProfile({ ...profile, username, bio, last_username_change: changedUsername ? new Date().toISOString() : profile?.last_username_change });
      setIsEditing(false);
      toast.success("Profile updated!");
    } catch (error: any) {
      console.error("Error updating profile:", error);
      // If the DB trigger blocks the change, show a friendly message
      const msg = (error.message || "").toLowerCase().includes("30 days")
        ? "You can only change your username once every 30 days."
        : (error.message || "Failed to update profile");
      toast.error(msg);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
    toast.success("Logged out successfully");
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
                  <Label htmlFor="username" className="text-white">Username</Label>
                  <Input
                    id="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Enter username"
                    className="bg-white/20 border-white/30 text-white placeholder:text-white/60"
                  />
                  {profile?.last_username_change && (
                    <p className="text-xs text-white/80 mt-1">
                      Next change available on {new Date(new Date(profile.last_username_change).getTime() + 30*24*60*60*1000).toLocaleDateString()}
                    </p>
                  )}
                </div>
                <div>
                  <Label htmlFor="bio" className="text-white">Bio</Label>
                  <Textarea
                    id="bio"
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder="Tell us about yourself"
                    rows={3}
                    className="bg-white/20 border-white/30 text-white placeholder:text-white/60"
                  />
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleSaveProfile} className="flex-1 bg-white text-primary hover:bg-white/90">
                    Save Changes
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setIsEditing(false);
                      setUsername(profile?.username || "");
                      setBio(profile?.bio || "");
                    }}
                    className="flex-1 text-white hover:bg-white/10"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <h2 className="text-2xl font-bold text-white">{profile?.username || "User"}</h2>
                <p className="text-white/80 text-sm">{user?.email}</p>
                <p className="text-white/90">{profile?.bio || `Hello, I'm ${profile?.username || "User"}!`}</p>
                
                {/* Edit Profile Button */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsEditing(true)}
                  className="mt-2 text-white/90 hover:text-white hover:bg-white/10"
                >
                  ✏️ Edit Profile
                </Button>
                
                {verificationStatus && (
                    <div className={`flex items-center gap-2 rounded-full px-4 py-2 ${
                      verificationStatus === 'approved' 
                        ? 'bg-success/20' 
                        : verificationStatus === 'pending'
                        ? 'bg-warning/20'
                        : 'bg-destructive/20'
                    }`}>
                      <Shield className="h-4 w-4 text-white" />
                      <span className="text-white font-semibold">
                        {verificationStatus === 'approved' 
                          ? 'Verified' 
                          : verificationStatus === 'pending'
                          ? 'Pending Verification'
                          : 'Not Verified'}
                      </span>
                    </div>
                  )}
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
              <h3 className="font-semibold text-foreground">Statistics</h3>
              {!isEditing && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsEditing(true)}
                  className="text-primary hover:text-primary/80"
                >
                  Edit
                </Button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center">
                <div className="text-3xl font-bold text-primary mb-1">0</div>
                <div className="text-sm text-muted-foreground">Safe Routes</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-primary mb-1">0</div>
                <div className="text-sm text-muted-foreground">Reports</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Safety Preferences */}
        <Card className="shadow-card mb-6">
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center gap-2 mb-3">
              <Shield className="h-5 w-5 text-primary" />
              <h3 className="font-semibold text-foreground">Safety Preferences</h3>
            </div>
            
            <div className="flex items-center justify-between py-2">
              <div>
                <p className="font-medium text-foreground">Avoid dark streets</p>
                <p className="text-sm text-muted-foreground">Prioritize well-lit routes</p>
              </div>
              <input type="checkbox" className="w-5 h-5 accent-primary" />
            </div>
            
            <div className="flex items-center justify-between py-2">
              <div>
                <p className="font-medium text-foreground">Prefer busy areas</p>
                <p className="text-sm text-muted-foreground">Route through populated streets</p>
              </div>
              <input type="checkbox" className="w-5 h-5 accent-primary" />
            </div>
            
            <div className="flex items-center justify-between py-2">
              <div>
                <p className="font-medium text-foreground">Notifications</p>
                <p className="text-sm text-muted-foreground">Safety alerts and updates</p>
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
                <p className="font-semibold text-foreground">Settings</p>
                <p className="text-xs text-muted-foreground">Manage your preferences</p>
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
                <p className="font-semibold text-foreground">About SafeBuddy</p>
                <p className="text-xs text-muted-foreground">More information</p>
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
          <span className="font-semibold text-destructive">Log Out</span>
        </Button>

        {/* Small Ad Space */}
        <div className="mt-6">
          <div className="bg-muted/50 border border-border rounded-lg p-3 text-center">
            <span className="text-xs text-muted-foreground">Advertisement</span>
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
