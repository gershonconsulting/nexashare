import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { 
  LayoutDashboard, 
  Settings, 
  Users, 
  CreditCard, 
  FileText, 
  LogOut,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Building2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';

interface SidebarProps {
  user?: {
    fullName: string;
    email: string;
    profilePicture?: string;
    subscriptionTier?: string;
  };
}

export function Sidebar({ user }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [location] = useLocation();
  const { toast } = useToast();

  const handleLogout = async () => {
    try {
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
      });

      if (response.ok) {
        window.location.href = '/';
      } else {
        toast({
          title: 'Error',
          description: 'Failed to logout',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to logout',
        variant: 'destructive',
      });
    }
  };

  const menuItems = [
    {
      label: 'Dashboard',
      icon: LayoutDashboard,
      path: '/dashboard',
      badge: null
    },
    {
      label: 'Companies',
      icon: Building2,
      path: '/companies',
      badge: null
    },
    {
      label: 'AI Features',
      icon: Sparkles,
      path: '/ai-features',
      badge: user?.subscriptionTier === 'starter' ? 'Pro' : null,
      badgeVariant: 'default' as const
    },
    {
      label: 'Reports',
      icon: FileText,
      path: '/reports',
      badge: null
    },
    {
      label: 'Billing',
      icon: CreditCard,
      path: '/billing',
      badge: null
    },
    {
      label: 'Refer Friends',
      icon: Users,
      path: '/refer',
      badge: '💰',
      badgeVariant: 'secondary' as const
    },
    {
      label: 'Settings',
      icon: Settings,
      path: '/settings',
      badge: null
    }
  ];

  const isActive = (path: string) => location === path;

  const getPlanBadge = () => {
    const tier = user?.subscriptionTier || 'starter';
    const colors = {
      starter: 'bg-gray-100 text-gray-700',
      pro: 'bg-purple-100 text-purple-700',
      elite: 'bg-yellow-100 text-yellow-700'
    };
    const labels = {
      starter: 'Free',
      pro: 'Pro',
      elite: 'Elite'
    };
    return { color: colors[tier as keyof typeof colors], label: labels[tier as keyof typeof labels] };
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <div 
      className={`
        fixed left-0 top-0 h-screen bg-white border-r border-gray-200 
        flex flex-col transition-all duration-300 ease-in-out z-50
        ${collapsed ? 'w-20' : 'w-64'}
      `}
    >
      {/* Logo & Toggle */}
      <div className="p-4 flex items-center justify-between">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-purple-600 to-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">NS</span>
            </div>
            <span className="font-bold text-lg bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
              NexaShare
            </span>
          </div>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCollapsed(!collapsed)}
          className="ml-auto"
        >
          {collapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <ChevronLeft className="w-4 h-4" />
          )}
        </Button>
      </div>

      <Separator />

      {/* User Profile */}
      <div className={`p-4 ${collapsed ? 'flex justify-center' : ''}`}>
        {collapsed ? (
          <Avatar className="w-10 h-10">
            <AvatarImage src={user?.profilePicture} />
            <AvatarFallback className="bg-gradient-to-br from-purple-600 to-blue-600 text-white">
              {user ? getInitials(user.fullName) : 'U'}
            </AvatarFallback>
          </Avatar>
        ) : (
          <div className="flex items-center gap-3">
            <Avatar className="w-10 h-10">
              <AvatarImage src={user?.profilePicture} />
              <AvatarFallback className="bg-gradient-to-br from-purple-600 to-blue-600 text-white">
                {user ? getInitials(user.fullName) : 'U'}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">
                {user?.fullName || 'User'}
              </p>
              <div className="flex items-center gap-2">
                <Badge 
                  variant="secondary" 
                  className={`text-xs ${getPlanBadge().color}`}
                >
                  {getPlanBadge().label}
                </Badge>
              </div>
            </div>
          </div>
        )}
      </div>

      <Separator />

      {/* Navigation Menu */}
      <nav className="flex-1 overflow-y-auto p-4 space-y-1">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.path);

          return (
            <Link key={item.path} href={item.path}>
              <div
                className={`
                  flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer
                  transition-all duration-200
                  ${active 
                    ? 'bg-gradient-to-r from-purple-600 to-blue-600 text-white shadow-lg' 
                    : 'text-gray-700 hover:bg-gray-100'
                  }
                  ${collapsed ? 'justify-center' : ''}
                `}
              >
                <Icon className={`w-5 h-5 flex-shrink-0 ${active ? 'text-white' : ''}`} />
                {!collapsed && (
                  <>
                    <span className="flex-1 font-medium">{item.label}</span>
                    {item.badge && (
                      <Badge 
                        variant={item.badgeVariant || 'default'}
                        className={`text-xs ${active ? 'bg-white/20 text-white' : ''}`}
                      >
                        {item.badge}
                      </Badge>
                    )}
                  </>
                )}
              </div>
            </Link>
          );
        })}
      </nav>

      <Separator />

      {/* Logout Button */}
      <div className="p-4">
        <Button
          variant="ghost"
          className={`w-full justify-start text-red-600 hover:text-red-700 hover:bg-red-50 ${
            collapsed ? 'justify-center px-2' : ''
          }`}
          onClick={handleLogout}
        >
          <LogOut className="w-5 h-5" />
          {!collapsed && <span className="ml-3">Logout</span>}
        </Button>
      </div>

      {/* Upgrade CTA (if free plan) */}
      {!collapsed && user?.subscriptionTier === 'starter' && (
        <>
          <Separator />
          <div className="p-4">
            <div className="bg-gradient-to-br from-purple-600 to-blue-600 rounded-lg p-4 text-white">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="w-5 h-5" />
                <span className="font-semibold">Upgrade to Pro</span>
              </div>
              <p className="text-xs text-white/90 mb-3">
                Unlock AI features, auto-repost, and 10 company pages
              </p>
              <Link href="/pricing">
                <Button 
                  size="sm" 
                  className="w-full bg-white text-purple-600 hover:bg-gray-100"
                >
                  View Plans
                </Button>
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
