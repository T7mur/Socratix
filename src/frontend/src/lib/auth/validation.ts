export function safeNext(value: string | null): string {
  return value && ["/review", "/account", "/reset-password"].includes(value)
    ? value
    : "/account";
}

export function passwordError(
  password: string,
  confirmation: string,
): string | null {
  if (password.length < 12 || password.length > 128)
    return "Use a password between 12 and 128 characters.";
  if (password !== confirmation) return "The passwords do not match.";
  return null;
}
