import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { LoginDto } from './dto/login.dto';
import {
  ChangePasswordDto,
  RefreshTokenDto,
  RegisterDto,
  VerifyOtpDto,
} from './dto/register.dto';
import { TokenService } from './token/token.service';

@ApiTags('Auth')
@ApiBearerAuth()
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly tokens: TokenService,
  ) {}

  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  @ApiOperation({
    operationId: 'loginUser',
    summary: 'Login User',
    description:
      'Authenticate with email and password. Tokens are for the BFF only.',
  })
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.email, dto.password, dto.rememberMe);
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  @ApiOperation({
    operationId: 'registerUser',
    summary: 'Register User',
    description: 'Start signup and email a hashed one-time code.',
  })
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('otp/verify')
  @ApiOperation({
    operationId: 'verifySignupOtp',
    summary: 'Verify OTP',
    description: 'Exchange a signup OTP for a session.',
  })
  verify(@Body() dto: VerifyOtpDto) {
    return this.auth.verifyOtp(dto.email, dto.code);
  }

  @Public()
  @Post('refresh')
  @ApiOperation({
    operationId: 'refreshSession',
    summary: 'Refresh Session',
    description: 'Rotate refresh tokens. Replay revokes the family.',
  })
  refresh(@Body() dto: RefreshTokenDto) {
    return this.tokens.refreshTokens(dto.refreshToken);
  }

  @Get('me')
  @ApiOperation({
    operationId: 'getAuthMe',
    summary: 'Current User',
    description: 'Session user with CASL roles, permissions, and rules.',
  })
  me(@CurrentUser('sub') userId: string) {
    return this.auth.me(userId);
  }

  @Post('logout')
  @ApiOperation({
    operationId: 'logoutUser',
    summary: 'Logout User',
    description: 'Revoke all refresh tokens for the current user.',
  })
  logout(@CurrentUser('sub') userId: string) {
    return this.auth.logout(userId);
  }

  @Post('password')
  @ApiOperation({
    operationId: 'changePassword',
    summary: 'Change Password',
    description: 'Update password and revoke existing refresh families.',
  })
  changePassword(
    @CurrentUser('sub') userId: string,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.auth.changePassword(userId, dto);
  }
}
