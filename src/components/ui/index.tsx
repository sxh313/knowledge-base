import { forwardRef, type ButtonHTMLAttributes, type HTMLAttributes, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react';
import { Loader2 } from 'lucide-react';

type Size = 'sm' | 'md' | 'lg';
type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

const buttonClasses: Record<ButtonVariant, string> = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  ghost: 'btn-ghost',
  danger: 'btn-danger',
};
const sizeClasses: Record<Size, string> = { sm: 'text-xs px-2.5 py-1.5', md: 'text-sm px-3 py-2', lg: 'text-sm px-4 py-2.5' };

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ variant = 'secondary', size = 'md', loading = false, icon, className = '', children, disabled, ...props }, ref) {
  return <button ref={ref} className={`${buttonClasses[variant]} ${sizeClasses[size]} inline-flex items-center justify-center gap-1.5 ${className}`} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
    {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : icon}
    {children}
  </button>;
});

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> { label: string; size?: Size; variant?: ButtonVariant; }
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton({ label, size = 'md', variant = 'ghost', className = '', children, ...props }, ref) {
  const dimensions = size === 'sm' ? 'h-8 w-8' : size === 'lg' ? 'h-11 w-11' : 'h-9 w-9';
  return <Button ref={ref} variant={variant} size="md" className={`${dimensions} p-0 ${className}`} aria-label={label} title={props.title ?? label} {...props}>{children}</Button>;
});

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className = '', ...props }, ref) {
  return <input ref={ref} className={`input-field ${className}`} {...props} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className = '', ...props }, ref) {
  return <textarea ref={ref} className={`input-field ${className}`} {...props} />;
});

export function Tag({ children, tone = 'gray', className = '', ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: 'gray' | 'accent' | 'brand' }) {
  return <span className={`tag-${tone} inline-flex items-center ${className}`} {...props}>{children}</span>;
}

export function Card({ children, className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`card ${className}`} {...props}>{children}</div>;
}
