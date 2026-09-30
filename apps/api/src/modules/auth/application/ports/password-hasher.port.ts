export interface PasswordHasher {
  hash(password: string): Promise<string>;
  needsRehash(passwordHash: string): boolean;
  verify(passwordHash: string, password: string): Promise<boolean>;
}
