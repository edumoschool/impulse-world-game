import { Global, Module } from '@nestjs/common';
import { AccessDirectory } from '../identity/index.js';
import { OrganizationAccessDirectory } from './application/access-directory.impl.js';
import { InvitationAcceptance } from './application/invitation-acceptance.js';
import { OrganizationService } from './application/organization.service.js';
import { OrganizationsController } from './presentation/organizations.controller.js';

/** Global so the identity module's guard can resolve the AccessDirectory it declares. */
@Global()
@Module({
  controllers: [OrganizationsController],
  providers: [
    InvitationAcceptance,
    OrganizationService,
    { provide: AccessDirectory, useClass: OrganizationAccessDirectory },
  ],
  exports: [AccessDirectory, InvitationAcceptance, OrganizationService],
})
export class OrganizationsModule {}
