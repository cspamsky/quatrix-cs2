import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface Option {
  value: string | number;
  label: string;
}

interface CustomSelectProps {
  options: Option[];
  value: string | number;
  onChange: (value: string | number) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  icon?: React.ReactNode;
}

const CustomSelect: React.FC<CustomSelectProps> = ({
  options,
  value,
  onChange,
  placeholder = 'Select an option...',
  disabled = false,
  className,
  icon,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.value === value);

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
  };

  const handleSelect = (val: string | number) => {
    onChange(val);
    setIsOpen(false);
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
        <div className="flex items-center gap-3 truncate">
          {icon && <div className="text-gray-500 shrink-0">{icon}</div>}
          <span className={cn('truncate', !selectedOption && 'text-gray-500')}>
            {selectedOption ? selectedOption.label : placeholder}
          </span>
        </div>
        <ChevronDown
          className={cn(
            'w-4 h-4 text-gray-500 transition-transform shrink-0',
            isOpen && 'rotate-180'
          )}
        />
      </div>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute z-[100] w-full mt-2 bg-[#0F172A] border border-gray-800 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 origin-top">
          <div className="max-h-64 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-800 scrollbar-track-transparent">
            {options.map((opt) => (
              <div
                key={opt.value}
                onClick={() => handleSelect(opt.value)}
                className={cn(
                  'px-4 py-2.5 text-sm cursor-pointer flex items-center justify-between hover:bg-white/5 transition-colors',
                  value === opt.value ? 'text-primary bg-primary/5' : 'text-gray-300'
                )}
              >
                <span className="truncate">{opt.label}</span>
                {value === opt.value && <Check className="w-4 h-4" />}
              </div>
            ))}
            {options.length === 0 && (
              <div className="px-4 py-8 text-center text-sm text-gray-500">
                No options available
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomSelect;
