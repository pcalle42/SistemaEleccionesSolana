export interface PasswordPolicy {
  readonly maximumLength: number;
  readonly minimumLength: number;
}

export function validateAdminPassword(password: string, policy: PasswordPolicy): void {
  const length = Array.from(password).length;
  if (length < policy.minimumLength || length > policy.maximumLength) {
    throw new Error(
      `Password length must be between ${policy.minimumLength} and ${policy.maximumLength} characters`,
    );
  }
  if (Buffer.byteLength(password, 'utf8') > 1_024) {
    throw new Error('Password UTF-8 representation is too large');
  }
}
