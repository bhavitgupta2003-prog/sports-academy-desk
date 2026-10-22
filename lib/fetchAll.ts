// Supabase returns at most 1,000 rows per request (a default setting). A plain query that
// matches more rows is cut short WITHOUT an error. This reads a query page by page instead.
//
// Usage:
//   const { data, error } = await fetchAll<Row>((from, to) =>
//     supabase.from("attendance").select("student_id,status").order("id").range(from, to));
// Always include .order(...) so the pages line up.

export const PAGE_SIZE = 1000;

type Page<T> = { data: T[] | null; error: unknown };

export async function fetchAll<T>(
  getPage: (from: number, to: number) => PromiseLike<Page<T>>,
  pageSize: number = PAGE_SIZE,
): Promise<{ data: T[]; error: unknown }> {
  const all: T[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await getPage(from, from + pageSize - 1);
    if (error) return { data: [], error };
    if (!data || data.length === 0) break;
    all.push(...data);
    from += data.length; // advance by what actually came back, in case the server caps pages lower than we asked
    if (from > 1_000_000) break; // safety stop
  }
  return { data: all, error: null };
}
