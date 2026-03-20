import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [MailModule],
  controllers: [AdminController],
})
export class AdminModule {}
