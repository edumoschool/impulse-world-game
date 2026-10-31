import { forwardRef, type InputHTMLAttributes, useId } from 'react';

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string;
}

export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field(
  { label, hint, error, ...input },
  ref,
) {
  const id = useId();
  const noteId = `${id}-note`;
  const note = error ?? hint;

  return (
    <div>
      <label htmlFor={id} className="block font-semibold">
        {label}
      </label>
      <input
        id={id}
        ref={ref}
        aria-invalid={error ? true : undefined}
        aria-describedby={note ? noteId : undefined}
        className={`mt-1.5 min-h-13 w-full rounded-control border-2 bg-sheet px-4 text-lg ${
          error ? 'border-danger' : 'border-ink'
        }`}
        {...input}
      />
      {note ? (
        <p
          id={noteId}
          className={`mt-1.5 text-sm ${error ? 'font-medium text-danger' : 'text-ink-soft'}`}
        >
          {note}
        </p>
      ) : null}
    </div>
  );
});
