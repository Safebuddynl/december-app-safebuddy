import { useState, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLanguage } from "@/i18n/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { MapPin, Locate } from "lucide-react";

interface ReportLocationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReportSubmitted?: () => void;
}

/** One result from the Nominatim search API. */
interface AddressSuggestion {
  display_name: string;
  lat: string;
  lon: string;
  address?: {
    road?: string;
    house_number?: string;
    city?: string;
    town?: string;
    village?: string;
    postcode?: string;
  };
}

const ReportLocationDialog = ({ open, onOpenChange, onReportSubmitted }: ReportLocationDialogProps) => {
  const { t } = useLanguage();
  const [locationAddress, setLocationAddress] = useState("");
  const [coordinates, setCoordinates] = useState<{ lat: number; lon: number } | null>(null);
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [reportType, setReportType] = useState("");
  const [severity, setSeverity] = useState("medium");
  const [timeOfDay, setTimeOfDay] = useState("");
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef<HTMLDivElement>(null);

  // Click outside to close suggestions
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (inputRef.current && !inputRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Search for address suggestions
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (locationAddress.length > 2) {
        try {
          const response = await fetch(
            `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(locationAddress + ", Netherlands")}&format=json&limit=5&addressdetails=1`
          );
          const data = await response.json();
          if (data && data.length > 0) {
            setSuggestions(data);
            setShowSuggestions(true);
          }
        } catch (error) {
          console.error("Search failed:", error);
        }
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [locationAddress]);

  const formatStreetAddress = (suggestion: AddressSuggestion): string => {
    const addr = suggestion.address;
    if (!addr) return suggestion.display_name;
    
    const parts: string[] = [];
    if (addr.road) {
      let street = addr.road;
      if (addr.house_number) street += ` ${addr.house_number}`;
      parts.push(street);
    }
    if (addr.city || addr.town || addr.village) {
      parts.push(addr.city || addr.town || addr.village || "");
    }
    
    return parts.length > 0 ? parts.join(", ") : suggestion.display_name;
  };

  const selectSuggestion = (suggestion: AddressSuggestion) => {
    setLocationAddress(formatStreetAddress(suggestion));
    // Stored so the report can be written as a PostGIS point.
    setCoordinates({ lat: Number(suggestion.lat), lon: Number(suggestion.lon) });
    setShowSuggestions(false);
  };

  const handleGetCurrentLocation = async () => {
    // Check HTTPS
    const isSecure = window.location.protocol === 'https:' || window.location.hostname === 'localhost';
    if (!isSecure) {
      toast.error("HTTPS is vereist voor locatie");
      return;
    }

    // Check if geolocation is supported
    if (!navigator.geolocation) {
      toast.error("Geolocation wordt niet ondersteund door je browser");
      return;
    }

    toast.loading("Locatie ophalen...");
    
    // Skip permissions API on iOS
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    
    if (!isIOS && navigator.permissions) {
      try {
        const permission = await navigator.permissions.query({ name: 'geolocation' });
        if (permission.state === 'denied') {
          toast.dismiss();
          toast.error("Locatie toegang is geblokkeerd. Ga naar je browser instellingen.");
          return;
        }
      } catch {
        // Continue anyway
      }
    }
    
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          // Sla coördinaten direct op
          setCoordinates({ 
            lat: position.coords.latitude, 
            lon: position.coords.longitude 
          });
          
          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${position.coords.latitude}&lon=${position.coords.longitude}&format=json&addressdetails=1`
          );
          const data = await response.json();
          if (data && data.address) {
            const addr = data.address;
            let streetAddress = "";
            if (addr.road) {
              streetAddress = addr.road;
              if (addr.house_number) streetAddress += ` ${addr.house_number}`;
            }
            if (addr.city || addr.town || addr.village) {
              streetAddress += streetAddress ? `, ${addr.city || addr.town || addr.village}` : (addr.city || addr.town || addr.village);
            }
            setLocationAddress(streetAddress || data.display_name);
          }
          toast.dismiss();
          toast.success("Locatie gevonden");
        } catch (error) {
          console.error("Reverse geocoding failed:", error);
          toast.dismiss();
          toast.error("Kon adres niet ophalen");
        }
      },
      (error) => {
        toast.dismiss();
        switch (error.code) {
          case error.PERMISSION_DENIED:
            toast.error("Locatie toegang geweigerd. Sta locatie toe in je browser/telefoon instellingen.");
            break;
          case error.POSITION_UNAVAILABLE:
            toast.error("Locatie niet beschikbaar. Zet GPS aan.");
            break;
          case error.TIMEOUT:
            toast.error("Locatie ophalen duurde te lang. Probeer opnieuw.");
            break;
          default:
            toast.error("Kon locatie niet ophalen");
        }
      },
      {
        enableHighAccuracy: false,
        timeout: 30000,
        maximumAge: 60000
      }
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!locationAddress || !reportType) {
      toast.error("Please fill in all required fields");
      return;
    }

    if (!coordinates) {
      toast.error("Please select a location from the suggestions or use current location");
      return;
    }

    setIsSubmitting(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        toast.error("You must be logged in to submit a report");
        return;
      }

      // PostGIS verwacht POINT(longitude latitude) format
      const locationString = `POINT(${coordinates.lon} ${coordinates.lat})`;

      const { error } = await supabase.from("safety_reports").insert({
        user_id: user.id,
        location_address: locationAddress,
        location: locationString,
        report_type: reportType,
        severity,
        time_of_day: timeOfDay,
        description,
      });

      if (error) throw error;

      toast.success("Safety report submitted successfully!");
      onReportSubmitted?.();
      
      // Emit event so Profile can update report count
      window.dispatchEvent(new Event('reportSubmitted'));
      
      setLocationAddress("");
      setCoordinates(null);
      setReportType("");
      setSeverity("medium");
      setTimeOfDay("");
      setDescription("");
      onOpenChange(false);
    } catch (error) {
      console.error("Error submitting report:", error);
      toast.error("Failed to submit report");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="bg-gradient-to-r from-primary to-primary-light p-4 -m-6 mb-4 rounded-t-lg">
          <div className="flex items-center gap-2 text-primary-foreground">
            <MapPin className="h-5 w-5" />
            <DialogTitle className="text-primary-foreground">{t("reportLocation")}</DialogTitle>
          </div>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">{t("streetAddress")} *</label>
            <div className="relative" ref={inputRef}>
              <div className="flex gap-2">
                <Input
                  placeholder={t("enterStreetAddress")}
                  value={locationAddress}
                  onChange={(e) => setLocationAddress(e.target.value)}
                  onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                  required
                  className="flex-1"
                />
                <Button type="button" size="sm" variant="outline" onClick={handleGetCurrentLocation} className="flex-shrink-0">
                  <Locate className="h-4 w-4" />
                </Button>
              </div>
              
              {showSuggestions && suggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-background border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto z-50">
                  {suggestions.map((suggestion, index) => (
                    <button
                      key={index}
                      type="button"
                      onClick={() => selectSuggestion(suggestion)}
                      className="w-full text-left px-3 py-2 hover:bg-muted text-sm transition-colors border-b border-border last:border-0"
                    >
                      <span className="font-medium">{formatStreetAddress(suggestion)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{t("enterExactStreetName")}</p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">{t("reportType")} *</label>
            <Select value={reportType} onValueChange={setReportType}>
              <SelectTrigger>
                <SelectValue placeholder={t("selectType")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Poor Lighting">{t("poorLighting")}</SelectItem>
                <SelectItem value="Harassment">{t("harassment")}</SelectItem>
                <SelectItem value="Theft">{t("theft")}</SelectItem>
                <SelectItem value="Suspicious Activity">{t("suspiciousActivity")}</SelectItem>
                <SelectItem value="Traffic Risk">{t("trafficRisk")}</SelectItem>
                <SelectItem value="Disturbance">{t("disturbance")}</SelectItem>
                <SelectItem value="Unsafe Area">{t("unsafeArea")}</SelectItem>
                <SelectItem value="Other">{t("other")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">{t("severity")}</label>
            <Select value={severity} onValueChange={setSeverity}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">{t("lowRisk")}</SelectItem>
                <SelectItem value="medium">{t("mediumRisk")}</SelectItem>
                <SelectItem value="high">{t("highRisk")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">{t("timeOfDay")}</label>
            <Select value={timeOfDay} onValueChange={setTimeOfDay}>
              <SelectTrigger>
                <SelectValue placeholder={t("selectTime")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Morning">{t("morning")}</SelectItem>
                <SelectItem value="Afternoon">{t("afternoon")}</SelectItem>
                <SelectItem value="Evening">{t("evening")}</SelectItem>
                <SelectItem value="Night">{t("night")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">{t("descriptionOptional")}</label>
            <Textarea
              placeholder={t("shareDetails")}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>

          <div className="flex gap-3">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={isSubmitting} className="flex-1 gradient-primary">
              {isSubmitting ? t("submitting") : t("submitReport")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default ReportLocationDialog;
