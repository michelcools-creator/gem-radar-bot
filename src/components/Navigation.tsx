import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Settings, BarChart3, Coins, Shield } from "lucide-react";

const Navigation = () => {
  const location = useLocation();
  
  const isActive = (path: string) => location.pathname === path;
  
  return (
    <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-50">
      <div className="container mx-auto px-4 py-3">
        <nav className="flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 font-bold text-xl">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-primary-glow flex items-center justify-center">
              <Coins className="w-5 h-5 text-primary-foreground" />
            </div>
            New-Coin Radar
          </Link>
          
          <div className="flex items-center gap-2">
            <Link to="/">
              <Button 
                variant={isActive("/") ? "default" : "ghost"} 
                size="sm"
                className="flex items-center gap-2"
              >
                <BarChart3 className="w-4 h-4" />
                Dashboard
              </Button>
            </Link>
            
            <Link to="/settings">
              <Button 
                variant={isActive("/settings") ? "default" : "ghost"} 
                size="sm"
                className="flex items-center gap-2"
              >
                <Settings className="w-4 h-4" />
                Settings
              </Button>
            </Link>
            
            <Link to="/admin">
              <Button 
                variant={isActive("/admin") ? "default" : "ghost"} 
                size="sm"
                className="flex items-center gap-2"
              >
                <Shield className="w-4 h-4" />
                Admin
              </Button>
            </Link>
          </div>
        </nav>
      </div>
    </header>
  );
};

export default Navigation;