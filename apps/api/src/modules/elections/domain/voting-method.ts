export const VOTING_METHODS = ['SINGLE_CHOICE'] as const;

export type VotingMethod = (typeof VOTING_METHODS)[number];
