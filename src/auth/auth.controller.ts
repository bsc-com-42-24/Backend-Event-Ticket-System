import { Body, Controller, Post } from '@nestjs/common';
import type { AuthResponse } from './auth.types';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(@Body() input: RegisterDto): Promise<AuthResponse> {
    return this.authService.register(input);
  }

  @Post('login')
  login(@Body() input: LoginDto): Promise<AuthResponse> {
    return this.authService.login(input);
  }
}