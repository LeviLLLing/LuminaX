export interface PasswordCredential {
  userId: string;
  username: string;
  salt: string;
  passwordHash: string;
  version: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuthenticatedUser {
  id: string;
  username: string;
  displayName: string;
  role: "super_admin" | "manager" | "analyst";
}

export interface AuthSessionPayload {
  userId: string;
  credentialVersion: string;
  issuedAt: number;
  expiresAt: number;
}

export interface LoginResult {
  user: AuthenticatedUser;
  token: string;
  expiresAt: Date;
}
