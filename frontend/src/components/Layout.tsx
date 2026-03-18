import { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Navbar } from './Navbar';
import { OfflineBanner } from './OfflineBanner';

export function Layout() {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const location = useLocation();

    // Auto-close sidebar on route change (mobile)
    useEffect(() => {
        setSidebarOpen(false);
    }, [location.pathname]);

    return (
        <div className="flex h-screen bg-dark-bg text-gray-100 overflow-hidden selection:bg-brand-500/30">
            {/* Background ambient glow effect */}
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-brand-900/20 blur-[120px] pointer-events-none"></div>

            <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

            {/* Mobile backdrop */}
            {sidebarOpen && (
                <div
                    className="fixed inset-0 bg-black/50 backdrop-blur-sm z-30 md:hidden"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            <div className="flex-1 flex flex-col min-w-0 overflow-hidden z-10 relative">
                <Navbar onMenuToggle={() => setSidebarOpen(prev => !prev)} />
                <OfflineBanner />

                <main className="flex-1 overflow-y-auto p-3 sm:p-6 md:p-8 custom-scrollbar">
                    <div className="mx-auto max-w-7xl animate-in fade-in duration-500">
                        <Outlet />
                    </div>
                </main>
            </div>
        </div>
    );
}
