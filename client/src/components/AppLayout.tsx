import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useUser } from '@/hooks/use-user';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  LayoutDashboard,
  Settings,
  Users,
  CreditCard,
  FileText,
  LogOut,
  Menu,
  X,
  Sparkles
} from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: LayoutProps) {
  const [location] = useLocation();
  const { user, logout } = useUser();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navigation = [
    {
      name: 'Dashboard',
      href: '/dashboard',
      icon: LayoutDashboard,
      badge: null
    },
    {
      name: 'Settings',
      href: '/settings',
      icon: Settings,
      badge: null
    },
    {
      name: 'Refer Friends',
      href: '/refer',
      icon: Users,
      badge: user?.referralCount > 0 ? user.referralCount : null
    },
    {
      name: 'Billing',
      href: '/billing',
      icon: CreditCard,
      badge: user?.subscriptionTier === 'starter' ? 'Free' : null
    },
    {
      name: 'Reports',
      href: '/reports',
      icon: FileText,
      badge: null
    }
  ];

  const handleLogout = async () => {
    await logout();
    window.location.href = '/';
  };

  const isActive = (href: string) => {
    if (href === '/dashboard') {
      return location === '/' || location === '/dashboard';
    }
    return location === href;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sidebar for desktop */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-64 lg:flex-col">
        <div className="flex flex-col flex-grow bg-gradient-to-b from-purple-700 to-blue-800 overflow-y-auto">
          {/* Logo */}
          <div className="flex items-center flex-shrink-0 px-6 py-6">
            <div className="flex items-center gap-2">
              <Sparkles className="w-8 h-8 text-white" />
              <span className="text-2xl font-bold text-white">NexaShare</span>
            </div>
          </div>

          {/* User Profile */}
          <div className="px-6 pb-6">
            <div className="flex items-center gap-3 p-3 bg-white/10 rounded-lg backdrop-blur">
              <Avatar>
                <AvatarImage src={user?.profilePicture || ''} />
                <AvatarFallback className="bg-purple-500 text-white">
                  {user?.fullName?.charAt(0) || 'U'}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">
                  {user?.fullName || 'User'}
                </p>
                <p className="text-xs text-purple-200 truncate">
                  {user?.email || ''}
                </p>
              </div>
            </div>

            {/* Plan Badge */}
            {user?.subscriptionTier && (
              <div className="mt-3 flex items-center justify-between px-3 py-2 bg-white/10 rounded-lg">
                <span className="text-xs text-purple-200">Current Plan</span>
                <Badge className={`
                  ${user.subscriptionTier === 'elite' ? 'bg-yellow-500 text-yellow-900' : ''}
                  ${user.subscriptionTier === 'pro' ? 'bg-purple-500 text-white' : ''}
                  ${user.subscriptionTier === 'starter' ? 'bg-gray-500 text-white' : ''}
                `}>
                  {user.subscriptionTier.charAt(0).toUpperCase() + user.subscriptionTier.slice(1)}
                </Badge>
              </div>
            )}
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-4 space-y-1">
            {navigation.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href);
              
              return (
                <Link key={item.name} href={item.href}>
                  <a
                    className={`
                      group flex items-center px-3 py-3 text-sm font-medium rounded-lg transition-all
                      ${active 
                        ? 'bg-white/20 text-white shadow-lg' 
                        : 'text-purple-100 hover:bg-white/10 hover:text-white'
                      }
                    `}
                  >
                    <Icon className={`mr-3 h-5 w-5 flex-shrink-0 ${
                      active ? 'text-white' : 'text-purple-200 group-hover:text-white'
                    }`} />
                    <span className="flex-1">{item.name}</span>
                    {item.badge && (
                      <Badge variant="secondary" className="ml-auto">
                        {item.badge}
                      </Badge>
                    )}
                  </a>
                </Link>
              );
            })}
          </nav>

          {/* Logout Button */}
          <div className="px-4 pb-6">
            <Button
              onClick={handleLogout}
              variant="ghost"
              className="w-full justify-start text-purple-100 hover:bg-white/10 hover:text-white"
            >
              <LogOut className="mr-3 h-5 w-5" />
              Logout
            </Button>
          </div>
        </div>
      </div>

      {/* Mobile menu button */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-white shadow-sm">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-purple-600" />
            <span className="text-xl font-bold text-gray-900">NexaShare</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </Button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-50 bg-gray-900/80" onClick={() => setMobileMenuOpen(false)}>
          <div className="fixed inset-y-0 left-0 w-full max-w-xs bg-gradient-to-b from-purple-700 to-blue-800" onClick={(e) => e.stopPropagation()}>
            <div className="flex flex-col h-full">
              {/* Mobile Header */}
              <div className="flex items-center justify-between px-6 py-6">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-8 h-8 text-white" />
                  <span className="text-2xl font-bold text-white">NexaShare</span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-white"
                >
                  <X className="h-6 w-6" />
                </Button>
              </div>

              {/* User Profile */}
              <div className="px-6 pb-6">
                <div className="flex items-center gap-3 p-3 bg-white/10 rounded-lg">
                  <Avatar>
                    <AvatarImage src={user?.profilePicture || ''} />
                    <AvatarFallback className="bg-purple-500 text-white">
                      {user?.fullName?.charAt(0) || 'U'}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">
                      {user?.fullName || 'User'}
                    </p>
                    <p className="text-xs text-purple-200 truncate">
                      {user?.email || ''}
                    </p>
                  </div>
                </div>

                {/* Plan Badge */}
                {user?.subscriptionTier && (
                  <div className="mt-3 flex items-center justify-between px-3 py-2 bg-white/10 rounded-lg">
                    <span className="text-xs text-purple-200">Current Plan</span>
                    <Badge className={`
                      ${user.subscriptionTier === 'elite' ? 'bg-yellow-500 text-yellow-900' : ''}
                      ${user.subscriptionTier === 'pro' ? 'bg-purple-500 text-white' : ''}
                      ${user.subscriptionTier === 'starter' ? 'bg-gray-500 text-white' : ''}
                    `}>
                      {user.subscriptionTier.charAt(0).toUpperCase() + user.subscriptionTier.slice(1)}
                    </Badge>
                  </div>
                )}
              </div>

              {/* Mobile Navigation */}
              <nav className="flex-1 px-4 space-y-1">
                {navigation.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item.href);
                  
                  return (
                    <Link key={item.name} href={item.href}>
                      <a
                        onClick={() => setMobileMenuOpen(false)}
                        className={`
                          group flex items-center px-3 py-3 text-sm font-medium rounded-lg
                          ${active 
                            ? 'bg-white/20 text-white shadow-lg' 
                            : 'text-purple-100 hover:bg-white/10 hover:text-white'
                          }
                        `}
                      >
                        <Icon className={`mr-3 h-5 w-5 flex-shrink-0 ${
                          active ? 'text-white' : 'text-purple-200 group-hover:text-white'
                        }`} />
                        <span className="flex-1">{item.name}</span>
                        {item.badge && (
                          <Badge variant="secondary" className="ml-auto">
                            {item.badge}
                          </Badge>
                        )}
                      </a>
                    </Link>
                  );
                })}
              </nav>

              {/* Mobile Logout Button */}
              <div className="px-4 pb-6">
                <Button
                  onClick={handleLogout}
                  variant="ghost"
                  className="w-full justify-start text-purple-100 hover:bg-white/10 hover:text-white"
                >
                  <LogOut className="mr-3 h-5 w-5" />
                  Logout
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="lg:pl-64 flex flex-col min-h-screen">
        <main className="flex-1 pt-16 lg:pt-0">
          <div className="py-6 px-4 sm:px-6 lg:px-8">
            {children}
          </div>
        </main>

        {/* Footer */}
        <footer className="bg-white border-t border-gray-200 py-4 px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between text-sm text-gray-500">
            <p>&copy; 2026 NexaShare. All rights reserved.</p>
            <div className="flex gap-6">
              <a href="/privacy" className="hover:text-gray-700">Privacy</a>
              <a href="/terms" className="hover:text-gray-700">Terms</a>
              <a href="/help" className="hover:text-gray-700">Help</a>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
