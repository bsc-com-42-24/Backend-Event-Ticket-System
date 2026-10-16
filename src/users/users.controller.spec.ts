import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { UserRole } from './user-role.enum';
import { UsersController } from './users.controller';

describe('UsersController', () => {
  it('restricts user administration to administrators', () => {
    expect(Reflect.getMetadata(ROLES_KEY, UsersController)).toEqual([
      UserRole.ADMIN,
    ]);
  });
});
