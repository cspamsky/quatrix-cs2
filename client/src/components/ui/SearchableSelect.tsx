import React, { useState, useRef, useEffect } from 'react';
import { Search, ChevronDown, Check, X } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface SearchableSelectProps {
  options: string[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

const SearchableSelect: React.FC<SearchableSelectProps> = ({
  options,
  value,
  onChange,
  placeholder = 'Select an option...',
  disabled = false,
  className,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filteredOptions = options.filter((opt) =>
    opt.toLowerCase().includes(searchTerm.toLowerCase())
  );

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleToggle = () => {
    if (disabled) return;
    setIsOpen(!isOpen);
    if (!isOpen) {
      setSearchTerm('');
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  };

  const handleSelect = (opt: string) => {
    onChange(opt);
    setIsOpen(false);
    setSearchTerm('');
  };

  return (
    <div className={cn('relative w-full', className)} ref={containerRef}>
      {/* Trigger */}
      <div
        onClick={handleToggle}
        className={cn(
          'w-full bg-[#0F172A]/50 border border-gray-800 rounded-xl px-4 py-3 text-white flex items-center justify-between cursor-pointer transition-all hover:border-gray-700',
          isOpen && 'ring-2 ring-primary border-transparent',
          disabled && 'opacity-50 cursor-not-allowed'
        )}
      >
        <span className={cn('truncate', !value && 'text-gray-500')}>{value || placeholder}</span>
        <ChevronDown
          className={cn('w-4 h-4 text-gray-500 transition-transform', isOpen && 'rotate-180')}
        />
      </div>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute z-[100] w-full mt-2 bg-[#0F172A] border border-gray-800 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 origin-top">
          {/* Search Input */}
          <div className="p-3 border-b border-gray-800 flex items-center gap-2">
            <Search className="w-4 h-4 text-gray-500" />
            <input
              ref={inputRef}
              type="text"
              className="w-full bg-transparent border-none outline-none text-sm text-white placeholder:text-gray-600"
              placeholder="Search..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <X
                className="w-4 h-4 text-gray-500 cursor-pointer hover:text-white"
                onClick={() => setSearchTerm('')}
              />
            )}
          </div>

          {/* Options List */}
          <div className="max-h-64 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-800 scrollbar-track-transparent">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((opt) => (
                <div
                  key={opt}
                  onClick={() => handleSelect(opt)}
                  className={cn(
                    'px-4 py-2.5 text-sm cursor-pointer flex items-center justify-between hover:bg-white/5 transition-colors',
                    value === opt ? 'text-primary bg-primary/5' : 'text-gray-300'
                  )}
                >
                  <span className="truncate">{opt}</span>
                  {value === opt && <Check className="w-4 h-4" />}
                </div>
              ))
            ) : (
              <div className="px-4 py-8 text-center text-sm text-gray-500">No results found</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default SearchableSelect;
