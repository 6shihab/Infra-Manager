import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Navbar } from './Navbar';

export function Layout() {
    return (
        <div className="flex h-screen bg-dark-bg text-gray-100 overflow-hidden selection:bg-brand-500/30">
            {/* Background ambient glow effect */}
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-brand-900/20 blur-[120px] pointer-events-none"></div>

            <Sidebar />

            <div className="flex-1 flex flex-col min-w-0 overflow-hidden z-10 relative">
                <Navbar />

                <main className="flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar">
                    <div className="mx-auto max-w-7xl animate-in fade-in duration-500">
                        <Outlet />
                    </div>
                </main>
            </div>
        </div>
    );
}
