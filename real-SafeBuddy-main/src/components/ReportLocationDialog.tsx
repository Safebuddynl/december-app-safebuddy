import { useState, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { MapPin, Locate } from "lucide-react";

interface ReportLocationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReportSubmitted?: () => void;
}

interface AddressSuggestion {
  display_name: string;
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
  const [locationAddress, setLocationAddress] = useState("");
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
    const formattedAddress = formatStreetAddress(suggestion);
    setLocationAddress(formattedAddress);
    setShowSuggestions(false);
  };

  const handleGetCurrentLocation = () => {
    if (navigator.geolocation) {
      toast.loading("Getting your location...");
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          try {
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
            toast.success("Location detected");
          } catch (error) {
            toast.dismiss();
            toast.error("Could not get address");
          }
        },
        () => {
          toast.dismiss();
          toast.error("Unable to get your location");
        }
      );
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!locationAddress || !reportType) {
      toast.error("Please fill in all required fields");
      return;
    }

    setIsSubmitting(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        toast.error("You must be logged in to submit a report");
        return;
      }

      const { error } = await supabase.from("safety_reports").insert({
        user_id: user.id,
        location_address: locationAddress,
        report_type: reportType,
        severity,
        time_of_day: timeOfDay,
        description,
      });

      if (error) throw error;

      toast.success("Safety report submitted successfully!");
      onReportSubmitted?.();
      
      setLocationAddress("");
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
            <DialogTitle className="text-primary-foreground">Report Location</DialogTitle>
          </div>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Street Address *</label>
            <div className="relative" ref={inputRef}>
              <div className="flex gap-2">
                <Input
                  placeholder="e.g., Kalverstraat 123, Amsterdam"
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
            <p className="text-xs text-muted-foreground">Enter the exact street name and number</p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Report Type *</label>
            <Select value={reportType} onValueChange={setReportType}>
              <SelectTrigger>
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Poor Lighting">Poor Lighting</SelectItem>
                <SelectItem value="Harassment">Harassment</SelectItem>
                <SelectItem value="Theft">Theft</SelectItem>
                <SelectItem value="Suspicious Activity">Suspicious Activity</SelectItem>
                <SelectItem value="Traffic Risk">Traffic Risk</SelectItem>
                <SelectItem value="Disturbance">Disturbance</SelectItem>
                <SelectItem value="Unsafe Area">Unsafe Area</SelectItem>
                <SelectItem value="Other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Severity</label>
            <Select value={severity} onValueChange={setSeverity}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Time of Day</label>
            <Select value={timeOfDay} onValueChange={setTimeOfDay}>
              <SelectTrigger>
                <SelectValue placeholder="Select time" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Morning">Morning (6am-12pm)</SelectItem>
                <SelectItem value="Afternoon">Afternoon (12pm-6pm)</SelectItem>
                <SelectItem value="Evening">Evening (6pm-10pm)</SelectItem>
                <SelectItem value="Night">Night (10pm-6am)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Description (Optional)</label>
            <Textarea
              placeholder="Share details to help others stay safe..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>

          <div className="flex gap-3">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting} className="flex-1 gradient-primary">
              {isSubmitting ? "Submitting..." : "Submit Report"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default ReportLocationDialog;
