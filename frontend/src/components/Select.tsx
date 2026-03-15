import { Listbox, ListboxButton, ListboxOptions, ListboxOption } from '@headlessui/react';
import { ChevronDown, Check } from 'lucide-react';
import clsx from 'clsx';

export interface SelectOption {
    value: string;
    label: string;
}

interface SelectProps {
    value: string;
    onChange: (value: string) => void;
    options: SelectOption[];
    placeholder?: string;
    disabled?: boolean;
    className?: string;
    size?: 'default' | 'sm';
}

export function Select({ value, onChange, options, placeholder = 'Select...', disabled = false, className = '', size = 'default' }: SelectProps) {
    const selectedOption = options.find(o => o.value === value);

    return (
        <Listbox value={value} onChange={onChange} disabled={disabled}>
            <div className={clsx('relative', className)}>
                <ListboxButton
                    className={clsx(
                        'relative w-full cursor-pointer bg-black/30 border border-dark-border rounded-lg text-left focus:outline-none focus:border-brand-500 transition-colors',
                        size === 'sm' ? 'px-3 py-1.5 pr-8 text-sm' : 'px-4 py-2 pr-10 text-sm',
                        disabled && 'opacity-50 cursor-not-allowed'
                    )}
                >
                    <span className={clsx('block truncate', selectedOption ? 'text-white' : 'text-gray-400')}>
                        {selectedOption?.label || placeholder}
                    </span>
                    <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                        <ChevronDown className="h-4 w-4 text-gray-400" aria-hidden="true" />
                    </span>
                </ListboxButton>

                <ListboxOptions
                    anchor="bottom start"
                    className="[--anchor-gap:4px] min-w-[var(--button-width)] max-h-60 overflow-auto rounded-lg bg-gray-900/95 backdrop-blur-sm border border-dark-border shadow-xl focus:outline-none py-1 z-50"
                >
                    {options.map((option) => (
                        <ListboxOption
                            key={option.value}
                            value={option.value}
                            className="group relative cursor-pointer select-none py-2 pl-10 pr-4 text-sm text-gray-300 data-[focus]:bg-white/10 data-[selected]:text-white"
                        >
                            <span className="block whitespace-nowrap font-normal group-data-[selected]:font-semibold">
                                {option.label}
                            </span>
                            <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-brand-500 opacity-0 group-data-[selected]:opacity-100">
                                <Check className="h-4 w-4" aria-hidden="true" />
                            </span>
                        </ListboxOption>
                    ))}
                </ListboxOptions>
            </div>
        </Listbox>
    );
}
