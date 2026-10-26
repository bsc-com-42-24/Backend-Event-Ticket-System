import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from './user-role.enum';
import { ListUsersDto } from './dto/list-users.dto';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';
import { ParseBigIntIdPipe } from './parse-bigint-id.pipe';
import { UsersService } from './users.service';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'List users with pagination and email search' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({
    name: 'email',
    required: false,
    description: 'Case-insensitive substring to search in email addresses.',
  })
  @ApiOkResponse({ description: 'Paginated list of users.' })
  @ApiBadRequestResponse({ description: 'Pagination parameters are invalid.' })
  @ApiUnauthorizedResponse({ description: 'A valid bearer token is required.' })
  @ApiForbiddenResponse({ description: 'Only administrators may list users.' })
  findAll(@Query() input: ListUsersDto) {
    return this.usersService.findAll(input);
  }

  @Patch(':userId/role')
  @ApiOperation({ summary: "Change another user's role" })
  @ApiParam({ name: 'userId', description: 'Positive integer user ID.' })
  @ApiOkResponse({ description: "The user's role was updated." })
  @ApiBadRequestResponse({
    description: 'The user ID or requested role is invalid.',
  })
  @ApiUnauthorizedResponse({ description: 'A valid bearer token is required.' })
  @ApiForbiddenResponse({
    description:
      'Only administrators may change roles; self-role changes are forbidden.',
  })
  @ApiNotFoundResponse({ description: 'The target user does not exist.' })
  updateRole(
    @Param('userId', ParseBigIntIdPipe) userId: string,
    @Body() input: UpdateUserRoleDto,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    return this.usersService.updateRole(userId, input.role, admin.userId);
  }
}
