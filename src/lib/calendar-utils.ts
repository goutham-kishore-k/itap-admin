export function getWeekStart(d: Date) {
  const date = new Date(d);
  const day = date.getDay();
  date.setDate(date.getDate() - (day === 0 ? 6 : day - 1));
  date.setHours(0, 0, 0, 0);
  return date;
}
export function getMonthStart(d: Date) {
  const date = new Date(d.getFullYear(), d.getMonth(), 1);
  date.setHours(0, 0, 0, 0);
  return date;
}
export function getMonthEnd(d: Date) {
  const date = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  date.setHours(0, 0, 0, 0);
  return date;
}
export function addMonths(d: Date, n: number) {
  const r = new Date(d);
  r.setMonth(r.getMonth() + n);
  return r;
}
export function addDays(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
export function fmt(d: Date) { return d.toISOString().split('T')[0]; }
export function daySpan(start: Date, end: Date) {
  return Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
}
export function displayDate(d: Date) {
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export type DayStatus = 'empty' | 'draft' | 'submitted' | 'approved' | 'rejected';

export function dayStatus(dayEntries: { status: string }[]): DayStatus {
  if (!dayEntries.length) return 'empty';
  if (dayEntries.some(e => e.status === 'rejected'))  return 'rejected';
  if (dayEntries.every(e => e.status === 'approved')) return 'approved';
  if (dayEntries.some(e => e.status === 'submitted')) return 'submitted';
  return 'draft';
}

export const DAY_CELL_STYLE: Record<DayStatus, string> = {
  empty:     'border-dashed border-gray-200 bg-white',
  draft:     'border-gray-200 bg-gray-50',
  submitted: 'border-blue-200 bg-blue-50',
  approved:  'border-green-200 bg-green-50',
  rejected:  'border-red-200 bg-red-50',
};

export const DAY_DOT_STYLE: Record<DayStatus, string> = {
  empty:     'bg-gray-300',
  draft:     'bg-gray-400',
  submitted: 'bg-blue-500',
  approved:  'bg-green-500',
  rejected:  'bg-red-500',
};

export const WEEKDAY_HEADERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function monthGridCells(monthAnchor: Date): Date[] {
  const monthStart = getMonthStart(monthAnchor);
  const monthEnd   = getMonthEnd(monthAnchor);
  const gridStart  = getWeekStart(monthStart);
  const gridEnd    = addDays(getWeekStart(monthEnd), 6);
  return Array.from({ length: daySpan(gridStart, gridEnd) }, (_, i) => addDays(gridStart, i));
}
