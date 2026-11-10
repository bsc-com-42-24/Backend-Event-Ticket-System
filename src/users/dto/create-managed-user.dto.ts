import { IsEmail, IsEnum, IsString, MinLength, MaxLength } from 'class-validator';
import { UserRole } from '../user-role.enum';

export class CreateManagedUserDto {
  @IsString() @MinLength(2) @MaxLength(150)
  name: string;
  @IsEmail() @MaxLength(255)
  email: string;
  @IsString() @MinLength(10) @MaxLength(72)
  password: string;
  @IsEnum(UserRole)
  role: UserRole;
}
