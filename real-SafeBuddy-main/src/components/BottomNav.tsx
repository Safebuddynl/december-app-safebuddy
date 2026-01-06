import { Map, MessageSquare, User } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";

const BottomNav = () => {
  const location = useLocation();
  
  const navItems = [
    { path: "/", icon: Map, label: "Route" },
    { path: "/community", icon: MessageSquare, label: "Reports" },
    { path: "/profile", icon: User, label: "Profile" },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-background border-t border-border z-50">
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
                  "flex flex-col items-center justify-center gap-1 min-w-[60px] py-2 px-3 rounded-lg transition-all duration-200 ease-in-out active:scale-95",
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