import { backend } from "#backend";

// @effect-diagnostics-next-line asyncFunction:off -- TanStack routes use a Promise-returning transport boundary.
export const proxy = async ({
  request,
}: {
  readonly request: Request;
}): Promise<Response> => await backend(request);
