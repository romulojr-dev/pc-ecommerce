// Deliberately unguarded: the enumeration test must catch it. Never imported
// by the app.
export async function POST(): Promise<Response> {
  return new Response("oops")
}
