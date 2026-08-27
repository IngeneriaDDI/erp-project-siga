import { ReactNode } from 'react';

interface Props {
  title?: string;
  description?: string;
  children: ReactNode;
}

export function FormSection({ title, description, children }: Props) {
  return (
    <section className="space-y-3">
      {(title || description) && (
        <div>
          {title && <h3 className="text-sm font-semibold text-gray-800">{title}</h3>}
          {description && <p className="text-xs text-gray-500">{description}</p>}
        </div>
      )}
      {children}
    </section>
  );
}
