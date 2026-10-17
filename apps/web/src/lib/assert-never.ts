export function assertNever(value: never): never {
  throw new Error(`unhandled state: ${JSON.stringify(value)}`);
}
