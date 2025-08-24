import React from 'react';
import { cn } from '@/lib/utils';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent } from '@/components/ui/card';

interface Column<T> {
  header: string;
  accessorKey: keyof T | ((row: T) => string);
  className?: string;
  cell?: (row: T) => React.ReactNode;
}

interface ResponsiveTableProps<T> {
  data: T[];
  columns: Column<T>[];
  className?: string;
  onRowClick?: (row: T) => void;
  isLoading?: boolean;
  emptyMessage?: string;
}

export function ResponsiveTable<T extends { id?: string | number }>({
  data,
  columns,
  className,
  onRowClick,
  isLoading,
  emptyMessage = 'No data available'
}: ResponsiveTableProps<T>) {
  // Desktop view
  const renderDesktopTable = () => (
    <div className="hidden md:block overflow-x-auto">
      <Table className={className}>
        <TableHeader>
          <TableRow>
            {columns.map((column, index) => (
              <TableHead
                key={index}
                className={cn(column.className)}
              >
                {column.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((row, rowIndex) => (
            <TableRow
              key={row.id || rowIndex}
              className={cn(onRowClick && 'cursor-pointer hover:bg-muted/50')}
              onClick={() => onRowClick?.(row)}
            >
              {columns.map((column, colIndex) => (
                <TableCell
                  key={colIndex}
                  className={cn(column.className)}
                >
                  {column.cell
                    ? column.cell(row)
                    : typeof column.accessorKey === 'function'
                    ? column.accessorKey(row)
                    : String(row[column.accessorKey] || '')}
                </TableCell>
              ))}
            </TableRow>
          ))}
          {data.length === 0 && !isLoading && (
            <TableRow>
              <TableCell
                colSpan={columns.length}
                className="text-center h-24 text-muted-foreground"
              >
                {emptyMessage}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );

  // Mobile view
  const renderMobileCards = () => (
    <div className="grid grid-cols-1 gap-4 md:hidden">
      {data.map((row, index) => (
        <Card
          key={row.id || index}
          className={cn(
            'overflow-hidden',
            onRowClick && 'cursor-pointer hover:bg-muted/50'
          )}
          onClick={() => onRowClick?.(row)}
        >
          <CardContent className="p-4 space-y-2">
            {columns.map((column, colIndex) => (
              <div key={colIndex} className="flex justify-between items-start gap-2">
                <span className="text-sm font-medium text-muted-foreground">
                  {column.header}
                </span>
                <span className="text-sm text-right">
                  {column.cell
                    ? column.cell(row)
                    : typeof column.accessorKey === 'function'
                    ? column.accessorKey(row)
                    : String(row[column.accessorKey] || '')}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
      {data.length === 0 && !isLoading && (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            {emptyMessage}
          </CardContent>
        </Card>
      )}
    </div>
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="animate-pulse space-y-4">
          <div className="h-4 w-48 bg-muted rounded"></div>
          <div className="h-4 w-36 bg-muted rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <>
      {renderDesktopTable()}
      {renderMobileCards()}
    </>
  );
}
