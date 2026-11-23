import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OrganizerKycController } from './organizer-kyc.controller';
import { OrganizersController } from './organizers.controller';
import { OrganizersService } from './organizers.service';

@Module({
  imports: [AuthModule],
  controllers: [OrganizersController, OrganizerKycController],
  providers: [OrganizersService],
  exports: [OrganizersService],
})
export class OrganizersModule {}
