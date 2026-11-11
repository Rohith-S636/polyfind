export interface AuthPrincipal {
  id: string;
  email: string;
  roles: string[];
}

export interface AuthSession {
  token: string;
  expiresAt: string;
  user: AuthPrincipal;
}
