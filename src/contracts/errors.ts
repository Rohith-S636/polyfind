export type ContractErrorCode =
  | "INVALID_REQUEST"
  | "INVALID_PRODUCT"
  | "INVALID_RESPONSE"
  | "INVALID_CONFIGURATION";

export interface ContractIssue {
  path: string;
  message: string;
}

export class ContractValidationError extends Error {
  readonly code: ContractErrorCode;
  readonly issues: readonly ContractIssue[];

  constructor(code: ContractErrorCode, issues: ContractIssue[]) {
    super(
      issues.length === 1
        ? issues[0]?.message ?? "Contract validation failed"
        : `Contract validation failed with ${issues.length} errors`,
    );
    this.name = "ContractValidationError";
    this.code = code;
    this.issues = issues;
  }
}
