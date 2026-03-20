import { IsIn } from 'class-validator';

export class UpdateUserRoleDto {
  @IsIn(['customer', 'admin'])
  role!: 'customer' | 'admin';
}
