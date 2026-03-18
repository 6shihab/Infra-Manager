import { useState } from 'react';
import { CopyButton } from './CopyButton';

interface SecretFieldProps {
    username?: string;
    password?: string;
    ssh_key?: string;
    label: string;
    isCustomField?: boolean;
    customValue?: string;
}

export function SecretField({ username, password, ssh_key, label, isCustomField = false, customValue = "" }: SecretFieldProps) {
    const [revealed, setRevealed] = useState(false);

    return (
        <div className={`mt-3 flex flex-wrap sm:flex-nowrap items-start gap-2 sm:gap-4 p-3 bg-black/20 rounded-lg ${isCustomField ? 'border-b border-white/5 last:border-0 last:pb-3 pb-3 mt-0 mb-1 rounded-none px-2' : 'border border-dark-border'}`}>
            <div className={`text-sm text-gray-500 mt-1 flex items-center gap-2 ${isCustomField ? 'w-1/3 break-words' : 'w-auto sm:w-24 flex-shrink-0'}`}>
                {label}
                {isCustomField && revealed && <CopyButton text={customValue} />}
            </div>
            <div className="flex-1 min-w-0">
                {revealed ? (
                    <div className="space-y-2 animate-in fade-in">
                        {isCustomField ? (
                            <div className="text-sm text-white font-mono break-all">{customValue}</div>
                        ) : (
                            <>
                                {username && (
                                    <div className="flex flex-wrap items-center gap-2 text-sm text-white group">
                                        <span className="text-gray-400">User:</span> <span className="break-all">{username}</span>
                                        <CopyButton text={username} className="md:opacity-0 md:group-hover:opacity-100" />
                                    </div>
                                )}
                                {password && (
                                    <div className="flex flex-wrap items-center gap-2 text-sm text-white font-mono break-all group">
                                        <span className="text-gray-400 font-sans">Pass:</span> {password}
                                        <CopyButton text={password} className="md:opacity-0 md:group-hover:opacity-100" />
                                    </div>
                                )}
                                {ssh_key && (
                                    <div className="relative group mt-1">
                                        <div className="text-xs text-gray-500 italic break-all font-mono pr-8">{ssh_key}</div>
                                        <div className="absolute top-0 right-0 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                                            <CopyButton text={ssh_key} />
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                ) : (
                    <div className="text-sm text-gray-500 font-mono tracking-widest mt-1 opacity-50">
                        ••••••••••••••••
                    </div>
                )}
            </div>
            <button
                onClick={() => setRevealed(!revealed)}
                className="text-xs bg-brand-500/10 hover:bg-brand-500/20 text-brand-400 px-3 py-1.5 rounded transition-colors flex items-center justify-center flex-shrink-0"
            >
                {revealed ? 'Hide' : 'Reveal'}
            </button>
        </div>
    );
}
