import { UserRole } from '../users/user-role.enum';

export interface AuthenticatedUser {
  userId: string;
  email: string;
  role: UserRole;
}

export interface AuthResponse {
  accessToken: string;
  tokenType: 'Bearer';
  user: {
    id: string;
    name: string;
    email: string;
    role: UserRole;
  };
}

export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
}