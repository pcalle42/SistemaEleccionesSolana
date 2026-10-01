export interface VoteAdmission {
  execute<T>(networkSignal: string, work: () => Promise<T>): Promise<T>;
}
