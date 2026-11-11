export interface AuthPrincipal {
  id: string;
  email: string;
  roles: string[];
}

export interface AuthSessionResponse {
  expiresAt: string;
  user: AuthPrincipal;
}
