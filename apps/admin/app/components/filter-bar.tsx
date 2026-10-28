import type { ReactNode } from "react";

interface Option {
  value: string;
  label: string;
}

interface Props {
  statusLabel: string;
  statusOptions: readonly Option[];
  status: string;
  onStatus: (value: string) => void;
  /** Extra checkbox filters, for example "Sem executor". */
  checks?: readonly {
    id: string;
    label: string;
    checked: boolean;
    onChange: (checked: boolean) => void;
  }[];
  /** Sort control for narrow screens, where the column headers are hidden. */
  sort?: {
    options: readonly Option[];
    value: string;
    direction: "asc" | "desc";
    onChange: (value: string) => void;
    onDirection: (direction: "asc" | "desc") => void;
  };
  children?: ReactNode;
}

/** Filters above a table; every control is a plain labelled form field, operable by keyboard. */
export function FilterBar({
  statusLabel,
  statusOptions,
  status,
  onStatus,
  checks = [],
  sort,
  children,
}: Props) {
  return (
    <div className="filter-bar" role="group" aria-label="Filtros">
      <label className="filter-field">
        <span>{statusLabel}</span>
        <select
          value={status}
          onChange={(event) => {
            onStatus(event.target.value);
          }}
        >
          {statusOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      {checks.map((check) => (
        <label key={check.id} className="filter-check">
          <input
            type="checkbox"
            checked={check.checked}
            onChange={(event) => {
              check.onChange(event.target.checked);
            }}
          />
          {check.label}
        </label>
      ))}
      {sort !== undefined && (
        <div className="only-narrow filter-field-group">
          <label className="filter-field">
            <span>Ordenar por</span>
            <select
              value={sort.value}
              onChange={(event) => {
                sort.onChange(event.target.value);
              }}
            >
              {sort.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="filter-field">
            <span>Ordem</span>
            <select
              value={sort.direction}
              onChange={(event) => {
                sort.onDirection(event.target.value as "asc" | "desc");
              }}
            >
              <option value="asc">Crescente</option>
              <option value="desc">Decrescente</option>
            </select>
          </label>
        </div>
      )}
      {children}
    </div>
  );
}
