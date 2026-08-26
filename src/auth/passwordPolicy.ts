export const PASSWORD_POLICY_HINT = "Use at least 12 characters with an uppercase letter, a lowercase letter, and a number.";

export const validatePasswordPolicy = (password: string): string | null => {
  if (password.length < 12) return "New password must contain at least 12 characters.";
  if (!/[A-Z]/.test(password)) return "New password must contain an uppercase letter.";
  if (!/[a-z]/.test(password)) return "New password must contain a lowercase letter.";
  if (!/[0-9]/.test(password)) return "New password must contain a number.";
  return null;
};
