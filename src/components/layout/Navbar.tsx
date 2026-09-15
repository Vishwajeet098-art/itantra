import { Link, useLocation } from 'react-router-dom';
import { Activity, Radio, Mic2, Cpu, Globe, Users, ShieldAlert } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

const navLinks = [
  { name: 'Home', path: '/', icon: Globe },
  { name: 'Studio', path: '/studio', icon: Mic2 },
  { name: 'Live Room', path: '/room', icon: Users },
  { name: 'Sim Lab', path: '/lab', icon: Radio },
  { name: 'Technology', path: '/technology', icon: Cpu },
  { name: 'Impact', path: '/impact', icon: Activity },
];

export function Navbar() {
  const location = useLocation();

  return (
    <nav className="sticky top-0 z-50 w-full backdrop-blur-md bg-darker/80 border-b border-white/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex-shrink-0">
            <Link to="/" className="flex items-center gap-2">
              <Radio className="h-8 w-8 text-primary" />
              <span className="font-bold text-xl tracking-tight text-white">
                iTantra<span className="text-primary">.</span>
              </span>
            </Link>
          </div>
          
          <div className="hidden md:block">
            <div className="flex items-baseline space-x-1">
              {navLinks.map((link) => {
                const isActive = location.pathname === link.path;
                const Icon = link.icon;
                return (
                  <Link
                    key={link.name}
                    to={link.path}
                    className={cn(
                      'px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2',
                      isActive 
                        ? 'bg-white/10 text-white' 
                        : 'text-gray-300 hover:bg-white/5 hover:text-white'
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    {link.name}
                  </Link>
                );
              })}
            </div>
          </div>

          <div className="hidden md:flex items-center gap-3">
            <Link
              to="/sos"
              className={cn(
                'flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors border',
                location.pathname === '/sos'
                  ? 'bg-error text-white border-error'
                  : 'text-error border-error/30 hover:bg-error/10'
              )}
            >
              <ShieldAlert className="w-4 h-4" />
              SOS
            </Link>
            <Link
              to="/studio"
              className="bg-primary hover:bg-primary-hover text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-[0_0_15px_rgba(6,182,212,0.5)]"
            >
              Start Communication
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
}
