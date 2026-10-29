import type { ReactNode } from "react";

export interface Column<T> {
  key: string;
  header: string;
  /** Makes the header a button that sorts by this column. */
  sortable?: boolean;
  align?: "right";
  render: (row: T) => ReactNode;
}

export interface Sorting {
  key: string;
  direction: "asc" | "desc";
}

interface Props<T> {
  /** Names the table for screen readers. */
  caption: string;
  columns: readonly Column<T>[];
  rows: readonly T[];
  rowKey: (row: T) => string;
  sorting?: Sorting;
  onSort?: (key: string) => void;
  selectedKey?: string | undefined;
  /** The first column becomes a button that selects the row (keyboard friendly). */
  onSelect?: (row: T) => void;
  /** Accessible name of the select button of a row, for example "Editar Corte". */
  selectLabel?: (row: T) => string;
  emptyMessage: string;
}

/**
 * Dense table for the owner's computer screens (FR-015). On narrow screens (up to 768 px) the
 * rows turn into stacked cards, each cell labelled by its column, so nothing needs a
 * horizontal scroll (FR-018); the styles live in `globals.css`.
 */
export function DataTable<T>({
  caption,
  columns,
  rows,
  rowKey,
  sorting,
  onSort,
  selectedKey,
  onSelect,
  selectLabel,
  emptyMessage,
}: Props<T>) {
  if (rows.length === 0) {
    return <p className="hint">{emptyMessage}</p>;
  }
  return (
    <table className="data">
      <caption className="visually-hidden">{caption}</caption>
      <thead>
        <tr>
          {columns.map((column) => {
            const active = sorting?.key === column.key;
            const sortLabel =
              active && sorting.direction === "asc"
                ? "crescente"
                : "decrescente";
            return (
              <th
                key={column.key}
                scope="col"
                className={column.align === "right" ? "right" : undefined}
                aria-sort={
                  active
                    ? sorting.direction === "asc"
                      ? "ascending"
                      : "descending"
                    : undefined
                }
              >
                {column.sortable === true && onSort !== undefined ? (
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => {
                      onSort(column.key);
                    }}
                  >
                    {column.header}
                    {active && (
                      <span aria-hidden="true">
                        {sorting.direction === "asc" ? " ▲" : " ▼"}
                      </span>
                    )}
                    {active && (
                      <span className="visually-hidden"> ({sortLabel})</span>
                    )}
                  </button>
                ) : (
                  column.header
                )}
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const key = rowKey(row);
          return (
            <tr
              key={key}
              data-selected={key === selectedKey ? "true" : undefined}
            >
              {columns.map((column, index) => (
                <td
                  key={column.key}
                  data-label={column.header}
                  className={column.align === "right" ? "right" : undefined}
                >
                  {index === 0 && onSelect !== undefined ? (
                    <button
                      type="button"
                      className="link-button"
                      aria-label={selectLabel?.(row)}
                      aria-pressed={key === selectedKey}
                      onClick={() => {
                        onSelect(row);
                      }}
                    >
                      {column.render(row)}
                    </button>
                  ) : (
                    column.render(row)
                  )}
                </td>
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
