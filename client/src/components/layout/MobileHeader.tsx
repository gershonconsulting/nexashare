import { Button } from "@/components/ui/button";
import { useState } from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";

interface NavItem {
  name: string;
  href: string;
  icon: string;
}

const navItems: NavItem[] = [
  { name: "Dashboard", href: "/", icon: "fas fa-chart-line" },
  { name: "Campaigns", href: "/campaigns", icon: "fas fa-bullhorn" },
  { name: "Influencers", href: "/influencers", icon: "fas fa-user-group" },
  { name: "Content", href: "/content", icon: "fas fa-share-from-square" },
  { name: "Analytics", href: "/analytics", icon: "fas fa-chart-simple" },
  { name: "Settings", href: "/settings", icon: "fas fa-gear" }
];

export function MobileHeader() {
  const [location] = useLocation();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  
  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };
  
  return (
    <div className="lg:hidden fixed top-0 left-0 right-0 bg-white border-b border-neutral-200 z-10">
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center space-x-2">
          <div className="h-8 w-8 bg-primary rounded flex items-center justify-center">
            <i className="fas fa-share-nodes text-white text-lg"></i>
          </div>
          <h1 className="text-xl font-semibold text-neutral-900">NexaShare</h1>
        </div>
        <Button 
          variant="ghost" 
          className="text-neutral-500 hover:text-neutral-700" 
          onClick={toggleMenu}
        >
          <i className="fas fa-bars text-xl"></i>
        </Button>
      </div>
      
      {isMenuOpen && (
        <div className="px-4 py-2 bg-white border-b border-neutral-200">
          <nav>
            <ul>
              {navItems.map((item) => (
                <li key={item.name} className="mb-1">
                  <Link href={item.href}>
                    <a
                      className={cn(
                        "flex items-center px-4 py-3 text-sm font-medium rounded-md",
                        location === item.href 
                          ? "bg-primary/10 text-primary" 
                          : "text-neutral-700 hover:bg-neutral-100"
                      )}
                      onClick={() => setIsMenuOpen(false)}
                    >
                      <i className={cn(`${item.icon} w-5 h-5 mr-3`)}></i>
                      {item.name}
                    </a>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      )}
    </div>
  );
}
