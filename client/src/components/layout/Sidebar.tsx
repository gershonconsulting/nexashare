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
  { name: "Subscription", href: "/subscribe", icon: "fas fa-crown" },
  { name: "Settings", href: "/settings", icon: "fas fa-gear" }
];

export function Sidebar() {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  
  // Get user initials for avatar
  const getInitials = () => {
    if (!user?.fullName) return "U";
    
    const names = user.fullName.split(" ");
    if (names.length === 1) return names[0].charAt(0);
    return `${names[0].charAt(0)}${names[names.length - 1].charAt(0)}`;
  };
  
  return (
    <aside className="hidden lg:flex flex-col w-64 bg-white border-r border-neutral-200">
      <div className="p-6">
        <div className="flex items-center space-x-2">
          <div className="h-8 w-8 bg-primary rounded flex items-center justify-center">
            <i className="fas fa-share-nodes text-white text-lg"></i>
          </div>
          <h1 className="text-xl font-semibold text-neutral-900">Hexashare</h1>
        </div>
      </div>
      
      <nav className="flex-1 overflow-y-auto px-4 py-2">
        <ul>
          {navItems.map((item) => (
            <li key={item.name} className="mb-1">
              <Link 
                href={item.href}
                className={cn(
                  "flex items-center px-4 py-3 text-sm font-medium rounded-md",
                  location === item.href 
                    ? "bg-primary/10 text-primary" 
                    : "text-neutral-700 hover:bg-neutral-100"
                )}
              >
                <i className={cn(`${item.icon} w-5 h-5 mr-3`)}></i>
                {item.name}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      
      <div className="p-4 border-t border-neutral-200">
        <div className="flex items-center">
          <div className="h-10 w-10 rounded-full bg-neutral-200 flex items-center justify-center">
            <span className="text-neutral-700 font-medium">{getInitials()}</span>
          </div>
          <div className="ml-3">
            <p className="text-sm font-medium text-neutral-900">{user?.fullName || "User"}</p>
            <p className="text-xs text-neutral-500">{user?.company || ""}</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
