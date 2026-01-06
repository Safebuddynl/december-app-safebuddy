import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Bell, Globe } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";

interface SafetySettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SafetySettingsDialog = ({ open, onOpenChange }: SafetySettingsDialogProps) => {
  const { theme, toggleTheme } = useTheme();
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>
        <div className="space-y-6 py-4">
          
          {/* Notifications */}
          <div>
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
              <Bell className="h-4 w-4" /> Notifications
            </h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <Label className="text-base">Push Notifications</Label>
                  <p className="text-sm text-muted-foreground">Receive alerts on your device</p>
                </div>
                <Switch defaultChecked />
              </div>
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <Label className="text-base">Safety Alerts</Label>
                  <p className="text-sm text-muted-foreground">Warnings for your area</p>
                </div>
                <Switch defaultChecked />
              </div>
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <Label className="text-base">Community Updates</Label>
                  <p className="text-sm text-muted-foreground">New reports nearby</p>
                </div>
                <Switch />
              </div>
            </div>
          </div>
          
          <Separator />
          
          {/* App Preferences */}
          <div>
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-2">
              <Globe className="h-4 w-4" /> App Preferences
            </h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <Label className="text-base">Dark Mode</Label>
                  <p className="text-sm text-muted-foreground">Use dark theme</p>
                </div>
                <Switch checked={theme === "dark"} onCheckedChange={toggleTheme} />
              </div>
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <Label className="text-base">Language</Label>
                  <p className="text-sm text-muted-foreground">English</p>
                </div>
                <span className="text-muted-foreground">→</span>
              </div>
            </div>
          </div>
          
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SafetySettingsDialog;
