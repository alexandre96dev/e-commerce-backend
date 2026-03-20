import { Controller, Get } from '@nestjs/common';
import { BrandsService } from './brands.service';
import { Public } from '../../common/decorators/public.decorator';

@Controller({ path: 'brands', version: '1' })
export class BrandsController {
  constructor(private readonly brandsService: BrandsService) {}

  @Public()
  @Get()
  findAll() {
    return this.brandsService.findAll();
  }
}
