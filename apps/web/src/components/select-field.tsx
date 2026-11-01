import { forwardRef, type ReactNode, type SelectHTMLAttributes, useId } from 'react';

interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  children: ReactNode;
}

/** The select counterpart of Field, with the same label and sizing. */
export const SelectField = forwardRef<HTMLSelectElement, SelectFieldProps>(function SelectField(
  { label, children, ...select },
  ref,
) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="block font-semibold">
        {label}
      </label>
      <select
        id={id}
        ref={ref}
        className="mt-1.5 min-h-13 w-full rounded-control border-2 border-ink bg-sheet px-4 text-lg"
        {...select}
      >
        {children}
      </select>
    </div>
  );
});
