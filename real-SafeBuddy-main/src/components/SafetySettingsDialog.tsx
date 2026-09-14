import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Bell, Globe } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";
import { useLanguage } from "@/i18n/LanguageContext";
import type { Language } from "@/i18n/translations";
import { useState } from "react";

interface SafetySettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SafetySettingsDialog = ({ open, onOpenChange }: SafetySettingsDialogProps) => {
  const { theme, toggleTheme } = useTheme();
  const { language, setLanguage, t } = useLanguage();
  const [showLanguageMenu, setShowLanguageMenu] = useState(false);

  const languages = [
    { id: "nl" as Language, label: "Nederlands", flag: "🇳🇱" },
    { id: "en" as Language, label: "English", flag: "🇬🇧" },
    { id: "fr" as Language, label: "Français", flag: "🇫🇷" }
  ];

  const currentLanguage = languages.find(l => l.id === language);

  if (showLanguageMenu) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("selectLanguage")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-4">
            {languages.map((lang) => (
              <Button
                key={lang.id}
                variant={language === lang.id ? "default" : "outline"}
                className="w-full justify-start h-12 text-base"
                onClick={() => {
                  setLanguage(lang.id);
                  setShowLanguageMenu(false);
                }}
              >
                <span className="mr-2 text-lg">{lang.flag}</span>
                {lang.label}
              </Button>
            ))}
            <Button
              variant="ghost"
              className="w-full mt-4"
              onClick={() => setShowLanguageMenu(false)}
            >
              {t("back")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("settingsTitle")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-6 py-4">
          
          {/* Notifications */}
          <div>
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
              <Bell className="h-4 w-4" /> {t("notifications")}
            </h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <Label className="text-base">{t("pushNotifications")}</Label>
                  <p className="text-sm text-muted-foreground">{t("receiveAlerts")}</p>
                </div>
                <Switch defaultChecked />
              </div>
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <Label className="text-base">{t("safetyAlerts")}</Label>
                  <p className="text-sm text-muted-foreground">{t("warningsArea")}</p>
                </div>
                <Switch defaultChecked />
              </div>
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <Label className="text-base">{t("communityUpdates")}</Label>
                  <p className="text-sm text-muted-foreground">{t("newReportsNearby")}</p>
                </div>
                <Switch />
              </div>
            </div>
          </div>
          
          <Separator />
          
          {/* App Preferences */}
          <div>
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
              <Globe className="h-4 w-4" /> {t("appPreferences")}
            </h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <Label className="text-base">{t("darkMode")}</Label>
                  <p className="text-sm text-muted-foreground">{t("useDarkTheme")}</p>
                </div>
                <Switch checked={theme === "dark"} onCheckedChange={toggleTheme} />
              </div>
              <Button
                variant="ghost"
                className="w-full justify-between h-auto p-0 hover:bg-transparent"
                onClick={() => setShowLanguageMenu(true)}
              >
                <div className="flex-1 text-left">
                  <Label className="text-base cursor-pointer">{t("language")}</Label>
                  <p className="text-sm text-muted-foreground">{currentLanguage?.flag} {currentLanguage?.label}</p>
                </div>
                <span className="text-muted-foreground">→</span>
              </Button>
            </div>
          </div>
          
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SafetySettingsDialog;
