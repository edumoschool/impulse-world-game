import { Global, Module } from '@nestjs/common';
import { AccountService } from './application/account.service.js';
import { AuthResponder } from './application/auth-responder.js';
import { AuthService } from './application/auth.service.js';
import { LoginThrottle } from './application/login-throttle.js';
import { MfaService } from './application/mfa.service.js';
import { PasswordHasher } from './application/password-hasher.js';
import { RoleCatalog } from './application/role-catalog.js';
import { SessionService } from './application/session.service.js';
import { AuthController } from './presentation/auth.controller.js';
import { AuthGuard } from './presentation/auth.guard.js';

/**
 * Global because the auth guard applies to every route. AccessDirectory is not provided here. It
 * comes from the global OrganizationsModule, which is how identity avoids depending on it.
 */
@Global()
@Module({
  controllers: [AuthController],
  providers: [
    AccountService,
    AuthResponder,
    AuthService,
    LoginThrottle,
    MfaService,
    PasswordHasher,
    RoleCatalog,
    SessionService,
    AuthGuard,
  ],
  exports: [AccountService, AuthResponder, LoginThrottle, RoleCatalog, SessionService, AuthGuard],
})
export class IdentityModule {}
