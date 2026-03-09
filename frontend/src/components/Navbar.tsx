import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { NotificationDropdown } from './NotificationDropdown';

export function Navbar() {
    const [searchQuery, setSearchQuery] = useState('');
    const navigate = useNavigate();

    const handleSearch = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' && searchQuery.trim() !== '') {
            navigate(`/projects?q=${encodeURIComponent(searchQuery.trim())}`);
            setSearchQuery(''); // Clear the navbar search after routing
        }
    };

    return (
        <header className="h-16 border-b border-dark-border bg-dark-card/50 backdrop-blur-md flex items-center justify-between px-6 sticky top-0 z-10">
            <div className="flex-1 flex items-center">
                <div className="relative w-full max-w-md hidden md:block">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Search className="h-4 w-4 text-gray-500" />
                    </div>
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onKeyDown={handleSearch}
                        className="block w-full pl-10 pr-3 py-2 border border-dark-border rounded-lg leading-5 bg-black/20 text-gray-300 placeholder-gray-500 focus:outline-none focus:bg-dark-card focus:border-brand-500 focus:ring-1 focus:ring-brand-500 sm:text-sm transition-all duration-200"
                        placeholder="Search projects, servers, databases..."
                    />
                </div>
            </div>

            <div className="ml-4 flex items-center md:ml-6 gap-4">
                <NotificationDropdown />
            </div>
        </header>
    );
}
