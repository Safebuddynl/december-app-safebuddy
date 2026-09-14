import { Map, MessageSquare, User } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/i18n/LanguageContext";

const BottomNav = () => {
  const location = useLocation();
  const { t } = useLanguage();
  
  const navItems = [
    { path: "/", icon: Map, label: t("home") },
    { path: "/community", icon: MessageSquare, label: t("community") },
    { path: "/profile", icon: User, label: t("profile") },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur-md border-t border-border z-[9999] pb-safe">
      <div className="max-w-screen-xl mx-auto px-4">
        <div className="flex justify-around items-center h-16">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            
            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 min-w-[60px] py-2 px-3 rounded-lg transition-all duration-200 ease-in-out active:scale-95 touch-manipulation select-none",
                  isActive 
                    ? "text-primary bg-accent shadow-[0_0_15px_hsl(273_62%_68%_/_0.3)]" 
                    : "text-muted-foreground hover:text-primary hover:bg-accent/50"
                )}
              >
                <Icon className={cn("h-5 w-5 transition-all duration-200", isActive && "stroke-[2.5px] scale-110")} />
                <span className="text-xs font-medium">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
};

export default BottomNav;